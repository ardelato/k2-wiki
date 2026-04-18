import {
  MAX_SANCTUARY_SLOTS,
  SANCTUARY_JOBS,
  SCORE_DIVISOR,
  TIER_THRESHOLDS,
  TIER_THRESHOLDS_RAW,
  MAX_TIER,
  JOB_TIER_BENEFITS,
  JOB_COLORS,
  jobTierLabel,
} from '@/utils/sanctuaryConstants'

describe('sanctuaryConstants', () => {
  test('MAX_SANCTUARY_SLOTS is 8', () => {
    expect(MAX_SANCTUARY_SLOTS).toBe(8)
  })

  test('SANCTUARY_JOBS has 6 jobs', () => {
    expect(SANCTUARY_JOBS).toHaveLength(6)
    expect(SANCTUARY_JOBS).toContain('Chopping')
    expect(SANCTUARY_JOBS).toContain('Mining')
    expect(SANCTUARY_JOBS).toContain('Digging')
    expect(SANCTUARY_JOBS).toContain('Exploring')
    expect(SANCTUARY_JOBS).toContain('Fishing')
    expect(SANCTUARY_JOBS).toContain('Farming')
  })

  test('TIER_THRESHOLDS_RAW are TIER_THRESHOLDS * SCORE_DIVISOR', () => {
    for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
      expect(TIER_THRESHOLDS_RAW[i]).toBe(TIER_THRESHOLDS[i] * SCORE_DIVISOR)
    }
  })

  test('TIER_THRESHOLDS are sorted ascending', () => {
    for (let i = 1; i < TIER_THRESHOLDS.length; i++) {
      expect(TIER_THRESHOLDS[i]).toBeGreaterThan(TIER_THRESHOLDS[i - 1])
    }
  })

  test('MAX_TIER equals TIER_THRESHOLDS length', () => {
    expect(MAX_TIER).toBe(TIER_THRESHOLDS.length)
    expect(MAX_TIER).toBe(5)
  })

  test('JOB_TIER_BENEFITS has entries for tier 0 through MAX_TIER', () => {
    expect(JOB_TIER_BENEFITS).toHaveLength(MAX_TIER + 1)
  })

  test('JOB_TIER_BENEFITS tier 0 has no bonuses', () => {
    const t0 = JOB_TIER_BENEFITS[0]
    expect(t0.xpBonus).toBe(0)
    expect(t0.durationReduction).toBe(0)
    expect(t0.yieldBonus).toBe(0)
  })

  test('JOB_TIER_BENEFITS bonuses never decrease at higher tiers', () => {
    for (let i = 1; i < JOB_TIER_BENEFITS.length; i++) {
      const prev = JOB_TIER_BENEFITS[i - 1]
      const curr = JOB_TIER_BENEFITS[i]
      expect(curr.xpBonus).toBeGreaterThanOrEqual(prev.xpBonus)
      expect(curr.durationReduction).toBeGreaterThanOrEqual(prev.durationReduction)
      expect(curr.yieldBonus).toBeGreaterThanOrEqual(prev.yieldBonus)
    }
  })

  test('JOB_TIER_BENEFITS max tier includes yield bonus', () => {
    const max = JOB_TIER_BENEFITS[MAX_TIER]
    expect(max.yieldBonus).toBeGreaterThan(0)
  })

  test('JOB_COLORS has a color for every job', () => {
    for (const job of SANCTUARY_JOBS) {
      expect(JOB_COLORS[job.toLowerCase()]).toBeDefined()
      expect(JOB_COLORS[job.toLowerCase()]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('jobTierLabel', () => {
  test('tier 0 returns "No bonuses"', () => {
    expect(jobTierLabel(0)).toBe('No bonuses')
  })

  test('tier 1 shows XP bonus only', () => {
    expect(jobTierLabel(1)).toBe('+20% XP')
  })

  test('tier 2 shows XP and Duration', () => {
    expect(jobTierLabel(2)).toBe('+20% XP, -10% Duration')
  })

  test('short duration flag abbreviates Duration to Dur', () => {
    expect(jobTierLabel(2, true)).toBe('+20% XP, -10% Dur')
  })

  test('max tier shows all three bonuses', () => {
    const label = jobTierLabel(MAX_TIER)
    expect(label).toContain('XP')
    expect(label).toContain('Duration')
    expect(label).toContain('Yield')
  })

  test('out-of-range tier falls back to tier 0 benefits', () => {
    // Negative tier uses JOB_TIER_BENEFITS[0] via nullish coalescing
    expect(jobTierLabel(-1)).toBe('')
    // Beyond max tier uses JOB_TIER_BENEFITS[0] via nullish coalescing
    expect(jobTierLabel(99)).toBe('')
  })
})
