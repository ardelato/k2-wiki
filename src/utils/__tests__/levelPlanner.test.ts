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

describe('planLevelingPath — expeditionTierSelections filtering', () => {
  test('plan without expeditionTierSelections produces steps', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
    })
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.totalRuns).toBeGreaterThan(0)
  })

  test('plan with empty expeditionTierSelections applies no restrictions', () => {
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
      expeditionTierSelections: {},
    })
    expect(withEmpty.steps.length).toBe(unrestricted.steps.length)
    expect(withEmpty.totalRuns).toBe(unrestricted.totalRuns)
  })

  test('plan with expedition at empty tiers excludes that expedition', () => {
    const excludedId = expeditions[0].id
    const tierSelections: Record<string, number[]> = { [excludedId]: [] }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionTierSelections: tierSelections,
    })

    for (const step of plan.steps) {
      expect(step.expedition.id).not.toBe(excludedId)
    }
  })

  test('plan with tier selections [1, 2] produces no steps exceeding tier 2', () => {
    const tierSelections: Record<string, number[]> = {}
    for (const exp of expeditions) {
      tierSelections[exp.id] = [1, 2]
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionTierSelections: tierSelections,
    })

    expect(plan.steps.length).toBeGreaterThan(0)
    for (const step of plan.steps) {
      expect(step.tier).toBeLessThanOrEqual(2)
    }
  })

  test('plan with all expeditions at empty tiers produces empty steps', () => {
    const tierSelections: Record<string, number[]> = {}
    for (const exp of expeditions) {
      tierSelections[exp.id] = []
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionTierSelections: tierSelections,
    })

    expect(plan.steps).toHaveLength(0)
    expect(plan.totalRuns).toBe(0)
  })

  test('plan with only higher tiers [3, 4, 5] excludes lower tiers', () => {
    const tierSelections: Record<string, number[]> = {}
    for (const exp of expeditions) {
      tierSelections[exp.id] = [3, 4, 5]
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionTierSelections: tierSelections,
    })

    expect(plan.steps.length).toBeGreaterThan(0)
    for (const step of plan.steps) {
      expect(step.tier).toBeGreaterThanOrEqual(3)
    }
  })

  test('plan with mixed tier selections respects per-expedition choices', () => {
    const firstExp = expeditions[0]
    const secondExp = expeditions[1]
    const tierSelections: Record<string, number[]> = {
      [firstExp.id]: [1, 2],
      [secondExp.id]: [4, 5],
    }

    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      expeditionTierSelections: tierSelections,
    })

    for (const step of plan.steps) {
      if (step.expedition.id === firstExp.id) {
        expect(step.tier).toBeLessThanOrEqual(2)
      }
      if (step.expedition.id === secondExp.id) {
        expect(step.tier).toBeGreaterThanOrEqual(4)
      }
    }
  })
})
