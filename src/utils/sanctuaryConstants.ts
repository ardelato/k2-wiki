export const MAX_SANCTUARY_SLOTS = 8

export const SANCTUARY_JOBS = [
  'Chopping',
  'Mining',
  'Digging',
  'Exploring',
  'Fishing',
  'Farming',
] as const

export const SCORE_DIVISOR = 60
export const TIER_THRESHOLDS = [0.1, 0.3, 0.5, 0.7, 0.9]
export const TIER_THRESHOLDS_RAW = TIER_THRESHOLDS.map((t) => t * SCORE_DIVISOR)
export const MAX_TIER = TIER_THRESHOLDS.length

export const JOB_TIER_BENEFITS = [
  { xpBonus: 0, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 1 },
]

export function jobTierLabel(tier: number, shortDuration = false): string {
  const b = JOB_TIER_BENEFITS[tier] ?? JOB_TIER_BENEFITS[0]
  if (tier === 0) return 'No bonuses'
  const parts: string[] = []
  if (b.xpBonus > 0) parts.push(`+${b.xpBonus}% XP`)
  if (b.durationReduction > 0)
    parts.push(`-${b.durationReduction}% ${shortDuration ? 'Dur' : 'Duration'}`)
  if (b.yieldBonus > 0) parts.push(`+${b.yieldBonus} Yield`)
  return parts.join(', ')
}

export const JOB_COLORS: Record<string, string> = {
  chopping: '#59e843',
  mining: '#c9c9c9',
  digging: '#e89643',
  exploring: '#fc1717',
  fishing: '#43c7e8',
  farming: '#fce917',
}
