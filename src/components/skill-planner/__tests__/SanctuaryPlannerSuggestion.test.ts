import { mount } from '@vue/test-utils'

import SanctuaryPlannerSuggestion from '@/components/skill-planner/SanctuaryPlannerSuggestion.vue'
import type { SanctuaryRosterDiff } from '@/utils/planner/skillAdvisories'

vi.mock('@/utils/format/icons', () => ({
  jobIcons: {} as Record<string, string>,
}))

// The roster swap rendering is covered by SanctuaryPartyDiff's own test; stub it here
// and just verify the panel wires it up (passes the diff, forwards inspect).
vi.mock('@/components/skill-planner/SanctuaryPartyDiff.vue', () => ({
  default: {
    name: 'SanctuaryPartyDiff',
    props: ['diff'],
    emits: ['inspect'],
    template: `<button class="diff-stub" @click="$emit('inspect', 'a')">diff</button>`,
  },
}))

function diff(overrides: Partial<SanctuaryRosterDiff> = {}): SanctuaryRosterDiff {
  return {
    target: { job: 'Mining', from: 1, to: 3 },
    keep: [{ id: 'a', name: 'Keeper', contribution: 5 }],
    swapOut: [{ id: 'b', name: 'Bench Me', contribution: 0 }],
    swapIn: [{ id: 'c', name: 'New Star', contribution: 8 }],
    sideEffects: [],
    ...overrides,
  }
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(SanctuaryPlannerSuggestion, {
    props: {
      job: 'Mining',
      suggestedTier: 3,
      diff: diff(),
      ...overrides,
    },
  })
}

describe('SanctuaryPlannerSuggestion', () => {
  test('renders the suggested job and tier', () => {
    const w = mountPanel()
    expect(w.text()).toContain('Skill Planner suggests')
    expect(w.text()).toContain('Mining → Tier 3')
  })

  test('renders the roster-swap diff child', () => {
    const w = mountPanel()
    expect(w.findComponent({ name: 'SanctuaryPartyDiff' }).exists()).toBe(true)
  })

  test('forwards inspect from the diff child', async () => {
    const w = mountPanel()
    await w.find('.diff-stub').trigger('click')
    expect(w.emitted('inspect')?.[0]).toEqual(['a'])
  })

  test('emits apply when the Apply button is clicked', async () => {
    const w = mountPanel()
    const apply = w.findAll('button').find((b) => b.text().includes('Apply'))
    await apply?.trigger('click')
    expect(w.emitted('apply')).toHaveLength(1)
  })

  test('emits dismiss when the Dismiss button is clicked', async () => {
    const w = mountPanel()
    const dismiss = w.findAll('button').find((b) => b.text().trim() === 'Dismiss')
    await dismiss?.trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
