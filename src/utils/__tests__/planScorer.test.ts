import type { PartyLevelingPlan, PartyPlanStep, PartyPlanMember } from '@/types'
import { scorePlan } from '@/utils/planner/planScorer'

function makeMember(overrides: Partial<PartyPlanMember> = {}): PartyPlanMember {
  return {
    creatureId: 'creature-1',
    fromLevel: 1,
    toLevel: 10,
    xpGained: 1000,
    isBooster: false,
    ...overrides,
  }
}

function makeStep(overrides: Partial<PartyPlanStep> = {}): PartyPlanStep {
  return {
    kind: 'run',
    expedition: { id: 'exp-1', name: 'Test Expedition' } as any,
    tier: 1,
    party: [makeMember()],
    runs: 5,
    timeSeconds: 600,
    xpPerMinute: 100,
    biomeName: 'Forest',
    loopCount: 1,
    loopCountStart: 1,
    loopCountEnd: 2,
    preservedLoopBonus: false,
    wasReconfigured: false,
    ...overrides,
  }
}

function makePlan(overrides: Partial<PartyLevelingPlan> = {}): PartyLevelingPlan {
  return {
    steps: [],
    summaries: [],
    awakenEvents: [],
    inputLevelerCount: 0,
    plannedLevelerCount: 0,
    isComplete: true,
    incompleteCreatureIds: [],
    totalTimeSeconds: 0,
    totalRuns: 0,
    ...overrides,
  }
}

describe('scorePlan', () => {
  describe('empty plan', () => {
    test('returns zeroes for all numeric fields', () => {
      const score = scorePlan(makePlan())
      expect(score.totalTimeSeconds).toBe(0)
      expect(score.totalRuns).toBe(0)
      expect(score.totalReconfigurations).toBe(0)
      expect(score.swapsPerHour).toBe(0)
      expect(score.shortStepCount).toBe(0)
      expect(score.earlySwapCount).toBe(0)
      expect(score.avgXpPerMinute).toBe(0)
      expect(score.avgCreatureXpPerSecond).toBe(0)
      expect(score.avgCreatureTimeSeconds).toBe(0)
      expect(score.maxCreatureTimeSeconds).toBe(0)
      expect(score.creaturesFullyLeveled).toBe(0)
    })
  })

  describe('isComplete / incompleteCount passthrough', () => {
    test('reflects isComplete = true', () => {
      const score = scorePlan(makePlan({ isComplete: true, incompleteCreatureIds: [] }))
      expect(score.isComplete).toBe(true)
      expect(score.incompleteCount).toBe(0)
    })

    test('reflects isComplete = false with incomplete creatures', () => {
      const score = scorePlan(
        makePlan({ isComplete: false, incompleteCreatureIds: ['c1', 'c2', 'c3'] }),
      )
      expect(score.isComplete).toBe(false)
      expect(score.incompleteCount).toBe(3)
    })
  })

  describe('totalTimeSeconds / totalRuns passthrough', () => {
    test('passes through plan totals directly', () => {
      const score = scorePlan(
        makePlan({
          totalTimeSeconds: 7200,
          totalRuns: 42,
          steps: [makeStep({ timeSeconds: 100, runs: 10 })],
        }),
      )
      expect(score.totalTimeSeconds).toBe(7200)
      expect(score.totalRuns).toBe(42)
    })
  })

  describe('totalReconfigurations', () => {
    test('counts only steps where wasReconfigured is true', () => {
      const steps = [
        makeStep({ wasReconfigured: false }),
        makeStep({ wasReconfigured: true }),
        makeStep({ wasReconfigured: true }),
        makeStep({ wasReconfigured: false }),
      ]
      const score = scorePlan(makePlan({ steps, totalTimeSeconds: 2400, totalRuns: 20 }))
      expect(score.totalReconfigurations).toBe(2)
    })
  })

  describe('swapsPerHour', () => {
    test('calculates reconfigurations per hour correctly', () => {
      // 2 reconfigs over 3600s = 2 swaps/hr
      const steps = [
        makeStep({ wasReconfigured: true, timeSeconds: 1800 }),
        makeStep({ wasReconfigured: true, timeSeconds: 1800 }),
      ]
      const score = scorePlan(makePlan({ steps, totalTimeSeconds: 3600, totalRuns: 10 }))
      expect(score.swapsPerHour).toBeCloseTo(2, 5)
    })

    test('returns 0 when totalTimeSeconds is 0', () => {
      const steps = [makeStep({ wasReconfigured: true, timeSeconds: 0 })]
      const score = scorePlan(makePlan({ steps, totalTimeSeconds: 0, totalRuns: 5 }))
      expect(score.swapsPerHour).toBe(0)
    })
  })

  describe('shortStepCount', () => {
    test('counts steps with runs <= 2', () => {
      const steps = [
        makeStep({ runs: 1 }),
        makeStep({ runs: 2 }),
        makeStep({ runs: 3 }),
        makeStep({ runs: 10 }),
      ]
      const score = scorePlan(makePlan({ steps, totalTimeSeconds: 1000, totalRuns: 16 }))
      expect(score.shortStepCount).toBe(2)
    })
  })

  describe('creaturesFullyLeveled', () => {
    test('counts summaries with endLevel >= 120', () => {
      const summaries = [
        {
          creatureId: 'c1',
          startLevel: 1,
          endLevel: 120,
          totalTimeSeconds: 1000,
          totalRuns: 10,
          expeditionsUsed: [],
        },
        {
          creatureId: 'c2',
          startLevel: 1,
          endLevel: 119,
          totalTimeSeconds: 900,
          totalRuns: 9,
          expeditionsUsed: [],
        },
        {
          creatureId: 'c3',
          startLevel: 50,
          endLevel: 120,
          totalTimeSeconds: 500,
          totalRuns: 5,
          expeditionsUsed: [],
        },
      ]
      const score = scorePlan(makePlan({ summaries, totalTimeSeconds: 2400, totalRuns: 24 }))
      expect(score.creaturesFullyLeveled).toBe(2)
    })
  })

  describe('earlySwapCount', () => {
    test('counts reconfigured steps with startTime < 7200', () => {
      const steps = [
        makeStep({ wasReconfigured: true, startTime: 3600 }), // before 2hr → counted
        makeStep({ wasReconfigured: true, startTime: 7199 }), // before 2hr → counted
        makeStep({ wasReconfigured: true, startTime: 7200 }), // exactly 2hr → not counted
        makeStep({ wasReconfigured: true, startTime: 9000 }), // after 2hr → not counted
        makeStep({ wasReconfigured: false, startTime: 1000 }), // not reconfigured → not counted
        makeStep({ wasReconfigured: true }), // no startTime → not counted
      ]
      const score = scorePlan(makePlan({ steps, totalTimeSeconds: 10000, totalRuns: 30 }))
      expect(score.earlySwapCount).toBe(2)
    })
  })
})
