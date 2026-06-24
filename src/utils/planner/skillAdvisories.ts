import { getPlayerLevel, SKILLING_IDS, xpForSkillLevel } from '@/utils/formulas'

/** Player level grants +0.25 percentage points of XP per level (additive). */
export const PLAYER_XP_PP_PER_LEVEL = 0.25

export interface PlayerLevelBoostStep {
  skillId: string
  fromLevel: number
  toLevel: number
  levelsAdded: number
}

interface PlayerLevelBoost {
  steps: PlayerLevelBoostStep[]
  /** Total XP to raise the listed skills (the cheap source levels). */
  totalXpCost: number
  playerLevelFrom: number
  playerLevelTo: number
  /** Global XP bonus gained, in percentage points. */
  xpBonusGain: number
}

const clamp = (n: number) => Math.max(1, Math.min(99, Math.floor(n)))

/**
 * Cheapest set of skill-level raises that lift the player level by `targetDeltaPl`.
 *
 * Player level = floor(average of all 9 skills), so the cheapest way to add total
 * levels is always to raise the lowest-level skill (it has the smallest next-level
 * XP cost). We greedily do that until the player level climbs by the requested
 * amount. `excludeSkillId` skips the skill you're already planning to grind, so the
 * advice is about *other* lagging skills. Returns null if the player level is capped
 * or can't move.
 */
export function planPlayerLevelBoost(
  skillLevels: Record<string, number>,
  targetDeltaPl: number,
  excludeSkillId?: string,
): PlayerLevelBoost | null {
  const levels: Record<string, number> = {}
  for (const id of SKILLING_IDS) levels[id] = clamp(skillLevels[id] ?? 1)
  const start = { ...levels }
  const plFrom = getPlayerLevel(levels)
  if (plFrom >= 99) return null
  const plTarget = Math.min(99, plFrom + Math.max(1, Math.floor(targetDeltaPl)))

  let totalXpCost = 0
  while (getPlayerLevel(levels) < plTarget) {
    let pick: string | null = null
    let minCost = Infinity
    for (const id of SKILLING_IDS) {
      if (id === excludeSkillId || levels[id] >= 99) continue
      const next = xpForSkillLevel(levels[id] + 1) - xpForSkillLevel(levels[id])
      if (next < minCost) {
        minCost = next
        pick = id
      }
    }
    if (!pick) break // every eligible skill is maxed
    levels[pick] += 1
    totalXpCost += minCost
  }

  const plTo = getPlayerLevel(levels)
  if (plTo <= plFrom) return null

  const steps: PlayerLevelBoostStep[] = SKILLING_IDS.filter((id) => levels[id] > start[id])
    .map((id) => ({
      skillId: id,
      fromLevel: start[id],
      toLevel: levels[id],
      levelsAdded: levels[id] - start[id],
    }))
    .sort((a, b) => a.fromLevel - b.fromLevel || a.skillId.localeCompare(b.skillId))

  return {
    steps,
    totalXpCost,
    playerLevelFrom: plFrom,
    playerLevelTo: plTo,
    xpBonusGain: (plTo - plFrom) * PLAYER_XP_PP_PER_LEVEL,
  }
}

export interface JobPartyPick {
  id: string
  name: string
  contribution: number
}

interface JobPartyRecommendation {
  party: JobPartyPick[]
  score: number
  reachedTier: number
}

/**
 * Best sanctuary party for a single gathering job. Job score is just the sum of
 * each slotted creature's `jobs[jobKey]` (no awaken multiplier — see useSanctuary),
 * so for one job the optimal party is simply the top contributors. The sanctuary
 * party is a *fixed* set of slots, so this fills the whole party (up to `maxSlots`)
 * with the best eligible creatures — `isEligible` must restrict to creatures the
 * player has summoned AND awakened. `reachedTier` reports how far that full party
 * pushes the job's tier.
 */
export function recommendPartyForJob(
  creatures: { id: string; name: string; jobs?: Record<string, number> }[],
  jobKey: string,
  thresholdsRaw: number[],
  maxSlots: number,
  isEligible: (id: string) => boolean,
): JobPartyRecommendation {
  const party = creatures
    .filter((c) => isEligible(c.id) && (c.jobs?.[jobKey] ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, contribution: c.jobs?.[jobKey] ?? 0 }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, maxSlots)

  const score = party.reduce((sum, pick) => sum + pick.contribution, 0)
  const reachedTier = thresholdsRaw.filter((t) => score >= t).length
  return { party, score, reachedTier }
}

