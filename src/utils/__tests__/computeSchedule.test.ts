import { computeSchedule } from '@/composables/useCraftPlanner'
import type { PlannerModifiers } from '@/composables/useCraftPlanner'
import type { PlannerMethod, PlannerNode } from '@/types'

const DEFAULT_MODIFIERS: PlannerModifiers = {
  gardenFlowers: {},
  awakenGatherUpgrades: {},
  awakenSpeedTiers: {},
  jobTiers: {},
  goldPerMinute: 0,
  machineLevels: {},
  fabricationAllocations: {},
  expeditionTier: 5,
}

function makeNode(overrides: Partial<PlannerNode> & { id: string; itemId: string }): PlannerNode {
  return {
    itemName: overrides.itemId,
    itemType: 'Gathered',
    requiredAmount: 1,
    depth: 0,
    defaultMethodId: null,
    methods: [],
    issues: [],
    fulfilled: false,
    ...overrides,
  }
}

function makeMethod(
  overrides: Partial<PlannerMethod> & { id: string; nodeId: string; kind: PlannerMethod['kind'] },
): PlannerMethod {
  return {
    title: overrides.id,
    subtitle: '',
    requiredAmount: 1,
    localTimeSeconds: 60,
    totalTimeSeconds: 60,
    cost: null,
    detailRows: [],
    notes: [],
    children: [],
    ...overrides,
  }
}

