// @vitest-environment node
import { describe, expect, test } from 'vitest'

import creaturesData from '@/data/creatures.json'
import type { Creature } from '@/types'
import { xpForLevel } from '@/utils/formulas'
import {
  MAX_XP,
  type PoolUnit,
  type PrestigeStrategy,
  creaturesByStrength,
  simulatePrestigeLoop,
} from '@/utils/planner/prestigeLoopPlanner'
import { expeditions } from '@/utils/save/precomputedTables'

const allCreatures = creaturesData as Creature[]

// Reproduce the 9a sim's pool construction: strong = top N by strength, weak = bottom N,
// all starting fresh (xp = 0). See docs/.../2026-05-28-9a-prestige-loop-validation-findings.md.
const WS = 36
const HORIZON = 4000 * 3600
const WARMUP = 1000 * 3600

function pool(roster: 'weak' | 'strong'): PoolUnit[] {
  const ranked = creaturesByStrength()
  const slice = roster === 'strong' ? ranked.slice(0, WS) : ranked.slice(-WS)
  return slice.map((creature) => ({ creature, startXp: 0 }))
}

function tokensPerHour(roster: 'weak' | 'strong', mode: PrestigeStrategy, K: number, cadH: number) {
  return simulatePrestigeLoop(pool(roster), {
    mode,
    K,
    cadenceSec: cadH * 3600,
    horizonSec: HORIZON,
    warmupSec: WARMUP,
  }).tokensPerHour
}

const round2 = (n: number) => Number(n.toFixed(2))

// Total idle-at-120 hours and prestige count across a captured timeline window.
function wasteStats(out: ReturnType<typeof simulatePrestigeLoop>) {
  let waste = 0
  let prestiges = 0
  for (const s of out.timeline) {
    waste += Object.values(s.wastedHoursByCreature ?? {}).reduce((a, b) => a + b, 0)
    prestiges += s.prestigedCreatureIds.length
  }
  return { waste, prestiges }
}

describe('prestigeLoopPlanner — sanity / self-tests (fast)', () => {
  test('data fixtures match the validated sim assumptions', () => {
    expect(MAX_XP).toBe(720_000)
    expect(allCreatures.length).toBe(120)
  })

  test('assignment members carry in-loop levels (anchors at 120, climbers below)', () => {
    const ranked = creaturesByStrength()
    const poolUnits = ranked.slice(0, 8).map((creature) => ({ creature, startXp: 0 }))
    const out = simulatePrestigeLoop(poolUnits, {
      mode: 'anchor',
      K: 3,
      cadenceSec: 6 * 3600,
      horizonSec: 60 * 3600,
      warmupSec: 12 * 3600,
    })
    const anchorSet = new Set(out.anchorIds)
    for (const party of out.firstAssignment) {
      for (const m of party.members) {
        if (anchorSet.has(m.creatureId)) expect(m.level).toBe(120)
        expect(m.level).toBeGreaterThanOrEqual(1)
        expect(m.level).toBeLessThanOrEqual(120)
      }
    }
  })

  test('rotation timeline captures the requested window with prestige events', () => {
    const ranked = creaturesByStrength()
    const poolUnits = ranked.slice(0, 10).map((creature) => ({ creature, startXp: 0 }))
    const out = simulatePrestigeLoop(poolUnits, {
      mode: 'rotation',
      K: 3,
      cadenceSec: 6 * 3600,
      horizonSec: 400 * 3600,
      warmupSec: 100 * 3600,
      captureTimelineSteps: 8,
    })
    expect(out.timeline).toHaveLength(8)
    // Captured at steady state (past warmup), consecutive, with party assignments.
    expect(out.timeline[0].clockHours).toBeGreaterThanOrEqual(100)
    for (const [i, step] of out.timeline.entries()) {
      expect(step.checkInIndex).toBe(i)
      expect(step.assignment.length).toBeGreaterThan(0)
    }
    // The loop should be actively prestiging creatures somewhere in the window.
    expect(out.timeline.some((s) => s.prestigedCreatureIds.length > 0)).toBe(true)
  })

  test('timeline records wasted idle-at-120 hours, and a longer cadence wastes more per prestige', () => {
    const ranked = creaturesByStrength()
    const poolUnits = ranked.slice(0, 10).map((creature) => ({ creature, startXp: 0 }))
    // Generous windows (12 check-ins) so each run spans full climb→max→prestige cycles.
    const sim = (cadH: number) =>
      simulatePrestigeLoop(poolUnits, {
        mode: 'anchor',
        K: 3,
        cadenceSec: cadH * 3600,
        horizonSec: 800 * 3600,
        warmupSec: 200 * 3600,
        captureTimelineSteps: 12,
      })
    const short = wasteStats(sim(6))
    const long = wasteStats(sim(24))

    // The loop genuinely prestiges climbers and idles them at 120 before each prestige.
    expect(short.prestiges).toBeGreaterThan(0)
    expect(long.prestiges).toBeGreaterThan(0)
    expect(short.waste).toBeGreaterThan(0)
    // Wasted time per prestige scales with the gap between hitting 120 and the next check-in,
    // so a longer cadence wastes strictly more per prestige.
    expect(long.waste / long.prestiges).toBeGreaterThan(short.waste / short.prestiges)
  })

  test('anchor mode parks the K strongest as anchors and captures an assignment', () => {
    const ranked = creaturesByStrength()
    const poolUnits = ranked.slice(0, 8).map((creature) => ({ creature, startXp: 0 }))
    const out = simulatePrestigeLoop(poolUnits, {
      mode: 'anchor',
      K: 3,
      cadenceSec: 3600,
      horizonSec: 5 * 3600,
      warmupSec: 0,
    })
    // The K strongest become permanent anchors...
    expect(out.anchorIds).toHaveLength(3)
    expect(new Set(out.anchorIds)).toEqual(new Set(ranked.slice(0, 3).map((c) => c.id)))
    // ...and the first check-in yields an applyable party assignment.
    expect(out.firstAssignment.length).toBeGreaterThan(0)
    for (const party of out.firstAssignment) {
      expect(party.members.length).toBeGreaterThan(0)
      expect(party.tier).toBeGreaterThanOrEqual(1)
    }
    // Anchors must surface as the 'anchor' role where they appear.
    const anchorSet = new Set(out.anchorIds)
    for (const party of out.firstAssignment) {
      for (const m of party.members) {
        if (anchorSet.has(m.creatureId)) expect(m.role).toBe('anchor')
      }
    }
  })
})

