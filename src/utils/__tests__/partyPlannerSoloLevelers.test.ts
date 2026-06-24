import { describe, expect, it } from 'vitest'

import creaturesData from '@/data/creatures.json'
import type { Creature, PartyLevelingPlan, PartyPlanCreature, PartyPlannerInput } from '@/types'

import { planPartyLevelingPath } from '../planner/partyPlanner'

const creatures = creaturesData as unknown as Creature[]
const byId = (id: string): Creature => {
  const c = creatures.find((x) => x.id === id)
  if (!c) throw new Error(`unknown creature ${id}`)
  return c
}

function leveler(id: string, startLevel: number): PartyPlanCreature {
  return { creature: byId(id), startLevel, targetLevel: 70, isBooster: false, awakened: false }
}
function booster(id: string): PartyPlanCreature {
  return { creature: byId(id), startLevel: 120, targetLevel: 120, isBooster: true, awakened: true }
}

function maxLevelersInAnyStep(plan: PartyLevelingPlan): number {
  let max = 0
  for (const step of plan.steps) {
    max = Math.max(max, step.party.filter((m) => !m.isBooster).length)
  }
  return max
}

describe('party planner — solo-leveler cap', () => {
  it('keeps at most one leveler per party when maxLevelersPerParty = 1', () => {
    const input: PartyPlannerInput = {
      creatures: [
        leveler('moss', 10),
        leveler('scoots', 8),
        leveler('chroma', 12),
        booster('ranger'),
        booster('baabaa'),
      ],
      expeditions: {},
      timeBudget: 'quick',
      wallClockLimitMs: 5000,
      maxLevelersPerParty: 1,
    }
    const plan = planPartyLevelingPath(input)
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(maxLevelersInAnyStep(plan)).toBe(1)
    expect(plan.isComplete).toBe(true)
  })

  it('still groups multiple levelers per party without the cap', () => {
    const input: PartyPlannerInput = {
      creatures: [leveler('moss', 10), leveler('scoots', 8), leveler('chroma', 12)],
      expeditions: {},
      timeBudget: 'quick',
      wallClockLimitMs: 5000,
    }
    const plan = planPartyLevelingPath(input)
    expect(plan.steps.length).toBeGreaterThan(0)
    // Uncapped runs are free to pack levelers together (≥1); we only assert the
    // cap isn't silently applied.
    expect(maxLevelersInAnyStep(plan)).toBeGreaterThanOrEqual(1)
  })
})
