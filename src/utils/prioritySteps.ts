import type { PlannerNode, PlannerSchedule } from '@/types'

export type StepKind = 'gather' | 'craft' | 'expedition' | 'passive' | 'buy' | 'container'

export interface PriorityStepCard {
  label: string
  description: string
  timeEstimate: number // seconds
  kind: StepKind
  itemId: string
  resource: string
  cost?: number
  amount?: number
}

export interface PriorityWave {
  waveNumber: number
  cards: PriorityStepCard[]
}

/**
 * Derive priority waves from a merged PlannerSchedule.
 *
 * Groups tasks into "waves" based on start time proximity.
 * Each wave contains individual task cards.
 */
export function computePriorityWaves(
  schedule: PlannerSchedule,
  nodesById?: Record<string, PlannerNode>,
): PriorityWave[] {
  if (schedule.tasks.length === 0) return []

  // Sort tasks by start time, then by kind priority
  const kindPriority: Record<string, number> = {
    expedition: 0,
    garden: 1,
    gather: 2,
    craft: 3,
    buy: 4,
    container: 5,
  }

  const sorted = schedule.tasks.toSorted((a, b) => {
    const timeDiff = a.startTime - b.startTime
    if (timeDiff !== 0) return timeDiff
    return (kindPriority[a.kind] ?? 9) - (kindPriority[b.kind] ?? 9)
  })

  // Group into waves: tasks with start times within a tolerance are in the same wave.
  const tolerance = Math.max(schedule.totalTime * 0.01, 60)

  interface RawWave {
    startTime: number
    tasks: typeof sorted
  }

  const rawWaves: RawWave[] = []
  let currentWave: RawWave | null = null

  for (const task of sorted) {
    if (!currentWave || task.startTime > currentWave.startTime + tolerance) {
      currentWave = { startTime: task.startTime, tasks: [] }
      rawWaves.push(currentWave)
    }
    currentWave.tasks.push(task)
  }

  // Convert to waves with individual cards
  const waves: PriorityWave[] = []

  for (const raw of rawWaves) {
    // Deduplicate tasks by resource:itemName, accumulating amounts and time
    const cardMap = new Map<string, PriorityStepCard>()

    for (const task of raw.tasks) {
      const dedupeKey = `${task.resource}:${task.itemName}`
      const node = nodesById?.[task.passive?.linkedNodeId ?? task.nodeId]
      const taskAmount = node?.requiredAmount ?? task.passive?.produced ?? 0

      const existing = cardMap.get(dedupeKey)
      if (existing) {
        existing.timeEstimate = Math.max(existing.timeEstimate, task.localTime)
        if (taskAmount > 0) existing.amount = (existing.amount ?? 0) + Math.round(taskAmount)
        continue
      }

      const isPassive = task.kind === 'expedition' || task.kind === 'garden'
      cardMap.set(dedupeKey, {
        label: task.itemName,
        description: task.resource.replace(/^(Expedition|Garden|Buy): /, ''),
        timeEstimate: task.localTime,
        kind: isPassive ? 'passive' : (task.kind as StepKind),
        itemId: task.itemId,
        resource: task.resource,
        amount: Math.round(taskAmount) || undefined,
      })
    }

    const cards = [...cardMap.values()]

    if (cards.length > 0) {
      waves.push({
        waveNumber: waves.length + 1,
        cards,
      })
    }
  }

  return waves
}
