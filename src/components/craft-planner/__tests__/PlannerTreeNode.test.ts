import { mount } from '@vue/test-utils'

import PlannerTreeNode from '@/components/craft-planner/PlannerTreeNode.vue'
import type { PlannerLockedGate, PlannerMethod, PlannerNode } from '@/types'

vi.mock('@/utils/format/format', () => ({
  formatNumber: (n: number) => n.toLocaleString('en-US'),
  itemTypeColor: () => '#888',
}))
vi.mock('@/utils/format/icons', () => ({
  sourceIcons: {} as Record<string, string>,
}))
vi.mock('@/utils/images/itemImages', () => ({
  getItemImage: () => undefined,
}))
vi.mock('@/utils/planner/modifierChips', () => ({
  extractModifierChips: () => [],
}))

vi.mock('vue-router', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, useRoute: () => ({ path: '/planner' }) }
})

const stubs = {
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}

function gatherMethod(): PlannerMethod {
  return {
    id: 'm1',
    nodeId: 'n1',
    kind: 'gather',
    title: 'Digging',
    subtitle: 'Ember Pits',
    requiredAmount: 10,
    localTimeSeconds: 1,
    totalTimeSeconds: 1,
    cost: null,
    detailRows: [],
    notes: [],
    children: [],
    skillGate: { skill: 'Digging', level: 80 },
  } as unknown as PlannerMethod
}

function gatherNode(): PlannerNode {
  return {
    id: 'n1',
    itemId: 'volcanic-rock',
    itemName: 'Volcanic Rock',
    itemType: 'Resource',
    requiredAmount: 10,
    grossAmount: 10,
    depth: 1,
    defaultMethodId: 'm1',
    methods: [gatherMethod()],
    issues: [],
    fulfilled: false,
  } as unknown as PlannerNode
}

function mountNode(lockedGateByNode: Record<string, PlannerLockedGate>) {
  const node = gatherNode()
  return mount(PlannerTreeNode, {
    props: {
      node,
      nodesById: { n1: node },
      activeMethodIdByNode: { n1: 'm1' },
      selectedNodeId: null,
      selectedMethodId: null,
      collapsedNodeIds: new Set<string>(),
      inventoryAmounts: {},
      completionTimeByNode: {},
      lockedGateByNode,
    },
    global: { stubs },
  })
}

describe('PlannerTreeNode — skill-gate lock (#2)', () => {
  test('flags a node locked via the per-node gate map and deep-links to the skills tab', () => {
    const w = mountNode({ n1: { skill: 'Digging', level: 80, current: 45 } })
    expect(w.text()).toContain('Digging Lv80')
    expect(w.text()).toContain("you're 45")

    const cta = w.findAllComponents({ name: 'RouterLink' }).find((l) => l.text().includes('Plan'))
    expect(cta).toBeDefined()
    expect(cta!.props('to')).toEqual({
      name: 'planner',
      query: { tab: 'skills', skill: 'digging', target: '80' },
    })
  })

  test('renders no lock chrome when the node is not in the gate map', () => {
    const w = mountNode({})
    expect(w.text()).not.toContain('Lv80')
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
  })
})
