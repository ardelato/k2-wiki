import { describe, it, expect } from 'vitest'

import { xpForSkillLevel } from '@/utils/formulas'
import { getJobBenefits } from '@/utils/planner/sanctuaryConstants'
import {
  buildGatheringPlan,
  buildWorkstationPlan,
  getActivityXpPerSec,
  getSkillMultipliers,
  getWorkstationMultipliers,
  type SkillActivity,
  type SkillMultipliers,
  type WorkstationRecipe,
} from '@/utils/planner/skillPlanner'

// The 12-tier gathering progression shared by all 6 gathering skills.
const PROGRESSION: SkillActivity[] = [
  { id: 't1', name: 'T1', levelRequirement: 1, xpRate: 2, duration: 8 },
  { id: 't2', name: 'T2', levelRequirement: 5, xpRate: 3, duration: 9 },
  { id: 't3', name: 'T3', levelRequirement: 10, xpRate: 4, duration: 10 },
  { id: 't4', name: 'T4', levelRequirement: 15, xpRate: 6, duration: 11 },
  { id: 't5', name: 'T5', levelRequirement: 20, xpRate: 8, duration: 12 },
  { id: 't6', name: 'T6', levelRequirement: 30, xpRate: 10, duration: 13 },
  { id: 't7', name: 'T7', levelRequirement: 40, xpRate: 14, duration: 14 },
  { id: 't8', name: 'T8', levelRequirement: 50, xpRate: 20, duration: 16 },
  { id: 't9', name: 'T9', levelRequirement: 60, xpRate: 26, duration: 20 },
  { id: 't10', name: 'T10', levelRequirement: 70, xpRate: 36, duration: 25 },
  { id: 't11', name: 'T11', levelRequirement: 80, xpRate: 60, duration: 35 },
  { id: 't12', name: 'T12', levelRequirement: 90, xpRate: 120, duration: 45 },
]

const NEUTRAL: SkillMultipliers = { xpMultiplier: 1, durationMultiplier: 1 }

const zeroInputs = {
  jobTier: 0,
  awakenXpTier: 0,
  awakenDurationTier: 0,
  toolLevel: 0,
  playerLevel: 0,
}

describe('getJobBenefits', () => {
  it('tier 0 grants nothing', () => {
    expect(getJobBenefits(0)).toEqual({ xpBonus: 0, durationReduction: 0, yieldBonus: 0 })
  })

  it('is cumulative across tiers', () => {
    expect(getJobBenefits(3)).toEqual({ xpBonus: 120, durationReduction: 10, yieldBonus: 0 })
    expect(getJobBenefits(5)).toEqual({ xpBonus: 120, durationReduction: 20, yieldBonus: 1 })
  })

  it('clamps tiers beyond the table to the max', () => {
    expect(getJobBenefits(99)).toEqual(getJobBenefits(5))
  })
})

describe('getSkillMultipliers', () => {
  it('applies only the player-level bonus when everything else is zero', () => {
    // getPlayerLevelXpBonus(0) = 0.25 percentage points
    const m = getSkillMultipliers(zeroInputs)
    expect(m.xpMultiplier).toBeCloseTo(1.0025, 6)
    expect(m.durationMultiplier).toBe(1)
  })

  it('player level 99 contributes +25% XP', () => {
    const m = getSkillMultipliers({ ...zeroInputs, playerLevel: 99 })
    expect(m.xpMultiplier).toBeCloseTo(1.25, 6)
  })

  it('tool level adds +5% XP per level', () => {
    const m = getSkillMultipliers({ ...zeroInputs, toolLevel: 10 })
    expect(m.xpMultiplier).toBeCloseTo(1 + (0.25 + 50) / 100, 6)
  })

  it('awaken XP nodes add +10% each', () => {
    const m = getSkillMultipliers({ ...zeroInputs, awakenXpTier: 2 })
    expect(m.xpMultiplier).toBeCloseTo(1 + (0.25 + 20) / 100, 6)
  })

  it('job tier contributes both XP and duration', () => {
    const m = getSkillMultipliers({ ...zeroInputs, jobTier: 3 })
    expect(m.xpMultiplier).toBeCloseTo(1 + (0.25 + 120) / 100, 6) // +120% sanctuary XP
    expect(m.durationMultiplier).toBeCloseTo(0.9, 6) // -10% duration
  })

  it('awaken duration nodes reduce duration by 5% each', () => {
    const m = getSkillMultipliers({ ...zeroInputs, awakenDurationTier: 4 })
    expect(m.durationMultiplier).toBeCloseTo(0.8, 6)
  })

  it('stacks all XP components additively', () => {
    const m = getSkillMultipliers({
      jobTier: 3, // +120 xp, -10 dur
      awakenXpTier: 2, // +20 xp
      awakenDurationTier: 4, // -20 dur
      toolLevel: 10, // +50 xp
      playerLevel: 99, // +25 xp
    })
    expect(m.xpMultiplier).toBeCloseTo(1 + (120 + 20 + 25 + 50) / 100, 6) // ×3.15
    expect(m.durationMultiplier).toBeCloseTo(1 - (10 + 20) / 100, 6) // ×0.70
  })

  it('clamps the duration multiplier at 0.01', () => {
    const m = getSkillMultipliers({ ...zeroInputs, awakenDurationTier: 30 }) // 150% reduction
    expect(m.durationMultiplier).toBe(0.01)
  })
})

