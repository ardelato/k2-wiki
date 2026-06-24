import { describe, it, expect } from 'vitest'

import { getPlayerLevel } from '@/utils/formulas'
import {
  buildSanctuaryDiff,
  planPlayerLevelBoost,
  recommendPartyForJob,
  valueBoostOnGrind,
  PLAYER_XP_PP_PER_LEVEL,
} from '@/utils/planner/skillAdvisories'

describe('planPlayerLevelBoost', () => {
  it('raises the cheapest (lowest) skills to gain player levels', () => {
    // Eight skills already high, one dead skill dragging the average down.
    const levels: Record<string, number> = {
      Chopping: 90,
      Mining: 90,
      Digging: 90,
      Exploring: 90,
      Fishing: 90,
      Farming: 90,
      Furnace: 90,
      Stove: 90,
      Workbench: 1, // the laggard
    }
    const boost = planPlayerLevelBoost(levels, 2)
    expect(boost).not.toBeNull()
    // Only the laggard is cheap enough to touch.
    expect(boost!.steps.map((s) => s.skillId)).toEqual(['Workbench'])
    expect(boost!.playerLevelTo).toBe(boost!.playerLevelFrom + 2)
    expect(boost!.xpBonusGain).toBeCloseTo(2 * PLAYER_XP_PP_PER_LEVEL, 6)
    expect(boost!.totalXpCost).toBeGreaterThan(0)
    // Cross-check the player-level math against the live formula.
    const after = { ...levels, Workbench: boost!.steps[0].toLevel }
    expect(getPlayerLevel(after)).toBe(boost!.playerLevelTo)
  })

  it('skips the skill you are already planning to grind', () => {
    const levels: Record<string, number> = {
      Chopping: 1,
      Mining: 1,
      Digging: 1,
      Exploring: 1,
      Fishing: 1,
      Farming: 1,
      Furnace: 1,
      Stove: 1,
      Workbench: 1,
    }
    const boost = planPlayerLevelBoost(levels, 1, 'Mining')
    expect(boost).not.toBeNull()
    expect(boost!.steps.some((s) => s.skillId === 'Mining')).toBe(false)
  })

  it('returns null when the player level is already capped', () => {
    const maxed = Object.fromEntries(
      [
        'Chopping',
        'Mining',
        'Digging',
        'Exploring',
        'Fishing',
        'Farming',
        'Furnace',
        'Stove',
        'Workbench',
      ].map((id) => [id, 99]),
    )
    expect(planPlayerLevelBoost(maxed, 3)).toBeNull()
  })

  it('prefers the cheap laggard over an already-high skill (cost asymmetry)', () => {
    const levels: Record<string, number> = {
      Chopping: 50,
      Mining: 50,
      Digging: 50,
      Exploring: 50,
      Fishing: 50,
      Farming: 50,
      Furnace: 50,
      Stove: 50,
      Workbench: 5,
    }
    const boost = planPlayerLevelBoost(levels, 1)!
    // It should only raise Workbench (far cheaper per level than the L50 skills).
    expect(boost.steps.map((s) => s.skillId)).toEqual(['Workbench'])
  })
})

