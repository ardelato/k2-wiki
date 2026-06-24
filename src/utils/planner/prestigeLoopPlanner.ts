/**
 * Prestige-loop planner (sub-project #9).
 *
 * A deterministic, hands-free / check-in simulation of prestige-token farming.
 * Ported from the validated 9a simulator (scripts/sim/prestige-loop.ts) — see
 * docs/superpowers/specs/2026-05-28-9a-prestige-loop-validation-findings.md.
 *
 * The player checks in every C hours; at a check-in they prestige maxed creatures
 * (per strategy) and re-form parties (ONE reconfiguration per visit). Between
 * check-ins parties are FROZEN and auto-repeat; a creature that maxes IDLES at 120
 * (still boosting partners, earning nothing) until the next check-in.
 *
 * Unlike the 9a sim (which only reports tokens/hour to compare strategies), this
 * planner also emits the concrete recommended *stable assignment* — the party setup
 * the player applies on check-in #1 — which is the actionable output the UI shows.
 */
import { creatureMap as creatureById, creatures as allCreatures } from '@/data/creatureIndex'
import type { Biome, Creature, Expedition } from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  xpForLevel,
} from '@/utils/formulas'
import { biomeMap, expeditions } from '@/utils/save/precomputedTables'

// ── Constants (verified against recovered-source) ──────────────────────────
export const MAX_LEVEL = 120
export const MAX_XP = xpForLevel(MAX_LEVEL) // 720_000
const XP_COEF = 50
const TIERS = [1, 2, 3, 4, 5]
const MAX_PARTY = 3

/**
 * Lighter horizon for the live planner: the warmup still discards the transient so the
 * steady-state tokens/hour and the relative strategy/cadence ordering stay accurate, but
 * the shorter measurement window keeps a full-roster comparison grid responsive (a few
 * seconds in a worker). The fidelity test passes the published config explicitly, so it is
 * unaffected by this value.
 */
const APP_HORIZON_SEC = 1500 * 3600
const APP_WARMUP_SEC = 500 * 3600

/** Cadences surfaced as presets + used for the comparison grid. */
export const COMPARISON_CADENCE_HOURS = [5, 12, 24] as const

/** Number of consecutive steady-state check-ins captured for the rotation timeline. */
const TIMELINE_STEPS = 8

// ── Public types ───────────────────────────────────────────────────────────
export type PrestigeStrategy = 'anchor' | 'rotation' | 'individual' | 'batch'
export type MemberRole = 'climber' | 'booster' | 'anchor'

export interface PrestigeLoopRosterEntry {
  creatureId: string
  level: number
  awakened: boolean
}

export interface PrestigeLoopInput {
  creatures: PrestigeLoopRosterEntry[]
  cadenceHours: number
  boosterCount: number // K
  /**
   * Per-expedition allowed tiers (expeditionId → tiers). When omitted, every expedition
   * and tier is fair game (legacy behavior). When present, an absent key defaults to all
   * tiers and an empty array excludes the expedition entirely — matching the picker's
   * `getSelectedTiers` semantics.
   */
  allowedExpeditionTiers?: Record<string, number[]>
}

export interface AssignmentMember {
  creatureId: string
  role: MemberRole
  /** Level *in the loop* at this snapshot (anchors/boosters = 120, climbers = their climb level). */
  level: number
}

export interface PrestigeLoopAssignment {
  expeditionId: string
  tier: number
  members: AssignmentMember[]
}

/** One check-in in the rotation timeline: who got prestiged + the resulting party layout. */
export interface PrestigeTimelineStep {
  checkInIndex: number
  clockHours: number
  prestigedCreatureIds: string[]
  assignment: PrestigeLoopAssignment[]
  /**
   * Idle hours each creature spent at level 120 during the interval that ended at this
   * check-in — i.e. wasted XP time between hitting max and the manual prestige. Keyed by
   * creatureId; omitted for synthetic/test steps.
   */
  wastedHoursByCreature?: Record<string, number>
}

/** One cadence row: tokens/hour at that check-in interval. */
export interface CadenceComparisonRow {
  cadenceHours: number
  tokensPerHour: number
}