describe('getActivityXpPerSec', () => {
  it('is xpRate / duration with neutral multipliers', () => {
    expect(getActivityXpPerSec(120, 45, NEUTRAL)).toBeCloseTo(120 / 45, 6) // ≈2.667
    expect(getActivityXpPerSec(2, 8, NEUTRAL)).toBeCloseTo(0.25, 6)
  })

  it('scales with multipliers', () => {
    const m: SkillMultipliers = { xpMultiplier: 2, durationMultiplier: 0.5 }
    expect(getActivityXpPerSec(120, 45, m)).toBeCloseTo((120 * 2) / (45 * 0.5), 6)
  })

  it('is monotonic across the progression', () => {
    const rates = PROGRESSION.map((a) => getActivityXpPerSec(a.xpRate, a.duration, NEUTRAL))
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1])
    }
  })
})

describe('buildGatheringPlan', () => {
  it('returns an empty plan when target <= current', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, 50, 50, NEUTRAL)
    expect(plan.segments).toEqual([])
    expect(plan.totalXp).toBe(0)
    expect(plan.totalCycles).toBe(0)
  })

  it('crosses every unlock threshold from 1 to 99', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, 1, 99, NEUTRAL)
    // boundaries: 1,5,10,15,20,30,40,50,60,70,80,90,99 -> 12 segments
    expect(plan.segments).toHaveLength(12)
    expect(plan.segments[0].unlockLevel).toBe(1)
    expect(plan.segments.at(-1)?.unlockLevel).toBe(90)
  })

  it('total XP equals the curve delta and band XP sums to it', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, 1, 99, NEUTRAL)
    const expected = xpForSkillLevel(99) - xpForSkillLevel(1)
    expect(plan.totalXp).toBe(expected)
    const summed = plan.segments.reduce((s, seg) => s + seg.bandXp, 0)
    expect(summed).toBe(expected)
  })

  it('starts a mid-range plan on the correct unlocked activity', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, 42, 70, NEUTRAL)
    // active at 42 = highest req <= 42 = the level-40 activity (t7)
    expect(plan.segments[0].fromLevel).toBe(42)
    expect(plan.segments[0].unlockLevel).toBe(40)
    expect(plan.segments[0].activityId).toBe('t7')
    // unlocks inside (42,70): 50, 60 -> boundaries 42,50,60,70 -> 3 segments
    expect(plan.segments.map((s) => s.fromLevel)).toEqual([42, 50, 60])
    expect(plan.segments.map((s) => s.toLevel)).toEqual([50, 60, 70])
  })

  it('reports whole-number cycle counts and consistent totals', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, 1, 90, NEUTRAL)
    for (const seg of plan.segments) {
      expect(Number.isInteger(seg.cycles)).toBe(true)
      expect(seg.cycles).toBeGreaterThan(0)
      expect(seg.timeSeconds).toBeCloseTo(seg.cycles * seg.effectiveDuration, 6)
    }
    expect(plan.totalCycles).toBe(plan.segments.reduce((s, seg) => s + seg.cycles, 0))
  })

  it('clamps out-of-range levels into [1, 99]', () => {
    const plan = buildGatheringPlan('Mining', PROGRESSION, -5, 200, NEUTRAL)
    expect(plan.currentLevel).toBe(1)
    expect(plan.targetLevel).toBe(99)
  })
})

