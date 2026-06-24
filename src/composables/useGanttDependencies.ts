import { computed, type Ref } from 'vue'

import type { PlannerNode, ScheduledTask } from '@/types'

/** A ScheduledTask that may carry merged nodeIds from consecutive-same-item merging. */
type MergeableTask = ScheduledTask & { _mergedNodeIds?: string[] }

/**
 * Read the merged nodeIds tracked on a task (set by mergeConsecutiveSameItem),
 * centralizing the `as ScheduledTask & { _mergedNodeIds?: string[] }` cast in one place.
 * Falls back to the supplied default ids when no merge metadata is present.
 */
function mergedNodeIdsOf(task: ScheduledTask, fallback: string[]): string[] {
  return (task as MergeableTask)._mergedNodeIds ?? fallback
}

/**
 * Dependency-graph logic for the planner Gantt: builds the node→task and
 * dependency adjacency maps, walks transitive prerequisite/dependent closures
 * for the active task, derives per-bar highlight classes, and computes the
 * active task's required amount (minus queued).
 */
export function useGanttDependencies(opts: {
  tasks: () => ScheduledTask[]
  nodesById: () => Record<string, PlannerNode>
  queuedAmounts: () => Record<string, number> | undefined
  activeTask: Ref<ScheduledTask | null>
}) {
  const { tasks, nodesById, queuedAmounts, activeTask } = opts

  const taskByNodeId = computed(() => {
    const map = new Map<string, ScheduledTask>()
    for (const task of tasks()) map.set(task.nodeId, task)
    return map
  })

  const dependentsOf = computed(() => {
    const map = new Map<string, string[]>()
    for (const task of tasks()) {
      for (const dep of task.dependencies ?? []) {
        const list = map.get(dep)
        if (list) list.push(task.nodeId)
        else map.set(dep, [task.nodeId])
      }
    }
    return map
  })

  /** Transitive closure walking upstream (prerequisites). */
  function collectTransitive(startIds: string[], getNext: (id: string) => string[]): Set<string> {
    const visited = new Set<string>()
    const stack = [...startIds]
    while (stack.length) {
      const id = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      for (const next of getNext(id)) stack.push(next)
    }
    return visited
  }

  const prereqNodeIds = computed<Set<string>>(() => {
    if (!activeTask.value) return new Set()
    const rootIds = mergedNodeIdsOf(activeTask.value, [activeTask.value.nodeId])
    // Collect all direct deps of the root node(s) as starting points
    const seedDeps: string[] = []
    for (const id of rootIds) {
      const t = taskByNodeId.value.get(id)
      if (t?.dependencies) seedDeps.push(...t.dependencies)
    }
    return collectTransitive(seedDeps, (id) => taskByNodeId.value.get(id)?.dependencies ?? [])
  })

  const dependentNodeIds = computed<Set<string>>(() => {
    if (!activeTask.value) return new Set()
    const rootIds = mergedNodeIdsOf(activeTask.value, [activeTask.value.nodeId])
    // Collect all direct dependents of the root node(s) as starting points
    const seedDeps: string[] = []
    for (const id of rootIds) {
      for (const dep of dependentsOf.value.get(id) ?? []) seedDeps.push(dep)
    }
    return collectTransitive(seedDeps, (id) => dependentsOf.value.get(id) ?? [])
  })

  function barHighlightClasses(task: ScheduledTask): string {
    if (!activeTask.value) return ''
    const ids = mergedNodeIdsOf(task, [task.nodeId])
    // Check if this IS the active bar
    const activeIds = mergedNodeIdsOf(activeTask.value, [activeTask.value.nodeId])
    if (ids.some((id) => activeIds.includes(id))) return ''
    // Prereq
    if (ids.some((id) => prereqNodeIds.value.has(id))) return 'gantt-prereq'
    // Dependent
    if (ids.some((id) => dependentNodeIds.value.has(id))) return 'gantt-dependent'
    // Unrelated
    return 'gantt-dimmed'
  }

  const activeTaskNode = computed(() => {
    if (!activeTask.value) return null
    const task = activeTask.value
    return nodesById()[task.passive?.linkedNodeId ?? task.nodeId] ?? null
  })

  /** Total required amount across all merged nodes (for consolidated bars), minus queued. */
  const activeTaskAmount = computed(() => {
    if (!activeTask.value) return null
    const nodeIds = mergedNodeIdsOf(activeTask.value, [
      activeTask.value.passive?.linkedNodeId ?? activeTask.value.nodeId,
    ])
    let total = 0
    for (const id of nodeIds) {
      const node = nodesById()[id]
      if (node) total += node.requiredAmount
    }
    const raw = total > 0 ? total : (activeTaskNode.value?.requiredAmount ?? null)
    if (raw == null) return null
    const itemId = activeTask.value.itemId
    const queued = queuedAmounts()?.[itemId] ?? 0
    return Math.max(0, raw - queued)
  })

  return {
    taskByNodeId,
    dependentsOf,
    collectTransitive,
    prereqNodeIds,
    dependentNodeIds,
    barHighlightClasses,
    activeTaskAmount,
  }
}
