import type { ScheduledTask } from '@/types'
import { isResourceType, parseResourceType, type ResourceType } from '@/utils/save/resourceType'

/** Actual timespan for a resource's tasks (handles overlapping passive tasks). */
export function barSpan(tasks: ScheduledTask[]): number {
  if (tasks.length === 0) return 0
  const minStart = tasks[0].startTime
  const maxEnd = Math.max(...tasks.map((t) => t.endTime))
  return maxEnd - minStart
}

/**
 * Merge overlapping passive tasks for the same item on non-machine resources.
 * Machine passives are serialized by mergeSchedules and should NOT be re-merged.
 */
export function mergePassiveTasks(tasks: ScheduledTask[], resource: string): ScheduledTask[] {
  const merged: ScheduledTask[] = []
  const passiveByItem = new Map<string, ScheduledTask>()

  for (const task of tasks) {
    if (task.passive && !isResourceType(resource, 'machine')) {
      const existing = passiveByItem.get(task.itemId)
      if (existing && task.startTime < existing.endTime) {
        // Actually overlapping — merge into one bar
        const m = { ...existing }
        m.startTime = Math.min(existing.startTime, task.startTime)
        m.endTime = Math.max(existing.endTime, task.endTime)
        m.localTime = m.endTime - m.startTime
        if (m.passive && task.passive && 'produced' in m.passive && 'produced' in task.passive) {
          m.passive = {
            ...m.passive,
            produced: (m.passive.produced ?? 0) + (task.passive.produced ?? 0),
          }
        }
        passiveByItem.set(task.itemId, m)
      } else {
        // Non-overlapping or first occurrence — keep separate
        if (existing) merged.push(existing)
        passiveByItem.set(task.itemId, { ...task })
      }
    } else {
      merged.push(task)
    }
  }

  merged.push(...passiveByItem.values())
  merged.sort((a, b) => a.startTime - b.startTime)
  return merged
}

/**
 * Merge consecutive tasks for the same item on the same resource into one bar.
 * Useful for buy tasks that are split across trees but represent a single purchase event.
 * Tasks must be pre-sorted by startTime.
 */
export function mergeConsecutiveSameItem(tasks: ScheduledTask[]): ScheduledTask[] {
  if (tasks.length <= 1) return tasks
  const result: ScheduledTask[] = []
  let current: ScheduledTask & { _mergedNodeIds?: string[] } = { ...tasks[0] }

  for (let i = 1; i < tasks.length; i++) {
    const next = tasks[i]
    if (
      next.itemId === current.itemId &&
      next.kind === current.kind &&
      next.startTime <= current.endTime + 1
    ) {
      // Merge: extend current to cover next, track all merged nodeIds
      const mergedIds = current._mergedNodeIds ?? [current.nodeId]
      mergedIds.push(next.nodeId)
      current = {
        ...current,
        _mergedNodeIds: mergedIds,
        endTime: Math.max(current.endTime, next.endTime),
        localTime: Math.max(current.endTime, next.endTime) - current.startTime,
      }
    } else {
      result.push(current)
      current = { ...next }
    }
  }
  result.push(current)
  return result
}

const MACHINE_RESOURCES = new Set([
  'Bakery',
  'Refinery',
  'Stone Quarry',
  'Stick Finder',
  'Coal Miner',
])

// Visual group label per prefixed resource kind. Workstation/dungeon lanes have no entry and
// fall through to the raw resource string (matching the prior ladder's `return resource`).
const PREFIX_GROUP_LABEL: Partial<Record<ResourceType, string>> = {
  machine: 'Machines',
  garden: 'Garden',
  expedition: 'Expeditions',
  fabrication: 'Fabrication',
  buy: 'Merchant',
}

/** Determine which visual group a resource belongs to. */
export function getResourceGroupKey(resource: string, tasks: ScheduledTask[]): string {
  const kind = tasks[0]?.kind
  if (kind === 'gather') return 'Gathering'
  if (kind === 'machine') return 'Machines'
  if (kind === 'craft' && MACHINE_RESOURCES.has(resource)) return 'Machines'
  if (kind === 'craft') return 'Refining'
  return PREFIX_GROUP_LABEL[parseResourceType(resource)] ?? resource
}
