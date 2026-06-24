import { describe, test, expect } from 'vitest'

import {
  computeAcquisitionPlan,
  type ResourceDemand,
  type CreatureDemand,
} from '@/utils/planner/acquisitionPlan'

const res = (over: Partial<ResourceDemand> & { itemId: string }): ResourceDemand => ({
  totalNeed: 0,
  perUnitGatherSeconds: 0,
  passiveRatePerSecond: 0,
  creatureIds: [],
  ...over,
})

describe('computeAcquisitionPlan', () => {
  test('rate-vs-time is reported per resource on the full need', () => {
    const plan = computeAcquisitionPlan([
      res({
        itemId: 'rainbow-fish',
        totalNeed: 40710,
        perUnitGatherSeconds: 15.75,
        passiveRatePerSecond: 1.67 / 60,
      }),
    ])
    const r = plan.resources[0]
    // 40710 × 15.75 / 3600 ≈ 178 h
    expect(Math.round(r.activeHours)).toBe(178)
    // 40710 / (1.67/min × 1440 min) ≈ 16.9 days
    expect(r.passiveDays).toBeCloseTo(16.9, 0)
  })

  test('a single resource with no passive: full need is its own horizon', () => {
    const plan = computeAcquisitionPlan([
      res({ itemId: 'ore', totalNeed: 100, perUnitGatherSeconds: 10 }), // 1000s
    ])
    expect(plan.horizonSeconds).toBe(1000)
    expect(plan.resources[0].assignment).toBe('active')
    expect(plan.resources[0].activeShortfall).toBe(100)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({
      itemId: 'ore',
      units: 100,
      startSeconds: 0,
      endSeconds: 1000,
    })
  })

  test('fixpoint: a covered resource does NOT inflate the horizon that covers it', () => {
    // 'filler' is huge active work; 'trinket' has passive that clears it over that horizon.
    // The naïve horizon would count trinket's active time too; the fixpoint must not.
    const plan = computeAcquisitionPlan([
      res({ itemId: 'filler', totalNeed: 1000, perUnitGatherSeconds: 10 }), // 10,000s active
      res({ itemId: 'trinket', totalNeed: 50, perUnitGatherSeconds: 10, passiveRatePerSecond: 1 }),
    ])
    // Horizon is driven by filler only (10,000s); trinket: passive 1/s × 10,000 = 10,000 ≥ 50 → covered.
    expect(plan.horizonSeconds).toBe(10000)
    const trinket = plan.resources.find((r) => r.itemId === 'trinket')!
    expect(trinket.assignment).toBe('passive')
    expect(trinket.activeShortfall).toBe(0)
    // ...and trinket contributes NO active step.
    expect(plan.steps.map((s) => s.itemId)).toEqual(['filler'])
  })

  test('partial coverage leaves an active shortfall and a campaign for it', () => {
    // need 1000, passive 0.05/s. Horizon depends on the shortfall (fixpoint).
    const plan = computeAcquisitionPlan([
      res({ itemId: 'wood', totalNeed: 1000, perUnitGatherSeconds: 1, passiveRatePerSecond: 0.05 }),
    ])
    // Fixpoint H = shortfall × 1 = (1000 − 0.05H). H = 1000 − 0.05H → 1.05H = 1000 → H ≈ 952.4
    expect(plan.horizonSeconds).toBeCloseTo(952.4, 0)
    const r = plan.resources[0]
    expect(r.assignment).toBe('active')
    expect(r.activeShortfall).toBeGreaterThan(0)
    expect(r.activeShortfall).toBeLessThan(1000) // passive shaved some off
  })

  test('active steps are ordered (default: largest shortfall first) and laid out serially', () => {
    const plan = computeAcquisitionPlan([
      res({ itemId: 'small', totalNeed: 10, perUnitGatherSeconds: 1 }), // 10s
      res({ itemId: 'big', totalNeed: 100, perUnitGatherSeconds: 1 }), // 100s
      res({ itemId: 'mid', totalNeed: 50, perUnitGatherSeconds: 1 }), // 50s
    ])
    expect(plan.steps.map((s) => s.itemId)).toEqual(['big', 'mid', 'small'])
    expect(plan.steps.map((s) => [s.startSeconds, s.endSeconds])).toEqual([
      [0, 100],
      [100, 150],
      [150, 160],
    ])
  })

  test('a custom order callback overrides the default', () => {
    const plan = computeAcquisitionPlan(
      [
        res({ itemId: 'big', totalNeed: 100, perUnitGatherSeconds: 1 }),
        res({ itemId: 'small', totalNeed: 10, perUnitGatherSeconds: 1 }),
      ],
      [],
      { order: (a, b) => a.totalNeed - b.totalNeed }, // smallest first
    )
    expect(plan.steps.map((s) => s.itemId)).toEqual(['small', 'big'])
  })

  test('creature ETA: active resource resolves at its campaign end', () => {
    const demands = [
      res({ itemId: 'ore', totalNeed: 100, perUnitGatherSeconds: 10, creatureIds: ['a'] }), // 1000s
    ]
    const creatures: CreatureDemand[] = [
      { creatureId: 'a', needs: [{ itemId: 'ore', amount: 100 }] },
    ]
    const plan = computeAcquisitionPlan(demands, creatures)
    expect(plan.creatureEtas).toEqual([{ creatureId: 'a', etaSeconds: 1000 }])
  })

  test('creature ETA: passive resource is FIFO across creatures (no double-credit)', () => {
    // One passive pool, 1/s. Two creatures each claim 100. Big active job sets a long
    // horizon so the pool covers both — but the SECOND creature waits longer (FIFO).
    const demands = [
      res({
        itemId: 'filler',
        totalNeed: 100000,
        perUnitGatherSeconds: 1,
        creatureIds: ['a', 'b'],
      }),
      res({
        itemId: 'gem',
        totalNeed: 200,
        perUnitGatherSeconds: 1,
        passiveRatePerSecond: 1,
        creatureIds: ['a', 'b'],
      }),
    ]
    const creatures: CreatureDemand[] = [
      { creatureId: 'a', needs: [{ itemId: 'gem', amount: 100 }] },
      { creatureId: 'b', needs: [{ itemId: 'gem', amount: 100 }] },
    ]
    const plan = computeAcquisitionPlan(demands, creatures)
    const gem = plan.resources.find((r) => r.itemId === 'gem')!
    expect(gem.assignment).toBe('passive') // covered over the long filler horizon
    const a = plan.creatureEtas.find((e) => e.creatureId === 'a')!
    const b = plan.creatureEtas.find((e) => e.creatureId === 'b')!
    // a waits for 100 units @1/s = 100s; b waits for the next 100 = 200s (not also 100).
    expect(a.etaSeconds).toBe(100)
    expect(b.etaSeconds).toBe(200)
  })

  test('empty input yields an empty plan', () => {
    const plan = computeAcquisitionPlan([])
    expect(plan).toEqual({ horizonSeconds: 0, resources: [], steps: [], creatureEtas: [] })
  })
})
