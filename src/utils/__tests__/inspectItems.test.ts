/** THROWAWAY — inspect backpack demand + fish/pineapple method classification. */
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

test('inspect backpack + fish/pineapple', async () => {
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
  const watch = new Set(['backpack', 'rainbow-fish', 'pineapple'])

  // method classification: for each watch item wherever it appears, dump methods.
  const methodInfo: Record<string, unknown> = {}
  // backpack demand provenance: parent item -> gross
  const backpackParents: Record<string, number> = {}

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
        const def = node.defaultMethodId ? g.methodsById[node.defaultMethodId] : null
        if (watch.has(node.itemId) && !methodInfo[node.itemId]) {
          methodInfo[node.itemId] = {
            defaultKind: def?.kind ?? null,
            methods: node.methods.map((m) => ({
              kind: m.kind,
              title: m.title,
              activeTime: m.activeTimeSeconds,
              localTime: m.localTimeSeconds,
              children: (m.children ?? []).map((ch) => ch.itemId),
            })),
            passiveRatePerMin: +(getPassiveRate(node.itemId, mods).rate * 60).toFixed(2),
            grossAmount: node.grossAmount,
          }
        }
        if (node.itemId === 'backpack')
          backpackParents[parent] = (backpackParents[parent] ?? 0) + node.grossAmount
        for (const ch of def?.children ?? []) stack.push({ id: ch.nodeId, parent: node.itemId })
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n===== INSPECT =====\n' + JSON.stringify({ methodInfo, backpackParents }, null, 2))
  expect(selected.length).toBeGreaterThan(0)
})