export interface PrestigeLoopPlan {
  assignment: PrestigeLoopAssignment[]
  anchorIds: string[]
  tokensPerHour: number
  idleWasteFraction: number
  eligibleCount: number
  cadenceHours: number
  boosterCount: number
  /** A window of consecutive steady-state check-ins (populated for the headline run only). */
  timeline: PrestigeTimelineStep[]
  comparison: {
    byCadence: CadenceComparisonRow[]
  }
}

// ── Runtime types ──────────────────────────────────────────────────────────
interface Unit {
  idx: number
  content: Creature
  xp: number
  isAnchor: boolean
  maxedSince: number | null // clock time this unit reached MAX_XP (rotation ordering + wasted-XP)
}

interface ExpState {
  content: Expedition
  biome: Biome | undefined
  loopCount: number
  run: { memberIdx: number[]; xpPerMember: number; endsAt: number } | null
}

/** A creature entering the loop, with its starting XP (0 for the sim's all-fresh pool). */
export interface PoolUnit {
  creature: Creature
  startXp: number
}

interface SimConfig {
  mode: PrestigeStrategy
  K: number
  cadenceSec: number
  horizonSec: number
  warmupSec: number
  /** Disable the consecutive-run loop bonus (robustness check; mirrors NO_LOOP_BONUS). */
  noLoopBonus?: boolean
  /** Capture this many consecutive steady-state check-ins as a rotation timeline (0 = none). */
  captureTimelineSteps?: number
  /**
   * Max ANCHOR-role creatures allowed in a single party. Defaults to no effective cap
   * (faithful to the 9a sim); the app sets 1 so the K anchors spread across parties.
   */
  maxAnchorsPerParty?: number
  /** Per-expedition allowed tiers (see {@link PrestigeLoopInput.allowedExpeditionTiers}). */
  allowedExpeditionTiers?: Record<string, number[]>
  /**
   * EXPERIMENTAL (opt-in, default off): freeze parties to a fixed creature→expedition layout
   * instead of re-forming them each check-in. `memberIdx` indexes into the `pool`. When set,
   * `allocate()` skips the greedy search and rebuilds these exact parties every check-in (tier
   * re-optimized; only XP/prestige state evolves). Used by the allocation experiments to A/B
   * the dynamic swap allocator against a pinned best-fit one. Has NO effect when omitted.
   */
  pinnedParties?: { expeditionId: string; memberIdx: number[] }[]
  /**
   * HYBRID allocator (opt-in, default off): pin each expedition's *climbers* to a fixed set
   * (`memberIdx` into the `pool`) while leaving boosters/anchors in the shared pool to be
   * re-assigned each check-in. Combines pinned-fit climbers with dynamic booster sharing. Ignored
   * when `pinnedParties` is set. Has NO effect when omitted.
   */
  hybridClimbers?: { expeditionId: string; memberIdx: number[] }[]
}

interface SimOutput {
  tokensPerHour: number
  wastedSlotFraction: number
  /** Party layout from the steady-state check-in — the setup the player applies. */
  firstAssignment: PrestigeLoopAssignment[]
  anchorIds: string[]
  timeline: PrestigeTimelineStep[]
}

// ── Helpers (ported verbatim from the 9a sim for bit-exact fidelity) ─────────

/**
 * Faithful reimplementation of recovered-source getCreatureLevelFromXp. NOTE: this
 * differs from formulas.levelFromXp (the `+1` guards a float-underflow edge at exact
 * perfect-square boundaries) — keep it local so the sim numbers reproduce exactly.
 */
function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  let level = Math.floor(Math.sqrt(xp / XP_COEF)) + 1
  while (level > 1 && xp < xpForLevel(level)) level--
  return Math.min(level, MAX_LEVEL)
}

/** Mean L120 rating across all expeditions — the sim's "strength" metric. */
export function strengthOf(c: Creature): number {
  let s = 0
  for (const e of expeditions) s += calculateCreatureRating(c, e, MAX_LEVEL, biomeMap.get(e.biome))
  return s / expeditions.length
}

function evalParty(members: Unit[], exp: ExpState, tier: number, noLoopBonus: boolean) {
  let score = 0
  for (const m of members) {
    score += calculateCreatureRating(m.content, exp.content, levelFromXp(m.xp), exp.biome)
  }
  const dur = calculateDuration(score, exp.content, tier)
  const loopCount = noLoopBonus ? 0 : exp.loopCount
  const xpPerMember = calculateExpeditionXp(exp.content, tier, loopCount, members.length)
  return { dur, xpPerMember }
}

