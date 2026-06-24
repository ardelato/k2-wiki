import { mount } from '@vue/test-utils'

import SummoningObjectiveCard from '@/components/summoning-planner/SummoningObjectiveCard.vue'
import type { PlannerLockedGate } from '@/types'

vi.mock('@/utils/format/format', () => ({
  formatNumber: (n: number) => n.toLocaleString('en-US'),
  itemTypeColor: () => '#888',
}))
vi.mock('@/utils/images/itemImages', () => ({
  getItemImage: () => undefined,
}))

vi.mock('vue-router', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, useRoute: () => ({ path: '/planner' }) }
})

const stubs = {
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
  // Render both slots so the popover content is assertable without simulating hover.
  AppTooltip: { name: 'AppTooltip', template: '<div><slot /><slot name="content" /></div>' },
}

function mountCard(opts: { lockedGate: PlannerLockedGate | null; have?: number; need?: number }) {
  return mount(SummoningObjectiveCard, {
    props: {
      itemId: 'volcanic-rock',
      itemName: 'Volcanic Rock',
      itemType: 'Resource',
      totalNeeded: opts.need ?? 50,
      inventoryAmount: opts.have ?? 0,
      sourceLabel: 'Digging',
      lockedGate: opts.lockedGate,
    },
    global: { stubs },
  })
}

const GATE: PlannerLockedGate = { skill: 'Digging', level: 80, current: 45 }
const EXPECTED_TARGET = {
  name: 'planner',
  query: { tab: 'skills', skill: 'digging', target: '80' },
}

describe('SummoningObjectiveCard — skill-gate lock chip (#2)', () => {
  test('locked + unfulfilled: chip deep-links to skills tab and replaces the Need value', () => {
    const w = mountCard({ lockedGate: GATE })
    const link = w.findComponent({ name: 'RouterLink' })
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toEqual(EXPECTED_TARGET)
    expect(link.text()).toContain('L80')
    // chip stands in for the deficit value
    expect(w.text()).not.toContain('Need')
  })

  test('popover content states the requirement, the current level, and the plan CTA', () => {
    const w = mountCard({ lockedGate: GATE })
    expect(w.text()).toContain('Requires Digging Lv80')
    expect(w.text()).toContain('(LVL 45)')
    expect(w.text()).toContain('Click to plan Digging')
  })

  test('hides the lock once the objective is fulfilled from inventory', () => {
    const w = mountCard({ lockedGate: GATE, have: 50, need: 50 })
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
    expect(w.text()).not.toContain('L80')
  })

  test('unlocked: no lock chrome, keeps the Need value', () => {
    const w = mountCard({ lockedGate: null, have: 0, need: 50 })
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
    expect(w.text()).toContain('Need')
  })
})
