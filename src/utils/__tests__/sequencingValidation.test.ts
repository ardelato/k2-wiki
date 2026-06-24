/**
 * THROWAWAY PROTOTYPE — Acquisition-sequencing spec validation (2026-06-14).
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Answers the spec's three pre-build "Validation (do before building Phase 1)" checks,
 * by running the proposed forward passive-accrual pass over the all-creatures summon
 * sequence on REAL production primitives (buildPlannerGraph + getPassiveRate):
 *
 *   Q1. Does passive accrual MATERIALLY change the plan? Count requirement items whose
 *       source currently reads passive (defaultMethodId picked a 0-active fabrication/
 *       machine/garden method over an existing gather/craft alternative) but which the
 *       timeline says you'd still ACTIVELY get (effectiveRemaining > 0 at the creature's
 *       backgroundTime). Those are the misleading "Fabrication" labels the spec targets.
 *       If many flip → the timeline is load-bearing; if few → Phase 1 is mostly a relabel.
 *
 *   Q2. Over-delivery check. Independent per-creature accrual credits the SAME shared
 *       fabrication/machine pool to every creature. Compare Σ accrued (independent) to a
 *       single-pool ceiling (rate × totalTimelineTime) per shared item; quantify the
 *       over-count error to decide whether Phase 3 (true allocation) is needed.
 *
 *   Q3. Active-time roll-up sanity. Confirm each creature exposes a stable, non-trivial
 *       per-creature activeTimeSeconds aggregate (root method rollups sum), so
 *       backgroundTime is meaningful.
 *
 * Run (fixture smoke):  npx vitest run src/utils/__tests__/sequencingValidation.test.ts
 * Run (real save):      KOLTERA_SAVE=/abs/path/to/save.json npx vitest run src/utils/__tests__/sequencingValidation.test.ts
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
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig } from '@/utils/save/parseSave'

const PASSIVE_PRODUCER_KINDS = new Set(['fabrication', 'machine', 'garden'])

interface SummonCost {
  id: string
  amount: number
}
interface Creature {
  id: string
  name: string
  tier: number
  summoningCost?: SummonCost[]
}
const CREATURES = creaturesData as Creature[]
const ITEM_NAME = new Map((itemsData as { id: string; name?: string }[]).map((i) => [i.id, i.name]))

async function loadSave(path: string): Promise<Record<string, unknown>> {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return (await decryptSave(text)) as Record<string, unknown>
  }
}

type Graph = ReturnType<typeof buildPlannerGraph>
type Node = Graph['nodesById'][string]

/** Walk a graph following defaultMethodId; visit each reachable node once. */
function walkSelected(graph: Graph, visit: (node: Node) => void) {
  if (!graph.root) return
  const seen = new Set<string>()
  const stack = [graph.root.id]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = graph.nodesById[id]
    if (!node) continue
    visit(node)
    const m = node.defaultMethodId ? graph.methodsById[node.defaultMethodId] : null
    for (const c of m?.children ?? []) stack.push(c.nodeId)
  }
}

