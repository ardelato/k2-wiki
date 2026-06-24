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

function mountCard(memberIds: string[], anchorIds: string[] = []) {
  return mount(PrestigeCardLevelChart, {
    props: { timeline, creatures, memberIds, anchorIds },
  })
}

function seriesLines(w: ReturnType<typeof mountCard>) {
  // Scope to the chart SVG so we don't count paths from inline icons (e.g. the anchor glyph).
  const chart = w.findAll('svg').find((s) => s.attributes('viewBox') === '0 0 300 200')
  if (!chart) return []
  return chart.findAll('path').filter((p) => p.attributes('d')?.startsWith('M'))
}

describe('PrestigeCardLevelChart', () => {
  test('plots a line only for the party climbers', () => {
    const w = mountCard(['c', 'b'])
    expect(w.find('svg').exists()).toBe(true)
    expect(seriesLines(w).length).toBe(1)
    expect(w.text()).toContain('Climber')
  })

  test('lists held boosters/anchors in the held footer, not as lines', () => {
    const w = mountCard(['c', 'b'])
    expect(w.text()).toContain('Held at 120')
    expect(w.text()).toContain('Boostling')
  })

  test('scopes strictly to the given member ids', () => {
    const w = mountCard(['c', 'b'])
    expect(w.text()).not.toContain('Caveling')
  })

  test('shows the empty state when the party is all held', () => {
    const w = mountCard(['b'])
    expect(seriesLines(w).length).toBe(0)
    expect(w.text().toLowerCase()).toContain('no leveling')
  })
})
