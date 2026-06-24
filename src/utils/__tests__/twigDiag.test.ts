/** THROWAWAY DIAGNOSTIC — why are twig/pine-log/elder-log quantities so large? */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import {
  buildPlannerGraph,
  getPassiveRate,
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

test('twig/pine/elder provenance + double-count check', async () => {
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
  const selected = CREATURES.filter((c) => c.tier === 4 && (c.summoningCost?.length ?? 0) > 0)
  const watch = ['twig', 'pine-log', 'elder-log', 'stone']
  const TOOLS = new Set(['hammer', 'saw', 'knife']) // workstation tools (owned, not consumed)

  // direct summon-ingredient demand
  const direct: Record<string, number> = {}
  for (const c of selected)
    for (const ing of c.summoningCost ?? [])
      if (watch.includes(ing.id)) direct[ing.id] = (direct[ing.id] ?? 0) + ing.amount

  // replicate the composable's aggregation, instrumented
  const total: Record<string, number> = {}
  const spurious: Record<string, number> = {} // recorded-as-gather but default != gather
  const parents: Record<string, Record<string, number>> = {} // watch item -> parent item -> amount
  let recordedNonGatherDefault = 0

  for (const c of selected) {
    for (const ing of c.summoningCost ?? []) {
      let g: ReturnType<typeof buildPlannerGraph>
      try {
        g = buildPlannerGraph(ing.id, ing.amount, {}, mods)
      } catch {
        continue
      }
      if (!g.root) continue
      const seen = new Set<string>()
      const stack: { id: string; parent: string }[] = [{ id: g.root.id, parent: ing.id }]
      while (stack.length) {
        const { id, parent } = stack.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        const node = g.nodesById[id]
        if (!node) continue
        if (TOOLS.has(node.itemId)) continue // CORRECTED: tools are owned, skip subtree
        const hasGather = node.methods.some((m) => m.kind === 'gather')
        const def = node.defaultMethodId ? g.methodsById[node.defaultMethodId] : null
        if (hasGather) {
          if (watch.includes(node.itemId)) {
            total[node.itemId] = (total[node.itemId] ?? 0) + node.grossAmount
            ;(parents[node.itemId] ??= {})[parent] =
              (parents[node.itemId]?.[parent] ?? 0) + node.grossAmount
          }
          if (def && def.kind !== 'gather') {
            recordedNonGatherDefault++
            if (watch.includes(node.itemId))
              spurious[node.itemId] = (spurious[node.itemId] ?? 0) + node.grossAmount
          }
        }
        for (const ch of def?.children ?? []) stack.push({ id: ch.nodeId, parent: node.itemId })
      }
    }
  }

  const report = {
    note: 'CURRENT code records a node if it HAS a gather method, then recurses into its DEFAULT method. A node with a gather option but a CRAFT default is counted as gathered AND its craft inputs are counted (double count).',
    watch: watch.map((id) => ({
      item: id,
      totalCountedAsGather: Math.round(total[id] ?? 0),
      directSummonIngredient: direct[id] ?? 0,
      spurious_recordedButCraftedDefault: Math.round(spurious[id] ?? 0),
      topParents: Object.entries(parents[id] ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([p, n]) => `${p}: ${Math.round(n)}`),
    })),
    totalNodesRecordedAsGatherButCraftDefault: recordedNonGatherDefault,
  }
  // eslint-disable-next-line no-console
  console.log('\n===== TWIG DIAG =====\n' + JSON.stringify(report, null, 2))
  expect(selected.length).toBeGreaterThan(0)
  void getPassiveRate
})
