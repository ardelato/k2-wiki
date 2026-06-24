import { describe, test, expect, beforeEach } from 'vitest'
/**
 * Phase C — machine switch advisory.
 *
 * When a processor could make a planned item but is set to a different recipe, the planner
 * advises retasking it to produce the item passively. Advisory only — selection is unchanged
 * (the item is still produced actively because the machine isn't assigned to it).
 *
 * Smelter makes copper-bar and iron-bar (among others). Set it to iron-bar and plan copper-bar:
 * copper-bar is produced by its Furnace recipe, and a "Switch Smelter" advisory appears.
 */
import { createApp, ref } from 'vue'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'
import { useRecommendations } from '@/composables/useRecommendations'
import i18n from '@/i18n'

// useRecommendations calls useI18n(), which requires an active component setup. Run it
// inside a throwaway app that has the i18n plugin installed so the composable resolves.
function withI18nSetup<T>(composable: () => T): T {
  let result!: T
  const app = createApp({
    setup() {
      result = composable()
      return () => null
    },
  })
  app.use(i18n)
  app.mount(document.createElement('div'))
  app.unmount()
  return result
}

function modifiers(machineRecipes: Record<string, string | null>): PlannerModifiers {
  return {
    gardenFlowers: {},
    awakenGatherUpgrades: {},
    awakenSpeedTiers: {},
    toolSpeedBonuses: {},
    jobTiers: {},
    goldPerMinute: 0,
    machineLevels: {},
    machineRecipes,
    fabricationAllocations: {},
    expeditionTier: 1,
  }
}

function recommendFor(itemId: string, machineRecipes: Record<string, string | null>) {
  const gc = useGameConfig()
  gc.setMachineRecipes(machineRecipes)
  const graph = buildPlannerGraph(itemId, 1, {}, modifiers(machineRecipes))
  const nodesById = ref(graph.nodesById)
  const getActiveMethod = (nodeId: string) => {
    const n = graph.nodesById[nodeId]
    return n?.defaultMethodId ? (graph.methodsById[n.defaultMethodId] ?? null) : null
  }
  const recs = withI18nSetup(() => useRecommendations(nodesById, getActiveMethod, gc))
  return { recs: recs.value, rootId: graph.root!.id }
}

describe('Phase C — machine switch advisory', () => {
  beforeEach(() => useGameConfig().resetGameConfig())

  test('Smelter set to a sibling recipe advises switching to the planned item', () => {
    const { recs, rootId } = recommendFor('copper-bar', { smelter: 'iron-bar' })
    expect(recs[rootId]?.text).toMatch(/Switch Smelter/)
    expect(recs[rootId]?.text).toMatch(/Copper Bar/)
    expect(recs[rootId]?.text).toMatch(/Iron Bar/) // names the current recipe it'd retask from
  })

  test('Smelter set to this item gives no switch advisory (already assigned)', () => {
    const { recs, rootId } = recommendFor('copper-bar', { smelter: 'copper-bar' })
    expect(recs[rootId]?.text ?? '').not.toMatch(/Switch Smelter/)
  })

  test("Smelter set to 'all' gives no switch advisory (already produces it)", () => {
    const { recs, rootId } = recommendFor('copper-bar', { smelter: 'all' })
    expect(recs[rootId]?.text ?? '').not.toMatch(/Switch Smelter/)
  })
})