test('sequencing validation — passive accrual over the all-creatures summon order', async () => {
  // ---- modifiers from the save (real fabrication/machine config) ----
  const savePath = process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json'
  const raw = await loadSave(savePath)
  const cfg = extractSaveConfig(raw)
  const awakenedCount = cfg.creatures.filter((c) => c.awakened).length
  const goldPerMinute = computeGoldPerMinute(awakenedCount, cfg.awakenGoldLevel, [])
  const mods: PlannerModifiers = {
    gardenFlowers: {},
    awakenGatherUpgrades: cfg.awakenGatherUpgrades,
    awakenSpeedTiers: cfg.awakenSpeedTiers,
    toolSpeedBonuses: {},
    jobTiers: cfg.jobTiers,
    goldPerMinute,
    machineLevels: cfg.machineLevels,
    machineRecipes: cfg.machineRecipes,
    fabricationAllocations: cfg.fabricationAllocations,
    expeditionTier: 5,
  }
  const inv = cfg.inventory

  // Sequence = creatures NOT already owned (the "all-creatures acquisition" backlog).
  const ownedSpecies = new Set(
    (raw.creatures as { species?: string }[] | undefined)?.map((c) => c.species) ?? [],
  )
  const backlog = CREATURES.filter(
    (c) => !ownedSpecies.has(c.id) && (c.summoningCost?.length ?? 0) > 0,
  )

  // Per-creature: active-time rollup (Q3) + readiness (for "most ready" rail order).
  interface Plan {
    creature: Creature
    activeTime: number // Σ root method activeTimeSeconds (the rollup under test, Q3)
    activeKnown: boolean // every root method had a non-null activeTimeSeconds
    readiness: number // fraction of summon ingredients already covered by inventory
    // passive-producer nodes that ALSO have a gather alternative (the symptom candidates)
    symptomNodes: { itemId: string; need: number; passiveRate: number; kind: string }[]
  }
  const plans: Plan[] = []

  for (const creature of backlog) {
    let activeTime = 0
    let activeKnown = true
    let covered = 0
    const symptomNodes: Plan['symptomNodes'] = []
    for (const ing of creature.summoningCost ?? []) {
      // readiness proxy: inventory coverage of the top-level ingredient
      covered += Math.min(1, (inv[ing.id] ?? 0) / ing.amount)
      let graph: Graph
      try {
        graph = buildPlannerGraph(ing.id, ing.amount, inv, mods)
      } catch {
        activeKnown = false
        continue
      }
      if (!graph.root) continue
      const rootMethod = graph.root.defaultMethodId
        ? graph.methodsById[graph.root.defaultMethodId]
        : null
      if (rootMethod?.activeTimeSeconds == null) activeKnown = false
      else activeTime += rootMethod.activeTimeSeconds // rollup already sums children

      walkSelected(graph, (node) => {
        const m = node.defaultMethodId ? graph.methodsById[node.defaultMethodId] : null
        if (!m) return
        const hasGatherAlt = node.methods.some((x) => x.kind === 'gather')
        // Symptom: a passive producer was chosen (0 active time wins) while you COULD gather it.
        if (PASSIVE_PRODUCER_KINDS.has(m.kind) && hasGatherAlt) {
          symptomNodes.push({
            itemId: node.itemId,
            need: node.requiredAmount, // already net of inventory/queue
            passiveRate: getPassiveRate(node.itemId, mods).rate, // items/sec
            kind: m.kind,
          })
        }
      })
    }
    plans.push({
      creature,
      activeTime,
      activeKnown,
      readiness:
        (creature.summoningCost?.length ?? 0) > 0 ? covered / creature.summoningCost!.length : 0,
      symptomNodes,
    })
  }

  // Rail order: "most ready" (highest inventory coverage first), spec's v1 default.
  plans.sort((a, b) => b.readiness - a.readiness || a.creature.tier - b.creature.tier)

  // ===== Q3: active-time roll-up sanity =====
  const activeTimes = plans.map((p) => p.activeTime)
  const knownCount = plans.filter((p) => p.activeKnown).length
  const nonTrivial = activeTimes.filter((t) => t > 0).length
  const totalTimelineTime = activeTimes.reduce((s, t) => s + t, 0)

  // ===== Q1 + Q2: forward accrual pass, two models =====
  //  (A) INDEPENDENT — spec Phase 1 approx: every creature credits the full shared pool.
  //  (B) ALLOCATED  — spec Phase 3 truth: one shared pool, consumed FIFO down the sequence.
  // Comparing the two answers BOTH Q1 (real flip magnitude) and Q2 (allocation error).
  let backgroundTime = 0
  let symptomTotal = 0 // passive-labeled nodes with a gather alternative (the candidates)
  let flippedIndependent = 0 // flips under (A) independent accrual
  let flippedAllocated = 0 // flips under (B) true shared-pool allocation
  let zeroRateNodes = 0 // labeled passive but rate==0 (would NEVER deliver — always a flip)
  const accruedByItem = new Map<string, number>() // Σ independent per-creature accrual
  const rateByItem = new Map<string, number>()
  const flipsByItem = new Map<string, number>() // flips under (B), per item (the real fix)
  // (B) shared-pool ledger: cumulative units this single pool has actually produced/consumed.
  const poolConsumed = new Map<string, number>()

  for (const plan of plans) {
    for (const n of plan.symptomNodes) {
      symptomTotal++
      rateByItem.set(n.itemId, n.passiveRate)
      if (n.passiveRate <= 0) zeroRateNodes++

      // (A) independent: each creature gets rate × its own backgroundTime, ignoring others.
      const accruedIndep = n.passiveRate > 0 ? Math.min(n.need, n.passiveRate * backgroundTime) : 0
      accruedByItem.set(n.itemId, (accruedByItem.get(n.itemId) ?? 0) + accruedIndep)
      if (Math.max(0, n.need - accruedIndep) > 0) flippedIndependent++

      // (B) allocated: one pool, FIFO. Available now = (rate × backgroundTime) − already consumed.
      const produced = n.passiveRate * backgroundTime
      const consumed = poolConsumed.get(n.itemId) ?? 0
      const available = Math.max(0, produced - consumed)
      const accruedAlloc = Math.min(n.need, available)
      poolConsumed.set(n.itemId, consumed + accruedAlloc)
      if (Math.max(0, n.need - accruedAlloc) > 0) {
        flippedAllocated++
        flipsByItem.set(n.itemId, (flipsByItem.get(n.itemId) ?? 0) + 1)
      }
    }
    backgroundTime += plan.activeTime // earlier creatures' active time accrues for later ones
  }
  const stayedPassive = symptomTotal - flippedAllocated

  // Q2: independent-accrual over-delivery vs a single shared-pool ceiling per item.
  const overDelivery: { item: string; accrued: number; ceiling: number; ratio: number }[] = []
  for (const [itemId, accrued] of accruedByItem) {
    const rate = rateByItem.get(itemId) ?? 0
    const ceiling = rate * totalTimelineTime // one pool over the whole horizon
    if (accrued > ceiling + 1e-6) {
      overDelivery.push({
        item: ITEM_NAME.get(itemId) ?? itemId,
        accrued: Math.round(accrued),
        ceiling: Math.round(ceiling),
        ratio: ceiling > 0 ? accrued / ceiling : Infinity,
      })
    }
  }
  overDelivery.sort((a, b) => b.ratio - a.ratio)

  const topFlips = [...flipsByItem.entries()]
    .map(([id, n]) => ({
      item: ITEM_NAME.get(id) ?? id,
      flips: n,
      ratePerMin: +((rateByItem.get(id) ?? 0) * 60).toFixed(2),
    }))
    .sort((a, b) => b.flips - a.flips)
    .slice(0, 15)

  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'n/a')
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }

  const report = {
    save: savePath,
    sequence: {
      backlogCreatures: backlog.length,
      ownedExcluded: ownedSpecies.size,
      order: 'most-ready (inventory coverage desc, then tier)',
      totalTimelineActiveSeconds: Math.round(totalTimelineTime),
      totalTimelineActiveHours: +(totalTimelineTime / 3600).toFixed(1),
    },
    Q3_activeTimeRollup: {
      creaturesWithKnownActiveTime: knownCount,
      ofBacklog: backlog.length,
      knownPct: pct(knownCount, backlog.length),
      creaturesWithNonTrivialActiveTime: nonTrivial,
      medianActiveSecondsPerCreature: Math.round(median(activeTimes)),
      maxActiveSecondsPerCreature: Math.round(Math.max(0, ...activeTimes)),
      verdict:
        knownCount >= backlog.length * 0.8 && median(activeTimes) > 0
          ? 'STABLE + non-trivial — backgroundTime is meaningful'
          : 'SHAKY — rollup missing or trivial; investigate before relying on backgroundTime',
    },
    Q1_doesAccrualChangeThePlan: {
      passiveLabeledWithGatherAlt: symptomTotal,
      flips_independentAccrual_Phase1approx: flippedIndependent,
      flips_independentPct: pct(flippedIndependent, symptomTotal),
      flips_trueAllocation_Phase3: flippedAllocated,
      flips_allocatedPct: pct(flippedAllocated, symptomTotal),
      extraFlipsExposedByAllocation: flippedAllocated - flippedIndependent,
      stayedLegitimatelyPassive_underAllocation: stayedPassive,
      ofWhichRateZero_neverDelivers: zeroRateNodes,
      topFlippedItems_underAllocation: topFlips,
      verdict:
        symptomTotal === 0
          ? 'NO SYMPTOM on this save (likely a starter/empty save — re-run with a real mid/late KOLTERA_SAVE)'
          : flippedAllocated >= symptomTotal * 0.5
            ? `LOAD-BEARING under true allocation (${pct(flippedAllocated, symptomTotal)} flip) — and independent accrual UNDER-flips by ${flippedAllocated - flippedIndependent}, so Phase 1's approximation mislabels real gather work as passive`
            : `Independent accrual flips ${pct(flippedIndependent, symptomTotal)}; true allocation flips ${pct(flippedAllocated, symptomTotal)} (+${flippedAllocated - flippedIndependent}). The relabel is real but allocation-sensitive`,
    },
    Q2_overDelivery: {
      sharedItemsOverCredited: overDelivery.length,
      worst: overDelivery.slice(0, 15),
      note: 'accrued = Σ independent per-creature accrual; ceiling = rate × total timeline active time (one shared pool). ratio >> 1 means independent accrual over-counts → Phase 3 allocation matters.',
      verdict:
        overDelivery.length === 0
          ? 'No over-delivery detected on this save'
          : `${overDelivery.length} shared items over-credited (worst ${overDelivery[0]?.ratio === Infinity ? '∞' : overDelivery[0]?.ratio.toFixed(1)}×) — independent accrual over-delivers; quantify vs Phase 3`,
    },
  }
  // eslint-disable-next-line no-console
  console.log('\n===== SEQUENCING VALIDATION =====\n' + JSON.stringify(report, null, 2))
  expect(backlog.length).toBeGreaterThan(0)
})
