import {
  tierBenefitType,
  tierIncrementalLabel,
  progressPercent,
  targetPercent,
  isScoreAtThreshold,
  TIER_THRESHOLDS_RAW,
  MAX_TIER,
  MAX_SCORE,
  SCORE_DIVISOR,
} from '@/utils/sanctuaryConstants'

describe('MAX_SCORE', () => {
  test('equals the last tier threshold', () => {
    expect(MAX_SCORE).toBe(TIER_THRESHOLDS_RAW[TIER_THRESHOLDS_RAW.length - 1])
  })

  test('equals 0.9 * SCORE_DIVISOR', () => {
    expect(MAX_SCORE).toBe(0.9 * SCORE_DIVISOR)
  })
})

describe('tierBenefitType', () => {
  test('returns "xp" for out-of-range tiers', () => {
    expect(tierBenefitType(0)).toBe('xp')
    expect(tierBenefitType(-1)).toBe('xp')
    expect(tierBenefitType(6)).toBe('xp')
  })

  test('tier 1 is xp (first XP bonus)', () => {
    expect(tierBenefitType(1)).toBe('xp')
  })

  test('tier 2 is duration (first duration reduction)', () => {
    expect(tierBenefitType(2)).toBe('duration')
  })

  test('tier 3 is xp (XP increases again)', () => {
    expect(tierBenefitType(3)).toBe('xp')
  })

  test('tier 4 is duration (duration increases again)', () => {
    expect(tierBenefitType(4)).toBe('duration')
  })

  test('tier 5 is yield (first yield bonus)', () => {
    expect(tierBenefitType(5)).toBe('yield')
  })
})

describe('tierIncrementalLabel', () => {
  test('returns empty string for out-of-range tiers', () => {
    expect(tierIncrementalLabel(0)).toBe('')
    expect(tierIncrementalLabel(-1)).toBe('')
    expect(tierIncrementalLabel(6)).toBe('')
  })

  test('tier 1 shows XP increase', () => {
    expect(tierIncrementalLabel(1)).toBe('+20% XP')
  })

  test('tier 2 shows duration reduction', () => {
    expect(tierIncrementalLabel(2)).toBe('-10% Dur')
  })

  test('tier 3 shows XP increase', () => {
    expect(tierIncrementalLabel(3)).toBe('+20% XP')
  })

  test('tier 4 shows duration reduction', () => {
    expect(tierIncrementalLabel(4)).toBe('-10% Dur')
  })

  test('tier 5 shows yield bonus', () => {
    expect(tierIncrementalLabel(5)).toBe('+1 Yield')
  })
})

describe('progressPercent', () => {
  test('returns 0 for score 0', () => {
    expect(progressPercent(0)).toBe(0)
  })

  test('returns 100 for max score', () => {
    expect(progressPercent(MAX_SCORE)).toBe(100)
  })

  test('caps at 100 for scores above max', () => {
    expect(progressPercent(MAX_SCORE + 10)).toBe(100)
  })

  test('returns correct percentage for intermediate scores', () => {
    const half = MAX_SCORE / 2
    expect(progressPercent(half)).toBeCloseTo(50)
  })
})

describe('targetPercent', () => {
  test('returns 0 for tier 0 or below', () => {
    expect(targetPercent(0)).toBe(0)
    expect(targetPercent(-1)).toBe(0)
  })

  test('returns 0 for tiers above MAX_TIER', () => {
    expect(targetPercent(MAX_TIER + 1)).toBe(0)
  })

  test('returns correct percentage for each tier', () => {
    for (let t = 1; t <= MAX_TIER; t++) {
      const expected = (TIER_THRESHOLDS_RAW[t - 1] / MAX_SCORE) * 100
      expect(targetPercent(t)).toBeCloseTo(expected)
    }
  })

  test('tier 1 is the smallest non-zero percentage', () => {
    expect(targetPercent(1)).toBeGreaterThan(0)
    expect(targetPercent(1)).toBeLessThan(targetPercent(2))
  })

  test('percentages are strictly ascending', () => {
    for (let t = 2; t <= MAX_TIER; t++) {
      expect(targetPercent(t)).toBeGreaterThan(targetPercent(t - 1))
    }
  })
})

describe('isScoreAtThreshold', () => {
  test('returns true for each threshold value', () => {
    for (const threshold of TIER_THRESHOLDS_RAW) {
      if (threshold < MAX_SCORE) {
        expect(isScoreAtThreshold(threshold)).toBe(true)
      }
    }
  })

  test('returns false for max score (bar fills completely)', () => {
    expect(isScoreAtThreshold(MAX_SCORE)).toBe(false)
  })

  test('returns false for scores between thresholds', () => {
    expect(isScoreAtThreshold(TIER_THRESHOLDS_RAW[0] + 1)).toBe(false)
  })

  test('returns false for 0', () => {
    expect(isScoreAtThreshold(0)).toBe(false)
  })

  test('returns false for scores above max', () => {
    expect(isScoreAtThreshold(MAX_SCORE + 10)).toBe(false)
  })
})