describe('getWorkstationMultipliers', () => {
  const base = {
    awakenXpTier: 0,
    awakenSpeedTier: 0,
    toolLevel: 0,
    speedMode: false,
    playerLevel: 0,
  }

  it('applies only the player-level bonus at the zero state', () => {
    const m = getWorkstationMultipliers(base)
    expect(m.xpMultiplier).toBeCloseTo(1.0025, 6)
    expect(m.durationMultiplier).toBe(1)
  })

  it('awaken workstation XP nodes add +10% each', () => {
    const m = getWorkstationMultipliers({ ...base, awakenXpTier: 5 })
    expect(m.xpMultiplier).toBeCloseTo(1 + (0.25 + 50) / 100, 6)
  })

  it('awaken speed nodes reduce duration by 15% each', () => {
    const m = getWorkstationMultipliers({ ...base, awakenSpeedTier: 4 })
    expect(m.durationMultiplier).toBeCloseTo(1 - 60 / 100, 6)
  })

  it('tool gives XP when not in speed mode', () => {
    const m = getWorkstationMultipliers({ ...base, toolLevel: 10, speedMode: false })
    expect(m.xpMultiplier).toBeCloseTo(1 + (0.25 + 50) / 100, 6)
    expect(m.durationMultiplier).toBe(1)
  })

  it('tool converts to duration (and forfeits XP) in speed mode', () => {
    const m = getWorkstationMultipliers({ ...base, toolLevel: 10, speedMode: true })
    expect(m.xpMultiplier).toBeCloseTo(1.0025, 6) // only player level
    expect(m.durationMultiplier).toBeCloseTo(1 - 20 / 100, 6) // 10 × 2%
  })
})

