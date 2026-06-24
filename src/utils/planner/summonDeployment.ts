/**
 * summonDeployment — "what to do with a creature once you've summoned it" (Action Plan
 * playbook, Deploy step). Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Two pure recommenders:
 *  - recommendSanctuarySwap: should this creature go into the (often full) Sanctuary,
 *    and if so, who do you bench? Optimizes for the gather jobs the creatures STILL
 *    AHEAD of you actually need, and only recommends a move that raises a needed tier.
 *  - recommendRoles: lighter, honest role-fit hints (helper / expedition / machine).
 *
 * Tier math reuses calculateJobTiersFromSanctuary (the game's real thresholds). Time-
 * saved quantification is the caller's job (it has the remaining gather seconds per job);
 * here we return the tier deltas.
 *
 * CASING: creature.jobs keys are lowercase ('fishing'); Sanctuary/jobTier keys are
 * capitalized ('Fishing'). We normalize to capitalized everywhere.
 */
import { creatureMap as byId } from '@/data/creatureIndex'
import {
  JOB_TIER_BENEFITS,
  MAX_SANCTUARY_SLOTS,
  SANCTUARY_JOBS,
} from '@/utils/planner/sanctuaryConstants'
import { calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

const SANCTUARY_JOB_SET = new Set<string>(SANCTUARY_JOBS as readonly string[])

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Capitalized job → score for a creature (only the six Sanctuary jobs). */
export function creatureJobScores(id: string): Record<string, number> {
  const out: Record<string, number> = {}
  const jobs = byId.get(id)?.jobs ?? ({} as Record<string, number>)
  for (const [job, score] of Object.entries(jobs)) {
    const c = cap(job)
    if (SANCTUARY_JOB_SET.has(c)) out[c] = score
  }
  return out
}

export function creatureName(id: string): string {
  return byId.get(id)?.name ?? id
}

function durReduction(tier: number): number {
  return (
    JOB_TIER_BENEFITS[Math.max(0, Math.min(tier, JOB_TIER_BENEFITS.length - 1))]
      ?.durationReduction ?? 0
  )
}

export interface TierImprovement {
  job: string
  fromTier: number
  toTier: number
  durFrom: number
  durTo: number
}

export interface SanctuarySwapRec {
  /** 'add' = free slot; 'swap' = bench someone; 'hold' = no needed-tier gain; 'already-in' = present. */
  action: 'add' | 'swap' | 'hold' | 'already-in'
  creatureId: string
  /** Who to bench (swap only). */
  benchId: string | null
  benchName: string | null
  /** Needed jobs whose tier rises from this move. */
  improvements: TierImprovement[]
}

function neededTierSum(sanctuaryIds: string[], neededJobs: Set<string>): number {
  const tiers = calculateJobTiersFromSanctuary(sanctuaryIds)
  let sum = 0
  for (const j of neededJobs) sum += tiers[j] ?? 0
  return sum
}

function improvementsBetween(
  before: string[],
  after: string[],
  neededJobs: Set<string>,
): TierImprovement[] {
  const a = calculateJobTiersFromSanctuary(before)
  const b = calculateJobTiersFromSanctuary(after)
  const out: TierImprovement[] = []
  for (const job of neededJobs) {
    const from = a[job] ?? 0
    const to = b[job] ?? 0
    if (to > from)
      out.push({
        job,
        fromTier: from,
        toTier: to,
        durFrom: durReduction(from),
        durTo: durReduction(to),
      })
  }
  return out.toSorted((x, y) => y.toTier - x.toTier)
}

/**
 * Recommend Sanctuary placement for a freshly-summoned creature.
 * neededJobs = capitalized gather jobs the creatures still AHEAD of you depend on.
 */
export function recommendSanctuarySwap(params: {
  creatureId: string
  sanctuaryIds: string[]
  neededJobs: Set<string>
  maxSlots?: number
}): SanctuarySwapRec {
  const { creatureId, sanctuaryIds, neededJobs } = params
  const maxSlots = params.maxSlots ?? MAX_SANCTUARY_SLOTS
  const base = { creatureId, benchId: null, benchName: null, improvements: [] as TierImprovement[] }

  if (sanctuaryIds.includes(creatureId)) return { ...base, action: 'already-in' }
  if (neededJobs.size === 0) return { ...base, action: 'hold' }

  // Creature contributes nothing to the jobs still needed → no point seating it.
  const myScores = creatureJobScores(creatureId)
  const contributesToNeeded = [...neededJobs].some((j) => (myScores[j] ?? 0) > 0)
  if (!contributesToNeeded) return { ...base, action: 'hold' }

  // Free slot: just add if it lifts a needed tier.
  if (sanctuaryIds.length < maxSlots) {
    const after = [...sanctuaryIds, creatureId]
    const improvements = improvementsBetween(sanctuaryIds, after, neededJobs)
    return improvements.length
      ? { ...base, action: 'add', improvements }
      : { ...base, action: 'hold' }
  }

  // Full Sanctuary: find the swap that maximizes the needed-tier sum, breaking ties by
  // benching whoever contributes least to needed jobs. Only recommend if it's a net gain.
  const curSum = neededTierSum(sanctuaryIds, neededJobs)
  const benchScore = (id: string) => {
    const s = creatureJobScores(id)
    return [...neededJobs].reduce((t, j) => t + (s[j] ?? 0), 0)
  }
  let best: { benchId: string; after: string[]; sum: number } | null = null
  for (const member of sanctuaryIds) {
    const after = sanctuaryIds.map((x) => (x === member ? creatureId : x))
    const sum = neededTierSum(after, neededJobs)
    if (
      !best ||
      sum > best.sum ||
      (sum === best.sum && benchScore(member) < benchScore(best.benchId))
    ) {
      best = { benchId: member, after, sum }
    }
  }

  if (best && best.sum > curSum) {
    const improvements = improvementsBetween(sanctuaryIds, best.after, neededJobs)
    if (improvements.length) {
      return {
        ...base,
        action: 'swap',
        benchId: best.benchId,
        benchName: creatureName(best.benchId),
        improvements,
      }
    }
  }
  return { ...base, action: 'hold' }
}

export interface RoleRec {
  /** Strongest gather job (capitalized) if it's a real strength. */
  helper: { job: string; score: number } | null
  /** Top stats — fresh creatures level via expeditions toward awaken. */
  expedition: { topStats: { stat: string; value: number }[] } | null
  /** Surfaced when passive items are still needed (machines boost passive output). */
  machine: { suggest: true } | null
}

const HELPER_SCORE_FLOOR = 5

export function recommendRoles(params: {
  creatureId: string
  hasRemainingPassiveNeed: boolean
}): RoleRec {
  const { creatureId, hasRemainingPassiveNeed } = params
  const scores = creatureJobScores(creatureId)
  const topJob = Object.entries(scores).toSorted((a, b) => b[1] - a[1])[0]
  const helper =
    topJob && topJob[1] >= HELPER_SCORE_FLOOR ? { job: topJob[0], score: topJob[1] } : null

  const stats = byId.get(creatureId)?.stats ?? ({} as Record<string, number>)
  const topStats = Object.entries(stats)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([stat, value]) => ({ stat: cap(stat), value }))

  return {
    helper,
    expedition: topStats.length ? { topStats } : null,
    machine: hasRemainingPassiveNeed ? { suggest: true } : null,
  }
}
