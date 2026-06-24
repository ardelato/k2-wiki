/**
 * Acquisition planning — resource-campaign model (Redesign v2, Phase A).
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Replaces the per-creature, binary-"Covered" Phase-1 model (proven structurally
 * wrong: a shared resource read active for creature #1 and covered for #2, and the
 * binary verdict was dominated by an inflated active horizon).
 *
 * This model is indexed by RESOURCE, not creature:
 *  - need is aggregated across every selected creature (net inventory, once);
 *  - passive producers run continuously and contribute `rate × horizon` for free;
 *  - the active horizon is a FIXPOINT (only the active shortfall counts toward it,
 *    so a passively-covered resource can't inflate the horizon that covers it);
 *  - the tradeoff is surfaced as RATE-VS-TIME (active-hours to gather vs passive-days
 *    to supply), never a binary chip.
 *
 * Pure and deterministic — no Vue, no graph building. The caller aggregates planner
 * trees into ResourceDemand[] / CreatureDemand[] and feeds them in.
 */

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86400

/** One gatherable resource, aggregated across all selected creatures. */
export interface ResourceDemand {
  itemId: string
  /** Cross-creature need, already net of inventory. */
  totalNeed: number
  /** Active hands-on seconds per unit gathered (0 if not hand-gatherable). */
  perUnitGatherSeconds: number
  /** Shared passive production rate, items/second (0 if nothing produces it). */
  passiveRatePerSecond: number
  /** Creatures depending on this resource, in summon-sequence order. */
  creatureIds: string[]
}

/** Per-creature claim on a resource (sequence order matters for FIFO passive supply). */
export interface CreatureDemand {
  creatureId: string
  /** itemId → this creature's own need (net inventory share). */
  needs: { itemId: string; amount: number }[]
}

export interface ResourcePlan {
  itemId: string
  totalNeed: number
  passiveRatePerSecond: number
  /** Rate-vs-time, full need: hand-gather the whole thing. */
  activeHours: number
  /** Rate-vs-time, full need: passive alone supplies it (null if no passive). */
  passiveDays: number | null
  /** Free passive supply accrued during the plan's active horizon. */
  passiveOverHorizon: number
  /** Units you still actively gather after passive help. */
  activeShortfall: number
  activeShortfallSeconds: number
  /** 'passive' ⇔ the shortfall is zero (passive supplies it over the horizon). */
  assignment: 'active' | 'passive'
}

export interface ActiveStep {
  order: number
  itemId: string
  /** Units gathered in this campaign (the shortfall). */
  units: number
  activeSeconds: number
  startSeconds: number
  endSeconds: number
  creatureIds: string[]
}

export interface CreatureEta {
  creatureId: string
  /** Clock seconds from t=0 until all this creature's resources are satisfied. */
  etaSeconds: number
}

export interface AcquisitionPlan {
  /** Fixpoint active horizon: total hands-on time across active campaigns. */
  horizonSeconds: number
  resources: ResourcePlan[]
  steps: ActiveStep[]
  creatureEtas: CreatureEta[]
}

export interface AcquisitionPlanOptions {
  /**
   * Order active campaigns. Default: largest active shortfall first.
   * (Optimal ordering — gather low-passive-rate items first so high-rate ones accrue —
   * is Phase 3; this is a sensible, explainable default.)
   */
  order?: (a: ResourcePlan, b: ResourcePlan) => number
  maxFixpointIters?: number
}

/** Default active-campaign ordering: largest active shortfall first. */
function byLargestShortfall(a: ResourcePlan, b: ResourcePlan): number {
  return b.activeShortfallSeconds - a.activeShortfallSeconds
}

/** Active seconds a resource still costs at a given horizon (shortfall × per-unit). */
function shortfallSeconds(d: ResourceDemand, horizonSeconds: number): number {
  const passive = d.passiveRatePerSecond * horizonSeconds
  const shortfall = Math.max(0, d.totalNeed - passive)
  const perUnit = d.totalNeed > 0 ? d.perUnitGatherSeconds : 0
  return shortfall * perUnit
}

