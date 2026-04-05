import creaturesData from '@/data/creatures.json'
import expeditionsData from '@/data/expeditions.json'
import type { Creature, Expedition } from '@/types'
import { planLevelingPath } from '@/utils/levelPlanner'

const creatures = creaturesData as Creature[]
const expeditions = expeditionsData as Expedition[]

const creature = creatures[0]

describe('planLevelingPath', () => {
  test('returns a plan with steps for level 1 to 10', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
    })
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.totalTimeSeconds).toBeGreaterThan(0)
    expect(plan.totalRuns).toBeGreaterThan(0)
  })

  test('omitting swordXpMultiplier defaults to 1', () => {
    const withDefault = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
    })
    const withExplicit = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
      swordXpMultiplier: 1,
    })
    expect(withDefault.totalTimeSeconds).toBe(withExplicit.totalTimeSeconds)
    expect(withDefault.totalRuns).toBe(withExplicit.totalRuns)
  })

  test('swordXpMultiplier > 1 reduces total runs', () => {
    const base = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
      swordXpMultiplier: 1,
    })
    const boosted = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
      swordXpMultiplier: 1.5,
    })
    expect(boosted.totalRuns).toBeLessThan(base.totalRuns)
  })

  test('swordXpMultiplier > 1 reduces total time', () => {
    const base = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
      swordXpMultiplier: 1,
    })
    const boosted = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 10,
      isAwakened: false,
      swordXpMultiplier: 1.5,
    })
    expect(boosted.totalTimeSeconds).toBeLessThan(base.totalTimeSeconds)
  })

  test('xpPerRun reflects the multiplier', () => {
    const base = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 5,
      isAwakened: false,
      swordXpMultiplier: 1,
    })
    const boosted = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 5,
      isAwakened: false,
      swordXpMultiplier: 2,
    })
    // First step's xpPerRun should be roughly double (floored)
    const baseXp = base.steps[0].xpPerRun
    const boostedXp = boosted.steps[0].xpPerRun
    expect(boostedXp).toBeGreaterThan(baseXp)
    expect(boostedXp).toBe(Math.floor(baseXp * 2))
  })
})

describe('planLevelingPath — expeditionMaxTiers filtering', () => {
  test('plan without expeditionMaxTiers produces steps', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
    })
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.totalRuns).toBeGreaterThan(0)
  })

  test('plan with empty expeditionMaxTiers applies no restrictions', () => {
    const unrestricted = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
    })
    const withEmpty = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionMaxTiers: {},
    })
    expect(withEmpty.steps.length).toBe(unrestricted.steps.length)
    expect(withEmpty.totalRuns).toBe(unrestricted.totalRuns)
  })

  test('plan with expedition at max tier 0 excludes that expedition', () => {
    const excludedId = expeditions[0].id
    const maxTiers: Record<string, number> = { [excludedId]: 0 }
    // Leave all other expeditions unrestricted (default 5)

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionMaxTiers: maxTiers,
    })

    for (const step of plan.steps) {
      expect(step.expedition.id).not.toBe(excludedId)
    }
  })

  test('plan with max tier cap produces no steps exceeding that tier', () => {
    // Cap all expeditions to tier 2
    const maxTiers: Record<string, number> = {}
    for (const exp of expeditions) {
      maxTiers[exp.id] = 2
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionMaxTiers: maxTiers,
    })

    expect(plan.steps.length).toBeGreaterThan(0)
    for (const step of plan.steps) {
      expect(step.tier).toBeLessThanOrEqual(2)
    }
  })

  test('plan with all expeditions at tier 0 produces empty steps', () => {
    const maxTiers: Record<string, number> = {}
    for (const exp of expeditions) {
      maxTiers[exp.id] = 0
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionMaxTiers: maxTiers,
    })

    expect(plan.steps).toHaveLength(0)
    expect(plan.totalRuns).toBe(0)
  })
})
