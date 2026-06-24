// @vitest-environment node
//
// EXPERIMENTS: does the dynamic per-check-in re-allocation earn its keep, or would
// pinning creatures to their best-fit expedition be as good / better (and cheaper)?
//
// Run:  npx vitest run src/utils/__tests__/prestigeAllocationExperiments.test.ts
// These tests print results to the console; the numbers are transcribed into
// docs/ for future reference. Light assertions guard the headline conclusions.
import { describe, expect, test } from 'vitest'

import creaturesData from '@/data/creatures.json'
import type { Creature } from '@/types'
import { calculateCreatureRating } from '@/utils/formulas'
import {
  MAX_LEVEL,
  type PoolUnit,
  type PrestigeStrategy,
  buildHybridClimberAssignment,
  creaturesByStrength,
  simulatePrestigeLoop,
  strengthOf,
} from '@/utils/planner/prestigeLoopPlanner'
import { biomeMap, expeditions } from '@/utils/save/precomputedTables'

const MAX_PARTY = 3

const allCreatures = creaturesData as Creature[]

// Published validation config (the numbers the sim was tuned against).
const HORIZON = 4000 * 3600
const WARMUP = 1000 * 3600

function strongPool(n: number): PoolUnit[] {
  return creaturesByStrength()
    .slice(0, n)
    .map((creature) => ({ creature, startXp: 0 }))
}
function fullPool(): PoolUnit[] {
  return allCreatures.map((creature) => ({ creature, startXp: 0 }))
}

// Best-fit expedition ranking for a creature at a given level.
function rankExpeditions(creature: Creature, level: number): string[] {
  return expeditions
    .map((e) => ({
      id: e.id,
      r: calculateCreatureRating(creature, e, level, biomeMap.get(e.biome)),
    }))
    .toSorted((a, b) => b.r - a.r)
    .map((x) => x.id)
}

// Roster for a progression state: all creatures up to `maxTier`, take the strongest `n`.
function tierPool(maxTier: number, n: number): PoolUnit[] {
  return allCreatures
    .filter((c) => (c.tier ?? 0) <= maxTier)
    .toSorted((a, b) => strengthOf(b) - strengthOf(a))
    .slice(0, n)
    .map((creature) => ({ creature, startXp: 0 }))
}

// ── Shared pinned-allocator helpers (used by Experiments 3–5) ────────────────
function ratingFor(c: Creature, expId: string): number {
  const e = expeditions.find((x) => x.id === expId)!
  return calculateCreatureRating(c, e, MAX_LEVEL, biomeMap.get(e.biome))
}

// Top-K strongest pool indices become anchors (mirrors simulatePrestigeLoop anchor selection).
function anchorSet(pool: PoolUnit[], K: number): Set<number> {
  if (K <= 0) return new Set()
  return new Set(
    pool
      .map((p, i) => ({ i, s: strengthOf(p.creature) }))
      .toSorted((a, b) => b.s - a.s)
      .slice(0, K)
      .map((x) => x.i),
  )
}

// Frozen parties by FIT: expeditions in base-rating order, each takes ≤1 best-fit anchor (the
// booster slot, matching maxAnchorsPerParty=1) then fills with its best-fit climbers.
function buildPinned(pool: PoolUnit[], anchorIdx: Set<number>) {
  const expOrder = [...expeditions].toSorted((a, b) => b.baseRating - a.baseRating)
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
      const best = availA.toSorted(
        (a, b) => ratingFor(pool[b].creature, exp.id) - ratingFor(pool[a].creature, exp.id),
      )[0]
      usedA.add(best)
      members.push(best)
    }
    const pickC = availC
      .toSorted((a, b) => ratingFor(pool[b].creature, exp.id) - ratingFor(pool[a].creature, exp.id))
      .slice(0, MAX_PARTY - members.length)
    for (const c of pickC) usedC.add(c)
    members.push(...pickC)
    parties.push({ expeditionId: exp.id, memberIdx: members })
  }
  return { parties, placed: usedC.size + usedA.size }
}

function tph(pool: PoolUnit[], cfg: Parameters<typeof simulatePrestigeLoop>[1]) {
  return simulatePrestigeLoop(pool, cfg).tokensPerHour
}

