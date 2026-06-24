import type { ScheduledTask } from '@/types'
import {
  barSpan,
  mergePassiveTasks,
  mergeConsecutiveSameItem,
  getResourceGroupKey,
} from '@/utils/planner/ganttHelpers'

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

describe('barSpan', () => {
  test('empty array returns 0', () => {
    expect(barSpan([])).toBe(0)
  })

  test('single task returns its localTime', () => {
    const tasks = [
      makeTask({ nodeId: 'n1', resource: 'Mining', startTime: 0, endTime: 60, localTime: 60 }),
    ]
    expect(barSpan(tasks)).toBe(60)
  })

  test('sequential tasks returns max(endTime) - min(startTime)', () => {
    const tasks = [
      makeTask({ nodeId: 'n1', resource: 'Mining', startTime: 0, endTime: 100, localTime: 100 }),
      makeTask({ nodeId: 'n2', resource: 'Mining', startTime: 100, endTime: 180, localTime: 80 }),
    ]
    expect(barSpan(tasks)).toBe(180)
  })

  test('tasks with gaps returns full span including gaps', () => {
    const tasks = [
      makeTask({ nodeId: 'n1', resource: 'Mining', startTime: 0, endTime: 60, localTime: 60 }),
      makeTask({ nodeId: 'n2', resource: 'Mining', startTime: 120, endTime: 180, localTime: 60 }),
    ]
    // Span = 180 - 0 = 180, but sum of localTimes = 120
    expect(barSpan(tasks)).toBe(180)
    expect(barSpan(tasks)).toBeGreaterThan(120)
  })

  test('overlapping tasks returns span of union, not sum', () => {
    const tasks = [
      makeTask({
        nodeId: 'n1',
        resource: 'Fabrication: X',
        startTime: 0,
        endTime: 300,
        localTime: 300,
      }),
      makeTask({
        nodeId: 'n2',
        resource: 'Fabrication: X',
        startTime: 0,
        endTime: 200,
        localTime: 200,
      }),
    ]
    // Union span = max(300, 200) - min(0, 0) = 300, not 500
    expect(barSpan(tasks)).toBe(300)
  })
})

describe('mergePassiveTasks', () => {
  const fabPassive = {
    kind: 'fabrication' as const,
    fabricationPoints: 5,
    produced: 50,
    ratePerMin: 1.0,
    linkedNodeId: 'some-node',
  }

  test('overlapping same-item fabrication passives are merged into one bar with summed produced', () => {
    const tasks = [
      makeTask({
        nodeId: 'f1',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'fabrication',
        startTime: 0,
        endTime: 300,
        localTime: 300,
        passive: { ...fabPassive, produced: 50 },
      }),
      makeTask({
        nodeId: 'f2',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'fabrication',
        startTime: 0,
        endTime: 200,
        localTime: 200,
        passive: { ...fabPassive, produced: 30 },
      }),
    ]
    const result = mergePassiveTasks(tasks, 'Fabrication: Wheat')
    expect(result).toHaveLength(1)
    expect(result[0].passive?.produced).toBe(80)
    expect(result[0].endTime).toBe(300)
  })

  test('non-overlapping same-item passives stay separate', () => {
    const tasks = [
      makeTask({
        nodeId: 'f1',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'fabrication',
        startTime: 0,
        endTime: 100,
        localTime: 100,
        passive: { ...fabPassive, produced: 50 },
      }),
      makeTask({
        nodeId: 'f2',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'fabrication',
        startTime: 200,
        endTime: 300,
        localTime: 100,
        passive: { ...fabPassive, produced: 30 },
      }),
    ]
    const result = mergePassiveTasks(tasks, 'Fabrication: Wheat')
    expect(result).toHaveLength(2)
  })

  test('machine passives never merge — two Machine: Bakery tasks stay separate', () => {
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
      linkedNodeId: 'some-node',
    }
    const tasks = [
      makeTask({
        nodeId: 'm1',
        resource: 'Machine: Bakery',
        itemId: 'flour',
        itemName: 'Flour',
        kind: 'machine',
        startTime: 0,
        endTime: 200,
        localTime: 200,
        passive: { ...machinePassive, produced: 50 },
      }),
      makeTask({
        nodeId: 'm2',
        resource: 'Machine: Bakery',
        itemId: 'flour',
        itemName: 'Flour',
        kind: 'machine',
        startTime: 200,
        endTime: 400,
        localTime: 200,
        passive: { ...machinePassive, produced: 50 },
      }),
    ]
    const result = mergePassiveTasks(tasks, 'Machine: Bakery')
    expect(result).toHaveLength(2)
  })

  test('active tasks pass through unchanged', () => {
    const tasks = [
      makeTask({
        nodeId: 'n1',
        resource: 'Mining',
        kind: 'gather',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'n2',
        resource: 'Mining',
        kind: 'gather',
        startTime: 100,
        endTime: 200,
        localTime: 100,
      }),
    ]
    const result = mergePassiveTasks(tasks, 'Mining')
    expect(result).toHaveLength(2)
    expect(result[0].nodeId).toBe('n1')
    expect(result[1].nodeId).toBe('n2')
  })

  test('mixed active and passive — both coexist in output', () => {
    const tasks = [
      makeTask({
        nodeId: 'active',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'gather',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'passive1',
        resource: 'Fabrication: Wheat',
        itemId: 'wheat',
        itemName: 'Wheat',
        kind: 'fabrication',
        startTime: 0,
        endTime: 100,
        localTime: 100,
        passive: { ...fabPassive, produced: 40 },
      }),
    ]
    const result = mergePassiveTasks(tasks, 'Fabrication: Wheat')
    const activeResult = result.filter((t) => !t.passive)
    const passiveResult = result.filter((t) => !!t.passive)
    expect(activeResult).toHaveLength(1)
    expect(passiveResult).toHaveLength(1)
  })
})