// ── Core simulation ──────────────────────────────────────────────────────────

/**
 * Simulate the hands-free prestige loop over a given creature pool. The pool is an
 * ordered list of creatures with starting XP; ANCHOR mode promotes the K strongest to
 * permanent pre-maxed boosters. Mirrors `simulate()` in the 9a sim, plus capture of
 * the first allocation as the recommended assignment.
 */
export function simulatePrestigeLoop(pool: PoolUnit[], cfg: SimConfig): SimOutput {
  const noLoopBonus = cfg.noLoopBonus ?? false
  const maxAnchorsPerParty = cfg.maxAnchorsPerParty ?? MAX_PARTY
  const units: Unit[] = pool.map((p, i) => ({
    idx: i,
    content: p.creature,
    xp: Math.min(MAX_XP, Math.max(0, p.startXp)),
    isAnchor: false,
    maxedSince: null,
  }))

  if (cfg.mode === 'anchor') {
    const order = units
      .toSorted((a, b) => strengthOf(b.content) - strengthOf(a.content))
      .slice(0, cfg.K)
    for (const u of order) {
      u.isAnchor = true
      u.xp = MAX_XP
    }
  }

  // Per-expedition allowed tiers. Absent filter → every tier; absent key → all tiers;
  // empty array → expedition excluded (it drops out of `exps` below).
  const expeditionFilter = cfg.allowedExpeditionTiers
  const allowedTiersFor = (expeditionId: string): number[] =>
    expeditionFilter ? (expeditionFilter[expeditionId] ?? TIERS) : TIERS

  const exps: ExpState[] = expeditions
    .filter((e) => allowedTiersFor(e.id).length > 0)
    .map((e) => ({
      content: e,
      biome: biomeMap.get(e.biome),
      loopCount: 0,
      run: null,
    }))
  const expOrder = exps.toSorted((a, b) => b.content.baseRating - a.content.baseRating)

  let measuredTokens = 0
  let clock = 0
  let climbSlotSec = 0
  let wastedSlotSec = 0
  let firstAssignment: PrestigeLoopAssignment[] | null = null
  const captureTimeline = cfg.captureTimelineSteps ?? 0
  const timeline: PrestigeTimelineStep[] = []
  let currentPrestiged: string[] = []

  function grantToken() {
    if (clock >= cfg.warmupSec) measuredTokens++
  }

  function prestige(u: Unit) {
    grantToken()
    currentPrestiged.push(u.content.id)
    u.xp = 0
    u.maxedSince = null
  }

  // Decide which maxed creatures to reset at this check-in, per policy.
  function applyCheckInPolicy() {
    const maxedNonAnchor = units.filter((u) => !u.isAnchor && u.xp >= MAX_XP)
    switch (cfg.mode) {
      case 'individual':
      case 'anchor':
        for (const u of maxedNonAnchor) prestige(u)
        break
      case 'batch':
        if (units.every((u) => u.isAnchor || u.xp >= MAX_XP)) {
          for (const u of maxedNonAnchor) prestige(u)
        }
        break
      case 'rotation': {
        // keep K most-recently-maxed as boosters; prestige the rest (oldest first)
        const ordered = maxedNonAnchor.toSorted((a, b) => (a.maxedSince ?? 0) - (b.maxedSince ?? 0))
        const toPrestige = ordered.slice(0, Math.max(0, ordered.length - cfg.K))
        for (const u of toPrestige) prestige(u)
        break
      }
    }
  }

  const expById = new Map(exps.map((e) => [e.content.id, e]))

  // Build the captured member view for a party (role from current XP / anchor status).
  function captureMembers(members: Unit[]): AssignmentMember[] {
    return members.map((m) => ({
      creatureId: m.content.id,
      role: m.isAnchor ? 'anchor' : m.xp >= MAX_XP ? 'booster' : 'climber',
      level: levelFromXp(m.xp),
    }))
  }

  // EXPERIMENTAL pinned allocator: rebuild the fixed parties each check-in (membership frozen,
  // tier re-optimized). Mirrors set-and-leave play. Inert unless cfg.pinnedParties is provided.
  function allocatePinned(capture: boolean): PrestigeLoopAssignment[] | null {
    for (const e of exps) e.run = null
    const captured: PrestigeLoopAssignment[] = []
    for (const party of cfg.pinnedParties ?? []) {
      const exp = expById.get(party.expeditionId)
      if (!exp || party.memberIdx.length === 0) continue
      const members = party.memberIdx.map((i) => units[i])
      const tier = bestTierFor(members, exp)
      const { dur, xpPerMember } = evalParty(members, exp, tier, noLoopBonus)
      exp.run = { memberIdx: party.memberIdx, xpPerMember, endsAt: clock + dur }
      if (capture)
        captured.push({ expeditionId: exp.content.id, tier, members: captureMembers(members) })
    }
    return capture ? captured : null
  }

  // Hybrid: each expedition's climbers are fixed; only boosters stay shared/dynamic below.
  const hybridByExp = cfg.hybridClimbers
    ? new Map(cfg.hybridClimbers.map((h) => [h.expeditionId, h.memberIdx]))
    : null

  // Re-form all parties from the full pool (the single reconfiguration per check-in).
  // Returns the captured assignment (with in-loop levels) when `capture`, else null.
  function allocate(capture: boolean): PrestigeLoopAssignment[] | null {
    if (cfg.pinnedParties) return allocatePinned(capture)
    for (const e of exps) e.run = null
    const reserved = new Set<number>()
    const captured: PrestigeLoopAssignment[] = []
    for (const exp of expOrder) {
      // Climbers: this expedition's fixed group under the hybrid allocator, else the global
      // neediest pool. Boosters (below) stay shared/dynamic in both modes.
      const climberUnits = hybridByExp
        ? (hybridByExp.get(exp.content.id) ?? []).map((i) => units[i])
        : units.filter((u) => u.xp < MAX_XP)
      const climbers = climberUnits
        .filter((u) => !reserved.has(u.idx) && u.xp < MAX_XP)
        .toSorted((a, b) => a.xp - b.xp)
      if (climbers.length === 0) continue
      const allBoosters = units
        .filter((u) => !reserved.has(u.idx) && u.xp >= MAX_XP)
        .toSorted(
          (a, b) =>
            calculateCreatureRating(b.content, exp.content, MAX_LEVEL, exp.biome) -
            calculateCreatureRating(a.content, exp.content, MAX_LEVEL, exp.biome),
        )
      // Drop anchors beyond the per-party cap so K anchors spread across expeditions.
      let anchorsTaken = 0
      const boosters = allBoosters.filter((u) => {
        if (!u.isAnchor) return true
        if (anchorsTaken < maxAnchorsPerParty) {
          anchorsTaken++
          return true
        }
        return false
      })
      let best: { value: number; members: Unit[]; tier: number; xpPerMember: number } | null = null
      const maxB = Math.min(2, boosters.length)
      for (let nB = 0; nB <= maxB; nB++) {
        for (let nC = 1; nC <= MAX_PARTY - nB; nC++) {
          if (climbers.length < nC) continue
          const members = [...climbers.slice(0, nC), ...boosters.slice(0, nB)]
          for (const tier of allowedTiersFor(exp.content.id)) {
            const { dur, xpPerMember } = evalParty(members, exp, tier, noLoopBonus)
            let useful = 0
            for (const c of climbers.slice(0, nC)) useful += Math.min(xpPerMember, MAX_XP - c.xp)
            const value = useful / dur
            if (best === null || value > best.value) {
              best = { value, members, tier, xpPerMember }
            }
          }
        }
      }
      if (best === null) continue
      for (const m of best.members) reserved.add(m.idx)
      const { dur } = evalParty(best.members, exp, best.tier, noLoopBonus)
      exp.run = {
        memberIdx: best.members.map((m) => m.idx),
        xpPerMember: best.xpPerMember,
        endsAt: clock + dur,
      }
      if (capture) {
        captured.push({
          expeditionId: exp.content.id,
          tier: best.tier,
          members: best.members.map((m) => ({
            creatureId: m.content.id,
            role: m.isAnchor ? 'anchor' : m.xp >= MAX_XP ? 'booster' : 'climber',
            level: levelFromXp(m.xp),
          })),
        })
      }
    }
    return capture ? captured : null
  }

  // For auto-repeat, keep using the tier that maximizes climber useful-xp/min right now.
  function bestTierFor(members: Unit[], exp: ExpState): number {
    const tiers = allowedTiersFor(exp.content.id)
    let bestTier = tiers[0] ?? 1
    let bestVal = -1
    for (const tier of tiers) {
      const { dur, xpPerMember } = evalParty(members, exp, tier, noLoopBonus)
      let useful = 0
      for (const m of members) if (m.xp < MAX_XP) useful += Math.min(xpPerMember, MAX_XP - m.xp)
      const v = useful / dur
      if (v > bestVal) {
        bestVal = v
        bestTier = tier
      }
    }
    return bestTier
  }

  // Run frozen, auto-repeating parties until `target` (in-flight runs past the boundary
  // are abandoned; they restart at the next check-in's reallocation).
  function runMicro(target: number) {
    while (true) {
      let next: ExpState | null = null
      for (const exp of exps) {
        if (exp.run && (next === null || exp.run.endsAt < next.run!.endsAt)) next = exp
      }
      if (next === null || next.run!.endsAt > target) {
        clock = target
        return
      }
      const run = next.run!
      const dur = run.endsAt - clock
      clock = run.endsAt
      for (const mi of run.memberIdx) {
        const u = units[mi]
        if (u.xp >= MAX_XP) {
          wastedSlotSec += dur
        } else {
          climbSlotSec += dur
          u.xp = Math.min(MAX_XP, u.xp + run.xpPerMember)
          if (u.xp >= MAX_XP && u.maxedSince === null) u.maxedSince = clock
        }
      }
      next.loopCount++
      // auto-repeat: same party, same expedition, recompute duration + xp for new levels/loop
      const members = run.memberIdx.map((i) => units[i])
      const tierGuess = bestTierFor(members, next)
      const { dur: nd, xpPerMember } = evalParty(members, next, tierGuess, noLoopBonus)
      next.run = { memberIdx: run.memberIdx, xpPerMember, endsAt: clock + nd }
    }
  }

  // Capture the recommended assignment at a STEADY-STATE check-in (first one past warmup),
  // not the degenerate first visit — so rotation shows real boosters mid-cycle and the
  // snapshot reflects the loop the player actually maintains. The very first check-in is a
  // fallback in case the horizon is short.
  let capturedSteady = false
  while (clock < cfg.horizonSec) {
    const steady = clock >= cfg.warmupSec
    const inWindow = captureTimeline > 0 && steady && timeline.length < captureTimeline

    // Wasted idle-at-120 during the interval that just ended: each maxed climber sat idle
    // from when it hit 120 (`maxedSince`) — or the interval start, if it maxed earlier — until
    // this check-in could prestige it. Computed BEFORE applyCheckInPolicy resets maxedSince.
    // Anchors start pre-maxed (maxedSince === null) and are excluded.
    let wastedHoursByCreature: Record<string, number> | undefined
    if (inWindow) {
      const intervalStartSec = clock - cfg.cadenceSec
      wastedHoursByCreature = {}
      for (const u of units) {
        if (u.xp >= MAX_XP && u.maxedSince !== null) {
          const idleSec = clock - Math.max(u.maxedSince, intervalStartSec)
          if (idleSec > 0) wastedHoursByCreature[u.content.id] = idleSec / 3600
        }
      }
    }

    currentPrestiged = []
    applyCheckInPolicy()
    let storeSteady = false
    if (!capturedSteady && steady) {
      storeSteady = true
      capturedSteady = true
    }
    const captured = allocate(storeSteady || inWindow || firstAssignment === null)
    if (storeSteady || firstAssignment === null) firstAssignment = captured
    if (inWindow && captured) {
      timeline.push({
        checkInIndex: timeline.length,
        clockHours: Math.round(clock / 3600),
        prestigedCreatureIds: [...currentPrestiged],
        assignment: captured,
        wastedHoursByCreature,
      })
    }
    runMicro(clock + cfg.cadenceSec)
  }

  const windowHours = (cfg.horizonSec - cfg.warmupSec) / 3600
  const totalSlot = climbSlotSec + wastedSlotSec
  const anchorIds = units.filter((u) => u.isAnchor).map((u) => u.content.id)
  return {
    tokensPerHour: windowHours > 0 ? measuredTokens / windowHours : 0,
    wastedSlotFraction: totalSlot > 0 ? wastedSlotSec / totalSlot : 0,
    firstAssignment: firstAssignment ?? [],
    anchorIds,
    timeline,
  }
}

