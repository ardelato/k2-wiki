import { mount } from '@vue/test-utils'

import LevelPlannerTimelineStep from '@/components/level-planner/LevelPlannerTimelineStep.vue'
import type { Creature, Expedition } from '@/types'
import type { AlternativeRoute, BoosterInfo, PlanStep } from '@/utils/planner/levelPlanner'

vi.mock('@/utils/images/creatureImages', () => ({
  getCreatureImage: (c: Creature | undefined) => `mock://${c?.id ?? 'unknown'}.png`,
}))

vi.mock('@/utils/images/itemImages', () => ({
  getItemImage: () => undefined,
}))

vi.mock('@/utils/format/icons', () => ({
  expeditionTierIcons: { 1: '', 2: '', 3: '', 4: '', 5: '' },
}))

vi.mock('@/utils/format/format', () => ({
  formatNumber: (n: number) => n.toLocaleString('en-US'),
  formatDecimal: (n: number, d = 2) => n.toFixed(d),
  formatDuration: (s: number) => `${s}s`,
  itemName: (id: string) => id,
}))

vi.mock('@/components/beastiary/CreatureDetail.vue', () => ({
  default: { name: 'CreatureDetail', render: () => null },
}))

vi.mock('@/components/shared/RightClickHint.vue', () => ({
  default: {
    name: 'RightClickHint',
    template: '<div class="rch"><slot /></div>',
  },
}))

vi.mock('@/composables/useCreatureDrawer', () => ({
  useCreatureDrawer: () => ({
    selectedCreature: { value: null },
    drawerOpen: { value: false },
    toggleCreature: vi.fn(),
    closeDrawer: vi.fn(),
  }),
}))

function makeCreature(id: string, name: string): Creature {
  return {
    id,
    name,
    mainJob: 'chopping',
    description: '',
    image: '',
    tier: 0,
    trait: 'learner',
    types: ['Fire'],
    stats: { power: 1, grit: 1, agility: 1, smarts: 1, looting: 1, luck: 1 },
    jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
    summoningCost: [],
  }
}

function makeExpedition(id: string, name: string): Expedition {
  return {
    id,
    name,
    biome: 'forest',
    trait: 'learner',
    baseRating: 100,
    baseXP: 50,
    maxPartySize: 3,
    statWeights: { power: 1, grit: 0, agility: 0, smarts: 0, looting: 0, luck: 0 },
    rewards: [{ itemId: 'log', rarity: 'common', amount: 1, dropRate: 1 }],
  } as unknown as Expedition
}

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  const expedition = makeExpedition('exp-a', 'Forest Expedition')
  return {
    kind: 'run',
    expedition,
    tier: 1,
    fromLevel: 1,
    toLevel: 10,
    runs: 5,
    timeSeconds: 1500,
    xpPerRun: 100,
    durationPerRun: 300,
    xpPerMinute: 20,
    startXpPerMinute: 20,
    endXpPerMinute: 20,
    biomeName: 'Forest',
    traitMatch: true,
    biomeStatus: 'neutral',
    ...overrides,
  }
}

function makeBooster(id: string, name: string): BoosterInfo {
  return { creature: makeCreature(id, name), level: 120, rating: 5000 }
}