// Run dynamic vs pinned for one roster/config and return a comparison row.
function comparePinned(
  pool: PoolUnit[],
  mode: PrestigeStrategy,
  K: number,
  cadH: number,
): { dyn: number; pin: number; delta: number; placed: string } {
  const cfg = {
    mode,
    K,
    cadenceSec: cadH * 3600,
    horizonSec: HORIZON,
    warmupSec: WARMUP,
    maxAnchorsPerParty: 1,
  }
  const dyn = tph(pool, cfg)
  const { parties, placed } = buildPinned(pool, anchorSet(pool, K))
  const pin = tph(pool, { ...cfg, pinnedParties: parties })
  return {
    dyn,
    pin,
    delta: dyn > 0 ? (100 * (pin - dyn)) / dyn : 0,
    placed: `${placed}/${pool.length}`,
  }
}

function fmtRow(label: string, r: ReturnType<typeof comparePinned>): string {
  return (
    `${label.padEnd(28)} | dynamic ${r.dyn.toFixed(3).padStart(7)} | pinned ${r.pin.toFixed(3).padStart(7)} | ` +
    `pinned vs dynamic ${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(1)}% | placed ${r.placed}`
  )
}

describe('EXPERIMENT 2 — best-fit expedition ranking vs level', () => {
  // Hypothesis: level is a linear multiplier in calculateCreatureRating, so a creature's
  // ranking of expeditions should be (almost) level-invariant. If true, best-fit matchups
  // can be precomputed once at any reference level.
  test('a creature’s best-fit expedition is stable across levels', () => {
    const levels = [1, 35, 70, 105, 120]
    let argmaxFlips = 0
    let top3SetChanges = 0
    const flippers: string[] = []

    for (const c of allCreatures) {
      const ranks = levels.map((L) => rankExpeditions(c, L))
      const argmaxes = new Set(ranks.map((r) => r[0]))
      const top3Keys = new Set(ranks.map((r) => r.slice(0, 3).toSorted().join(',')))
      if (argmaxes.size > 1) {
        argmaxFlips++
        flippers.push(c.name)
      }
      if (top3Keys.size > 1) top3SetChanges++
    }

    console.log('\n=== EXPERIMENT 2: best-fit stability across level ===')
    console.log(`creatures tested: ${allCreatures.length}, levels: ${levels.join('/')}`)
    console.log(`creatures whose #1 expedition changes with level: ${argmaxFlips}`)
    console.log(`creatures whose top-3 set changes with level:     ${top3SetChanges}`)
    if (flippers.length) console.log(`  argmax flippers: ${flippers.join(', ')}`)

    // The ranking is level-invariant up to floor() rounding near ties.
    expect(argmaxFlips).toBeLessThanOrEqual(3)
  }, 30_000)
})

describe('EXPERIMENT 1 — how much does the dynamic allocator actually swap creatures?', () => {
  // Capture a long steady-state window and measure, per consecutive check-in pair, how often
  // a creature is assigned to a DIFFERENT expedition than the previous check-in. Split out the
  // moves that coincide with a prestige reset (which the model essentially forces).
  function measureSwaps(pool: PoolUnit[], mode: PrestigeStrategy, K: number, cadH: number) {
    const out = simulatePrestigeLoop(pool, {
      mode,
      K,
      cadenceSec: cadH * 3600,
      horizonSec: HORIZON,
      warmupSec: WARMUP,
      captureTimelineSteps: 80,
    })
    const steps = out.timeline
    // creatureId -> expeditionId at each captured step (undefined when benched).
    const where = (i: number) => {
      const m = new Map<string, string>()
      for (const a of steps[i].assignment)
        for (const mem of a.members) m.set(mem.creatureId, a.expeditionId)
      return m
    }

    let pairs = 0
    let swaps = 0
    let swapsExclPrestige = 0
    for (let i = 1; i < steps.length; i++) {
      const prev = where(i - 1)
      const cur = where(i)
      const prestiged = new Set(steps[i].prestigedCreatureIds)
      for (const [id, exp] of cur) {
        const before = prev.get(id)
        if (before === undefined) continue // wasn't placed last check-in
        pairs++
        if (before !== exp) {
          swaps++
          if (!prestiged.has(id)) swapsExclPrestige++
        }
      }
    }
    return {
      steps: steps.length,
      pairs,
      swapPct: pairs ? (100 * swaps) / pairs : 0,
      swapExclPrestigePct: pairs ? (100 * swapsExclPrestige) / pairs : 0,
    }
  }

  test('quantify expedition swaps across check-ins', () => {
    console.log('\n=== EXPERIMENT 1: expedition swap frequency (dynamic allocator) ===')
    const scenarios = [
      {
        label: 'strong-36 anchor K=6 12h',
        pool: strongPool(36),
        mode: 'anchor' as const,
        K: 6,
        cadH: 12,
      },
      {
        label: 'strong-36 rotation K=6 12h',
        pool: strongPool(36),
        mode: 'rotation' as const,
        K: 6,
        cadH: 12,
      },
      {
        label: 'full-120 anchor K=12 12h',
        pool: fullPool(),
        mode: 'anchor' as const,
        K: 12,
        cadH: 12,
      },
      {
        label: 'full-120 anchor K=12 24h',
        pool: fullPool(),
        mode: 'anchor' as const,
        K: 12,
        cadH: 24,
      },
    ]
    for (const s of scenarios) {
      const r = measureSwaps(s.pool, s.mode, s.K, s.cadH)
      console.log(
        `${s.label.padEnd(28)} | placed-pairs ${String(r.pairs).padStart(5)} | ` +
          `swap ${r.swapPct.toFixed(1).padStart(5)}% | swap excl. prestige ${r.swapExclPrestigePct.toFixed(1).padStart(5)}%`,
      )
      expect(r.pairs).toBeGreaterThan(0)
    }
  }, 60_000)
})