describe('mergeConsecutiveSameItem', () => {
  test('single task returned as-is', () => {
    const tasks = [makeTask({ nodeId: 'a', resource: 'Buy: Egg', kind: 'buy', itemId: 'egg' })]
    expect(mergeConsecutiveSameItem(tasks)).toHaveLength(1)
  })

  test('consecutive same-item buy tasks merge into one', () => {
    const tasks = [
      makeTask({
        nodeId: 'a',
        resource: 'Buy: Egg',
        kind: 'buy',
        itemId: 'egg',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'b',
        resource: 'Buy: Egg',
        kind: 'buy',
        itemId: 'egg',
        startTime: 100,
        endTime: 180,
        localTime: 80,
      }),
    ]
    const result = mergeConsecutiveSameItem(tasks)
    expect(result).toHaveLength(1)
    expect(result[0].startTime).toBe(0)
    expect(result[0].endTime).toBe(180)
    expect(result[0].localTime).toBe(180)
  })

  test('merged task tracks all original nodeIds', () => {
    const tasks = [
      makeTask({
        nodeId: 'a',
        resource: 'Buy: Egg',
        kind: 'buy',
        itemId: 'egg',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'b',
        resource: 'Buy: Egg',
        kind: 'buy',
        itemId: 'egg',
        startTime: 100,
        endTime: 180,
        localTime: 80,
      }),
    ]
    const result = mergeConsecutiveSameItem(tasks) as ((typeof tasks)[0] & {
      _mergedNodeIds?: string[]
    })[]
    expect(result[0]._mergedNodeIds).toEqual(['a', 'b'])
  })

  test('different items are not merged', () => {
    const tasks = [
      makeTask({
        nodeId: 'a',
        resource: 'Buy: Egg',
        kind: 'buy',
        itemId: 'egg',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'b',
        resource: 'Buy: Milk',
        kind: 'buy',
        itemId: 'milk',
        startTime: 100,
        endTime: 180,
        localTime: 80,
      }),
    ]
    const result = mergeConsecutiveSameItem(tasks)
    expect(result).toHaveLength(2)
  })

  test('non-consecutive same-item tasks are not merged', () => {
    const tasks = [
      makeTask({
        nodeId: 'a',
        resource: 'Mining',
        kind: 'gather',
        itemId: 'ore',
        startTime: 0,
        endTime: 100,
        localTime: 100,
      }),
      makeTask({
        nodeId: 'b',
        resource: 'Mining',
        kind: 'gather',
        itemId: 'ore',
        startTime: 200,
        endTime: 300,
        localTime: 100,
      }),
    ]
    const result = mergeConsecutiveSameItem(tasks)
    expect(result).toHaveLength(2)
  })

  test('empty array returns empty', () => {
    expect(mergeConsecutiveSameItem([])).toHaveLength(0)
  })
})

describe('getResourceGroupKey', () => {
  test('kind gather maps to Gathering', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Mining', kind: 'gather' })]
    expect(getResourceGroupKey('Mining', tasks)).toBe('Gathering')
  })

  test('kind machine maps to Machines', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Machine: Bakery', kind: 'machine' })]
    expect(getResourceGroupKey('Machine: Bakery', tasks)).toBe('Machines')
  })

  test('kind craft on non-machine resource maps to Refining', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Workbench', kind: 'craft' })]
    expect(getResourceGroupKey('Workbench', tasks)).toBe('Refining')
  })

  test('Garden: prefix maps to Garden', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Garden: Fire Flower', kind: 'garden' })]
    expect(getResourceGroupKey('Garden: Fire Flower', tasks)).toBe('Garden')
  })

  test('Expedition: prefix maps to Expeditions', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Expedition: Loot', kind: 'expedition' })]
    expect(getResourceGroupKey('Expedition: Loot', tasks)).toBe('Expeditions')
  })

  test('Fabrication: prefix maps to Fabrication', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Fabrication: Gear', kind: 'fabrication' })]
    expect(getResourceGroupKey('Fabrication: Gear', tasks)).toBe('Fabrication')
  })

  test('Buy: prefix maps to Merchant', () => {
    const tasks = [makeTask({ nodeId: 'n1', resource: 'Buy: Potion', kind: 'buy' })]
    expect(getResourceGroupKey('Buy: Potion', tasks)).toBe('Merchant')
  })
})