// ── App-facing planner ───────────────────────────────────────────────────────

/** Only awakened creatures can prestige; among them, sub-120 creatures climb to their first reset. */
function buildPool(creatures: PrestigeLoopRosterEntry[]): PoolUnit[] {
  const pool: PoolUnit[] = []
  for (const entry of creatures) {
    if (!entry.awakened) continue
    const creature = creatureById.get(entry.creatureId)
    if (!creature) continue
    const level = Math.min(MAX_LEVEL, Math.max(1, entry.level))
    pool.push({ creature, startXp: xpForLevel(level) })
  }
  return pool
}

/** Top-K strongest pool indices — the anchors (mirrors simulatePrestigeLoop's anchor selection). */
function selectAnchorIdx(pool: PoolUnit[], K: number): Set<number> {
  if (K <= 0) return new Set()
  return new Set(
    pool
      .map((p, i) => ({ i, s: strengthOf(p.creature) }))
      .toSorted((a, b) => b.s - a.s)
      .slice(0, K)
      .map((x) => x.i),
  )
}

/**
 * Best-fit frozen parties for the pinned allocator. Expeditions in base-rating order each take
 * ≤1 best-fit anchor (the booster slot, matching maxAnchorsPerParty=1) then fill with their
 * best-fit climbers, until climbers run out. Fit is computed at MAX_LEVEL — which is the right
 * reference at any level, since the rating's level factor is linear and so doesn't change a
 * creature's expedition ranking (see Experiment 2 in the allocation-experiments findings).
 */
