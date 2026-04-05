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

  if (treeSchedules.length === 1) {
    return treeSchedules[0].schedule
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
      })
    }
  }

  // Build adjacency: nodeId → list of tasks that depend on it
  const dependents = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const taskByNodeId = new Map<string, MergeTask>()

  for (const task of allTasks) {
    taskByNodeId.set(task.nodeId, task)
    inDegree.set(task.nodeId, task.mergedDeps.length)
    for (const dep of task.mergedDeps) {
      const list = dependents.get(dep)
      if (list) list.push(task.nodeId)
      else dependents.set(dep, [task.nodeId])
    }
  }

  // Topological schedule with resource constraints
  const completionTimeByNode: Record<string, number> = {}
  const resourceNextFree: Record<string, number> = {}
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

    const isPassive = task.resource.startsWith('Garden:') || task.resource.startsWith('Expedition:')

    // Start time = max of all dependency completion times + resource availability
    let depsReady = 0
    for (const dep of task.mergedDeps) {
      depsReady = Math.max(depsReady, completionTimeByNode[dep] ?? 0)
    }

    const startTime = isPassive ? 0 : Math.max(depsReady, resourceNextFree[task.resource] ?? 0)
    const endTime = startTime + task.localTime

    if (!isPassive) {
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

  const totalTime = resolvedTasks.reduce((max, t) => Math.max(max, t.endTime), 0)

  return {
    tasks: resolvedTasks,
    resourceOrder,
    totalTime,
    completionTimeByNode,
  }
}
