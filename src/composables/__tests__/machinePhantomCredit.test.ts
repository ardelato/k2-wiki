/**
 * A2 — machine phantom-credit gate.
 *
 * A processor (e.g. Smelter, which can make copper-bar, iron-bar, …) runs ONE
 * recipe at a time, tracked by `machineRecipes[machineId]` (the save's
 * selectedRecipeId): a specific output item, 'all' (sequential over all recipes),
 * or null. Passive machine credit for an item must be given only when the machine
 * is actually set to make it — not merely capable of it.
 *
 * copper-bar: has a Furnace craft recipe AND is a Smelter output, so the Smelter's
 * passive contribution lowers copper-bar's craft time when (and only when) credited.
 */
import { describe, test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'

function modifiers(overrides: Partial<PlannerModifiers> = {}): PlannerModifiers {
  return {
    gardenFlowers: {},
    awakenGatherUpgrades: {},
    awakenSpeedTiers: {},
    toolSpeedBonuses: {},
    jobTiers: {},
    goldPerMinute: 0,
    machineLevels: { smelter: 5 },
    machineRecipes: {},
    fabricationAllocations: {},
    expeditionTier: 1,
    ...overrides,
  }
}

function copperBarCraft(mods: PlannerModifiers) {
  const graph = buildPlannerGraph('copper-bar', 1, {}, mods)
  const node = graph.root!
  const method = node.methods.find((m) => m.kind === 'craft')!
  return method
}

function hasSmelterCredit(mods: PlannerModifiers): boolean {
  return copperBarCraft(mods).detailRows.some(
    (r) => typeof r.value === 'string' && r.label.startsWith('Machine') && /Smelter/.test(r.label),
  )
}

describe('A2 — machine phantom-credit gate', () => {
  test('Smelter set to a sibling recipe (iron-bar) gives ZERO credit to copper-bar', () => {
    expect(hasSmelterCredit(modifiers({ machineRecipes: { smelter: 'iron-bar' } }))).toBe(false)
  })

  test('Smelter set to copper-bar credits copper-bar', () => {
    expect(hasSmelterCredit(modifiers({ machineRecipes: { smelter: 'copper-bar' } }))).toBe(true)
  })

  test("Smelter set to 'all' credits copper-bar (sequential, still produces it)", () => {
    expect(hasSmelterCredit(modifiers({ machineRecipes: { smelter: 'all' } }))).toBe(true)
  })

  test('Smelter with no selected recipe (null / absent) gives no credit', () => {
    expect(hasSmelterCredit(modifiers({ machineRecipes: { smelter: null } }))).toBe(false)
    expect(hasSmelterCredit(modifiers({ machineRecipes: {} }))).toBe(false)
  })

  function hasSmelterMethod(mods: PlannerModifiers): boolean {
    const graph = buildPlannerGraph('copper-bar', 1, {}, mods)
    return graph.root!.methods.some((m) => m.kind === 'machine' && /Smelter/.test(m.title))
  }

  test('machine METHOD is not offered when the processor is set to a sibling recipe', () => {
    expect(hasSmelterMethod(modifiers({ machineRecipes: { smelter: 'iron-bar' } }))).toBe(false)
    expect(hasSmelterMethod(modifiers({ machineRecipes: {} }))).toBe(false)
  })

  test('machine METHOD is offered when the processor is set to this item or all', () => {
    expect(hasSmelterMethod(modifiers({ machineRecipes: { smelter: 'copper-bar' } }))).toBe(true)
    expect(hasSmelterMethod(modifiers({ machineRecipes: { smelter: 'all' } }))).toBe(true)
  })

  test('credited copper-bar crafts faster than un-credited (passive raises throughput)', () => {
    const credited = copperBarCraft(modifiers({ machineRecipes: { smelter: 'copper-bar' } }))
    const gated = copperBarCraft(modifiers({ machineRecipes: { smelter: 'iron-bar' } }))
    expect(credited.localTimeSeconds!).toBeLessThan(gated.localTimeSeconds!)
  })
})