export function buildBestFitParties(
  pool: PoolUnit[],
  K: number,
  allowedExpeditionTiers?: Record<string, number[]>,
): { expeditionId: string; memberIdx: number[] }[] {
  const anchorIdx = selectAnchorIdx(pool, K)
  const allowed = (id: string): number[] =>
    allowedExpeditionTiers ? (allowedExpeditionTiers[id] ?? TIERS) : TIERS
  const expOrder = expeditions
    .filter((e) => allowed(e.id).length > 0)
    .toSorted((a, b) => b.baseRating - a.baseRating)
  const rate = (i: number, exp: Expedition): number =>
    calculateCreatureRating(pool[i].creature, exp, MAX_LEVEL, biomeMap.get(exp.biome))

  const climberIdx = pool.map((_, i) => i).filter((i) => !anchorIdx.has(i))
  const anchorIdxs = pool.map((_, i) => i).filter((i) => anchorIdx.has(i))
  const usedC = new Set<number>()
  const usedA = new Set<number>()
  const parties: { expeditionId: string; memberIdx: number[] }[] = []
  for (const exp of expOrder) {
    const availC = climberIdx.filter((i) => !usedC.has(i))
    if (availC.length === 0) break
    const members: number[] = []
    const availA = anchorIdxs.filter((i) => !usedA.has(i))
    if (availA.length) {
      const best = availA.toSorted((a, b) => rate(b, exp) - rate(a, exp))[0]
      usedA.add(best)
      members.push(best)
    }
    const pickC = availC
      .toSorted((a, b) => rate(b, exp) - rate(a, exp))
      .slice(0, MAX_PARTY - members.length)
    for (const c of pickC) usedC.add(c)
    members.push(...pickC)
    parties.push({ expeditionId: exp.id, memberIdx: members })
  }
  return parties
}

