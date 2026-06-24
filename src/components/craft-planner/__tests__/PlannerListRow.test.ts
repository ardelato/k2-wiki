import { mount } from '@vue/test-utils'

import PlannerListRow from '@/components/craft-planner/PlannerListRow.vue'
import type { PlannerLockedGate, PlannerMethod, PlannerNode } from '@/types'

vi.mock('@/utils/format/format', () => ({
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
  PlannerRecommendation: { name: 'PlannerRecommendation', template: '<div />' },
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
    methods: [],
    issues: [],
    fulfilled: false,
  } as unknown as PlannerNode
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

function mountRow(lockedGate: PlannerLockedGate | null) {
  return mount(PlannerListRow, {
    props: {
      node: gatherNode(),
      activeMethod: gatherMethod(),
      inventoryAmount: 0,
      queuedAmount: 0,
      recommendation: null,
      subtreeCost: null,
      lockedGate,
    },
    global: { stubs },
  })
}

describe('PlannerListRow — skill-gate lock (#2)', () => {
  test('renders the lock flag with skill, required level, and current level', () => {
    const w = mountRow({ skill: 'Digging', level: 80, current: 45 })
    expect(w.text()).toContain('Digging Lv80')
    expect(w.text()).toContain("you're 45")
  })

  test('CTA deep-links to the skills tab aimed at the unlocking level', () => {
    const w = mountRow({ skill: 'Digging', level: 80, current: 45 })
    const links = w.findAllComponents({ name: 'RouterLink' })
    const cta = links.find((l) => l.text().includes('Plan Digging'))
    expect(cta).toBeDefined()
    expect(cta!.props('to')).toEqual({
      name: 'planner',
      query: { tab: 'skills', skill: 'digging', target: '80' },
    })
  })

  test('renders no lock chrome when the resource is unlocked', () => {
    const w = mountRow(null)
    expect(w.text()).not.toContain('Lv80')
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
  })
})
