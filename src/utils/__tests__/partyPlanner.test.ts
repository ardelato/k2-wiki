// @vitest-environment node
import { describe, expect, test } from 'vitest'

import expeditionsData from '@/data/expeditions.json'
import type { Expedition } from '@/types'
import { planPartyLevelingPath } from '@/utils/partyPlanner'

const allExpeditions = expeditionsData as Expedition[]
import type { PlanScore } from '@/utils/planScorer'
import { scorePlan } from '@/utils/planScorer'

import collectionFull from './fixtures/collection-full.json'
import collectionMixedAwaken from './fixtures/collection-mixed-awaken.json'
import collectionSameLevel from './fixtures/collection-same-level.json'
import collectionSmall from './fixtures/collection-small.json'
import { buildPlannerInput } from './testHelpers'

type Strategy = 'optimal' | 'hands-free'

function runPlan(fixture: typeof collectionFull, strategy: Strategy) {
  const input = buildPlannerInput(fixture, { strategy, timeBudget: 'thorough' })
  const plan = planPartyLevelingPath(input)
  return { plan, score: scorePlan(plan) }
}

// ── Quality gates — assert algorithm invariants ──────────────────────────
describe('plan quality', () => {
  let optimalScore: PlanScore
  let handsFreeScore: PlanScore

  // Run each strategy once and share results across tests
  test('optimal: full collection completes all creatures', { timeout: 120_000 }, () => {
    const result = runPlan(collectionFull, 'optimal')
    optimalScore = result.score
    expect(optimalScore.isComplete).toBe(true)
    expect(optimalScore.incompleteCount).toBe(0)
  })

  test('hands-free: full collection completes all creatures', { timeout: 120_000 }, () => {
    const result = runPlan(collectionFull, 'hands-free')
    handsFreeScore = result.score
    expect(handsFreeScore.isComplete).toBe(true)
    expect(handsFreeScore.incompleteCount).toBe(0)
  })

  test('optimal is faster than hands-free', () => {
    expect(optimalScore.totalTimeSeconds).toBeLessThanOrEqual(handsFreeScore.totalTimeSeconds)
  })

  test('hands-free has fewer reconfigurations than optimal', () => {
    expect(handsFreeScore.totalReconfigurations).toBeLessThan(optimalScore.totalReconfigurations)
  })

  test('hands-free has fewer or equal swaps/hr than optimal', () => {
    expect(handsFreeScore.swapsPerHour).toBeLessThanOrEqual(optimalScore.swapsPerHour)
  })

  test('hands-free has no short steps', () => {
    expect(handsFreeScore.shortStepCount).toBe(0)
  })

  test('both strategies have positive XP efficiency', () => {
    expect(optimalScore.avgXpPerMinute).toBeGreaterThan(0)
    expect(handsFreeScore.avgXpPerMinute).toBeGreaterThan(0)
  })
})

// ── Edge cases — catch known regressions ─────────────────────────────────
describe('edge cases', () => {
  test('small collection (5 creatures) completes', { timeout: 120_000 }, () => {
    const { score } = runPlan(collectionSmall, 'optimal')
    expect(score.isComplete).toBe(true)
  })

  test('all creatures at same level produces valid plan', { timeout: 120_000 }, () => {
    const { plan, score } = runPlan(collectionSameLevel, 'optimal')
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(score.isComplete).toBe(true)
  })

  test('mix of awakened and non-awakened', { timeout: 120_000 }, () => {
    const { plan, score } = runPlan(collectionMixedAwaken, 'optimal')
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(score.isComplete).toBe(true)

    // Non-awakened creatures should cap at 70
    const nonAwakenedIds = collectionMixedAwaken.creatures
      .filter((c) => !c.awakened)
      .map((c) => c.creatureId)
    for (const summary of plan.summaries) {
      if (nonAwakenedIds.includes(summary.creatureId)) {
        expect(summary.endLevel).toBeLessThanOrEqual(70)
      }
    }
  })

  test('hands-free: small collection completes', { timeout: 120_000 }, () => {
    const { score } = runPlan(collectionSmall, 'hands-free')
    expect(score.isComplete).toBe(true)
  })
})

// ── Expedition max tier filtering ──────────────────────────────────────
describe('expedition max tier filtering', () => {
  test(
    'expeditionMaxTiers with tier 0 excludes expedition from plan steps',
    { timeout: 120_000 },
    () => {
      const input = buildPlannerInput(collectionSmall, { strategy: 'optimal', timeBudget: 'quick' })
      // Exclude the first expedition used in the fixture
      const firstExpId = Object.keys(input.expeditions)[0]
      input.expeditionMaxTiers = { [firstExpId]: 0 }

      const plan = planPartyLevelingPath(input)
      for (const step of plan.steps) {
        expect(step.expedition.id).not.toBe(firstExpId)
      }
    },
  )

  test('expeditionMaxTiers caps tier in plan steps', { timeout: 120_000 }, () => {
    const input = buildPlannerInput(collectionSmall, { strategy: 'optimal', timeBudget: 'quick' })
    // Cap all expeditions to tier 2
    const maxTiers: Record<string, number> = {}
    for (const exp of allExpeditions) {
      maxTiers[exp.id] = 2
    }
    input.expeditionMaxTiers = maxTiers

    const plan = planPartyLevelingPath(input)
    for (const step of plan.steps) {
      expect(step.tier).toBeLessThanOrEqual(2)
    }
  })

  test('empty expeditionMaxTiers applies no restrictions', { timeout: 120_000 }, () => {
    const input = buildPlannerInput(collectionSmall, { strategy: 'optimal', timeBudget: 'quick' })
    input.expeditionMaxTiers = {}

    const plan = planPartyLevelingPath(input)
    expect(plan.steps.length).toBeGreaterThan(0)
  })
})