/**
 * Fixed climber groups for the hybrid allocator: assign the non-anchor (climber) creatures to
 * their best-fit expeditions (base-rating order, up to MAX_PARTY each), leaving anchors out so
 * they stay in the shared booster pool. The sim then lends boosters to these fixed groups each
 * check-in. Same level-invariant fit reasoning as {@link buildBestFitParties}.
 */
export function buildHybridClimberAssignment(
  pool: PoolUnit[],
  K: number,
  allowedExpeditionTiers?: Record<string, number[]>,
): { expeditionId: string; memberIdx: number[] }[] {
  const anchorIdx = selectAnchorIdx(pool, K)
  const allowed = (id: string): number[] =>
    allowedExpeditionTiers ? (allowedExpeditionTiers[id] ?? TIERS) : TIERS
  const expOrder = expeditions
    .filter((e) => allowed(e.id).length > 0)
    .toSorted((a, b) => b.baseRating - a.baseRating)
  const rate = (i: number, exp: Expedition): number =>
    calculateCreatureRating(pool[i].creature, exp, MAX_LEVEL, biomeMap.get(exp.biome))

  const climberIdx = pool.map((_, i) => i).filter((i) => !anchorIdx.has(i))
  const used = new Set<number>()
  const groups: { expeditionId: string; memberIdx: number[] }[] = []
  for (const exp of expOrder) {
    const avail = climberIdx.filter((i) => !used.has(i))
    if (avail.length === 0) break
    const pick = avail.toSorted((a, b) => rate(b, exp) - rate(a, exp)).slice(0, MAX_PARTY)
    for (const i of pick) used.add(i)
    groups.push({ expeditionId: exp.id, memberIdx: pick })
  }
  return groups
}

