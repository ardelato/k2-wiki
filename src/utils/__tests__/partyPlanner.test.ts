import { describe, expect, test } from 'vitest'

import { planPartyLevelingPath } from '@/utils/partyPlanner'
import type { PlanScore } from '@/utils/planScorer'
import { scorePlan } from '@/utils/planScorer'

import baselines from './fixtures/baselines.json'
import collectionFull from './fixtures/collection-full.json'
import collectionMixedAwaken from './fixtures/collection-mixed-awaken.json'
import collectionSameLevel from './fixtures/collection-same-level.json'
import collectionSmall from './fixtures/collection-small.json'
import { buildPlannerInput } from './testHelpers'

type Strategy = 'optimal' | 'hands-free'

function getBaseline(fixture: string, strategy: string): PlanScore {
  const entry = baselines.find((b) => b.fixture === fixture && b.strategy === strategy)
  if (!entry) throw new Error(`No baseline for ${fixture}/${strategy}`)
  return entry.score as PlanScore
}

function runPlan(fixture: typeof collectionFull, strategy: Strategy) {
  const input = buildPlannerInput(fixture, { strategy, timeBudget: 'thorough' })
  const plan = planPartyLevelingPath(input)
  return { plan, score: scorePlan(plan) }
}

// ── Snapshot tests — detect ANY output change ──────────────────────────
describe('plan stability', () => {
  test('optimal: full collection score matches baseline', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'optimal')
    const baseline = getBaseline('full', 'optimal')
    expect(score.totalTimeSeconds).toBe(baseline.totalTimeSeconds)
    expect(score.totalRuns).toBe(baseline.totalRuns)
    expect(score.isComplete).toBe(baseline.isComplete)
    expect(score.creaturesFullyLeveled).toBe(baseline.creaturesFullyLeveled)
  })

  test('hands-free: full collection score matches baseline', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'hands-free')
    const baseline = getBaseline('full', 'hands-free')
    expect(score.totalTimeSeconds).toBe(baseline.totalTimeSeconds)
    expect(score.totalRuns).toBe(baseline.totalRuns)
    expect(score.isComplete).toBe(baseline.isComplete)
    expect(score.creaturesFullyLeveled).toBe(baseline.creaturesFullyLeveled)
    expect(score.totalReconfigurations).toBe(baseline.totalReconfigurations)
  })

  test('optimal: small collection score matches baseline', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionSmall, 'optimal')
    const baseline = getBaseline('small', 'optimal')
    expect(score.totalTimeSeconds).toBe(baseline.totalTimeSeconds)
    expect(score.totalRuns).toBe(baseline.totalRuns)
  })

  test('hands-free: small collection score matches baseline', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionSmall, 'hands-free')
    const baseline = getBaseline('small', 'hands-free')
    expect(score.totalTimeSeconds).toBe(baseline.totalTimeSeconds)
    expect(score.totalRuns).toBe(baseline.totalRuns)
  })
})

// ── Quality gate tests — enforce minimum quality ───────────────────────
describe('plan quality', () => {
  test('optimal: full collection completes all creatures', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'optimal')
    expect(score.isComplete).toBe(true)
    expect(score.incompleteCount).toBe(0)
  })

  test('optimal: total time within 5% of baseline', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'optimal')
    const baseline = getBaseline('full', 'optimal')
    const tolerance = baseline.totalTimeSeconds * 0.05
    expect(score.totalTimeSeconds).toBeLessThanOrEqual(baseline.totalTimeSeconds + tolerance)
  })

  test('hands-free: full collection completes all creatures', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'hands-free')
    expect(score.isComplete).toBe(true)
    expect(score.incompleteCount).toBe(0)
  })

  test('hands-free: fewer or equal swaps/hr than optimal', { timeout: 30_000 }, () => {
    const { score: hfScore } = runPlan(collectionFull, 'hands-free')
    const { score: optScore } = runPlan(collectionFull, 'optimal')
    expect(hfScore.swapsPerHour).toBeLessThanOrEqual(optScore.swapsPerHour)
  })

  test('hands-free: no short steps (runs <= 2)', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionFull, 'hands-free')
    expect(score.shortStepCount).toBeLessThanOrEqual(2)
  })
})

// ── Regression tests — catch known edge cases ──────────────────────────
describe('edge cases', () => {
  test('small collection (5 creatures) completes', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionSmall, 'optimal')
    expect(score.isComplete).toBe(true)
  })

  test('all creatures at same level produces valid plan', { timeout: 30_000 }, () => {
    const { plan, score } = runPlan(collectionSameLevel, 'optimal')
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(score.isComplete).toBe(true)
  })

  test('mix of awakened and non-awakened', { timeout: 30_000 }, () => {
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

  test('hands-free: small collection completes', { timeout: 30_000 }, () => {
    const { score } = runPlan(collectionSmall, 'hands-free')
    expect(score.isComplete).toBe(true)
  })
})

// ── Performance benchmarks ─────────────────────────────────────────────
describe('performance', () => {
  test('full collection completes within 30s', { timeout: 60_000 }, () => {
    const start = performance.now()
    const input = buildPlannerInput(collectionFull, { strategy: 'optimal', timeBudget: 'thorough' })
    planPartyLevelingPath(input)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(30_000)
  })

  test('small collection completes within 5s', { timeout: 10_000 }, () => {
    const start = performance.now()
    const input = buildPlannerInput(collectionSmall, {
      strategy: 'optimal',
      timeBudget: 'thorough',
    })
    planPartyLevelingPath(input)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5_000)
  })
})
