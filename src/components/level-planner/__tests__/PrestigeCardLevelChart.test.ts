import { mount } from '@vue/test-utils'

import PrestigeCardLevelChart from '@/components/level-planner/PrestigeCardLevelChart.vue'
import type { Creature } from '@/types'
import type {
  PrestigeLoopAssignment,
  PrestigeTimelineStep,
} from '@/utils/planner/prestigeLoopPlanner'

function creature(id: string, name: string): Creature {
  return { id, name, image: `creatures/${id}.png` } as Creature
}
function member(creatureId: string, role: 'climber' | 'booster' | 'anchor', level: number) {
  return { creatureId, role, level }
}
function assignAt(
  expeditionId: string,
  ...members: ReturnType<typeof member>[]
): PrestigeLoopAssignment {
  return { expeditionId, tier: 1, members }
}
function step(
  checkInIndex: number,
  clockHours: number,
  prestigedCreatureIds: string[],
  assignment: PrestigeLoopAssignment[],
): PrestigeTimelineStep {
  return { checkInIndex, clockHours, prestigedCreatureIds, assignment }
}

const creatures = new Map<string, Creature>([
  ['c', creature('c', 'Climber')],
  ['b', creature('b', 'Boostling')],
  ['d', creature('d', 'Caveling')],
])

// Party on 'forest': climber c (saw-tooths through a prestige) + booster b (held at 120).
// Creature d runs a different expedition entirely and must never leak into this card.
const timeline: PrestigeTimelineStep[] = [
  step(
    0,
    0,
    [],
    [
      assignAt('forest', member('c', 'climber', 110), member('b', 'booster', 120)),
      assignAt('cave', member('d', 'climber', 10)),
    ],
  ),
  step(
    1,
    12,
    ['c'],
    [
      assignAt('forest', member('c', 'climber', 1), member('b', 'booster', 120)),
      assignAt('cave', member('d', 'climber', 30)),
    ],
  ),
  step(
    2,
    24,
    [],
    [
      assignAt('forest', member('c', 'climber', 40), member('b', 'booster', 120)),
      assignAt('cave', member('d', 'climber', 55)),
    ],
  ),
]

// Real owned levels, deliberately below the in-loop 120 so we can prove held lines/chips render
// the player's true level rather than the max the sim pins anchors/boosters to.
const ownedLevels: Record<string, number> = { c: 108, b: 95, d: 50 }
function mountCard(memberIds: string[], anchorIds: string[] = []) {
  return mount(PrestigeCardLevelChart, {
    props: {
      timeline,
      creatures,
      memberIds,
      anchorIds,
      getLevel: (id: string) => ownedLevels[id] ?? 1,
    },
  })
}

function seriesLines(w: ReturnType<typeof mountCard>) {
  // Scope to the chart SVG so we don't count paths from inline icons (e.g. the anchor glyph).
  const chart = w.findAll('svg').find((s) => s.attributes('viewBox') === '0 0 300 200')
  if (!chart) return []
  return chart.findAll('path').filter((p) => p.attributes('d')?.startsWith('M'))
}

describe('PrestigeCardLevelChart', () => {
  test('plots a line for every party member — climbers and held alike', () => {
    const w = mountCard(['c', 'b'])
    expect(w.find('svg').exists()).toBe(true)
    // climber c (sawtooth) + held booster b (flat at the in-loop 120) are both plotted
    expect(seriesLines(w).length).toBe(2)
    expect(w.text()).toContain('Climber')
  })

  test('renders held boosters/anchors at their true owned level, not the in-loop max', () => {
    const w = mountCard(['c', 'b'])
    expect(w.text()).toContain('Boostling')
    // Booster b is owned at 95 — the chip shows that, not the sim's pinned 120.
    expect(w.text()).toContain('LVL 95')
    expect(w.text()).not.toContain('LVL 120')
  })

  test('scopes strictly to the given member ids', () => {
    const w = mountCard(['c', 'b'])
    expect(w.text()).not.toContain('Caveling')
  })

  test('ramps a held creature from its owned level up to the max, then holds', () => {
    const w = mountCard(['b']) // booster b, owned at 95
    const paths = seriesLines(w)
    expect(paths.length).toBe(1)
    // y-pixels per point: smaller y = higher level (120 is the top of the plot, y=0-ish).
    const ys = [...(paths[0].attributes('d') ?? '').matchAll(/,(\d+(?:\.\d+)?)/g)].map((m) =>
      Number(m[1]),
    )
    expect(ys.length).toBeGreaterThan(1)
    // Rises: starts below the max (owned 95, larger y) and reaches the max (smallest y).
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1])
    // Never drops: level is non-decreasing, so y is non-increasing across the whole line.
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1])
    expect(w.text().toLowerCase()).not.toContain('no leveling')
  })
})
