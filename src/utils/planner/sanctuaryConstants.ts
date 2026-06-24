import { t } from '@/i18n'

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

// Cumulative totals per tier, derived from the game's incremental
// SANCTUARY_JOB_TIER_BENEFITS (configs/sanctuary.ts):
// Tier 1 +40% XP, Tier 2 -10% dur, Tier 3 +80% XP, Tier 4 -10% dur, Tier 5 +1 yield.
export const JOB_TIER_BENEFITS = [
  { xpBonus: 0, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 120, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 120, durationReduction: 20, yieldBonus: 0 },
  { xpBonus: 120, durationReduction: 20, yieldBonus: 1 },
]

export interface JobTierBenefits {
  xpBonus: number
  durationReduction: number
  yieldBonus: number
}

/**
 * Cumulative sanctuary benefits for a job at the given tier (0–MAX_TIER).
 * `JOB_TIER_BENEFITS` is already cumulative-by-tier, so this just indexes it
 * with clamping. Matches the game's `SanctuaryHelpers.getJobBenefits`.
 */
export function getJobBenefits(tier: number): JobTierBenefits {
  const idx = Math.max(0, Math.min(Math.floor(tier), MAX_TIER))
  return JOB_TIER_BENEFITS[idx] ?? JOB_TIER_BENEFITS[0]
}

export function jobTierLabel(tier: number, shortDuration = false): string {
  const b = JOB_TIER_BENEFITS[tier] ?? JOB_TIER_BENEFITS[0]
  if (tier === 0) return t('sanctuary.noBonuses')
  const parts: string[] = []
  if (b.xpBonus > 0) parts.push(t('sanctuary.xpBonus', { n: b.xpBonus }))
  if (b.durationReduction > 0)
    parts.push(
      t(shortDuration ? 'sanctuary.durationReductionShort' : 'sanctuary.durationReduction', {
        n: b.durationReduction,
      }),
    )
  if (b.yieldBonus > 0) parts.push(t('sanctuary.yieldBonus', { n: b.yieldBonus }))
  return parts.join(', ')
}

export const MAX_SCORE = TIER_THRESHOLDS_RAW[TIER_THRESHOLDS_RAW.length - 1]

type BenefitType = 'xp' | 'duration' | 'yield'

export function tierBenefitType(tier: number): BenefitType {
  if (tier < 1 || tier > MAX_TIER) return 'xp'
  const curr = JOB_TIER_BENEFITS[tier]
  const prev = JOB_TIER_BENEFITS[tier - 1]
  if (curr.xpBonus > prev.xpBonus) return 'xp'
  if (curr.durationReduction > prev.durationReduction) return 'duration'
  return 'yield'
}

export function tierIncrementalLabel(tier: number): string {
  if (tier < 1 || tier > MAX_TIER) return ''
  const curr = JOB_TIER_BENEFITS[tier]
  const prev = JOB_TIER_BENEFITS[tier - 1]
  if (curr.xpBonus > prev.xpBonus) return t('sanctuary.xpBonus', { n: curr.xpBonus - prev.xpBonus })
  if (curr.durationReduction > prev.durationReduction)
    return t('sanctuary.durationReductionShort', {
      n: curr.durationReduction - prev.durationReduction,
    })
  if (curr.yieldBonus > prev.yieldBonus)
    return t('sanctuary.yieldBonus', { n: curr.yieldBonus - prev.yieldBonus })
  return ''
}

export function progressPercent(score: number): number {
  return Math.min(100, (score / MAX_SCORE) * 100)
}

export function targetPercent(targetTier: number): number {
  if (targetTier <= 0 || targetTier > MAX_TIER) return 0
  return (TIER_THRESHOLDS_RAW[targetTier - 1] / MAX_SCORE) * 100
}

export function isScoreAtThreshold(score: number): boolean {
  if (score >= MAX_SCORE) return false
  return TIER_THRESHOLDS_RAW.includes(score)
}

export const JOB_COLORS: Record<string, string> = {
  chopping: '#59e843',
  mining: '#c9c9c9',
  digging: '#e89643',
  exploring: '#fc1717',
  fishing: '#43c7e8',
  farming: '#fce917',
}
