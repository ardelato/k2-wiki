/**
 * THROWAWAY VALIDATION — does front-loading job-talented creatures (summon → awaken →
 * Sanctuary → faster gathering) materially beat the naive static-Sanctuary order?
 * Spec question raised 2026-06-14. Real save, fishing (Zorb/Floe) + farming (Porkchop).
 */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'
import creaturesData from '@/data/creatures.json'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { JOB_TIER_BENEFITS } from '@/utils/planner/sanctuaryConstants'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig, calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

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

test('compounding payoff: front-loaded fishing/farming vs static sanctuary', async () => {
  const raw = await loadSave(process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json')
  const cfg = extractSaveConfig(raw)
  const baseMods: PlannerModifiers = {
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
  // FULL collection: every not-owned creature, so per-unit cuts apply to the long-run volume.
  const ownedSpecies = new Set(
    (raw.creatures as { species?: string }[] | undefined)?.map((c) => c.species) ?? [],
  )
  const backlog = CREATURES.filter(
    (c) => !ownedSpecies.has(c.id) && (c.summoningCost?.length ?? 0) > 0,
  )

  // per-unit active gather seconds at a given Sanctuary tier + awaken upgrade for the job.
  // (Models BOTH levers: duration reduction AND yield bonus — yield reduces action count.)
  function perUnitGather(
    itemId: string,
    job: string,
    jobTier: number,
    awaken?: { durationTier: number; yieldBonus: number },
  ): number {
    const mods: PlannerModifiers = {
      ...baseMods,
      jobTiers: { ...baseMods.jobTiers, [job]: jobTier },
      awakenGatherUpgrades: awaken
        ? { ...baseMods.awakenGatherUpgrades, [job]: { ...awaken, xpTier: 0 } }
        : baseMods.awakenGatherUpgrades,
    }
    const g = buildPlannerGraph(itemId, 1000, {}, mods)
    const gm = g.root?.methods.find((m) => m.kind === 'gather')
    return gm?.localTimeSeconds != null ? gm.localTimeSeconds / 1000 : NaN
  }

  function analyze(itemId: string, job: string) {
    // FULL long-run volume: every not-owned creature that needs this item.
    const needers = backlog.filter((c) => (c.summoningCost ?? []).some((s) => s.id === itemId))
    const gross = needers.reduce(
      (s, c) => s + ((c.summoningCost ?? []).find((x) => x.id === itemId)?.amount ?? 0),
      0,
    )
    const totalNeed = Math.max(0, gross - (inv[itemId] ?? 0))

    const curTier = calculateJobTiersFromSanctuary(cfg.sanctuary)[job] ?? 0
    const curAwaken = baseMods.awakenGatherUpgrades[job] ?? { durationTier: 0, yieldBonus: 0 }
    const MAX_AWAKEN = { durationTier: 4, yieldBonus: 2 } // fully-funded by accumulated awaken points

    const hrs = (perUnit: number) => +((totalNeed * perUnit) / 3600).toFixed(1)
    const t0 = perUnitGather(itemId, job, curTier)
    const configs = {
      current: t0,
      sanctuaryTier2: perUnitGather(itemId, job, 2),
      sanctuaryTier5_yield: perUnitGather(itemId, job, 5),
      awakenMaxed: perUnitGather(itemId, job, curTier, MAX_AWAKEN),
      bothMaxed: perUnitGather(itemId, job, 5, MAX_AWAKEN),
    }
    const save = (perUnit: number) => +((totalNeed * (t0 - perUnit)) / 3600).toFixed(1)

    return {
      item: itemId,
      job,
      longRunNeeders: needers.length,
      totalNeed,
      currentTier: curTier,
      currentAwaken: curAwaken,
      perUnit_s: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, +v.toFixed(2)])),
      activeHours: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, hrs(v)])),
      hoursSavedVsCurrent: {
        sanctuaryTier2: save(configs.sanctuaryTier2),
        sanctuaryTier5_yield: save(configs.sanctuaryTier5_yield),
        awakenMaxed: save(configs.awakenMaxed),
        bothMaxed: save(configs.bothMaxed),
      },
    }
  }

  const report = {
    save: process.env.KOLTERA_SAVE ? 'real' : 'fixture',
    backlogCreatures: backlog.length,
    note: 'Long-run, full-collection volume. bothMaxed = Sanctuary tier 5 (+yield) AND awaken duration tier 4 + yield 2 — the end-state once many creatures are awakened. Shows the upper-bound prize.',
    durationReductionByTier: JOB_TIER_BENEFITS.map((b) => b.durationReduction + '%'),
    fishing_rainbowFish: analyze('rainbow-fish', 'Fishing'),
    farming_pineapple: analyze('pineapple', 'Farming'),
  }
  // eslint-disable-next-line no-console
  console.log('\n===== COMPOUNDING PAYOFF (long-run) =====\n' + JSON.stringify(report, null, 2))
  expect(backlog.length).toBeGreaterThan(0)
})
