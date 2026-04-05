import type { PlannerSchedule, ScheduledTask } from '@/types'
import { computePriorityWaves } from '@/utils/prioritySteps'

function makeTask(
  overrides: Partial<ScheduledTask> & { nodeId: string; resource: string },
): ScheduledTask {
  return {
    itemId: 'item-1',
    itemName: 'Item 1',
    kind: 'gather',
    startTime: 0,
    endTime: 60,
    localTime: 60,
    depth: 0,
    ...overrides,
  }
}

function makeSchedule(tasks: ScheduledTask[], totalTime?: number): PlannerSchedule {
  return {
    tasks,
    resourceOrder: [...new Set(tasks.map((t) => t.resource))],
    totalTime: totalTime ?? Math.max(0, ...tasks.map((t) => t.endTime)),
    completionTimeByNode: Object.fromEntries(tasks.map((t) => [t.nodeId, t.endTime])),
  }
}

describe('computePriorityWaves', () => {
  test('returns empty for empty schedule', () => {
    const schedule = makeSchedule([], 0)
    expect(computePriorityWaves(schedule)).toEqual([])
  })

  test('single task produces single wave', () => {
    const schedule = makeSchedule(
      [
        makeTask({
          nodeId: 'a',
          resource: 'Mining',
          itemName: 'Stone',
          startTime: 0,
          endTime: 120,
          localTime: 120,
        }),
      ],
      120,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves).toHaveLength(1)
    expect(waves[0].waveNumber).toBe(1)
    expect(waves[0].cards).toHaveLength(1)
    expect(waves[0].cards[0].label).toBe('Stone')
    expect(waves[0].cards[0].kind).toBe('gather')
  })

  test('tasks at same start time are in the same wave', () => {
    const schedule = makeSchedule(
      [
        makeTask({
          nodeId: 'a',
          resource: 'Mining',
          itemName: 'Stone',
          kind: 'gather',
          startTime: 0,
          endTime: 100,
          localTime: 100,
        }),
        makeTask({
          nodeId: 'b',
          resource: 'Expedition: Loot',
          itemName: 'Gem',
          kind: 'expedition',
          startTime: 0,
          endTime: 300,
          localTime: 300,
        }),
      ],
      300,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves).toHaveLength(1)
    expect(waves[0].cards).toHaveLength(2)
  })

  test('tasks with distant start times are in different waves', () => {
    const schedule = makeSchedule(
      [
        makeTask({
          nodeId: 'a',
          resource: 'Mining',
          itemName: 'Stone',
          startTime: 0,
          endTime: 1000,
          localTime: 1000,
        }),
        makeTask({
          nodeId: 'b',
          resource: 'Anvil',
          itemName: 'Bar',
          kind: 'craft',
          startTime: 5000,
          endTime: 6000,
          localTime: 1000,
        }),
      ],
      6000,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves).toHaveLength(2)
    expect(waves[0].waveNumber).toBe(1)
    expect(waves[1].waveNumber).toBe(2)
  })

  test('expedition and garden tasks have kind "passive"', () => {
    const schedule = makeSchedule(
      [
        makeTask({
          nodeId: 'a',
          resource: 'Expedition: Cave',
          itemName: 'Ore',
          kind: 'expedition',
          startTime: 0,
          endTime: 600,
          localTime: 600,
        }),
        makeTask({
          nodeId: 'b',
          resource: 'Garden: Fire Flower',
          itemName: 'Essence',
          kind: 'garden',
          startTime: 0,
          endTime: 300,
          localTime: 300,
        }),
      ],
      600,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves[0].cards.every((c) => c.kind === 'passive')).toBe(true)
  })

  test('deduplicates tasks by resource + itemName', () => {
    const schedule = makeSchedule(
      [
        makeTask({
          nodeId: 'a',
          resource: 'Mining',
          itemName: 'Stone',
          startTime: 0,
          endTime: 100,
          localTime: 100,
        }),
        makeTask({
          nodeId: 'b',
          resource: 'Mining',
          itemName: 'Stone',
          startTime: 0,
          endTime: 50,
          localTime: 50,
        }),
      ],
      100,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves[0].cards).toHaveLength(1)
  })

  test('waves are numbered sequentially', () => {
    const schedule = makeSchedule(
      [
        makeTask({ nodeId: 'a', resource: 'Mining', startTime: 0, endTime: 1000, localTime: 1000 }),
        makeTask({
          nodeId: 'b',
          resource: 'Anvil',
          kind: 'craft',
          startTime: 3000,
          endTime: 4000,
          localTime: 1000,
        }),
        makeTask({
          nodeId: 'c',
          resource: 'Loom',
          kind: 'craft',
          startTime: 8000,
          endTime: 9000,
          localTime: 1000,
        }),
      ],
      9000,
    )
    const waves = computePriorityWaves(schedule)
    expect(waves.map((w) => w.waveNumber)).toEqual([1, 2, 3])
  })
})