describe('EXPERIMENT 3 — dynamic-swap vs pinned-best-fit throughput', () => {
  test('compare tokens/hour: dynamic re-allocation vs frozen best-fit parties', () => {
    console.log('\n=== EXPERIMENT 3: dynamic vs pinned-best-fit (tokens/hr) ===')
    const scenarios = [
      {
        label: 'strong-24 individual 12h',
        pool: strongPool(24),
        mode: 'individual' as const,
        K: 0,
        cadH: 12,
      },
      {
        label: 'strong-36 individual 12h',
        pool: strongPool(36),
        mode: 'individual' as const,
        K: 0,
        cadH: 12,
      },
      {
        label: 'strong-36 anchor K=6 12h',
        pool: strongPool(36),
        mode: 'anchor' as const,
        K: 6,
        cadH: 12,
      },
      {
        label: 'strong-36 anchor K=6 24h',
        pool: strongPool(36),
        mode: 'anchor' as const,
        K: 6,
        cadH: 24,
      },
      {
        label: 'strong-48 anchor K=8 12h',
        pool: strongPool(48),
        mode: 'anchor' as const,
        K: 8,
        cadH: 12,
      },
      {
        label: 'full-120 anchor K=12 12h',
        pool: fullPool(),
        mode: 'anchor' as const,
        K: 12,
        cadH: 12,
      },
    ]
    const rows = scenarios.map((s) => ({
      label: s.label,
      r: comparePinned(s.pool, s.mode, s.K, s.cadH),
    }))
    for (const row of rows) console.log(fmtRow(row.label, row.r))
    expect(rows.every((row) => row.r.pin > 0)).toBe(true)
  }, 120_000)
})

