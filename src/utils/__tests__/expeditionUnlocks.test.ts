import { getTotalCompletedExpeditions, getMaxUnlockedTier } from '@/utils/planner/expeditionUnlocks'

describe('getTotalCompletedExpeditions', () => {
  test('returns 0 for empty completions', () => {
    expect(getTotalCompletedExpeditions({})).toBe(0)
  })

  test('sums counts across all expedition types and tiers', () => {
    const completions = {
      'exp-a': { 1: 3, 2: 7 },
      'exp-b': { 1: 10, 3: 2 },
    }
    expect(getTotalCompletedExpeditions(completions)).toBe(22)
  })

  test('sums correctly for a single expedition with multiple tiers', () => {
    const completions = {
      'exp-c': { 1: 5, 2: 10, 3: 15 },
    }
    expect(getTotalCompletedExpeditions(completions)).toBe(30)
  })
})

describe('getMaxUnlockedTier', () => {
  test('returns 1 when completions map is empty', () => {
    expect(getMaxUnlockedTier('exp-a', {})).toBe(1)
  })

  test('returns 1 when expedition type is not in the map', () => {
    const completions = { 'exp-b': { 1: 20 } }
    expect(getMaxUnlockedTier('exp-a', completions)).toBe(1)
  })

  test('returns tier 2 when tier 1 count meets the requirement (>= 5)', () => {
    const completions = { 'exp-a': { 1: 5 } }
    expect(getMaxUnlockedTier('exp-a', completions)).toBe(2)
  })

  test('returns tier 5 when all tier requirements are met', () => {
    const completions = {
      'exp-a': { 1: 20, 2: 20, 3: 20, 4: 20 },
    }
    expect(getMaxUnlockedTier('exp-a', completions)).toBe(5)
  })

  test('stops at the first unmet requirement', () => {
    // tier 1 >= 5 so tier 2 unlocked, tier 2 < 10 so tier 3 not unlocked
    const completions = {
      'exp-a': { 1: 8, 2: 3, 3: 15, 4: 20 },
    }
    expect(getMaxUnlockedTier('exp-a', completions)).toBe(2)
  })
})
