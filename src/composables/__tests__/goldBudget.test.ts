/**
 * B2 — gold spendable-budget allocation.
 *
 * Gold is a finite budget (on-hand + sellable surplus), not a free per-purchase cost.
 * Over the produce-optimal baseline, the planner swaps produce → buy for the best
 * active-time-saved-per-gold purchases, until the budget is spent. Buying a passively-
 * produced item (0 active) saves nothing, so it's never funded.
 *
 * `crate`: buyValue 3000, gathered via mining (active) and not machine-made → buying it
 * saves real gather time. `copper-bar`: sellValue 10 → an un-referenced stack is surplus
 * that funds purchases (auto-surplus selling).
 */
import { describe, test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'

function modifiers(): PlannerModifiers {
  return {
    gardenFlowers: {},
    awakenGatherUpgrades: {},
    awakenSpeedTiers: {},
    toolSpeedBonuses: {},
    jobTiers: {},
    goldPerMinute: 0,
    machineLevels: {},
    machineRecipes: {},
    fabricationAllocations: {},
    expeditionTier: 1,
  }
}

// crate costs 3000 gold to buy; gathered via mining otherwise.
function buysCrate(inventory: Record<string, number>): boolean {
  const graph = buildPlannerGraph('crate', 1, inventory, modifiers())
  const id = graph.root!.defaultMethodId
  return id ? graph.methodsById[id]?.kind === 'buy' : false
}

describe('B2 — gold spendable-budget allocation', () => {
  test('no budget → produce, not buy', () => {
    expect(buysCrate({})).toBe(false)
  })

  test('on-hand gold ≥ cost → buy', () => {
    expect(buysCrate({ gold: 5000 })).toBe(true)
  })

  test('on-hand gold < cost → stays produce', () => {
    expect(buysCrate({ gold: 1000 })).toBe(false)
  })

  test('sellable surplus funds a buy with no on-hand gold', () => {
    // copper-bar (sellValue 10) is unused by a crate plan → 400 × 10 = 4000 ≥ 3000.
    expect(buysCrate({ 'copper-bar': 400 })).toBe(true)
  })

  test('surplus below cost → stays produce', () => {
    // 100 × 10 = 1000 < 3000.
    expect(buysCrate({ 'copper-bar': 100 })).toBe(false)
  })
})