/**
 * Produce a recommended stable prestige-loop plan for the player's roster at the chosen
 * cadence, plus a per-cadence tokens/hour comparison.
 *
 * The loop is set-and-leave: the K strongest creatures are held as permanent boosters and
 * best-fit parties are built once and frozen (zero churn between check-ins).
 */
export function planPrestigeLoop(input: PrestigeLoopInput): PrestigeLoopPlan {
  const pool = buildPool(input.creatures)
  const eligibleCount = pool.length
  const cadenceSec = input.cadenceHours * 3600
  // Hold at most eligibleCount - 1 boosters — at least one creature must stay a climber to
  // earn tokens (holding the whole roster would produce nothing).
  const K = Math.min(Math.max(0, Math.round(input.boosterCount)), Math.max(0, eligibleCount - 1))

  const base = {
    horizonSec: APP_HORIZON_SEC,
    warmupSec: APP_WARMUP_SEC,
    maxAnchorsPerParty: 1,
    allowedExpeditionTiers: input.allowedExpeditionTiers,
  }

  // Best-fit parties are cadence-independent, so build the frozen layout once and reuse it
  // across the headline run and every comparison cadence.
  const pinnedParties = buildBestFitParties(pool, K, input.allowedExpeditionTiers)

  const headline = simulatePrestigeLoop(pool, {
    ...base,
    mode: 'anchor',
    K,
    cadenceSec,
    captureTimelineSteps: TIMELINE_STEPS,
    pinnedParties,
  })

  // byCadence: tokens/hour across the comparison cadences (+ the chosen one if custom), reusing
  // the headline run for the chosen cadence.
  const simCache = new Map<number, SimOutput>([[input.cadenceHours, headline]])
  const runAt = (hours: number): SimOutput => {
    let out = simCache.get(hours)
    if (!out) {
      out = simulatePrestigeLoop(pool, {
        ...base,
        mode: 'anchor',
        K,
        cadenceSec: hours * 3600,
        pinnedParties,
      })
      simCache.set(hours, out)
    }
    return out
  }

  const cadenceHoursSet = [...new Set([...COMPARISON_CADENCE_HOURS, input.cadenceHours])].toSorted(
    (a, b) => a - b,
  )
  const byCadence: CadenceComparisonRow[] = cadenceHoursSet.map((hours) => ({
    cadenceHours: hours,
    tokensPerHour: runAt(hours).tokensPerHour,
  }))

  return {
    assignment: headline.firstAssignment,
    anchorIds: headline.anchorIds,
    tokensPerHour: headline.tokensPerHour,
    idleWasteFraction: headline.wastedSlotFraction,
    eligibleCount,
    cadenceHours: input.cadenceHours,
    boosterCount: K,
    timeline: headline.timeline,
    comparison: { byCadence },
  }
}

/** Roster ordered strongest-first — used by callers (and the fidelity test) to build pools. */
export function creaturesByStrength(): Creature[] {
  return allCreatures.toSorted((a, b) => strengthOf(b) - strengthOf(a))
}
