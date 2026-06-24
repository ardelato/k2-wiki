import { mount } from '@vue/test-utils'

import AdvisoryRow from '@/components/skill-planner/AdvisoryRow.vue'
import type { SkillAdvisory } from '@/composables/useSkillPlanner'

vi.mock('@/utils/format/format', () => ({
  formatNumber: (n: number) => n.toLocaleString('en-US'),
  formatDuration: (s: number) => `${s}s`,
}))

vi.mock('@/utils/format/icons', () => ({
  sourceIcons: {} as Record<string, string>,
}))

vi.mock('@/utils/images/itemImages', () => ({
  getItemImage: () => undefined,
}))

vi.mock('@/components/skill-planner/SanctuaryPartyDiff.vue', () => ({
  default: { name: 'SanctuaryPartyDiff', template: '<div class="sanctuary-diff" />' },
}))

vi.mock('@/components/skill-planner/AwakenPointSources.vue', () => ({
  default: { name: 'AwakenPointSources', template: '<div class="awaken-sources" />' },
}))

const stubs = {
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}

vi.mock('vue-router', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, useRoute: () => ({ path: '/tools' }) }
})

function sanctuaryAdv(): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'sanctuary:mining',
    label: 'Sanctuary - Mining Tier 3',
    benefits: [
      { kind: 'xp', before: 0, after: 40 },
      { kind: 'duration', before: 0, after: 10 },
    ],
    timeSaved: 3600,
    routeName: 'sanctuary',
    partyDiff: {
      target: { job: 'Mining', from: 0, to: 3 },
      sideEffects: [],
      swapIn: [],
      swapOut: [],
      keep: [],
    } as never,
  }
}

function awakenAdv(): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'awaken:mining:0',
    label: 'Mining XP III',
    benefits: [{ kind: 'xp', before: 0, after: 10 }],
    timeSaved: 1800,
    routeName: 'awaken',
    awakenPointCost: 1,
    awakenPointsAvailable: 0,
    awakenTreeId: 'mining',
    awakenNodeId: '0',
    awakenSources: { owned: [], summon: [] },
  }
}

function toolAdv(): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'tools:mining',
    label: 'Mining Pickaxe Level 1 → 2',
    benefits: [{ kind: 'xp', before: 0, after: 5 }],
    timeSaved: 900,
    routeName: 'tools',
    toolId: 'mining-pickaxe',
    toolCost: { itemId: 'bar', itemName: 'Copper Bar', amount: 50 },
  }
}

function playerLevelAdv(): SkillAdvisory {
  return {
    kind: 'playerLevel',
    timeSaved: 7200,
    steps: [
      { skillId: 'Fishing', fromLevel: 5, toLevel: 8, levelsAdded: 3, timeSeconds: 600 },
      { skillId: 'Farming', fromLevel: 2, toLevel: 4, levelsAdded: 2, timeSeconds: 300 },
    ],
    totalXpCost: 1000,
    levelUpTimeSeconds: 3600,
    playerLevelFrom: 10,
    playerLevelTo: 12,
    xpBonusGain: 2,
  }
}

function mountRow(advisory: SkillAdvisory, open = false) {
  return mount(AdvisoryRow, { props: { advisory, open }, global: { stubs } })
}

describe('AdvisoryRow', () => {
  test('renders sanctuary headline + time saved; benefit only once open', () => {
    const w = mountRow(sanctuaryAdv())
    expect(w.text()).toContain('Sanctuary → Tier 3')
    expect(w.text()).toContain('−3600s')
    // The benefit phrase moved to the expanded body, off the collapsed row.
    expect(w.text()).not.toContain('+40% XP')
    expect(mountRow(sanctuaryAdv(), true).text()).toContain('+40% XP · 10% faster gathering')
  })

  test('renders awaken node-name headline (skill word stripped) and point-cost line', () => {
    const w = mountRow(awakenAdv())
    expect(w.text()).toContain('XP III')
    expect(w.text()).not.toContain('Mining XP III')
    expect(w.text()).toContain('1 Awaken Point')
  })

  test('renders tool label headline and item cost', () => {
    const w = mountRow(toolAdv())
    expect(w.text()).toContain('Mining Pickaxe Level 1 → 2')
    expect(w.text()).toContain('50 Copper Bar')
  })

  test('renders playerLevel headline; on-every-skill benefit when open', () => {
    const w = mountRow(playerLevelAdv(), true)
    expect(w.text()).toContain('Raise low skills → +2 player levels')
    expect(w.text()).toContain('+2% XP on every skill')
  })

  test('emits toggle on click', async () => {
    const w = mountRow(sanctuaryAdv())
    await w.find('button').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
  })

  test('emits toggle on Enter and Space', async () => {
    const w = mountRow(sanctuaryAdv())
    await w.find('button').trigger('keydown.enter')
    await w.find('button').trigger('keydown.space')
    expect(w.emitted('toggle')).toHaveLength(2)
  })

  test('aria-expanded tracks the open prop', async () => {
    const w = mountRow(sanctuaryAdv(), false)
    expect(w.find('button').attributes('aria-expanded')).toBe('false')
    await w.setProps({ open: true })
    expect(w.find('button').attributes('aria-expanded')).toBe('true')
  })

  test('body is hidden when collapsed, shown when open', async () => {
    const w = mountRow(sanctuaryAdv(), false)
    expect(w.find('.sanctuary-diff').exists()).toBe(false)
    await w.setProps({ open: true })
    expect(w.find('.sanctuary-diff').exists()).toBe(true)
  })

  test('bonus rows render exactly one CTA when open', () => {
    const w = mountRow(toolAdv(), true)
    const links = w.findAllComponents({ name: 'RouterLink' })
    const ctas = links.filter((l) => l.text().includes('Open in'))
    expect(ctas).toHaveLength(1)
    expect(ctas[0].text()).toContain('Open in Tools')
  })

  test('playerLevel row has NO single CTA — only per-skill links', () => {
    const w = mountRow(playerLevelAdv(), true)
    const links = w.findAllComponents({ name: 'RouterLink' })
    expect(links.some((l) => l.text().includes('Open in'))).toBe(false)
    // One link per skill step instead.
    expect(links).toHaveLength(2)
  })
})