describe('EXPERIMENT 7 — over-capacity creature selection (Phase C gate)', () => {
  // When a roster exceeds the ~60-slot capacity (20 expeditions × 3), does concentrating on
  // fewer/stronger parties or pruning to the best creatures beat the current seat-all greedy?
  // Configurable hybrid climber builder: optional expedition cap + strength prune.
  function buildClimbers(
    pool: PoolUnit[],
    K: number,
    opts: { maxExpeditions?: number; maxClimbers?: number } = {},
  ) {
    const anchors = anchorSet(pool, K)
    const rate = (i: number, expId: string) => {
      const e = expeditions.find((x) => x.id === expId)!
      return calculateCreatureRating(pool[i].creature, e, MAX_LEVEL, biomeMap.get(e.biome))
    }
    let climberIdx = pool.map((_, i) => i).filter((i) => !anchors.has(i))
    if (opts.maxClimbers != null) {
      climberIdx = climberIdx
        .toSorted((a, b) => strengthOf(pool[b].creature) - strengthOf(pool[a].creature))
        .slice(0, opts.maxClimbers)
    }
    let expOrder = [...expeditions].toSorted((a, b) => b.baseRating - a.baseRating)
    if (opts.maxExpeditions != null) expOrder = expOrder.slice(0, opts.maxExpeditions)
    const used = new Set<number>()
    const groups: { expeditionId: string; memberIdx: number[] }[] = []
    for (const exp of expOrder) {
      const avail = climberIdx.filter((i) => !used.has(i))
      if (avail.length === 0) break
      const pick = avail.toSorted((a, b) => rate(b, exp.id) - rate(a, exp.id)).slice(0, MAX_PARTY)
      for (const i of pick) used.add(i)
      groups.push({ expeditionId: exp.id, memberIdx: pick })
    }
    return groups
  }

  // Creature-greedy: assign each climber to its globally-best available (creature,expedition) pair,
  // i.e. every creature in its personal best-fit home (vs the expedition-greedy production builder).
  function buildCreatureGreedy(pool: PoolUnit[], K: number) {
    const anchors = anchorSet(pool, K)
    const rate = (i: number, expId: string) => {
      const e = expeditions.find((x) => x.id === expId)!
      return calculateCreatureRating(pool[i].creature, e, MAX_LEVEL, biomeMap.get(e.biome))
    }
    const climberIdx = pool.map((_, i) => i).filter((i) => !anchors.has(i))
    const pairs: { i: number; e: string; r: number }[] = []
    for (const i of climberIdx)
      for (const e of expeditions) pairs.push({ i, e: e.id, r: rate(i, e.id) })
    pairs.sort((a, b) => b.r - a.r)
    const cap = new Map<string, number>()
    const expOf = new Map<number, string>()
    for (const p of pairs) {
      if (expOf.has(p.i) || (cap.get(p.e) ?? 0) >= MAX_PARTY) continue
      expOf.set(p.i, p.e)
      cap.set(p.e, (cap.get(p.e) ?? 0) + 1)
    }
    const byExp = new Map<string, number[]>()
    for (const [i, e] of expOf) byExp.set(e, [...(byExp.get(e) ?? []), i])
    return [...byExp].map(([expeditionId, memberIdx]) => ({ expeditionId, memberIdx }))
  }

  function hybTph(
    pool: PoolUnit[],
    K: number,
    groups: { expeditionId: string; memberIdx: number[] }[],
  ) {
    return tph(pool, {
      mode: 'anchor',
      K,
      cadenceSec: 12 * 3600,
      horizonSec: HORIZON,
      warmupSec: WARMUP,
      maxAnchorsPerParty: 1,
      hybridClimbers: groups,
    })
  }

  test('seat-all vs concentrate vs strength-prune (over-capacity rosters)', () => {
    console.log('\n=== EXPERIMENT 7: over-capacity selection (hybrid, anchor 12h) ===')
    const rosters = [
      { label: 'full-120 K=12', pool: fullPool(), K: 12 },
      { label: 'late T0-5 own80 K=13', pool: tierPool(5, 80), K: 13 },
      { label: 'late T0-5 own100 K=17', pool: tierPool(5, 100), K: 17 },
    ]
    for (const r of rosters) {
      const base = hybTph(r.pool, r.K, buildClimbers(r.pool, r.K))
      const variants: [string, number][] = [
        ['seat-all (current)', base],
        [
          'concentrate ≤16 exp',
          hybTph(r.pool, r.K, buildClimbers(r.pool, r.K, { maxExpeditions: 16 })),
        ],
        [
          'concentrate ≤12 exp',
          hybTph(r.pool, r.K, buildClimbers(r.pool, r.K, { maxExpeditions: 12 })),
        ],
        [
          'concentrate ≤10 exp',
          hybTph(r.pool, r.K, buildClimbers(r.pool, r.K, { maxExpeditions: 10 })),
        ],
        ['prune to top-60', hybTph(r.pool, r.K, buildClimbers(r.pool, r.K, { maxClimbers: 60 }))],
        ['creature-greedy home', hybTph(r.pool, r.K, buildCreatureGreedy(r.pool, r.K))],
      ]
      console.log(`-- ${r.label} (roster ${r.pool.length}, capacity ~60) --`)
      for (const [label, v] of variants) {
        const delta = base > 0 ? (100 * (v - base)) / base : 0
        console.log(
          `   ${label.padEnd(22)} ${v.toFixed(3)} tok/hr  ${label.startsWith('seat-all') ? '(baseline)' : (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'}`,
        )
      }
    }
    expect(rosters.length).toBe(3)
  }, 240_000)
})

