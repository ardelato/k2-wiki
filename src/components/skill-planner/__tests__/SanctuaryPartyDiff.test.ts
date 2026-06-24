import { mount } from '@vue/test-utils'

import SanctuaryPartyDiff from '@/components/skill-planner/SanctuaryPartyDiff.vue'
import type { SanctuaryRosterDiff } from '@/utils/planner/skillAdvisories'

vi.mock('@/utils/format/icons', () => ({
  jobIcons: {} as Record<string, string>,
}))

// Stub the creature tile; assert on the names/ids the diff passes through.
vi.mock('@/components/skill-planner/CreatureDiffTile.vue', () => ({
  default: {
    name: 'CreatureDiffTile',
    props: ['id', 'name', 'contribution', 'variant'],
    emits: ['inspect'],
    template: `<button class="tile" :data-variant="variant" @click="$emit('inspect', id)">{{ name }}</button>`,
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

function mountDiff(overrides: Partial<SanctuaryRosterDiff> = {}) {
  return mount(SanctuaryPartyDiff, { props: { diff: diff(overrides) } })
}

describe('SanctuaryPartyDiff', () => {
  test('renders remove / add / keep creatures by variant', () => {
    const w = mountDiff()
    const byVariant = (v: string) => w.findAll(`.tile[data-variant="${v}"]`).map((t) => t.text())
    expect(byVariant('remove')).toContain('Bench Me')
    expect(byVariant('add')).toContain('New Star')
    expect(byVariant('keep')).toContain('Keeper')
  })

  test('renders the resulting tier change for the target job (rising)', () => {
    const w = mountDiff()
    expect(w.text()).toContain('Resulting tier changes')
    expect(w.text()).toContain('Mining')
    expect(w.text()).toContain('▲')
  })

  test('shows shared-slot side-effect tier moves (falling)', () => {
    const w = mountDiff({ sideEffects: [{ job: 'Fishing', from: 2, to: 1 }] })
    expect(w.text()).toContain('Fishing')
    expect(w.text()).toContain('▼')
  })

  test('forwards inspect with the creature id from a tile', async () => {
    const w = mountDiff()
    await w.find('.tile[data-variant="remove"]').trigger('click')
    expect(w.emitted('inspect')?.[0]).toEqual(['b'])
  })
})