describe('computeSchedule', () => {
  test('resource serialization — two craft nodes on same workstation run sequentially', () => {
    const methodA = makeMethod({
      id: 'method-a',
      nodeId: 'node-a',
      kind: 'craft',
      title: 'Stove',
      localTimeSeconds: 100,
      totalTimeSeconds: 100,
    })
    const methodB = makeMethod({
      id: 'method-b',
      nodeId: 'node-b',
      kind: 'craft',
      title: 'Stove',
      localTimeSeconds: 80,
      totalTimeSeconds: 80,
    })

    const nodeA = makeNode({
      id: 'node-a',
      itemId: 'item-a',
      itemName: 'Item A',
      methods: [methodA],
      defaultMethodId: 'method-a',
    })
    const nodeB = makeNode({
      id: 'node-b',
      itemId: 'item-b',
      itemName: 'Item B',
      methods: [methodB],
      defaultMethodId: 'method-b',
    })

    // nodeA is root, nodeB is a child dependency
    const methodRoot = makeMethod({
      id: 'method-root',
      nodeId: 'node-root',
      kind: 'craft',
      title: 'Workbench',
      localTimeSeconds: 50,
      totalTimeSeconds: 230,
      children: [
        { itemId: 'item-a', amount: 1, nodeId: 'node-a' },
        { itemId: 'item-b', amount: 1, nodeId: 'node-b' },
      ],
    })
    const nodeRoot = makeNode({
      id: 'node-root',
      itemId: 'item-root',
      itemName: 'Root Item',
      methods: [methodRoot],
      defaultMethodId: 'method-root',
      depth: 0,
    })

    const nodesById = { 'node-root': nodeRoot, 'node-a': nodeA, 'node-b': nodeB }
    const methodsById = { 'method-root': methodRoot, 'method-a': methodA, 'method-b': methodB }
    const activeMethodIdByNode = {
      'node-root': 'method-root',
      'node-a': 'method-a',
      'node-b': 'method-b',
    }

    const result = computeSchedule(nodeRoot, nodesById, activeMethodIdByNode, methodsById)

    const stoveTasks = result.tasks.filter((t) => t.resource === 'Stove')
    expect(stoveTasks).toHaveLength(2)
    stoveTasks.sort((a, b) => a.startTime - b.startTime)
    // Second task must start after first ends (serialized)
    expect(stoveTasks[1].startTime).toBeGreaterThanOrEqual(stoveTasks[0].endTime)
  })

  test('dependency ordering — craft waits for child gather to complete', () => {
    const gatherMethod = makeMethod({
      id: 'method-gather',
      nodeId: 'node-ore',
      kind: 'gather',
      title: 'Mining',
      localTimeSeconds: 100,
      totalTimeSeconds: 100,
    })
    const craftMethod = makeMethod({
      id: 'method-craft',
      nodeId: 'node-bar',
      kind: 'craft',
      title: 'Furnace',
      localTimeSeconds: 60,
      totalTimeSeconds: 160,
      children: [{ itemId: 'ore', amount: 1, nodeId: 'node-ore' }],
    })

    const nodeOre = makeNode({
      id: 'node-ore',
      itemId: 'ore',
      itemName: 'Ore',
      methods: [gatherMethod],
      defaultMethodId: 'method-gather',
      depth: 1,
    })
    const nodeBar = makeNode({
      id: 'node-bar',
      itemId: 'bar',
      itemName: 'Bar',
      methods: [craftMethod],
      defaultMethodId: 'method-craft',
      depth: 0,
    })

    const nodesById = { 'node-ore': nodeOre, 'node-bar': nodeBar }
    const methodsById = { 'method-gather': gatherMethod, 'method-craft': craftMethod }
    const activeMethodIdByNode = { 'node-ore': 'method-gather', 'node-bar': 'method-craft' }

    const result = computeSchedule(nodeBar, nodesById, activeMethodIdByNode, methodsById)

    const gatherTask = result.tasks.find((t) => t.resource === 'Mining')!
    const craftTask = result.tasks.find((t) => t.resource === 'Furnace')!

    expect(gatherTask).toBeDefined()
    expect(craftTask).toBeDefined()
    expect(craftTask.startTime).toBeGreaterThanOrEqual(gatherTask.endTime)
  })

  test('parallel resources — tasks on different resources both start at 0', () => {
    const miningMethod = makeMethod({
      id: 'method-mine',
      nodeId: 'node-ore',
      kind: 'gather',
      title: 'Mining',
      localTimeSeconds: 60,
      totalTimeSeconds: 60,
    })
    const farmMethod = makeMethod({
      id: 'method-farm',
      nodeId: 'node-wheat',
      kind: 'gather',
      title: 'Farming',
      localTimeSeconds: 60,
      totalTimeSeconds: 60,
    })
    const craftMethod = makeMethod({
      id: 'method-craft',
      nodeId: 'node-root',
      kind: 'craft',
      title: 'Workbench',
      localTimeSeconds: 30,
      totalTimeSeconds: 90,
      children: [
        { itemId: 'ore', amount: 1, nodeId: 'node-ore' },
        { itemId: 'wheat', amount: 1, nodeId: 'node-wheat' },
      ],
    })

    const nodeOre = makeNode({
      id: 'node-ore',
      itemId: 'ore',
      itemName: 'Ore',
      methods: [miningMethod],
      defaultMethodId: 'method-mine',
      depth: 1,
    })
    const nodeWheat = makeNode({
      id: 'node-wheat',
      itemId: 'wheat',
      itemName: 'Wheat',
      methods: [farmMethod],
      defaultMethodId: 'method-farm',
      depth: 1,
    })
    const nodeRoot = makeNode({
      id: 'node-root',
      itemId: 'result',
      itemName: 'Result',
      methods: [craftMethod],
      defaultMethodId: 'method-craft',
      depth: 0,
    })

    const nodesById = { 'node-root': nodeRoot, 'node-ore': nodeOre, 'node-wheat': nodeWheat }
    const methodsById = {
      'method-craft': craftMethod,
      'method-mine': miningMethod,
      'method-farm': farmMethod,
    }
    const activeMethodIdByNode = {
      'node-root': 'method-craft',
      'node-ore': 'method-mine',
      'node-wheat': 'method-farm',
    }

    const result = computeSchedule(nodeRoot, nodesById, activeMethodIdByNode, methodsById)

    const mineTask = result.tasks.find((t) => t.resource === 'Mining')!
    const farmTask = result.tasks.find((t) => t.resource === 'Farming')!

    expect(mineTask.startTime).toBe(0)
    expect(farmTask.startTime).toBe(0)
  })

  test('fulfilled nodes return 0 — fulfilled node creates no task', () => {
    const craftMethod = makeMethod({
      id: 'method-craft',
      nodeId: 'node-bar',
      kind: 'craft',
      title: 'Furnace',
      localTimeSeconds: 60,
      totalTimeSeconds: 60,
      children: [{ itemId: 'ore', amount: 1, nodeId: 'node-ore' }],
    })

    const nodeOre = makeNode({
      id: 'node-ore',
      itemId: 'ore',
      itemName: 'Ore',
      fulfilled: true,
      methods: [],
      defaultMethodId: null,
      depth: 1,
    })
    const nodeBar = makeNode({
      id: 'node-bar',
      itemId: 'bar',
      itemName: 'Bar',
      methods: [craftMethod],
      defaultMethodId: 'method-craft',
      depth: 0,
    })

    const nodesById = { 'node-ore': nodeOre, 'node-bar': nodeBar }
    const methodsById = { 'method-craft': craftMethod }
    const activeMethodIdByNode = { 'node-ore': null, 'node-bar': 'method-craft' }

    const result = computeSchedule(nodeBar, nodesById, activeMethodIdByNode, methodsById)

    // No task for the fulfilled ore node
    expect(result.tasks.find((t) => t.itemId === 'ore')).toBeUndefined()
    // Craft task starts at 0 since dependency is fulfilled
    const craftTask = result.tasks.find((t) => t.resource === 'Furnace')!
    expect(craftTask).toBeDefined()
    expect(craftTask.startTime).toBe(0)
  })

  test('passive machine lane generation — machine not used as active method gets passive lane', () => {
    // Use actual item that has a machine recipe — but we can test the structure
    // by using modifiers.fabricationAllocations for a simpler passive lane test
    const gatherMethod = makeMethod({
      id: 'method-gather',
      nodeId: 'node-item',
      kind: 'gather',
      title: 'Mining',
      localTimeSeconds: 120,
      totalTimeSeconds: 120,
    })
    const nodeItem = makeNode({
      id: 'node-item',
      itemId: 'iron-ore',
      itemName: 'Iron Ore',
      methods: [gatherMethod],
      defaultMethodId: 'method-gather',
      depth: 0,
    })

    const nodesById = { 'node-item': nodeItem }
    const methodsById = { 'method-gather': gatherMethod }
    const activeMethodIdByNode = { 'node-item': 'method-gather' }

    const modifiers: PlannerModifiers = {
      ...DEFAULT_MODIFIERS,
      fabricationAllocations: { 'iron-ore': 3 },
    }

    const result = computeSchedule(
      nodeItem,
      nodesById,
      activeMethodIdByNode,
      methodsById,
      modifiers,
    )

    const fabTask = result.tasks.find((t) => t.resource.startsWith('Fabrication:'))
    expect(fabTask).toBeDefined()
    expect(fabTask!.passive).toBeDefined()
    expect(fabTask!.passive!.kind).toBe('fabrication')
  })

  test('passive machine lane exclusion — machine IS active method, no duplicate passive lane', () => {
    // When fabrication is the active method, no fabrication passive lane is added
    const fabMethod = makeMethod({
      id: 'method-fab',
      nodeId: 'node-item',
      kind: 'fabrication',
      title: 'Fabrication',
      localTimeSeconds: 120,
      totalTimeSeconds: 120,
    })
    const nodeItem = makeNode({
      id: 'node-item',
      itemId: 'some-item',
      itemName: 'Some Item',
      methods: [fabMethod],
      defaultMethodId: 'method-fab',
      depth: 0,
    })

    const nodesById = { 'node-item': nodeItem }
    const methodsById = { 'method-fab': fabMethod }
    const activeMethodIdByNode = { 'node-item': 'method-fab' }

    const modifiers: PlannerModifiers = {
      ...DEFAULT_MODIFIERS,
      fabricationAllocations: { 'some-item': 5 },
    }

    const result = computeSchedule(
      nodeItem,
      nodesById,
      activeMethodIdByNode,
      methodsById,
      modifiers,
    )

    // Fabrication is the active method — no additional passive lane
    const passiveFabTasks = result.tasks.filter(
      (t) => t.resource.startsWith('Fabrication:') && t.passive,
    )
    expect(passiveFabTasks).toHaveLength(0)
  })
})
