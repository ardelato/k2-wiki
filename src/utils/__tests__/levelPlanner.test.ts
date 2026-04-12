import creaturesData from '@/data/creatures.json'
import expeditionsData from '@/data/expeditions.json'
import type { Creature, Expedition } from '@/types'
import { planLevelingPath, type AlternativeRoute } from '@/utils/levelPlanner'

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

describe('planLevelingPath — alternative routes', () => {
  test('steps include alternatives for a multi-level plan', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    const stepsWithAlts = plan.steps.filter((s) => s.alternatives && s.alternatives.length > 0)
    expect(stepsWithAlts.length).toBeGreaterThan(0)
  })

  test('alternatives do not include the chosen expedition+tier', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    for (const step of plan.steps) {
      if (!step.alternatives) continue
      for (const alt of step.alternatives) {
        const isSame = alt.expedition.id === step.expedition.id && alt.tier === step.tier
        expect(isSame).toBe(false)
      }
    }
  })

  test('alternatives have at most 5 entries per step', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 50,
      isAwakened: false,
    })

    for (const step of plan.steps) {
      if (!step.alternatives) continue
      expect(step.alternatives.length).toBeLessThanOrEqual(5)
    }
  })

  test('alternatives have valid time and XP delta values', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    for (const step of plan.steps) {
      if (!step.alternatives) continue
      for (const alt of step.alternatives) {
        expect(alt.timeSeconds).toBeGreaterThan(0)
        expect(alt.runs).toBeGreaterThan(0)
        expect(alt.xpPerMinute).toBeGreaterThan(0)
        expect(typeof alt.timeDeltaPercent).toBe('number')
        expect(typeof alt.xpPerMinuteDeltaPercent).toBe('number')
      }
    }
  })

  test('alternatives are sorted by time (fastest first)', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    for (const step of plan.steps) {
      if (!step.alternatives || step.alternatives.length < 2) continue
      for (let i = 1; i < step.alternatives.length; i++) {
        expect(step.alternatives[i].timeSeconds).toBeGreaterThanOrEqual(
          step.alternatives[i - 1].timeSeconds,
        )
      }
    }
  })

  test('awakening steps have no alternatives', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 120,
      isAwakened: false,
    })

    const awakeningSteps = plan.steps.filter((s) => s.isAwakeningStep)
    expect(awakeningSteps.length).toBeGreaterThan(0)
    for (const step of awakeningSteps) {
      expect(step.alternatives).toBeUndefined()
    }
  })
})

describe('planLevelingPath — step overrides', () => {
  test('overriding a step changes the expedition at that level', () => {
    const basePlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    // Find a step with alternatives to override
    const stepWithAlts = basePlan.steps.find((s) => s.alternatives && s.alternatives.length > 0)
    if (!stepWithAlts || !stepWithAlts.alternatives) return

    const alt = stepWithAlts.alternatives[0]
    const overrides = new Map<number, { expeditionId: string; tier: number; toLevel: number }>()
    overrides.set(stepWithAlts.fromLevel, {
      expeditionId: alt.expedition.id,
      tier: alt.tier,
      toLevel: stepWithAlts.toLevel,
    })

    const overriddenPlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
      stepOverrides: overrides,
    })

    // The overridden step should use the alternative's expedition
    const overriddenStep = overriddenPlan.steps.find((s) => s.fromLevel === stepWithAlts.fromLevel)
    expect(overriddenStep).toBeDefined()
    expect(overriddenStep!.expedition.id).toBe(alt.expedition.id)
    expect(overriddenStep!.tier).toBe(alt.tier)
  })

  test('override covers the full step level range', () => {
    const basePlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    const stepWithAlts = basePlan.steps.find((s) => s.alternatives && s.alternatives.length > 0)
    if (!stepWithAlts || !stepWithAlts.alternatives) return

    const alt = stepWithAlts.alternatives[0]
    const overrides = new Map<number, { expeditionId: string; tier: number; toLevel: number }>()
    overrides.set(stepWithAlts.fromLevel, {
      expeditionId: alt.expedition.id,
      tier: alt.tier,
      toLevel: stepWithAlts.toLevel,
    })

    const overriddenPlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
      stepOverrides: overrides,
    })

    // The overridden step should cover the same level range as the original
    const overriddenStep = overriddenPlan.steps.find((s) => s.fromLevel === stepWithAlts.fromLevel)
    expect(overriddenStep).toBeDefined()
    expect(overriddenStep!.expedition.id).toBe(alt.expedition.id)
    expect(overriddenStep!.toLevel).toBe(stepWithAlts.toLevel)
  })

  test('overridden step time matches alternative predicted time', () => {
    const basePlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
    })

    const stepWithAlts = basePlan.steps.find((s) => s.alternatives && s.alternatives.length > 0)
    if (!stepWithAlts || !stepWithAlts.alternatives) return

    const alt = stepWithAlts.alternatives[0]
    const overrides = new Map<number, { expeditionId: string; tier: number; toLevel: number }>()
    overrides.set(stepWithAlts.fromLevel, {
      expeditionId: alt.expedition.id,
      tier: alt.tier,
      toLevel: stepWithAlts.toLevel,
    })

    const overriddenPlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 30,
      isAwakened: false,
      stepOverrides: overrides,
    })

    const overriddenStep = overriddenPlan.steps.find((s) => s.fromLevel === stepWithAlts.fromLevel)
    expect(overriddenStep).toBeDefined()
    // The step's actual time should match the alternative's predicted time
    expect(overriddenStep!.timeSeconds).toBe(alt.timeSeconds)
    expect(overriddenStep!.runs).toBe(alt.runs)
  })

  test('overriding with same expedition as optimal produces same plan', () => {
    const basePlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
    })

    const firstStep = basePlan.steps[0]
    const overrides = new Map<number, { expeditionId: string; tier: number; toLevel: number }>()
    overrides.set(firstStep.fromLevel, {
      expeditionId: firstStep.expedition.id,
      tier: firstStep.tier,
      toLevel: firstStep.toLevel,
    })

    const overriddenPlan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 20,
      isAwakened: false,
      stepOverrides: overrides,
    })

    expect(overriddenPlan.totalTimeSeconds).toBe(basePlan.totalTimeSeconds)
    expect(overriddenPlan.totalRuns).toBe(basePlan.totalRuns)
  })
})

describe('planLevelingPath — prestige mode', () => {
  test('prestige plan starts with an awakening step', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 70,
      isAwakened: true,
      isPrestige: true,
    })

    expect(plan.steps.length).toBeGreaterThan(1)
    expect(plan.steps[0].isAwakeningStep).toBe(true)
    expect(plan.steps[0].fromLevel).toBe(120)
    expect(plan.steps[0].toLevel).toBe(1)
  })

  test('prestige plan generates valid leveling steps after the awakening step', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 50,
      isAwakened: true,
      isPrestige: true,
    })

    const levelingSteps = plan.steps.filter((s) => !s.isAwakeningStep)
    expect(levelingSteps.length).toBeGreaterThan(0)
    expect(levelingSteps[0].fromLevel).toBe(1)
    expect(plan.totalRuns).toBeGreaterThan(0)
    expect(plan.totalTimeSeconds).toBeGreaterThan(0)
  })

  test('prestige plan without prestige flag does not prepend awakening step', () => {
    const plan = planLevelingPath({
      creature,
      startLevel: 1,
      targetLevel: 50,
      isAwakened: true,
    })

    expect(plan.steps[0].isAwakeningStep).toBeFalsy()
  })
})
