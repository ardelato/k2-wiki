import { computeGoldPerMinute, goldToSeconds } from '@/utils/planner/goldIncome'

describe('computeGoldPerMinute', () => {
  test('zero awakened creatures and no flowers returns 0', () => {
    expect(computeGoldPerMinute(0, 0, [])).toBe(0)
  })

  test('awakened creatures with base gold level', () => {
    // 5 creatures × (1 + 0) = 5
    expect(computeGoldPerMinute(5, 0, [])).toBe(5)
  })

  test('awakened creatures with upgraded gold level', () => {
    // 3 creatures × (1 + 2) = 9
    expect(computeGoldPerMinute(3, 2, [])).toBe(9)
  })

  test('gold flowers contribute level × count', () => {
    const flowers = [
      { level: 3, count: 2 }, // 6
      { level: 1, count: 4 }, // 4
    ]
    expect(computeGoldPerMinute(0, 0, flowers)).toBe(10)
  })

  test('combines creature and flower income', () => {
    // 2 creatures × (1 + 1) = 4, plus flower 2×3 = 6
    expect(computeGoldPerMinute(2, 1, [{ level: 2, count: 3 }])).toBe(10)
  })
})

describe('goldToSeconds', () => {
  test('returns infinity when gold per minute is 0', () => {
    expect(goldToSeconds(100, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  test('returns infinity when gold per minute is negative', () => {
    expect(goldToSeconds(100, -5)).toBe(Number.POSITIVE_INFINITY)
  })

  test('converts gold cost to seconds', () => {
    // 120 gold ÷ 60 gold/min = 2 min = 120 seconds
    expect(goldToSeconds(120, 60)).toBe(120)
  })

  test('handles fractional amounts', () => {
    // 30 gold ÷ 10 gold/min = 3 min = 180 seconds
    expect(goldToSeconds(30, 10)).toBe(180)
  })

  test('zero gold cost returns 0 seconds', () => {
    expect(goldToSeconds(0, 10)).toBe(0)
  })
})