describe('EXPERIMENT 6 — hybrid (pin climbers, share boosters) vs pinned vs dynamic', () => {
  // The validation gate for Phase B. Hybrid should match/beat dynamic in the late-game anchor
  // corner (where pure pinned lost) while keeping pinned's wins elsewhere.
  function threeWay(pool: PoolUnit[], K: number, cadH: number) {
    const cfg = {
      mode: 'anchor' as PrestigeStrategy,
      K,
      cadenceSec: cadH * 3600,
      horizonSec: HORIZON,
      warmupSec: WARMUP,
      maxAnchorsPerParty: 1,
    }
    const dyn = tph(pool, cfg)
    const { parties } = buildPinned(pool, anchorSet(pool, K))
    const pin = tph(pool, { ...cfg, pinnedParties: parties })
    const hyb = tph(pool, { ...cfg, hybridClimbers: buildHybridClimberAssignment(pool, K) })
    return { dyn, pin, hyb }
  }

  test('three-way tokens/hour comparison (anchor mode, 12h)', () => {
    console.log('\n=== EXPERIMENT 6: dynamic vs pinned vs hybrid (tokens/hr, anchor 12h) ===')
    const scenarios = [
      { label: 'early    T0-1 own8', pool: tierPool(1, 8), K: 1 },
      { label: 'early-mid T0-2 own16', pool: tierPool(2, 16), K: 3 },
      { label: 'mid      T0-3 own28', pool: tierPool(3, 28), K: 5 },
      { label: 'mid-late T0-4 own44', pool: tierPool(4, 44), K: 7 },
      { label: 'late     T0-5 own80', pool: tierPool(5, 80), K: 13 },
      { label: 'strong-36', pool: strongPool(36), K: 6 },
      { label: 'strong-48', pool: strongPool(48), K: 8 },
    ]
    for (const s of scenarios) {
      const { dyn, pin, hyb } = threeWay(s.pool, s.K, 12)
      const vsDyn = dyn > 0 ? (100 * (hyb - dyn)) / dyn : 0
      const vsPin = pin > 0 ? (100 * (hyb - pin)) / pin : 0
      const best = hyb >= dyn && hyb >= pin ? 'HYBRID' : dyn >= pin ? 'dynamic' : 'pinned'
      console.log(
        `${s.label.padEnd(22)} | dyn ${dyn.toFixed(3).padStart(6)} | pin ${pin.toFixed(3).padStart(6)} | ` +
          `hyb ${hyb.toFixed(3).padStart(6)} | hyb vs dyn ${(vsDyn >= 0 ? '+' : '') + vsDyn.toFixed(1)}% | ` +
          `hyb vs pin ${(vsPin >= 0 ? '+' : '') + vsPin.toFixed(1)}% | best: ${best}`,
      )
    }
    expect(scenarios.length).toBe(7)
  }, 240_000)
})

describe('EXPERIMENT 4 — robustness across game progression states', () => {
  // Progression = which creature tiers you own. Stat-sum scales steeply by tier (T0≈41 … T5≈388),
  // so early rosters have a compressed strength spread (no T4/T5 anchors to share) — exactly where
  // the dynamic model's booster-sharing edge might vanish.
  test('dynamic vs pinned across early → late rosters', () => {
    console.log('\n=== EXPERIMENT 4: progression states (tokens/hr) ===')
    const states = [
      { label: 'early    T0-1 own8', maxTier: 1, n: 8 },
      { label: 'early-mid T0-2 own16', maxTier: 2, n: 16 },
      { label: 'mid      T0-3 own28', maxTier: 3, n: 28 },
      { label: 'mid-late T0-4 own44', maxTier: 4, n: 44 },
      { label: 'late     T0-5 own80', maxTier: 5, n: 80 },
    ]
    for (const st of states) {
      const pool = tierPool(st.maxTier, st.n)
      const K = Math.max(1, Math.round(pool.length / 6))
      console.log(fmtRow(`${st.label} | anchor K=${K} 12h`, comparePinned(pool, 'anchor', K, 12)))
      console.log(fmtRow(`${st.label} | individual  12h`, comparePinned(pool, 'individual', 0, 12)))
    }
    expect(states.length).toBe(5)
  }, 240_000)
})

describe('EXPERIMENT 5 — robustness when creatures are busy (Sanctuary)', () => {
  // Excluding busy creatures shrinks the roster and can remove the would-be anchors. If the
  // dynamic edge comes from sharing strong boosters, taking those boosters out (Sanctuary) should
  // narrow the gap — possibly making pinning competitive even in anchor mode.
  test('dynamic vs pinned with subsets of the roster removed', () => {
    console.log('\n=== EXPERIMENT 5: busy/Sanctuary exclusions (mid-late T0-4, anchor 12h) ===')
    const base = tierPool(4, 44) // strength-desc order
    const variants = [
      { label: 'none busy (baseline)', pool: base },
      { label: 'weakest 11 busy', pool: base.slice(0, base.length - 11) },
      { label: 'every-4th busy (spread)', pool: base.filter((_, i) => i % 4 !== 0) },
      { label: 'strongest 7 busy (anchors!)', pool: base.slice(7) },
    ]
    for (const v of variants) {
      const K = Math.max(1, Math.round(v.pool.length / 6))
      console.log(
        fmtRow(`${v.label} (n=${v.pool.length} K=${K})`, comparePinned(v.pool, 'anchor', K, 12)),
      )
    }
    expect(variants.length).toBe(4)
  }, 180_000)
})
