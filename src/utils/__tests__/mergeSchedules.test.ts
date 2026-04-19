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

  test('prefixes nodeIds for single schedule', () => {
    const task = makeTask({ nodeId: 'n1', resource: 'Mining' })
    const schedule = makeSchedule([task])
    const result = mergeSchedules([{ itemName: 'Iron', schedule }])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].nodeId).toBe('tree0/n1')
    expect(result.totalTime).toBe(schedule.totalTime)
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

  test('phantom dependency filtering — task with dep on non-existent nodeId still gets scheduled', () => {
    // Node 'bar' depends on 'ore', but 'ore' is fulfilled/zero-time so it doesn't appear as a task.
    // 'bar' should not be stuck with inDegree > 0.
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'bar',
        resource: 'Anvil',
        kind: 'craft',
        itemName: 'Iron Bar',
        startTime: 0,
        endTime: 100,
        localTime: 100,
        dependencies: ['ore'], // 'ore' node does NOT appear as a task in this schedule
      }),
    ])
    const result = mergeSchedules([{ itemName: 'Iron Bar', schedule: s1 }])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].itemName).toBe('Iron Bar')
    expect(result.tasks[0].startTime).toBe(0)
  })

  test('machine passive tasks serialize with each other but not with active tasks', () => {
    const machinePassive = {
      kind: 'machine' as const,
      machineName: 'Bakery',
      machineId: 'bakery',
      machineLevel: 0,
      baseInterval: 120,
      effectiveInterval: 120,
      outputAmount: 1,
      produced: 100,
      ratePerMin: 0.5,
    }
    // Need an active task to keep totalTime > 0 so passives aren't dropped
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'p1',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Bread',
        startTime: 0,
        endTime: 300,
        localTime: 300,
        passive: { ...machinePassive, linkedNodeId: 'keep' },
      }),
      makeTask({
        nodeId: 'keep',
        resource: 'Mining',
        kind: 'gather',
        startTime: 0,
        endTime: 500,
        localTime: 500,
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'p2',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Cake',
        startTime: 0,
        endTime: 200,
        localTime: 200,
        passive: { ...machinePassive, linkedNodeId: 'keep' },
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Bread', schedule: s1 },
      { itemName: 'Cake', schedule: s2 },
    ])
    const machineTasks = result.tasks
      .filter((t) => t.resource === 'Machine: Bakery')
      .toSorted((a, b) => a.startTime - b.startTime)
    // Passive tasks serialize with each other (machine can only run one recipe)
    expect(machineTasks.length).toBeGreaterThanOrEqual(2)
    expect(machineTasks[0].startTime).toBe(0)
    expect(machineTasks[1].startTime).toBeGreaterThanOrEqual(machineTasks[0].endTime)
  })

  test('fabrication passive bypass — Fabrication tasks start at 0 regardless of other tasks', () => {
    const fabPassive = {
      kind: 'fabrication' as const,
      fabricationPoints: 5,
      produced: 100,
      ratePerMin: 1.0,
      linkedNodeId: 'some-node',
    }
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'f1',
        resource: 'Fabrication: Gear',
        kind: 'fabrication',
        itemName: 'Gear',
        startTime: 0,
        endTime: 300,
        localTime: 300,
        passive: { ...fabPassive, linkedNodeId: 'some-node' },
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'f2',
        resource: 'Fabrication: Gear',
        kind: 'fabrication',
        itemName: 'Gear',
        startTime: 0,
        endTime: 200,
        localTime: 200,
        passive: { ...fabPassive, linkedNodeId: 'some-node' },
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Gear A', schedule: s1 },
      { itemName: 'Gear B', schedule: s2 },
    ])
    const fabTasks = result.tasks.filter((t) => t.resource.startsWith('Fabrication:'))
    expect(fabTasks.every((t) => t.startTime === 0)).toBe(true)
  })

  test('active-only totalTime — passive tasks (with passive field) do not inflate totalTime', () => {
    // Only tasks with the `passive` field set are excluded from totalTime computation.
    // A fabrication passive spanning 9999s should not affect totalTime when active ends at 100.
    const fabPassive = {
      kind: 'fabrication' as const,
      fabricationPoints: 5,
      produced: 100,
      ratePerMin: 1.0,
      linkedNodeId: 'active',
    }
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'active',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Iron',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'passive1',
        resource: 'Fabrication: Gear',
        kind: 'fabrication',
        itemName: 'Gear',
        startTime: 0,
        endTime: 9999,
        localTime: 9999,
        passive: fabPassive,
      }),
    ])
    const result = mergeSchedules([{ itemName: 'Iron', schedule: s1 }])
    expect(result.totalTime).toBe(100)
  })

  test('passive capping at totalTime — passive tasks past totalTime are capped or dropped', () => {
    // Active task drives totalTime=200.
    // passive-capped: starts at 0, ends at 500 → capped to endTime=200.
    // passive-dropped: machine passive serialized after active (startTime=200 >= totalTime=200) → dropped.
    const machinePassive = {
      kind: 'machine' as const,
      machineName: 'Bakery',
      machineId: 'bakery',
      machineLevel: 0,
      baseInterval: 120,
      effectiveInterval: 120,
      outputAmount: 1,
      produced: 100,
      ratePerMin: 0.5,
    }
    const fabPassive = {
      kind: 'fabrication' as const,
      fabricationPoints: 5,
      produced: 100,
      ratePerMin: 1.0,
    }
    // s1: active gather that drives totalTime
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'active',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Iron',
        startTime: 0,
        endTime: 200,
        localTime: 200,
      }),
    ])
    // s2: fabrication passive (starts at 0, will be capped) + machine passive (serializes after s1's active machine task)
    const s2 = makeSchedule([
      // Active machine task that occupies Machine: Bakery 0–200
      makeTask({
        nodeId: 'active-machine',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Bread',
        startTime: 0,
        endTime: 200,
        localTime: 200,
      }),
      // Fabrication passive — starts at 0, extends to 500; will be capped to 200
      makeTask({
        nodeId: 'passive-capped',
        resource: 'Fabrication: Gear',
        kind: 'fabrication',
        itemName: 'Gear',
        startTime: 0,
        endTime: 500,
        localTime: 500,
        passive: { ...fabPassive, linkedNodeId: 'active', produced: 100 },
      }),
      // Machine passive that will serialize after active-machine (startTime=200 = totalTime → dropped)
      makeTask({
        nodeId: 'passive-dropped',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Cake',
        startTime: 0,
        endTime: 200,
        localTime: 200,
        passive: { ...machinePassive, linkedNodeId: 'active-machine', produced: 100 },
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Iron', schedule: s1 },
      { itemName: 'Gear', schedule: s2 },
    ])
    const capped = result.tasks.find((t) => t.nodeId.includes('passive-capped'))
    const dropped = result.tasks.find((t) => t.nodeId.includes('passive-dropped'))

    expect(capped).toBeDefined()
    expect(capped!.endTime).toBe(200)
    expect(dropped).toBeUndefined()
  })

  test('late passive filtering via linkedNodeId — passive starting after linked node completed is dropped', () => {
    // Setup: two trees share Machine: Bakery.
    // Tree 0: active machine task 0–100 (drives totalTime=300 via s1's mining task).
    // Tree 1: active machine task on Machine: Bakery 0–100.
    //   Then a passive machine task (also Machine: Bakery) serializes after tree0's task ends at 100 → startTime=100.
    //   The passive's linkedNodeId points to tree1's early-active (ends at 100 in tree1, merged to some endTime).
    //   We want startTime(of passive) >= completionTime(linkedNode).
    //
    // Simpler approach: put an active Machine: Bakery task in s1 (0–200) so the passive in s2
    // serializes to startTime=200. The linked node (early-active) in s2 ends at 100 (tree1 prefixed).
    // After merging: completionTimeByNode['tree1/early-active'] = 100. Passive startTime = 200 >= 100 → dropped.
    const machinePassive = {
      kind: 'machine' as const,
      machineName: 'Bakery',
      machineId: 'bakery',
      machineLevel: 0,
      baseInterval: 120,
      effectiveInterval: 120,
      outputAmount: 1,
      produced: 50,
      ratePerMin: 0.5,
    }
    // s1: long mining task drives totalTime, plus machine task occupying Bakery 0–200
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'mining',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Iron',
        startTime: 0,
        endTime: 300,
        localTime: 300,
      }),
      makeTask({
        nodeId: 'bakery-blocker',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Bread',
        startTime: 0,
        endTime: 200,
        localTime: 200,
      }),
    ])
    // s2: short active task ending at 100, then passive machine linked to it
    // After merge: passive serializes after bakery-blocker (0–200), startTime=200
    //   completionTimeByNode['tree1/early-active'] = 100
    //   200 >= 100 → passive is dropped
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'early-active',
        resource: 'Anvil',
        kind: 'craft',
        itemName: 'Bar',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'late-passive',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Cake',
        startTime: 0,
        endTime: 100,
        localTime: 100,
        passive: { ...machinePassive, linkedNodeId: 'early-active', produced: 50 },
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Iron', schedule: s1 },
      { itemName: 'Bar', schedule: s2 },
    ])
    const latePassive = result.tasks.find((t) => t.nodeId.includes('late-passive'))
    expect(latePassive).toBeUndefined()
  })

  test('mixed active + passive on same machine resource — no overlap', () => {
    // Active machine task: 100–300 on Machine: Bakery.
    // Passive machine task: 0–500 (background production).
    // Passive gets clipped around active → two segments: 0–100 and 300–500.
    const machinePassive = {
      kind: 'machine' as const,
      machineName: 'Bakery',
      machineId: 'bakery',
      machineLevel: 0,
      baseInterval: 120,
      effectiveInterval: 120,
      outputAmount: 1,
      produced: 50,
      ratePerMin: 0.5,
    }
    const s1 = makeSchedule([
      makeTask({
        nodeId: 'active-machine',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Bread',
        startTime: 100,
        endTime: 300,
        localTime: 200,
        dependencies: ['gather-dep'],
      }),
      makeTask({
        nodeId: 'gather-dep',
        resource: 'Mining',
        kind: 'gather',
        itemName: 'Wheat',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'long-gather',
        resource: 'Farming',
        kind: 'gather',
        itemName: 'Iron',
        startTime: 0,
        endTime: 500,
        localTime: 500,
      }),
    ])
    const s2 = makeSchedule([
      makeTask({
        nodeId: 'passive-machine',
        resource: 'Machine: Bakery',
        kind: 'machine',
        itemName: 'Flour',
        startTime: 0,
        endTime: 500,
        localTime: 500,
        passive: { ...machinePassive, linkedNodeId: 'long-gather', produced: 50 },
      }),
    ])
    const result = mergeSchedules([
      { itemName: 'Bread', schedule: s1 },
      { itemName: 'Flour', schedule: s2 },
    ])
    const machineTasks = result.tasks
      .filter((t) => t.resource === 'Machine: Bakery')
      .toSorted((a, b) => a.startTime - b.startTime)

    // Active task + two passive segments clipped around it
    expect(machineTasks.length).toBe(3)
    // First passive segment fills gap before active
    expect(machineTasks[0].passive).toBeTruthy()
    expect(machineTasks[0].startTime).toBe(0)
    expect(machineTasks[0].endTime).toBe(100)
    // Active task
    expect(machineTasks[1].passive).toBeFalsy()
    expect(machineTasks[1].startTime).toBe(100)
    expect(machineTasks[1].endTime).toBe(300)
    // Second passive segment fills gap after active
    expect(machineTasks[2].passive).toBeTruthy()
    expect(machineTasks[2].startTime).toBe(300)
    expect(machineTasks[2].endTime).toBe(500)
  })
})
