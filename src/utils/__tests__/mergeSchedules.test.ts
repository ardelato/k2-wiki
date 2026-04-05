import type { PlannerSchedule, ScheduledTask } from '@/types'
import { mergeSchedules } from '@/utils/mergeSchedules'

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

describe('mergeSchedules', () => {
  test('returns empty schedule for empty input', () => {
    const result = mergeSchedules([])
    expect(result.tasks).toEqual([])
    expect(result.totalTime).toBe(0)
  })

  test('returns single schedule unchanged', () => {
    const task = makeTask({ nodeId: 'n1', resource: 'Mining' })
    const schedule = makeSchedule([task])
    const result = mergeSchedules([{ itemName: 'Iron', schedule }])
    expect(result).toBe(schedule)
  })

  test('queues shared resource tasks serially', () => {
    const s1 = makeSchedule([
      makeTask({ nodeId: 'a', resource: 'Anvil', startTime: 0, endTime: 100, localTime: 100 }),
    ])
    const s2 = makeSchedule([
      makeTask({ nodeId: 'b', resource: 'Anvil', startTime: 0, endTime: 80, localTime: 80 }),
    ])
    const result = mergeSchedules([
      { itemName: 'Iron Bar', schedule: s1 },
      { itemName: 'Steel Bar', schedule: s2 },
    ])

    const anvilTasks = result.tasks.filter((t) => t.resource === 'Anvil')
    expect(anvilTasks).toHaveLength(2)
    // First task starts at 0, second queues after first
    expect(anvilTasks[0].startTime).toBe(0)
    expect(anvilTasks[0].endTime).toBe(100)
    expect(anvilTasks[1].startTime).toBe(100)
    expect(anvilTasks[1].endTime).toBe(180)
    expect(result.totalTime).toBe(180)
  })

  test('passive tasks always start at 0', () => {
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'a',
        resource: 'Garden: Fire Flower',
        kind: 'garden',
        startTime: 0,
        endTime: 300,
        localTime: 300,
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'b',
        resource: 'Garden: Fire Flower',
        kind: 'garden',
        startTime: 0,
        endTime: 200,
        localTime: 200,
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Fire Essence', schedule: s1 },
      { itemName: 'Fire Essence 2', schedule: s2 },
    ])

    const gardenTasks = result.tasks.filter((t) => t.resource.startsWith('Garden:'))
    // Both passive tasks start at 0
    expect(gardenTasks.every((t) => t.startTime === 0)).toBe(true)
  })

  test('expedition tasks always start at 0', () => {
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'a',
        resource: 'Expedition: Loot',
        kind: 'expedition',
        startTime: 0,
        endTime: 600,
        localTime: 600,
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'b',
        resource: 'Expedition: Loot',
        kind: 'expedition',
        startTime: 0,
        endTime: 400,
        localTime: 400,
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Gem', schedule: s1 },
      { itemName: 'Ore', schedule: s2 },
    ])

    const expeditionTasks = result.tasks.filter((t) => t.resource.startsWith('Expedition:'))
    expect(expeditionTasks.every((t) => t.startTime === 0)).toBe(true)
  })

  test('prefixes nodeIds with tree index', () => {
    const s1 = makeSchedule([makeTask({ nodeId: 'n1', resource: 'Mining' })])
    const s2 = makeSchedule([makeTask({ nodeId: 'n1', resource: 'Mining' })])
    const result = mergeSchedules([
      { itemName: 'A', schedule: s1 },
      { itemName: 'B', schedule: s2 },
    ])
    const nodeIds = result.tasks.map((t) => t.nodeId)
    expect(nodeIds).toContain('tree0/n1')
    expect(nodeIds).toContain('tree1/n1')
  })

  test('sorts resource order with active before passive', () => {
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'a',
        resource: 'Expedition: Loot',
        kind: 'expedition',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'b',
        resource: 'Mining',
        kind: 'gather',
        startTime: 0,
        endTime: 50,
        localTime: 50,
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Gem', schedule: s1 },
      { itemName: 'Stone', schedule: s2 },
    ])
    // Active resources (priority 1) come before expedition (priority 3)
    expect(result.resourceOrder.indexOf('Mining')).toBeLessThan(
      result.resourceOrder.indexOf('Expedition: Loot'),
    )
  })

  test('craft waits for gather dependency when resource contention shifts timing', () => {
    // Tree A: gather ore (0-100) → craft bar (100-200), bar depends on ore
    // Tree B: gather ore (0-80), no dependencies
    // After merge: ore tasks queue serially on Mining.
    // Tree B ore: 0-80, Tree A ore: 80-180.
    // Tree A bar must wait for Tree A ore to finish (180), not start at original 100.
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'ore',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Iron Ore',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'bar',
        resource: 'Anvil',
        kind: 'craft',
        itemName: 'Iron Bar',
        startTime: 100,
        endTime: 200,
        localTime: 100,
        dependencies: ['ore'],
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'ore2',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Copper Ore',
        startTime: 0,
        endTime: 80,
        localTime: 80,
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Iron Bar', schedule: s1 },
      { itemName: 'Copper Ore', schedule: s2 },
    ])

    const bar = result.tasks.find((t) => t.itemName === 'Iron Bar')!
    const ore = result.tasks.find((t) => t.itemName === 'Iron Ore')!

    // Bar must start at or after ore's end time
    expect(bar.startTime).toBeGreaterThanOrEqual(ore.endTime)
  })

  test('deeply nested dependencies propagate correctly', () => {
    // Tree: gather (0-60) → refine (60-120) → craft (120-180)
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'raw',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Raw Stone',
        startTime: 0,
        endTime: 60,
        localTime: 60,
      }),
      makeTask({
        nodeId: 'refined',
        resource: 'Furnace',
        kind: 'craft',
        itemName: 'Stone Brick',
        startTime: 60,
        endTime: 120,
        localTime: 60,
        dependencies: ['raw'],
      }),
      makeTask({
        nodeId: 'final',
        resource: 'Workbench',
        kind: 'craft',
        itemName: 'Stone Wall',
        startTime: 120,
        endTime: 180,
        localTime: 60,
        dependencies: ['refined'],
      }),
    ])
    // Tree B competes for Mining
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'other',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Coal',
        startTime: 0,
        endTime: 50,
        localTime: 50,
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Stone Wall', schedule: s1 },
      { itemName: 'Coal', schedule: s2 },
    ])

    const raw = result.tasks.find((t) => t.itemName === 'Raw Stone')!
    const refined = result.tasks.find((t) => t.itemName === 'Stone Brick')!
    const final = result.tasks.find((t) => t.itemName === 'Stone Wall')!

    // Each step must start after its dependency completes
    expect(refined.startTime).toBeGreaterThanOrEqual(raw.endTime)
    expect(final.startTime).toBeGreaterThanOrEqual(refined.endTime)
  })
})