describe('LevelPlannerTimelineStep — booster chips', () => {
  const baseProps = {
    index: 0,
    creatureName: 'Target',
    isFirst: true,
    isLast: true,
    expanded: false,
    timePercent: 100,
  }

  test('does not render Bring row when step has no boosters', () => {
    const step = makeStep()
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })
    expect(wrapper.text()).not.toContain('Bring:')
  })

  test('renders Bring row with chips matching the Expeditions chip design', () => {
    const boosters = [makeBooster('b1', 'Helper One'), makeBooster('b2', 'Helper Two')]
    const step = makeStep({
      boosters,
      partySize: 3,
      boosterTimeSavings: 500,
    })

    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })

    // Label is present
    expect(wrapper.text()).toContain('Bring:')

    // Both booster names render
    expect(wrapper.text()).toContain('Helper One')
    expect(wrapper.text()).toContain('Helper Two')

    // Each chip uses the Expeditions card design and exposes the avatar
    const chipImgs = wrapper
      .findAll('img')
      .filter((img) => img.attributes('src')?.startsWith('mock://b'))
    expect(chipImgs).toHaveLength(2)
    for (const img of chipImgs) {
      const chip = img.element.closest('div')!.parentElement!
      // The chip wrapper is a sibling div wrapping the avatar + name
      expect(chip.className).toContain('inline-flex')
      expect(chip.className).toContain('rounded-lg')
      expect(chip.className).toContain('border-border')
      expect(chip.className).toContain('bg-muted/35')
      // Hover-affordance classes must NOT be present (chips are not left-clickable)
      expect(chip.className).not.toContain('hover:border-accent/45')
      expect(chip.className).not.toContain('hover:bg-muted/50')
      expect(chip.className).not.toContain('transition')
    }
  })

  test('renders the % faster savings label when boosterTimeSavings is positive', () => {
    const step = makeStep({
      boosters: [makeBooster('b1', 'Helper One')],
      partySize: 2,
      // 500s saved out of 2000s total (1500 step + 500 saved) ≈ 25%
      timeSeconds: 1500,
      boosterTimeSavings: 500,
    })
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })
    expect(wrapper.text()).toContain('25% faster')
  })

  test('hides generic partyTip when concrete boosters are recommended', () => {
    const step = makeStep({
      boosters: [makeBooster('b1', 'Helper One')],
      partySize: 2,
      partyTip: '40% faster with full party',
    })
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })
    expect(wrapper.text()).not.toContain('with full party')
  })

  test('does not render Bring row in party mode (when partyMembers present)', () => {
    const step = makeStep({
      boosters: [makeBooster('b1', 'Helper One')],
      partySize: 2,
    })
    const wrapper = mount(LevelPlannerTimelineStep, {
      props: {
        ...baseProps,
        step,
        partyMembers: [{ creatureId: 'p1', fromLevel: 1, toLevel: 10, xpGained: 0 }],
      },
    })
    expect(wrapper.text()).not.toContain('Bring:')
  })
})

describe('LevelPlannerTimelineStep — alternative-route booster chips', () => {
  const baseProps = {
    index: 0,
    creatureName: 'Target',
    isFirst: true,
    isLast: true,
    expanded: true, // expanded so alternatives are visible
    timePercent: 100,
  }

  function makeAlt(boosters?: BoosterInfo[]): AlternativeRoute {
    return {
      expedition: makeExpedition('alt-1', 'Mountain Expedition'),
      tier: 2,
      biomeName: 'Mountain',
      traitMatch: false,
      biomeStatus: 'advantage',
      xpPerMinute: 18,
      runs: 6,
      timeSeconds: 1800,
      timeDeltaPercent: 0.2,
      xpPerMinuteDeltaPercent: -0.1,
      ...(boosters ? { boosters, partySize: boosters.length + 1 } : {}),
    }
  }

  test('renders booster chips on an alternative when alt.boosters is set', () => {
    const altBoosters = [makeBooster('ab1', 'Alt Booster')]
    const step = makeStep({ alternatives: [makeAlt(altBoosters)] })
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })
    expect(wrapper.text()).toContain('Alt Booster')
    // The alt-route block should also include the Bring: label
    expect(wrapper.text().match(/Bring:/g)?.length).toBeGreaterThanOrEqual(1)
  })

  test('does not render booster row on an alternative without boosters', () => {
    const step = makeStep({ alternatives: [makeAlt(undefined)] })
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })
    expect(wrapper.text()).not.toContain('Bring:')
  })

  test('alternative booster chip has no hover affordance classes', () => {
    const altBoosters = [makeBooster('ab1', 'Alt Booster')]
    const step = makeStep({ alternatives: [makeAlt(altBoosters)] })
    const wrapper = mount(LevelPlannerTimelineStep, { props: { ...baseProps, step } })

    const chipImgs = wrapper
      .findAll('img')
      .filter((img) => img.attributes('src') === 'mock://ab1.png')
    expect(chipImgs.length).toBeGreaterThan(0)
    const chip = chipImgs[0].element.closest('div')!.parentElement!
    expect(chip.className).not.toContain('hover:border-accent/45')
    expect(chip.className).not.toContain('hover:bg-muted/50')
    expect(chip.className).not.toContain('transition')
  })
})