/** A job whose sanctuary tier changes when the recommended party is applied. */
export interface JobTierDelta {
  /** Capitalized job name (e.g. 'Chopping'). */
  job: string
  from: number
  to: number
}

/**
 * The concrete roster change to turn the player's *current* sanctuary into the
 * party recommended for one job, plus the collateral tier moves it causes.
 */
export interface SanctuaryRosterDiff {
  /** The job being optimized and how far these swaps lift its tier — the headline
   * change the swaps below are responsible for. */
  target: JobTierDelta
  /** Recommended members already slotted — no action needed. */
  keep: JobPartyPick[]
  /** Currently slotted but not in the recommended party — remove these. Least
   * useful for this job first (a 0-contribution creature is pure dead weight). */
  swapOut: JobPartyPick[]
  /** Recommended members not yet slotted — add these. Best first. */
  swapIn: JobPartyPick[]
  /** Other jobs whose tier shifts because the sanctuary's 8 slots are shared.
   * Biggest loss first; only jobs that actually change are listed. */
  sideEffects: JobTierDelta[]
}

/**
 * Diff the player's live sanctuary roster against the single-job-optimal party
 * from {@link recommendPartyForJob}. Because the sanctuary is one shared 8-slot
 * party, swapping toward one job's best team rebalances every other job — so this
 * also reports the collateral tier moves via the injected `jobTiersFor` (the game's
 * `calculateJobTiersFromSanctuary`). `thisJob` is the capitalized name of the job
 * being optimized, excluded from the side-effect list.
 */
export function buildSanctuaryDiff(
  creatures: { id: string; name: string; jobs?: Record<string, number> }[],
  currentIds: string[],
  recommended: JobPartyPick[],
  jobKey: string,
  thisJob: string,
  jobTiersFor: (ids: string[]) => Record<string, number>,
): SanctuaryRosterDiff {
  const byId = new Map(creatures.map((c) => [c.id, c]))
  const currentSet = new Set(currentIds)
  const recommendedSet = new Set(recommended.map((p) => p.id))

  const keep = recommended.filter((p) => currentSet.has(p.id))
  const swapIn = recommended.filter((p) => !currentSet.has(p.id))
  const swapOut = currentIds
    .filter((id) => !recommendedSet.has(id))
    .map((id) => {
      const c = byId.get(id)
      return { id, name: c?.name ?? id, contribution: c?.jobs?.[jobKey] ?? 0 }
    })
  // Keep currentIds (slot) order so the remove list matches the sanctuary party slots.

  const before = jobTiersFor(currentIds)
  const after = jobTiersFor([...keep, ...swapIn].map((p) => p.id))
  const sideEffects: JobTierDelta[] = []
  for (const job of Object.keys(before)) {
    if (job === thisJob) continue
    const from = before[job] ?? 0
    const to = after[job] ?? 0
    if (from !== to) sideEffects.push({ job, from, to })
  }
  // Biggest tier loss first; gains (rare) sort last.
  const ordered = sideEffects.toSorted((a, b) => a.to - a.from - (b.to - b.from))

  const target: JobTierDelta = {
    job: thisJob,
    from: before[thisJob] ?? 0,
    to: after[thisJob] ?? 0,
  }

  return { target, keep, swapOut, swapIn, sideEffects: ordered }
}

interface BoostValuation {
  timeBefore: number
  timeAfter: number
  timeSaved: number
}

/**
 * Value a player-level boost against one grind. The bonus stack is additive, so a
 * `xpBonusGain` of W percentage points lifts the XP multiplier by W/100, and grind
 * time scales as 1/xpMultiplier. This is the saving on *this* grind alone — the
 * boost also helps every future grind, so treat it as a lower bound.
 */
export function valueBoostOnGrind(
  boost: PlayerLevelBoost,
  currentXpMultiplier: number,
  grindTimeSeconds: number,
): BoostValuation {
  const newMult = currentXpMultiplier + boost.xpBonusGain / 100
  const timeAfter =
    newMult > 0 ? grindTimeSeconds * (currentXpMultiplier / newMult) : grindTimeSeconds
  return {
    timeBefore: grindTimeSeconds,
    timeAfter,
    timeSaved: Math.max(0, grindTimeSeconds - timeAfter),
  }
}
