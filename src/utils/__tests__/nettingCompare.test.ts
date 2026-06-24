/** THROWAWAY — old (gross, top-level net) vs new (inventory-budgeted) gather demand. */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import {
  buildPlannerGraph,
  computeInventoryBudgets,
  type PlannerModifiers,
} from '@/composables/useCraftPlanner'
import creaturesData from '@/data/creatures.json'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig } from '@/utils/save/parseSave'

interface Cr {
  id: string
  name: string
  tier: number
  summoningCost?: { id: string; amount: number }[]
}
const CREATURES = creaturesData as Cr[]
async function loadSave(p: string) {
  const t = readFileSync(p, 'utf-8')
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    return (await decryptSave(t)) as Record<string, unknown>
  }
}
type Graph = ReturnType<typeof buildPlannerGraph>
type Node = NonNullable<Graph['root']>
const eff = (n: Node, g: Graph) => {
  let m = n.defaultMethodId ? g.methodsById[n.defaultMethodId] : null
  if (m?.kind === 'container')
    m = n.methods.find((x) => x.kind === 'gather') ?? n.methods.find((x) => x.kind === 'craft') ?? m
  return m
}

test('netting comparison', async () => {
  const raw = await loadSave(process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json')
  const cfg = extractSaveConfig(raw)
  const mods: PlannerModifiers = {
    gardenFlowers: {},
    awakenGatherUpgrades: cfg.awakenGatherUpgrades,
    awakenSpeedTiers: cfg.awakenSpeedTiers,
    toolSpeedBonuses: {},
    jobTiers: cfg.jobTiers,
    goldPerMinute: computeGoldPerMinute(
      cfg.creatures.filter((c) => c.awakened).length,
      cfg.awakenGoldLevel,
      [],
    ),
    machineLevels: cfg.machineLevels,
    machineRecipes: cfg.machineRecipes,
    fabricationAllocations: cfg.fabricationAllocations,
    expeditionTier: 5,
  }
  const inv = cfg.inventory
  const t5 = CREATURES.filter((c) => c.tier === 4 && (c.summoningCost?.length ?? 0) > 0)

  // OLD: per-creature, {} inventory (gross), net only top-level.
  let oldHours = 0
  const oldAgg = new Map<string, number>()
  for (const c of t5)
    for (const ing of c.summoningCost ?? []) {
      let g: Graph
      try {
        g = buildPlannerGraph(ing.id, ing.amount, {}, mods)
      } catch {
        continue
      }
      if (!g.root) continue
      const seen = new Set<string>()
      const st = [g.root.id]
      while (st.length) {
        const id = st.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        const n = g.nodesById[id]
        if (!n) continue
        const e = eff(n, g)
        if (e?.kind === 'gather' && e.localTimeSeconds)
          oldAgg.set(n.itemId, (oldAgg.get(n.itemId) ?? 0) + e.localTimeSeconds)
        for (const ch of e?.children ?? []) st.push(ch.nodeId)
      }
    }
  for (const v of oldAgg.values()) oldHours += v
  oldHours /= 3600

  // NEW: aggregate bill + inventory budgets (nets intermediates, no double-credit).
  const targetQty = new Map<string, number>()
  for (const c of t5)
    for (const ing of c.summoningCost ?? [])
      targetQty.set(ing.id, (targetQty.get(ing.id) ?? 0) + ing.amount)
  const targets = [...targetQty].map(([itemId, quantity]) => ({ itemId, quantity }))
  const budgets = computeInventoryBudgets(targets, inv, mods)
  let newHours = 0
  for (const { itemId, quantity } of targets) {
    let g: Graph
    try {
      g = buildPlannerGraph(itemId, quantity, budgets[itemId] ?? {}, mods)
    } catch {
      continue
    }
    if (!g.root) continue
    const seen = new Set<string>()
    const st = [g.root.id]
    while (st.length) {
      const id = st.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const n = g.nodesById[id]
      if (!n) continue
      const e = eff(n, g)
      if (e?.kind === 'gather' && e.localTimeSeconds && n.requiredAmount > 0)
        newHours += e.localTimeSeconds
      for (const ch of e?.children ?? []) st.push(ch.nodeId)
    }
  }
  newHours /= 3600

  // eslint-disable-next-line no-console
  console.log(
    '\n===== NETTING COMPARE =====\n' +
      JSON.stringify(
        {
          oldGatherHours_grossTopLevelNet: +oldHours.toFixed(1),
          newGatherHours_inventoryBudgeted: +newHours.toFixed(1),
          note: 'new should be ≤ old: held inventory (incl. intermediates) now credited.',
        },
        null,
        2,
      ),
  )
  expect(newHours).toBeLessThanOrEqual(oldHours + 0.1)
})
