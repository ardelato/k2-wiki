import { describe, test, expect } from 'vitest'

import { computeGatherAdvisories, type GatherLeverSaving } from '@/utils/planner/gatherAdvisories'

const sv = (
  over: Partial<GatherLeverSaving> & { job: string; lever: GatherLeverSaving['lever'] },
): GatherLeverSaving => ({
  currentSeconds: 0,
  boostedSeconds: 0,
  ...over,
})

describe('computeGatherAdvisories', () => {
  test('time saved is current − boosted, formatted per lever', () => {
    const [a] = computeGatherAdvisories([
      sv({
        job: 'Fishing',
        lever: 'awakenYield',
        currentSeconds: 640_800,
        boostedSeconds: 301_680,
        awakenNodeId: 'fishing-yield-i',
      }),
    ])
    expect(a.timeSavedSeconds).toBe(339_120)
    expect(a.headline).toBe('Fishing Yield I')
    expect(a.detail).toBe('+1 gathered per action')
    expect(a.routeName).toBe('awaken')
    expect(a.awakenTreeId).toBe('fishing')
    expect(a.awakenNodeId).toBe('fishing-yield-i')
  })

  test('sanctuary advisory names the target tier and routes to sanctuary', () => {
    const [a] = computeGatherAdvisories([
      sv({
        job: 'Mining',
        lever: 'sanctuary',
        targetTier: 2,
        currentSeconds: 1000,
        boostedSeconds: 900,
      }),
    ])
    expect(a.headline).toBe('Mining Sanctuary → Tier 2')
    expect(a.routeName).toBe('sanctuary')
    expect(a.timeSavedSeconds).toBe(100)
  })

  test('ranks by time saved across jobs/levers; yield (the big lever) leads', () => {
    const out = computeGatherAdvisories([
      sv({ job: 'Fishing', lever: 'awakenDuration', currentSeconds: 1000, boostedSeconds: 950 }), // 50
      sv({ job: 'Fishing', lever: 'awakenYield', currentSeconds: 1000, boostedSeconds: 500 }), // 500
      sv({
        job: 'Mining',
        lever: 'sanctuary',
        targetTier: 2,
        currentSeconds: 1000,
        boostedSeconds: 900,
      }), // 100
    ])
    expect(out.map((a) => a.lever)).toEqual(['awakenYield', 'sanctuary', 'awakenDuration'])
    expect(out.every((a, i) => i === 0 || out[i - 1].timeSavedSeconds >= a.timeSavedSeconds)).toBe(
      true,
    )
  })

  test('levers that save nothing (or go backwards) are dropped', () => {
    const out = computeGatherAdvisories([
      sv({ job: 'Farming', lever: 'awakenYield', currentSeconds: 1000, boostedSeconds: 1000 }), // 0 (maxed)
      sv({
        job: 'Farming',
        lever: 'sanctuary',
        targetTier: 5,
        currentSeconds: 1000,
        boostedSeconds: 700,
      }), // 300
    ])
    expect(out).toHaveLength(1)
    expect(out[0].lever).toBe('sanctuary')
  })

  test('empty input → no advisories', () => {
    expect(computeGatherAdvisories([])).toEqual([])
  })

  test('sanctuary partyDiff is passed through to the advisory', () => {
    const partyDiff = {
      target: { job: 'Fishing', from: 1, to: 3 },
      keep: [],
      swapOut: [{ id: 'a', name: 'A', contribution: 0 }],
      swapIn: [{ id: 'b', name: 'B', contribution: 9 }],
      sideEffects: [],
    }
    const [a] = computeGatherAdvisories([
      sv({
        job: 'Fishing',
        lever: 'sanctuary',
        targetTier: 3,
        currentSeconds: 1000,
        boostedSeconds: 600,
        partyDiff,
      }),
    ])
    expect(a.partyDiff).toBe(partyDiff)
    expect(a.partyDiff?.target.to).toBe(3)
  })
})
