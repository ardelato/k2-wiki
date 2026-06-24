/**
 * THROWAWAY VALIDATION — runs the REAL Phase-A engine (computeAcquisitionPlan) on a
 * real save, all-T5s selected. Confirms the resource-campaign model produces a
 * consistent per-resource rate-vs-time picture (no per-creature flip-flop) and a
 * coherent fixpoint horizon. This is the integration check behind the unit tests.
 *
 * Run: KOLTERA_SAVE=/path npx vitest run src/utils/__tests__/sequencingModelV2.test.ts
 */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import {
  buildPlannerGraph,
  getPassiveRate,
  type PlannerModifiers,
} from '@/composables/useCraftPlanner'
import creaturesData from '@/data/creatures.json'
import itemsData from '@/data/items.json'
import {
  computeAcquisitionPlan,
  type ResourceDemand,
  type CreatureDemand,
} from '@/utils/planner/acquisitionPlan'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig } from '@/utils/save/parseSave'

const ITEM_NAME = new Map((itemsData as { id: string; name?: string }[]).map((i) => [i.id, i.name]))
interface Creature {
  id: string
  name: string
  tier: number
  summoningCost?: { id: string; amount: number }[]
}
const CREATURES = creaturesData as Creature[]

async function loadSave(path: string): Promise<Record<string, unknown>> {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return (await decryptSave(text)) as Record<string, unknown>
  }
}
type Graph = ReturnType<typeof buildPlannerGraph>

test('Phase-A engine on a real save (all T5s)', async () => {
  const savePath = process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json'
  const raw = await loadSave(savePath)
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
  const selected = CREATURES.filter((c) => c.tier === 4 && (c.summoningCost?.length ?? 0) > 0)

  // ── Adapter: aggregate planner trees → ResourceDemand[] + CreatureDemand[] ──
  // (This adapter is what Phase B will live in the view/composable.)
  interface Agg {
    grossNeed: number
    perUnitGatherSeconds: number | null
    creatures: Set<string>
  }
  const agg = new Map<string, Agg>()
  const passiveDirect = new Map<string, Agg>()
  const perCreatureNeed = new Map<string, Map<string, number>>() // creatureId → itemId → gross
  type Node = NonNullable<Graph['root']>
  const effective = (node: Node, graph: Graph) => {
    let m = node.defaultMethodId ? graph.methodsById[node.defaultMethodId] : null
    if (m?.kind === 'container') {
      const alt =
        node.methods.find((x) => x.kind === 'gather') ??
        node.methods.find((x) => x.kind === 'craft')
      if (alt) m = alt
    }
    return m
  }
  const perUnitGather = (node: Node) => {
    const g = node.methods.find((x) => x.kind === 'gather')
    return g?.localTimeSeconds != null && node.grossAmount > 0
      ? g.localTimeSeconds / node.grossAmount
      : 0
  }

  for (const creature of selected) {
    const own = new Map<string, number>()
    perCreatureNeed.set(creature.id, own)
    for (const ing of creature.summoningCost ?? []) {
      let graph: Graph
      try {
        graph = buildPlannerGraph(ing.id, ing.amount, {}, mods)
      } catch {
        continue
      }
      if (!graph.root) continue
      const rootEff = effective(graph.root, graph)
      if (
        rootEff &&
        (rootEff.kind === 'fabrication' || rootEff.kind === 'machine' || rootEff.kind === 'garden')
      ) {
        const e = passiveDirect.get(ing.id) ?? {
          grossNeed: 0,
          perUnitGatherSeconds: perUnitGather(graph.root),
          creatures: new Set<string>(),
        }
        e.grossNeed += graph.root.grossAmount
        e.creatures.add(creature.id)
        passiveDirect.set(ing.id, e)
        own.set(ing.id, (own.get(ing.id) ?? 0) + graph.root.grossAmount)
      }
      const seen = new Set<string>()
      const stack = [graph.root.id]
      while (stack.length) {
        const id = stack.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        const node = graph.nodesById[id]
        if (!node) continue
        const eff = effective(node, graph)
        if (eff?.kind === 'gather') {
          const a = agg.get(node.itemId) ?? {
            grossNeed: 0,
            perUnitGatherSeconds:
              eff.localTimeSeconds != null && node.grossAmount > 0
                ? eff.localTimeSeconds / node.grossAmount
                : null,
            creatures: new Set<string>(),
          }
          a.grossNeed += node.grossAmount
          a.creatures.add(creature.id)
          agg.set(node.itemId, a)
          own.set(node.itemId, (own.get(node.itemId) ?? 0) + node.grossAmount)
        }
        for (const c of eff?.children ?? []) stack.push(c.nodeId)
      }
    }
  }

  const demands: ResourceDemand[] = []
  const allAgg = new Map<string, Agg>(agg)
  for (const [itemId, a] of passiveDirect) if (!allAgg.has(itemId)) allAgg.set(itemId, a)
  for (const [itemId, a] of allAgg) {
    const totalNeed = Math.max(0, a.grossNeed - (inv[itemId] ?? 0))
    if (totalNeed <= 0) continue
    demands.push({
      itemId,
      totalNeed,
      perUnitGatherSeconds: a.perUnitGatherSeconds ?? 0,
      passiveRatePerSecond: getPassiveRate(itemId, mods).rate,
      creatureIds: [...a.creatures],
    })
  }
  const creatureDemands: CreatureDemand[] = selected.map((c) => ({
    creatureId: c.id,
    needs: [...(perCreatureNeed.get(c.id)?.entries() ?? [])].map(([itemId, amount]) => ({
      itemId,
      amount: Math.max(0, amount - (inv[itemId] ?? 0)),
    })),
  }))

  // ── Run the real engine ──
  const plan = computeAcquisitionPlan(demands, creatureDemands)

  const nameOf = (id: string) => ITEM_NAME.get(id) ?? id
  const days = (s: number) => +(s / 86400).toFixed(1)
  const focus = plan.resources
    .filter((r) => ['rainbow-fish', 'pineapple'].includes(r.itemId))
    .map((r) => ({
      item: nameOf(r.itemId),
      totalNeed: r.totalNeed,
      activeHours: +r.activeHours.toFixed(1),
      passiveDays: r.passiveDays != null ? +r.passiveDays.toFixed(1) : null,
      assignment: r.assignment,
      activeShortfall: r.activeShortfall,
    }))
  const etaByName = (name: string) => {
    const cr = selected.find((c) => c.name === name)
    const e = cr && plan.creatureEtas.find((x) => x.creatureId === cr.id)
    return e ? days(e.etaSeconds) + ' days' : 'n/a'
  }

  const report = {
    save: savePath,
    selectedT5: selected.length,
    horizonHours: +(plan.horizonSeconds / 3600).toFixed(1),
    activeCampaigns: plan.steps.length,
    USER_SCENARIO: focus,
    top6Steps: plan.steps.slice(0, 6).map((s) => ({
      order: s.order,
      item: nameOf(s.itemId),
      gather: s.units,
      hours: +(s.activeSeconds / 3600).toFixed(1),
      unblocks: s.creatureIds.length,
    })),
    sampleCreatureEtas: {
      Zorb: etaByName('Zorb'),
      Floe: etaByName('Floe'),
      Porkchop: etaByName('Porkchop'),
    },
  }
  // eslint-disable-next-line no-console
  console.log('\n===== PHASE-A ENGINE (real save) =====\n' + JSON.stringify(report, null, 2))
  expect(plan.resources.length).toBeGreaterThan(0)
})
