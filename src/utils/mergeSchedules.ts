import type { PlannerSchedule, ScheduledTask } from '@/types'

const resourceSortPriority = (r: string) =>
  r.startsWith('Garden:') ? 2 : r.startsWith('Expedition:') ? 3 : 1

interface MergeTask extends ScheduledTask {
  treeIndex: number
  mergedDeps: string[] // prefixed dependency nodeIds
}

/**
 * Merge multiple per-material PlannerSchedule objects into a single unified schedule.
 *
 * Uses dependency-aware topological scheduling so that craft tasks correctly
 * wait for their gather/garden dependencies even across different material trees.
 * Shared resources (e.g. the same workstation) are queued serially.
 * Passive tasks (garden, expedition) always start at time 0.
 */
export function mergeSchedules(
  treeSchedules: { itemName: string; schedule: PlannerSchedule }[],
): PlannerSchedule {
  if (treeSchedules.length === 0) {
    return { tasks: [], resourceOrder: [], totalTime: 0, completionTimeByNode: {} }
  }

  // Collect all tasks, prefixing nodeIds with tree index to avoid collisions
  const allTasks: MergeTask[] = []
  for (let i = 0; i < treeSchedules.length; i++) {
    const { schedule } = treeSchedules[i]
    for (const task of schedule.tasks) {
      allTasks.push({
        ...task,
        nodeId: `tree${i}/${task.nodeId}`,
        treeIndex: i,
        mergedDeps: (task.dependencies ?? []).map((dep) => `tree${i}/${dep}`),
        ...(task.passive?.linkedNodeId && {
          passive: { ...task.passive, linkedNodeId: `tree${i}/${task.passive.linkedNodeId}` },
        }),
      })
    }
  }

  // Build adjacency: nodeId → list of tasks that depend on it
  const dependents = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const taskByNodeId = new Map<string, MergeTask>()

  for (const task of allTasks) {
    taskByNodeId.set(task.nodeId, task)
  }

  for (const task of allTasks) {
    // Only count dependencies that exist as actual tasks — fulfilled or zero-time
    // nodes don't produce tasks and should be treated as already complete.
    const effectiveDeps = task.mergedDeps.filter((dep) => taskByNodeId.has(dep))
    task.mergedDeps = effectiveDeps
    inDegree.set(task.nodeId, effectiveDeps.length)
    for (const dep of effectiveDeps) {
      const list = dependents.get(dep)
      if (list) list.push(task.nodeId)
      else dependents.set(dep, [task.nodeId])
    }
  }

  // Topological schedule with resource constraints
  const completionTimeByNode: Record<string, number> = {}
  const resourceNextFree: Record<string, number> = {} // active tasks only
  const passiveNextFree: Record<string, number> = {} // passive machine tasks only
  const resolvedTasks: ScheduledTask[] = []

  // Seed queue with tasks that have no dependencies
  const queue: string[] = []
  for (const task of allTasks) {
    if (task.mergedDeps.length === 0) {
      queue.push(task.nodeId)
    }
  }

  // Process in dependency order, sorting queue by original start time for stability
  while (queue.length > 0) {
    // Pick the task with the earliest possible start time
    queue.sort((a, b) => {
      const taskA = taskByNodeId.get(a)!
      const taskB = taskByNodeId.get(b)!
      return taskA.startTime - taskB.startTime || taskA.treeIndex - taskB.treeIndex
    })
    const nodeId = queue.shift()!
    const task = taskByNodeId.get(nodeId)!

    // Passive tasks represent background production already factored into active
    // method times. They don't block active tasks — active tasks can preempt them.
    // But passive machine tasks serialize with each other (one recipe at a time).
    const isFullyPassive =
      (!!task.passive && !task.resource.startsWith('Machine:')) ||
      task.resource.startsWith('Garden:') ||
      task.resource.startsWith('Expedition:')
    const isMachinePassive = !!task.passive && task.resource.startsWith('Machine:')

    // Start time = max of all dependency completion times + resource availability
    let depsReady = 0
    for (const dep of task.mergedDeps) {
      depsReady = Math.max(depsReady, completionTimeByNode[dep] ?? 0)
    }

    let startTime: number
    if (isFullyPassive) {
      // Garden, Expedition, Fabrication — dedicated resources, always start at 0
      startTime = 0
    } else if (isMachinePassive) {
      // Passive machine tasks serialize with other passives on the same machine,
      // but do NOT check resourceNextFree (active tasks can preempt them)
      startTime = passiveNextFree[task.resource] ?? 0
    } else {
      // Active tasks check only active resource contention + dependencies
      startTime = Math.max(depsReady, resourceNextFree[task.resource] ?? 0)
    }

    const endTime = startTime + task.localTime

    if (isMachinePassive) {
      passiveNextFree[task.resource] = endTime
    } else if (!isFullyPassive) {
      resourceNextFree[task.resource] = endTime
    }

    const resolved: ScheduledTask = {
      nodeId: task.nodeId,
      itemId: task.itemId,
      itemName: task.itemName,
      resource: task.resource,
      kind: task.kind,
      startTime,
      endTime,
      localTime: task.localTime,
      depth: task.depth,
      ...(task.dependencies && { dependencies: task.mergedDeps }),
      ...(task.passive && { passive: task.passive }),
    }

    resolvedTasks.push(resolved)
    completionTimeByNode[task.nodeId] = endTime

    // Decrement in-degree of dependents and enqueue when ready
    for (const depNodeId of dependents.get(nodeId) ?? []) {
      const deg = (inDegree.get(depNodeId) ?? 1) - 1
      inDegree.set(depNodeId, deg)
      if (deg === 0) {
        queue.push(depNodeId)
      }
    }
  }

  // Compute resource order
  const resources = new Set(resolvedTasks.map((t) => t.resource))
  const resourceOrder = [...resources].toSorted((a, b) => {
    return resourceSortPriority(a) - resourceSortPriority(b) || a.localeCompare(b)
  })

  // Only active (non-passive) tasks drive the total time — passive tasks are
  // background production already factored into active method calculations.
  const activeTotalTime = resolvedTasks
    .filter((t) => !t.passive)
    .reduce((max, t) => Math.max(max, t.endTime), 0)
  const totalTime = activeTotalTime || resolvedTasks.reduce((max, t) => Math.max(max, t.endTime), 0)

  // Drop passive tasks whose output won't be used:
  // - starts after the plan ends
  // - starts after the linked active node has already completed (production arrives too late)
  // Cap remaining passive tasks that overlap the plan end.
  const filteredTasks = resolvedTasks
    .filter((t) => {
      if (!t.passive) return true
      if (t.startTime >= totalTime) return false
      const linkedId = t.passive.linkedNodeId
      if (linkedId && completionTimeByNode[linkedId] != null) {
        if (t.startTime >= completionTimeByNode[linkedId]) return false
      }
      return true
    })
    .map((t) => {
      if (!t.passive || t.endTime <= totalTime) return t
      return { ...t, endTime: totalTime, localTime: totalTime - t.startTime }
    })

  // Clip machine passive tasks around active tasks on the same resource.
  // Passive production is interrupted when the machine runs an active task,
  // then resumes after. Split passive tasks into gap-filling segments.
  const finalTasks: ScheduledTask[] = []
  const activeByResource = new Map<string, { start: number; end: number }[]>()
  for (const t of filteredTasks) {
    if (!t.passive && t.resource.startsWith('Machine:')) {
      const ranges = activeByResource.get(t.resource) ?? []
      ranges.push({ start: t.startTime, end: t.endTime })
      activeByResource.set(t.resource, ranges)
    }
  }

  for (const t of filteredTasks) {
    if (!t.passive || !t.resource.startsWith('Machine:')) {
      finalTasks.push(t)
      continue
    }

    const activeRanges = activeByResource.get(t.resource)
    if (!activeRanges || activeRanges.length === 0) {
      finalTasks.push(t)
      continue
    }

    // Find gaps in this passive task's span that don't overlap active tasks
    const sorted = activeRanges.toSorted((a, b) => a.start - b.start)
    let cursor = t.startTime
    let segIdx = 0
    for (const active of sorted) {
      if (active.start > cursor && cursor < t.endTime) {
        const segEnd = Math.min(active.start, t.endTime)
        finalTasks.push({
          ...t,
          nodeId: `${t.nodeId}:seg${segIdx++}`,
          startTime: cursor,
          endTime: segEnd,
          localTime: segEnd - cursor,
        })
      }
      cursor = Math.max(cursor, active.end)
    }
    // Remaining gap after last active task
    if (cursor < t.endTime) {
      finalTasks.push({
        ...t,
        nodeId: `${t.nodeId}:seg${segIdx}`,
        startTime: cursor,
        endTime: t.endTime,
        localTime: t.endTime - cursor,
      })
    }
  }

  return {
    tasks: finalTasks,
    resourceOrder,
    totalTime,
    completionTimeByNode,
  }
}
