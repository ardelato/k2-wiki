import creaturesData from '@/data/creatures.json'
import expeditionsData from '@/data/expeditions.json'
import type { Creature, Expedition } from '@/types'
import { planLevelingPath } from '@/utils/levelPlanner'

const creatures = creaturesData as Creature[]
const expeditions = expeditionsData as Expedition[]

// Use a real creature that exists in the data
const creature = creatures[0]

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
