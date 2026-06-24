/** THROWAWAY — per-creature remaining active work (completion order) on the real save. */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'
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
const effective = (n: Node, g: Graph) => {
  let m = n.defaultMethodId ? g.methodsById[n.defaultMethodId] : null
  if (m?.kind === 'container')
    m = n.methods.find((x) => x.kind === 'gather') ?? n.methods.find((x) => x.kind === 'craft') ?? m
  return m
}

test('per-creature remaining work (completion order)', async () => {
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
  const inv = cfg.inventory // REAL inventory → requiredAmount is what's actually still needed
  const t5 = CREATURES.filter((c) => c.tier === 4 && (c.summoningCost?.length ?? 0) > 0)

  // Per creature: active gather seconds for what it STILL needs (net inventory), and
  // how many of its ingredients are already fully covered.
  const rows = t5.map((c) => {
    let activeSec = 0
    let ingredientsLeft = 0
    const ings = c.summoningCost ?? []
    for (const ing of ings) {
      let g: Graph
      try {
        g = buildPlannerGraph(ing.id, ing.amount, inv, mods)
      } catch {
        continue
      }
      if (!g.root) continue
      if ((g.root.requiredAmount ?? 0) > 0) ingredientsLeft++
      const seen = new Set<string>()
      const st = [g.root.id]
      while (st.length) {
        const id = st.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        const n = g.nodesById[id]
        if (!n) continue
        const eff = effective(n, g)
        if (eff?.kind === 'gather' && eff.localTimeSeconds) activeSec += eff.localTimeSeconds
        for (const ch of eff?.children ?? []) st.push(ch.nodeId)
      }
    }
    return {
      name: c.name,
      ingredients: ings.length,
      ingredientsLeft,
      remainingActiveHours: +(activeSec / 3600).toFixed(1),
    }
  })

  const byClosest = [...rows].sort((a, b) => a.remainingActiveHours - b.remainingActiveHours)
  // eslint-disable-next-line no-console
  console.log(
    '\n===== COMPLETION ORDER (closest first) =====\n' + JSON.stringify(byClosest, null, 2),
  )
  expect(rows.length).toBeGreaterThan(0)
})