/**
 * Converge the active horizon. Start at the naïve "hand-gather everything" upper
 * bound, then repeatedly credit passive over the current horizon and recompute the
 * shortfall time. Monotonically decreasing → converges quickly.
 */
function solveHorizon(demands: ResourceDemand[], maxIters: number): number {
  let horizon = demands.reduce(
    (s, d) => s + (d.totalNeed > 0 ? d.totalNeed * d.perUnitGatherSeconds : 0),
    0,
  )
  for (let i = 0; i < maxIters; i++) {
    const next = demands.reduce((s, d) => s + shortfallSeconds(d, horizon), 0)
    if (Math.abs(next - horizon) < 1) return next
    horizon = next
  }
  return horizon
}

export function computeAcquisitionPlan(
  demands: ResourceDemand[],
  creatures: CreatureDemand[] = [],
  options: AcquisitionPlanOptions = {},
): AcquisitionPlan {
  const maxIters = options.maxFixpointIters ?? 100
  const horizonSeconds = solveHorizon(demands, maxIters)

  const resources: ResourcePlan[] = demands.map((d) => {
    const passiveOverHorizon = Math.min(d.totalNeed, d.passiveRatePerSecond * horizonSeconds)
    const activeShortfall = Math.max(0, d.totalNeed - passiveOverHorizon)
    const perUnit = d.totalNeed > 0 ? d.perUnitGatherSeconds : 0
    return {
      itemId: d.itemId,
      totalNeed: d.totalNeed,
      passiveRatePerSecond: d.passiveRatePerSecond,
      activeHours: (d.totalNeed * d.perUnitGatherSeconds) / SECONDS_PER_HOUR,
      passiveDays:
        d.passiveRatePerSecond > 0
          ? d.totalNeed / (d.passiveRatePerSecond * SECONDS_PER_DAY)
          : null,
      passiveOverHorizon,
      activeShortfall,
      activeShortfallSeconds: activeShortfall * perUnit,
      assignment: activeShortfall > 0 ? 'active' : 'passive',
    }
  })

  // ── Active step sequence ── (only resources with a real shortfall)
  const demandById = new Map(demands.map((d) => [d.itemId, d]))
  const ordered = resources
    .filter((r) => r.activeShortfall > 0)
    .toSorted(options.order ?? byLargestShortfall)

  let clock = 0
  const steps: ActiveStep[] = ordered.map((r, i) => {
    const start = clock
    clock += r.activeShortfallSeconds
    return {
      order: i + 1,
      itemId: r.itemId,
      units: r.activeShortfall,
      activeSeconds: r.activeShortfallSeconds,
      startSeconds: start,
      endSeconds: clock,
      creatureIds: demandById.get(r.itemId)?.creatureIds ?? [],
    }
  })

  // ── Per-creature ETA ──
  // A creature unlocks when each of its resources is satisfied:
  //   - active resource  → its campaign's end time in the sequence;
  //   - passive resource → when shared passive output reaches this creature's
  //     cumulative claim (FIFO across creatures in sequence order — Phase 3 can
  //     optimize the order; here it's the given order).
  const stepEndByItem = new Map(steps.map((s) => [s.itemId, s.endSeconds]))
  const planByItem = new Map(resources.map((r) => [r.itemId, r]))
  const passiveConsumed = new Map<string, number>()
  const creatureEtas: CreatureEta[] = creatures.map((c) => {
    let eta = 0
    for (const need of c.needs) {
      const plan = planByItem.get(need.itemId)
      if (!plan) continue
      if (plan.assignment === 'active') {
        eta = Math.max(eta, stepEndByItem.get(need.itemId) ?? 0)
      } else if (plan.passiveRatePerSecond > 0) {
        const consumedBefore = passiveConsumed.get(need.itemId) ?? 0
        const claimEnd = consumedBefore + need.amount
        passiveConsumed.set(need.itemId, claimEnd)
        eta = Math.max(eta, claimEnd / plan.passiveRatePerSecond)
      }
    }
    return { creatureId: c.creatureId, etaSeconds: eta }
  })

  return { horizonSeconds, resources, steps, creatureEtas }
}