describe('buildWorkstationPlan', () => {
  const RECIPES: WorkstationRecipe[] = [
    {
      itemId: 'a',
      itemName: 'A',
      levelRequirement: 1,
      experience: 10,
      craftTime: 10,
      ingredients: [{ id: 'wood', amount: 2 }],
    },
    {
      itemId: 'b',
      itemName: 'B',
      levelRequirement: 1,
      experience: 5,
      craftTime: 10,
      ingredients: [{ id: 'wood', amount: 9 }],
    },
    {
      itemId: 'c',
      itemName: 'C',
      levelRequirement: 10,
      experience: 40,
      craftTime: 10,
      ingredients: [{ id: 'ore', amount: 3 }],
    },
  ]

  // Enough of everything that inventory never constrains the plan.
  const ABUNDANT: Record<string, number> = { wood: 1e9, ore: 1e9 }

  it('picks the best XP/sec affordable recipe per band', () => {
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 20, NEUTRAL, ABUNDANT)
    // band [1,10] → A beats B (1.0 vs 0.5 xp/s); band [10,20] → C (4.0)
    expect(plan.segments.map((s) => s.activityId)).toEqual(['a', 'c'])
    expect(plan.reachedLevel).toBe(20)
    // Single-recipe items carry no variant tag (nothing to disambiguate).
    expect(plan.segments.every((s) => s.variantItemId === undefined)).toBe(true)
  })

  it('tags and separates recipe variants of one item (e.g. Helmet by its bar)', () => {
    // Helmet has two variants sharing `hammer` but differing by bar. The high-bar
    // variant has the better rate, so it goes first until its bar runs out, then the
    // grind cascades to the low-bar variant — two distinct "Helmet" bands.
    const HELMETS: WorkstationRecipe[] = [
      {
        itemId: 'helmet',
        itemName: 'Helmet',
        levelRequirement: 1,
        experience: 20,
        craftTime: 10,
        ingredients: [
          { id: 'hammer', amount: 1 },
          { id: 'gold-bar', amount: 1 },
        ],
      },
      {
        itemId: 'helmet',
        itemName: 'Helmet',
        levelRequirement: 1,
        experience: 30,
        craftTime: 10,
        ingredients: [
          { id: 'hammer', amount: 1 },
          { id: 'solarite-bar', amount: 1 },
        ],
      },
    ]
    // Solarite is scarce (5), gold abundant → solarite helmets first, then gold.
    const plan = buildWorkstationPlan('Furnace', HELMETS, 1, 10, NEUTRAL, {
      hammer: 1e9,
      'solarite-bar': 5,
      'gold-bar': 1e9,
    })
    expect(plan.segments.every((s) => s.activityId === 'helmet')).toBe(true)
    expect(plan.segments.length).toBeGreaterThanOrEqual(2) // distinct variants don't merge
    expect(plan.segments[0].variantItemId).toBe('solarite-bar')
    expect(plan.segments[1].variantItemId).toBe('gold-bar')
    expect(plan.segments[0].xpPerSec).toBeGreaterThan(plan.segments[1].xpPerSec)
  })

  it('aggregates consumed ingredient cost and matches the XP curve with abundant inventory', () => {
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 20, NEUTRAL, ABUNDANT)
    expect(plan.totalXp).toBe(xpForSkillLevel(20))
    const aCycles = Math.ceil((xpForSkillLevel(10) - xpForSkillLevel(1)) / 10)
    // C continues from where A overshot the level-10 threshold (carryover XP).
    const cCycles = Math.ceil((xpForSkillLevel(20) - aCycles * 10) / 40)
    expect(plan.ingredientCost.wood).toBe(aCycles * 2)
    expect(plan.ingredientCost.ore).toBe(cCycles * 3)
  })

  it('returns an empty plan when target <= current', () => {
    const plan = buildWorkstationPlan('Furnace', RECIPES, 30, 30, NEUTRAL, ABUNDANT)
    expect(plan.segments).toEqual([])
    expect(plan.ingredientCost).toEqual({})
    expect(plan.reachedLevel).toBe(30)
  })

  it('switches to the next affordable recipe when the best one depletes mid-grind', () => {
    // A (best) and B (worse) unlock together but use different materials. With X
    // scarce and Y abundant, the path crafts A until X runs out, then falls to B.
    const R2: WorkstationRecipe[] = [
      {
        itemId: 'a',
        itemName: 'A',
        levelRequirement: 1,
        experience: 10,
        craftTime: 10,
        ingredients: [{ id: 'x', amount: 2 }],
      },
      {
        itemId: 'b',
        itemName: 'B',
        levelRequirement: 1,
        experience: 8,
        craftTime: 10,
        ingredients: [{ id: 'y', amount: 2 }],
      },
    ]
    const plan = buildWorkstationPlan('Furnace', R2, 1, 20, NEUTRAL, { x: 10, y: 1e9 })
    const ids = plan.segments.map((s) => s.activityId)
    expect(ids[0]).toBe('a')
    expect(ids).toContain('b')
    expect(plan.ingredientCost.x).toBe(10) // all of X consumed before the switch
    expect(plan.reachedLevel).toBe(20) // Y is abundant, so it still reaches target
  })

  it('stops at the starting level when nothing is affordable', () => {
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 20, NEUTRAL, {})
    expect(plan.segments).toEqual([])
    expect(plan.reachedLevel).toBe(1)
  })

  it('stops before target when materials run out partway', () => {
    // Exactly enough wood for a few A crafts, no ore → can never reach C's tier.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 20, NEUTRAL, { wood: 6 })
    expect(plan.reachedLevel).toBeLessThan(20)
    expect(plan.ingredientCost.wood).toBe(6) // consumed all wood, no more
  })

  it('reaches the target and reports reachedLevel when inventory suffices', () => {
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 12, NEUTRAL, ABUNDANT)
    expect(plan.reachedLevel).toBe(12)
    expect(plan.totalCycles).toBeGreaterThan(0)
  })

  it('marks the queued fraction of a band (partial bar), not the whole card', () => {
    // 5 of 'a' are queued, but the band needs many more 'a' to progress — the bar
    // shows only 5 of the band's cycles as queued, never a full fill.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 5, NEUTRAL, ABUNDANT, { a: 5 })
    const seg = plan.segments[0]
    expect(seg.activityId).toBe('a')
    expect(seg.queuedCycles).toBe(5)
    expect(seg.cycles).toBeGreaterThan(5) // queued < total → partial, not full
  })

  it('fully marks a band as queued only when the queue covers all of its crafts', () => {
    // Queue covers the entire grind: c at level 10 → 12, queued amount exceeds need.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 10, 12, NEUTRAL, {}, { c: 100 })
    expect(plan.segments).toHaveLength(1)
    const seg = plan.segments[0]
    expect(seg.activityId).toBe('c')
    expect(seg.queuedCycles).toBe(seg.cycles) // entirely in queue → full bar
    expect(seg.timeSeconds).toBe(0) // no remaining work
    expect(plan.reachedLevel).toBe(12)
  })

  it('lets the queue reach the target even with no inventory (mats already paid)', () => {
    // c is queued and unlocked at level 10; empty inventory still reaches 12 because
    // the queued crafts already paid their ingredients.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 10, 12, NEUTRAL, {}, { c: 100 })
    expect(plan.reachedLevel).toBe(12)
    expect(plan.ingredientCost).toEqual({}) // nothing drawn from inventory
  })

  it('excludes buy-only queued items (no craft recipe) from queue credit', () => {
    // A buy-only item has no workstation recipe, so it can't be crafted/queued and
    // earns no skill XP — it must not contribute queuedCycles or change the plan.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 5, NEUTRAL, ABUNDANT, {
      'bought-charm': 9999,
    })
    expect(plan.segments.every((s) => (s.queuedCycles ?? 0) === 0)).toBe(true)
    const baseline = buildWorkstationPlan('Furnace', RECIPES, 1, 5, NEUTRAL, ABUNDANT)
    expect(plan.totalCycles).toBe(baseline.totalCycles)
    expect(plan.reachedLevel).toBe(baseline.reachedLevel)
  })

  it('does not spend inventory on queued crafts (only non-queued crafts consume mats)', () => {
    // Queue covers 5 'a' (free); 4 wood affords 2 more 'a'; then it blocks.
    const plan = buildWorkstationPlan('Furnace', RECIPES, 1, 5, NEUTRAL, { wood: 4 }, { a: 5 })
    const seg = plan.segments[0]
    expect(seg.activityId).toBe('a')
    expect(seg.queuedCycles).toBe(5)
    expect(seg.cycles).toBe(7) // 5 queued + 2 affordable
    expect(plan.ingredientCost.wood).toBe(4) // only the 2 non-queued crafts cost wood
    expect(plan.reachedLevel).toBeLessThan(5) // out of wood before the target
  })

  it('orders the in-progress queue first, even if another recipe has higher XP/sec', () => {
    // 'slow' (rate 0.5) is in the queue (already crafting); 'fast' (rate 2.0) is
    // affordable. The queued item must lead the grind path, not the optimal one.
    const ORDER: WorkstationRecipe[] = [
      {
        itemId: 'slow',
        itemName: 'Slow',
        levelRequirement: 1,
        experience: 10,
        craftTime: 20,
        ingredients: [{ id: 'x', amount: 1 }],
      },
      {
        itemId: 'fast',
        itemName: 'Fast',
        levelRequirement: 1,
        experience: 20,
        craftTime: 10,
        ingredients: [{ id: 'y', amount: 1 }],
      },
    ]
    const plan = buildWorkstationPlan('Stove', ORDER, 1, 5, NEUTRAL, { y: 1e9 }, { slow: 3 })
    expect(plan.segments[0]).toMatchObject({ activityId: 'slow', queuedCycles: 3 })
    // 'fast' still runs for the remainder, but only after the queued 'slow'.
    expect(plan.segments.findIndex((s) => s.activityId === 'fast')).toBeGreaterThan(0)
  })

  it('shows only the queue when it already covers the whole grind (no extra recipe)', () => {
    // Mirrors the real bug: deep into a level with a huge queue of one item — the
    // queue alone clears the target, so no other (higher-XP/sec) recipe is added.
    const ORDER: WorkstationRecipe[] = [
      {
        itemId: 'slow',
        itemName: 'Slow',
        levelRequirement: 1,
        experience: 10,
        craftTime: 20,
        ingredients: [{ id: 'x', amount: 1 }],
      },
      {
        itemId: 'fast',
        itemName: 'Fast',
        levelRequirement: 1,
        experience: 20,
        craftTime: 10,
        ingredients: [{ id: 'y', amount: 1 }],
      },
    ]
    const plan = buildWorkstationPlan('Stove', ORDER, 1, 5, NEUTRAL, { y: 1e9 }, { slow: 100000 })
    expect(plan.segments).toHaveLength(1)
    expect(plan.segments[0].activityId).toBe('slow')
    expect(plan.segments.some((s) => s.activityId === 'fast')).toBe(false)
  })
})
