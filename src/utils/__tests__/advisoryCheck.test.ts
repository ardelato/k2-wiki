/** THROWAWAY — end-to-end check that yield-aware gather advisories surface the big lever. */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'
import creaturesData from '@/data/creatures.json'
import { jobActivityIndex } from '@/data/indexes'
import { computeGatherAdvisories, type GatherLeverSaving } from '@/utils/planner/gatherAdvisories'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { JOB_TIER_BENEFITS } from '@/utils/planner/sanctuaryConstants'
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
const perUnitGather = (n: Node) => {
  const x = n.methods.find((m) => m.kind === 'gather')
  return x?.localTimeSeconds != null && n.grossAmount > 0 ? x.localTimeSeconds / n.grossAmount : 0
}

test('yield-aware advisories', async () => {
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

  // collect gatherable items (active + passive-direct with a gather alternative) per job
  const itemJob = new Map<string, string>()
  const gross = new Map<string, number>()
  for (const c of t5)
    for (const ing of c.summoningCost ?? []) {
      let g: Graph
      try {
        g = buildPlannerGraph(ing.id, ing.amount, {}, mods)
      } catch {
        continue
      }
      if (!g.root) continue
      const rootEff = effective(g.root, g)
      if (
        rootEff &&
        ['fabrication', 'machine', 'garden'].includes(rootEff.kind) &&
        perUnitGather(g.root) > 0
      ) {
        gross.set(ing.id, (gross.get(ing.id) ?? 0) + g.root.grossAmount)
        const j = jobActivityIndex.get(ing.id)?.[0]?.jobId
        if (j) itemJob.set(ing.id, j)
      }
      const seen = new Set<string>()
      const st = [g.root.id]
      while (st.length) {
        const id = st.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        const n = g.nodesById[id]
        if (!n) continue
        const eff = effective(n, g)
        if (eff?.kind === 'gather') {
          gross.set(n.itemId, (gross.get(n.itemId) ?? 0) + n.grossAmount)
          const j = jobActivityIndex.get(n.itemId)?.[0]?.jobId
          if (j) itemJob.set(n.itemId, j)
        }
        for (const ch of eff?.children ?? []) st.push(ch.nodeId)
      }
    }

  const perUnitAt = (itemId: string, m: PlannerModifiers) => {
    const g = buildPlannerGraph(itemId, 1000, {}, m)
    const gm = g.root?.methods.find((x) => x.kind === 'gather')
    return gm?.localTimeSeconds != null ? gm.localTimeSeconds / 1000 : 0
  }
  const itemsByJob = new Map<string, { itemId: string; need: number }[]>()
  for (const [itemId, j] of itemJob) {
    const need = Math.max(0, (gross.get(itemId) ?? 0) - (inv[itemId] ?? 0))
    if (need > 0) (itemsByJob.get(j) ?? itemsByJob.set(j, []).get(j)!).push({ itemId, need })
  }
  const nextTier = (cur: number) => {
    const c = JOB_TIER_BENEFITS[cur]
    for (let t = cur + 1; t < JOB_TIER_BENEFITS.length; t++)
      if (
        JOB_TIER_BENEFITS[t].durationReduction > c.durationReduction ||
        JOB_TIER_BENEFITS[t].yieldBonus > c.yieldBonus
      )
        return t
    return null
  }

  const savings: GatherLeverSaving[] = []
  for (const [job, items] of itemsByJob) {
    const aw = mods.awakenGatherUpgrades[job] ?? { durationTier: 0, yieldBonus: 0, xpTier: 0 }
    const sumAt = (m: PlannerModifiers) =>
      items.reduce((s, it) => s + it.need * perUnitAt(it.itemId, m), 0)
    const cur = sumAt(mods)
    const tt = nextTier(mods.jobTiers[job] ?? 0)
    if (tt != null)
      savings.push({
        job,
        lever: 'sanctuary',
        targetTier: tt,
        currentSeconds: cur,
        boostedSeconds: sumAt({ ...mods, jobTiers: { ...mods.jobTiers, [job]: tt } }),
      })
    if ((aw.yieldBonus ?? 0) < 2)
      savings.push({
        job,
        lever: 'awakenYield',
        currentSeconds: cur,
        boostedSeconds: sumAt({
          ...mods,
          awakenGatherUpgrades: {
            ...mods.awakenGatherUpgrades,
            [job]: { ...aw, yieldBonus: (aw.yieldBonus ?? 0) + 1 },
          },
        }),
      })
    if ((aw.durationTier ?? 0) < 4)
      savings.push({
        job,
        lever: 'awakenDuration',
        currentSeconds: cur,
        boostedSeconds: sumAt({
          ...mods,
          awakenGatherUpgrades: {
            ...mods.awakenGatherUpgrades,
            [job]: { ...aw, durationTier: (aw.durationTier ?? 0) + 1 },
          },
        }),
      })
  }

  const advisories = computeGatherAdvisories(savings).map((a) => ({
    ...a,
    savedHours: +(a.timeSavedSeconds / 3600).toFixed(1),
  }))
  // eslint-disable-next-line no-console
  console.log(
    '\n===== YIELD-AWARE ADVISORIES =====\n' +
      JSON.stringify(
        advisories.map((a) => ({
          headline: a.headline,
          detail: a.detail,
          savedHours: a.savedHours,
        })),
        null,
        2,
      ),
  )
  expect(advisories.length).toBeGreaterThan(0)
})
