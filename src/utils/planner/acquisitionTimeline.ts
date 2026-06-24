/**
 * Acquisition sequencing — passive-aware forward timeline (Phase 1).
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Walks the summon sequence with a clock at 0. While you actively work the earlier
 * creatures, shared passive producers (fabrication / machine / garden) accrue
 * materials for the ones still queued. An item is labeled passive ONLY when that
 * shared pool can actually deliver the needed amount by the time you reach the
 * creature — otherwise you'd still gather it, so it stays active.
 *
 * Capacity is a single shared pool per item, consumed FIFO down the sequence
 * (one `produced - consumed` ledger). Validation showed independent accrual
 * over-credits the same pool to every creature (up to 5.4x) and so under-flips
 * by ~7x; the ledger is the cheap fix. No search — the order is given.
 */

export interface TimelineRequirementInput {
  itemId: string
  /** Amount still required after inventory/queue is netted out. */
  need: number
  /** Shared passive production rate for this item, items/second (getPassiveRate). */
  passiveRate: number
}

export interface TimelineCreatureInput {
  creatureId: string
  /** Per-creature active hands-on time (s) — earlier creatures' time is later ones' background. */
  activeTimeSeconds: number
  requirements: TimelineRequirementInput[]
}

export interface TimelineRequirementResult {
  /** Amount you'll still actively get after passive accrual is credited. */
  effectiveRemaining: number
  /** Amount the shared passive pool delivers for this creature by the time you reach it. */
  accrued: number
  /** 'passive' only when the pool fully covers the need by then; else 'active'. */
  source: 'active' | 'passive'
  /**
   * Seconds of additional background time (beyond when you reach this creature)
   * until the shared pool would fully cover the remaining need. 0 when already
   * covered; null when nothing produces this item passively (never covered).
   */
  coverEtaSeconds: number | null
}

/** creatureId → (itemId → result). */
export type AcquisitionTimeline = Map<string, Map<string, TimelineRequirementResult>>

/**
 * Forward accrual pass over the given sequence (already in rail order).
 * Pure and deterministic; unit-tested independently of Vue.
 */
export function computeAcquisitionTimeline(sequence: TimelineCreatureInput[]): AcquisitionTimeline {
  const result: AcquisitionTimeline = new Map()
  // Shared single-pool ledger: cumulative units already handed to earlier creatures.
  const poolConsumed = new Map<string, number>()
  let backgroundTime = 0

  for (const creature of sequence) {
    const inner = new Map<string, TimelineRequirementResult>()
    for (const req of creature.requirements) {
      const need = Math.max(0, req.need)
      const rate = Math.max(0, req.passiveRate)
      const consumedBefore = poolConsumed.get(req.itemId) ?? 0

      // What this one shared pool has produced so far, minus what earlier creatures took.
      const produced = rate * backgroundTime
      const available = Math.max(0, produced - consumedBefore)
      const accrued = Math.min(need, available)
      poolConsumed.set(req.itemId, consumedBefore + accrued)

      const effectiveRemaining = Math.max(0, need - accrued)
      const source: 'active' | 'passive' = effectiveRemaining > 0 ? 'active' : 'passive'

      // When (in extra background time) would the pool finish covering this need?
      let coverEtaSeconds: number | null
      if (rate <= 0) {
        coverEtaSeconds = null
      } else {
        // Absolute clock time at which cumulative production reaches this creature's full claim.
        const coveredAt = (consumedBefore + need) / rate
        coverEtaSeconds = Math.max(0, coveredAt - backgroundTime)
      }

      inner.set(req.itemId, { effectiveRemaining, accrued, source, coverEtaSeconds })
    }
    result.set(creature.creatureId, inner)
    backgroundTime += Math.max(0, creature.activeTimeSeconds)
  }

  return result
}