describe('prestigeLoopPlanner — expedition scoping', () => {
  const base = {
    mode: 'anchor' as PrestigeStrategy,
    K: 3,
    cadenceSec: 6 * 3600,
    horizonSec: 60 * 3600,
    warmupSec: 12 * 3600,
  }
  const poolUnits = () =>
    creaturesByStrength()
      .slice(0, 8)
      .map((creature) => ({ creature, startXp: 0 }))

  test('omitting / fully-allowing the filter reproduces the legacy result', () => {
    const allTiers = Object.fromEntries(expeditions.map((e) => [e.id, [1, 2, 3, 4, 5]]))
    const legacy = simulatePrestigeLoop(poolUnits(), base)
    const allowed = simulatePrestigeLoop(poolUnits(), { ...base, allowedExpeditionTiers: allTiers })
    expect(allowed.tokensPerHour).toBe(legacy.tokensPerHour)
    expect(allowed.firstAssignment).toEqual(legacy.firstAssignment)
  })

  test('excluding an expedition drops it from the assignment', () => {
    const legacy = simulatePrestigeLoop(poolUnits(), base)
    const usedExpId = legacy.firstAssignment[0]?.expeditionId
    expect(usedExpId).toBeTruthy()
    const filtered = simulatePrestigeLoop(poolUnits(), {
      ...base,
      allowedExpeditionTiers: { [usedExpId]: [] },
    })
    expect(filtered.firstAssignment.every((p) => p.expeditionId !== usedExpId)).toBe(true)
  })

  test('restricting tiers confines the chosen tier to the allowed set', () => {
    const onlyTier1 = Object.fromEntries(expeditions.map((e) => [e.id, [1]]))
    const out = simulatePrestigeLoop(poolUnits(), { ...base, allowedExpeditionTiers: onlyTier1 })
    expect(out.firstAssignment.length).toBeGreaterThan(0)
    for (const party of out.firstAssignment) expect(party.tier).toBe(1)
  })

  test('excluding every expedition yields an empty, zero-rate plan', () => {
    const noneAllowed = Object.fromEntries(expeditions.map((e) => [e.id, []]))
    const out = simulatePrestigeLoop(poolUnits(), { ...base, allowedExpeditionTiers: noneAllowed })
    expect(out.firstAssignment).toEqual([])
    expect(out.tokensPerHour).toBe(0)
  })
})

// These run the full published horizon — slow, so generous timeouts.
describe('prestigeLoopPlanner — 9a fidelity (full horizon)', () => {
  test('reproduces the strong-roster / 5h tokens-per-hour row', { timeout: 60_000 }, () => {
    expect(round2(tokensPerHour('strong', 'batch', 0, 5))).toBe(0.26)
    expect(round2(tokensPerHour('strong', 'individual', 0, 5))).toBe(0.37)
    expect(round2(tokensPerHour('strong', 'anchor', 3, 5))).toBe(0.45)
    expect(round2(tokensPerHour('strong', 'rotation', 3, 5))).toBe(0.45)
  })

  test(
    'reproduces the weak-roster / 5h headline (ANCHOR K=3 wins at 0.10)',
    { timeout: 60_000 },
    () => {
      expect(round2(tokensPerHour('weak', 'anchor', 3, 5))).toBe(0.1)
      expect(round2(tokensPerHour('weak', 'individual', 0, 5))).toBe(0.08)
    },
  )

  test(
    'strategy ordering holds: ANCHOR/ROTATION ≥ INDIVIDUAL ≥ BATCH (strong, 24h)',
    { timeout: 60_000 },
    () => {
      const batch = tokensPerHour('strong', 'batch', 0, 24)
      const indiv = tokensPerHour('strong', 'individual', 0, 24)
      const rot = tokensPerHour('strong', 'rotation', 3, 24)
      const anc = tokensPerHour('strong', 'anchor', 3, 24)
      expect(indiv).toBeGreaterThanOrEqual(batch)
      expect(rot).toBeGreaterThan(indiv)
      expect(anc).toBeGreaterThan(indiv)
    },
  )
})
