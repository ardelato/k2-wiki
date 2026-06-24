// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { PrestigeLoopRosterEntry } from '@/utils/planner/prestigeLoopPlanner'
import {
  buildBestFitParties,
  creaturesByStrength,
  planPrestigeLoop,
} from '@/utils/planner/prestigeLoopPlanner'

// A realistic awakened roster: the strongest N creatures, all at max level.
function roster(n: number): PrestigeLoopRosterEntry[] {
  return creaturesByStrength()
    .slice(0, n)
    .map((c) => ({ creatureId: c.id, level: 120, awakened: true }))
}

// Expedition each creature is assigned to at a given timeline step.
function expeditionByCreature(step: {
  assignment: { expeditionId: string; members: { creatureId: string }[] }[]
}) {
  const m = new Map<string, string>()
  for (const a of step.assignment)
    for (const mem of a.members) m.set(mem.creatureId, a.expeditionId)
  return m
}

describe('planPrestigeLoop — set-and-leave (frozen best-fit parties)', () => {
  test('parties are frozen — each creature stays on one expedition across the window', () => {
    const plan = planPrestigeLoop({ creatures: roster(30), cadenceHours: 12, boosterCount: 6 })
    expect(plan.timeline.length).toBeGreaterThan(1)
    const seen = new Map<string, Set<string>>()
    for (const step of plan.timeline) {
      for (const [id, exp] of expeditionByCreature(step)) {
        const s = seen.get(id) ?? new Set<string>()
        s.add(exp)
        seen.set(id, s)
      }
    }
    // Frozen ⇒ nobody appears under more than one expedition.
    const movers = [...seen.values()].filter((s) => s.size > 1)
    expect(movers).toHaveLength(0)
  }, 60_000)
})

describe('buildBestFitParties', () => {
  test('places each creature at most once and respects excluded expeditions', () => {
    const pool = roster(24).map((e) => ({
      creature: creaturesByStrength().find((c) => c.id === e.creatureId)!,
      startXp: 0,
    }))
    const parties = buildBestFitParties(pool, 4)
    const ids = parties.flatMap((p) => p.memberIdx)
    expect(new Set(ids).size).toBe(ids.length) // no creature in two parties
    expect(parties.every((p) => p.memberIdx.length <= 3)).toBe(true)

    // An expedition with an empty allowed-tier list is excluded — it never gets a party.
    const excludedId = parties[0].expeditionId
    const limited = buildBestFitParties(pool, 4, { [excludedId]: [] })
    expect(limited.some((p) => p.expeditionId === excludedId)).toBe(false)
    expect(limited.length).toBeGreaterThan(0)
  })
})
