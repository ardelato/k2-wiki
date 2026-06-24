import { describe, expect, it } from 'vitest'

import creaturesData from '@/data/creatures.json'
import type { Creature } from '@/types'

import { planLevelingPath } from '../planner/levelPlanner'

const creatures = creaturesData as unknown as Creature[]
const byId = (id: string): Creature => {
  const c = creatures.find((x) => x.id === id)
  if (!c) throw new Error(`unknown creature ${id}`)
  return c
}

function plan(creatureId: string, swapThreshold?: number) {
  return planLevelingPath({
    creature: byId(creatureId),
    startLevel: 1,
    targetLevel: 70,
    isAwakened: false,
    swapThreshold,
  })
}

describe('planLevelingPath stickiness (swapThreshold)', () => {
  it('higher stickiness never increases the number of expedition steps', () => {
    for (const id of ['astra', 'moss', 'shelldon']) {
      const standard = plan(id) // default 0.15
      const sticky = plan(id, 0.5) // only switch if 50% faster
      expect(sticky.steps.length).toBeLessThanOrEqual(standard.steps.length)
      // Both still reach the target.
      expect(standard.steps.at(-1)?.toLevel).toBe(70)
      expect(sticky.steps.at(-1)?.toLevel).toBe(70)
    }
  })

  it('still graduates on a large improvement despite high stickiness', () => {
    // A very high threshold should still produce a finite, complete plan (it never
    // gets stuck — a big speed jump always clears even a large threshold).
    const sticky = plan('astra', 0.5)
    expect(sticky.steps.length).toBeGreaterThan(0)
    expect(sticky.totalTimeSeconds).toBeGreaterThan(0)
    expect(Number.isFinite(sticky.totalTimeSeconds)).toBe(true)
  })

  it('only ever brings boosters from the provided pool', () => {
    // Underpins the hands-free exclusive booster allocation: once a booster is
    // removed from the pool, no plan can re-use it.
    const pool = ['ranger', 'baabaa'].map((id) => ({ creature: byId(id), level: 120 }))
    const allowed = new Set(pool.map((b) => b.creature.id))
    const result = planLevelingPath({
      creature: byId('astra'),
      startLevel: 1,
      targetLevel: 70,
      isAwakened: false,
      boosterCandidates: pool,
    })
    for (const step of result.steps) {
      for (const b of step.boosters ?? []) {
        expect(allowed.has(b.creature.id)).toBe(true)
      }
    }
  })

  it('matches the default plan when swapThreshold is omitted', () => {
    const a = plan('moss')
    const b = plan('moss', 0.15)
    expect(a.steps.length).toBe(b.steps.length)
    expect(a.totalTimeSeconds).toBe(b.totalTimeSeconds)
  })
})