describe('recommendPartyForJob', () => {
  const THRESHOLDS = [6, 18, 30, 42, 54]
  const creatures = [
    { id: 'a', name: 'A', jobs: { mining: 12 } },
    { id: 'b', name: 'B', jobs: { mining: 9 } },
    { id: 'c', name: 'C', jobs: { mining: 7 } },
    { id: 'd', name: 'D', jobs: { mining: 5 } },
    { id: 'e', name: 'E', jobs: { mining: 0, chopping: 8 } }, // no mining contribution
  ]

  it('fills the full party with the top owned+awakened contributors', () => {
    const eligible = new Set(['a', 'b', 'c']) // only these are summoned & awakened
    const rec = recommendPartyForJob(creatures, 'mining', THRESHOLDS, 6, (id) => eligible.has(id))
    // Only eligible mining contributors, sorted by contribution descending.
    expect(rec.party.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(rec.score).toBe(28) // 12 + 9 + 7
    expect(rec.reachedTier).toBe(2) // >= 18 but < 30
  })

  it('caps the party at the slot count', () => {
    const rec = recommendPartyForJob(creatures, 'mining', THRESHOLDS, 2, () => true)
    expect(rec.party.map((p) => p.id)).toEqual(['a', 'b'])
    expect(rec.score).toBe(21)
  })

  it('returns an empty party when nothing is eligible', () => {
    const rec = recommendPartyForJob(creatures, 'mining', THRESHOLDS, 6, () => false)
    expect(rec.party).toEqual([])
    expect(rec.reachedTier).toBe(0)
  })
})

describe('buildSanctuaryDiff', () => {
  const creatures = [
    { id: 'a', name: 'A', jobs: { mining: 12, chopping: 5 } },
    { id: 'b', name: 'B', jobs: { mining: 9 } },
    { id: 'c', name: 'C', jobs: { mining: 7, chopping: 10 } },
    { id: 'd', name: 'D', jobs: { chopping: 20 } }, // dead weight for mining
    { id: 'e', name: 'E', jobs: { mining: 0, farming: 18 } },
    { id: 'f', name: 'F', jobs: { mining: 3 } }, // some mining, but not recommended
  ]

  // Stub for the game's calculateJobTiersFromSanctuary: 10 points = 1 tier.
  const tiersFor = (ids: string[]): Record<string, number> => {
    const sums: Record<string, number> = { Mining: 0, Chopping: 0, Farming: 0 }
    for (const id of ids) {
      const c = creatures.find((x) => x.id === id)
      if (!c) continue
      for (const [job, score] of Object.entries(c.jobs)) {
        const cap = job.charAt(0).toUpperCase() + job.slice(1)
        if (cap in sums) sums[cap] += score
      }
    }
    return Object.fromEntries(Object.entries(sums).map(([j, s]) => [j, Math.floor(s / 10)]))
  }

  it('splits the roster into keep / swap-out / swap-in and reports other-job fallout', () => {
    const current = ['d', 'e', 'a', 'f']
    const recommended = [
      { id: 'a', name: 'A', contribution: 12 },
      { id: 'b', name: 'B', contribution: 9 },
      { id: 'c', name: 'C', contribution: 7 },
    ]
    const diff = buildSanctuaryDiff(creatures, current, recommended, 'mining', 'Mining', tiersFor)

    // The headline target: current ['d','e','a','f'] mining = 15 (t1) → ['a','b','c'] = 28 (t2).
    expect(diff.target).toEqual({ job: 'Mining', from: 1, to: 2 })
    expect(diff.keep.map((c) => c.id)).toEqual(['a'])
    expect(diff.swapIn.map((c) => c.id)).toEqual(['b', 'c'])
    // Removed creatures, least useful for this job first (0-contributors lead, f's 3 last).
    expect(diff.swapOut.map((c) => c.id)).toEqual(['d', 'e', 'f'])
    expect(diff.swapOut.map((c) => c.contribution)).toEqual([0, 0, 3])

    // Mining (the job being optimized) is excluded; only changed jobs appear.
    // Chopping: a5+d20=25 (t2) → a5+c10=15 (t1). Farming: e18 (t1) → 0 (t0).
    expect(diff.sideEffects).toEqual([
      { job: 'Chopping', from: 2, to: 1 },
      { job: 'Farming', from: 1, to: 0 },
    ])
  })

  it('reports no swaps and no fallout when the roster already is the recommended party', () => {
    const current = ['a', 'b']
    const recommended = [
      { id: 'a', name: 'A', contribution: 12 },
      { id: 'b', name: 'B', contribution: 9 },
    ]
    const diff = buildSanctuaryDiff(creatures, current, recommended, 'mining', 'Mining', tiersFor)

    expect(diff.target).toEqual({ job: 'Mining', from: 2, to: 2 })
    expect(diff.keep.map((c) => c.id)).toEqual(['a', 'b'])
    expect(diff.swapIn).toEqual([])
    expect(diff.swapOut).toEqual([])
    expect(diff.sideEffects).toEqual([])
  })
})

describe('valueBoostOnGrind', () => {
  it('reduces grind time in proportion to the XP multiplier increase', () => {
    const boost = {
      steps: [],
      totalXpCost: 0,
      playerLevelFrom: 80,
      playerLevelTo: 82,
      xpBonusGain: 0.5, // +0.5 percentage points
    }
    // Current stack ×2.0 → new ×2.005; time 1000s → 1000 × 2.0/2.005 ≈ 997.51s.
    const v = valueBoostOnGrind(boost, 2.0, 1000)
    expect(v.timeAfter).toBeCloseTo(997.51, 1)
    expect(v.timeSaved).toBeCloseTo(2.49, 1)
  })
})
