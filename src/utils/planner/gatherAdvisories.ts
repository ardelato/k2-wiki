/**
 * Gather rate-improvement advisories (Redesign v2, Phase C — yield-aware).
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Validation (compoundingPayoff) showed the dominant lever is the awaken YIELD bonus
 * (gather more per action), not duration — e.g. Fishing yield 0→2 saves ~94h across the
 * fishing volume. So advisories cover three levers: Sanctuary tier, awaken duration, and
 * awaken yield. The caller computes the real boosted gather time per lever (via the
 * planner) and passes current-vs-boosted seconds here; this layer just formats + ranks.
 * Pure + unit-tested.
 */

import type { AwakenPointSources } from '@/composables/useSkillPlanner'
import { awakenNodeNames } from '@/data/upgrades'
import { t } from '@/i18n'

import type { SanctuaryRosterDiff } from './skillAdvisories'

export type GatherLever = 'sanctuary' | 'awakenDuration' | 'awakenYield'

export interface GatherLeverSaving {
  job: string
  lever: GatherLever
  /** For 'sanctuary': the tier you'd reach. */
  targetTier?: number
  /** Current total gather seconds for this job's volume. */
  currentSeconds: number
  /** Gather seconds for the same volume after applying this one lever. */
  boostedSeconds: number
  /** For 'sanctuary': the concrete roster swap (remove/add/keep + tier ripple) that
   * reaches `targetTier`. Carried through so the UI can show the party change. */
  partyDiff?: SanctuaryRosterDiff
  /** For awaken levers: the `{skill}-{type}-{roman}` id of the node to allocate (upgrades.ts),
   * so the headline names it and "Open in Awaken tree" can deep-link + highlight it. */
  awakenNodeId?: string
}

export interface GatherAdvisory {
  job: string
  lever: GatherLever
  headline: string
  detail: string
  timeSavedSeconds: number
  routeName: 'sanctuary' | 'awaken'
  /** For 'sanctuary': the roster swap to apply (passed through from the saving). */
  partyDiff?: SanctuaryRosterDiff
  /** Top-level ingredients this job's gather speeds up (the parent items the player
   * recognises — e.g. "Carrot Cake" — not the deep gather leaf like "hide"). */
  forItems?: { itemId: string; itemName: string }[]
  /** For awaken levers: the tree (skill) + node ids to deep-link into the Awaken tree,
   * driving its scroll-to + node-highlight animation (matching the Skill Planner). */
  awakenTreeId?: string
  awakenNodeId?: string
  /** For awaken levers, when funding context is supplied: the point cost to allocate the
   * node (incl. unowned prerequisites), the player's unspent points, and the cheapest ways
   * to earn one (awaken an owned creature). Lets the UI show the funding step rather than
   * assuming the node is free. Absent on the aggregate path. */
  awakenPointCost?: number
  awakenPointsAvailable?: number
  awakenSources?: AwakenPointSources
}

/** Headline an awaken lever by its real node name (e.g. "Fishing Yield I"), mirroring
 * the Skill Planner; fall back to a generic label if the id is unknown. The awaken icon
 * + cost line carry the rest, so we drop the old "Allocate Awaken node · " jargon prefix. */
function awakenHeadline(s: GatherLeverSaving): string {
  const name = s.awakenNodeId ? awakenNodeNames.get(s.awakenNodeId) : undefined
  return name ?? t('advisories.gather.awakenNodeFallback')
}

function present(s: GatherLeverSaving): {
  headline: string
  detail: string
  routeName: 'sanctuary' | 'awaken'
} {
  switch (s.lever) {
    case 'sanctuary':
      // "Sanctuary" and the job name are frozen, passed through as params.
      return {
        headline:
          s.targetTier != null
            ? t('advisories.gather.sanctuaryHeadlineWithTier', { job: s.job, tier: s.targetTier })
            : t('advisories.gather.sanctuaryHeadline', { job: s.job }),
        detail: t('advisories.gather.sanctuaryDetail'),
        routeName: 'sanctuary',
      }
    case 'awakenYield':
      return {
        headline: awakenHeadline(s),
        detail: t('advisories.gather.yieldDetail'),
        routeName: 'awaken',
      }
    case 'awakenDuration':
      return {
        headline: awakenHeadline(s),
        detail: t('advisories.gather.durationDetail'),
        routeName: 'awaken',
      }
  }
}

export function computeGatherAdvisories(savings: GatherLeverSaving[]): GatherAdvisory[] {
  return savings
    .map((s) => {
      const timeSavedSeconds = Math.max(0, s.currentSeconds - s.boostedSeconds)
      const isAwaken = s.lever === 'awakenYield' || s.lever === 'awakenDuration'
      return {
        job: s.job,
        lever: s.lever,
        timeSavedSeconds,
        partyDiff: s.partyDiff,
        awakenTreeId: isAwaken ? s.job.toLowerCase() : undefined,
        awakenNodeId: isAwaken ? s.awakenNodeId : undefined,
        ...present(s),
      }
    })
    .filter((a) => a.timeSavedSeconds > 1)
    .toSorted((a, b) => b.timeSavedSeconds - a.timeSavedSeconds)
}
