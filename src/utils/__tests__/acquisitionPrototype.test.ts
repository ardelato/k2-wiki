/**
 * THROWAWAY PROTOTYPE (sub-project #3 validation, 2026-06-14).
 * Measures: current greedy method-selection vs. globally-optimal DP, on the
 * SAME per-method costs that production already computes. By reusing
 * buildPlannerGraph's costs, greedy and DP differ ONLY in selection strategy —
 * so the gap is attributable to the algorithm, not to a hand-rolled cost model.
 *
 * Experiments:
 *   A. Symptom    — production default-method mix across all targets; how often
 *                   a container/buy is chosen while a craft/gather alternative exists.
 *   B. Algo gap   — DP-optimal vs production-greedy total cost (SUM composition).
 *   C. Separability — confirm DP-optimal == correct-bottom-up-greedy (proves pure
 *                   DP is NOT the hard part for independent trees).
 *   D. Cost-model — penalize "free" container opens (proxy ∝ amount); count flips.
 *
 * Run: npx vitest run src/utils/__tests__/acquisitionPrototype.test.ts
 */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'
import itemsData from '@/data/items.json'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig } from '@/utils/save/parseSave'

/** Read a save file: plain JSON, or AES-encrypted hex export → decrypt. */
async function loadSave(path: string): Promise<Record<string, unknown>> {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return (await decryptSave(text)) as Record<string, unknown>
  }
}

function emptyModifiers(): PlannerModifiers {
  return {
    gardenFlowers: {},
    awakenGatherUpgrades: {},
    awakenSpeedTiers: {},
    toolSpeedBonuses: {},
    jobTiers: {},
    goldPerMinute: 0,
    machineLevels: {},
    machineRecipes: {},
    fabricationAllocations: {},
    expeditionTier: 1,
  }
}

type Graph = ReturnType<typeof buildPlannerGraph>
type Method = Graph['methodsById'][string]
type Node = Graph['nodesById'][string]

const ALL_ITEM_IDS = (itemsData as { id: string }[]).map((i) => i.id)

/** Local active-time cost of a single method (no children). Production's own number. */
function localCost(m: Method): number {
  return m.localTimeSeconds ?? 0
}

/**
 * Cost of a node under a selection strategy, SUM-composing children (active time
 * is serial). Memoized per (nodeId, strategy). Cycles → 0 (guarded), matching the
 * fact that the planner already breaks them with a cycle method.
 */
function makeCoster(
  graph: Graph,
  pick: (node: Node) => Method | null,
  penalty: (m: Method) => number = () => 0,
) {
  const memo = new Map<string, number>()
  const onStack = new Set<string>()
  function nodeCost(nodeId: string): number {
    if (memo.has(nodeId)) return memo.get(nodeId)!
    if (onStack.has(nodeId)) return 0 // cycle guard
    const node = graph.nodesById[nodeId]
    if (!node) return 0
    onStack.add(nodeId)
    const m = pick(node)
    let cost = 0
    if (m) {
      cost = localCost(m) + penalty(m)
      for (const child of m.children ?? []) cost += nodeCost(child.nodeId)
    }
    onStack.delete(nodeId)
    memo.set(nodeId, cost)
    return cost
  }
  return nodeCost
}

/** Production greedy: follow defaultMethodId. */
function pickGreedy(graph: Graph) {
  return (node: Node): Method | null =>
    node.defaultMethodId ? (graph.methodsById[node.defaultMethodId] ?? null) : null
}

const isCore = (m: Method) => m.kind !== 'buy' // "producible core" — exclude free-buy degeneracy

/** Bottom-up greedy on the SAME additive objective DP uses (should equal DP for trees). */
function pickBottomUpGreedy(graph: Graph, core = false) {
  const best = new Map<string, Method | null>()
  const onStack = new Set<string>()
  const memo = new Map<string, number>()
  function nodeCost(nodeId: string): number {
    if (memo.has(nodeId)) return memo.get(nodeId)!
    if (onStack.has(nodeId)) return 0
    const node = graph.nodesById[nodeId]
    const methods = (node?.methods ?? []).filter((m) => !core || isCore(m))
    if (!node || methods.length === 0) {
      best.set(nodeId, null)
      return 0
    }
    onStack.add(nodeId)
    let bestM: Method | null = null
    let bestC = Infinity
    for (const m of methods) {
      let c = localCost(m)
      for (const child of m.children ?? []) c += nodeCost(child.nodeId)
      if (c < bestC) {
        bestC = c
        bestM = m
      }
    }
    onStack.delete(nodeId)
    best.set(nodeId, bestM)
    memo.set(nodeId, bestC)
    return bestC
  }
  return { resolve: (id: string) => (nodeCost(id), best.get(id) ?? null), nodeCost }
}

/** DP-optimal: argmin over methods of (local + Σ child DP cost). Bottom-up via memo. */
function pickDP(graph: Graph, penalty: (m: Method) => number = () => 0, core = false) {
  const best = new Map<string, Method | null>()
  const onStack = new Set<string>()
  const costMemo = new Map<string, number>()
  function nodeCost(nodeId: string): number {
    if (costMemo.has(nodeId)) return costMemo.get(nodeId)!
    if (onStack.has(nodeId)) return 0
    const node = graph.nodesById[nodeId]
    const methods = (node?.methods ?? []).filter((m) => !core || isCore(m))
    if (!node || methods.length === 0) {
      best.set(nodeId, null)
      return 0
    }
    onStack.add(nodeId)
    let bestM: Method | null = null
    let bestC = Infinity
    for (const m of methods) {
      let c = localCost(m) + penalty(m)
      for (const child of m.children ?? []) c += nodeCost(child.nodeId)
      if (c < bestC) {
        bestC = c
        bestM = m
      }
    }
    onStack.delete(nodeId)
    best.set(nodeId, bestM)
    costMemo.set(nodeId, bestC)
    return bestC
  }
  return { resolve: (nodeId: string) => (nodeCost(nodeId), best.get(nodeId) ?? null), nodeCost }
}

test('acquisition optimizer — DP vs greedy measurement', () => {
  const mods = emptyModifiers()

  // ---- A. Symptom: production default-method mix ----
  const kindCounts: Record<string, number> = {}
  let containerOrBuyOverAlt = 0
  let totalSelected = 0
  let buildable = 0

  // ---- B/C/D accumulators ----
  // Producible core (buy excluded — avoids the gold-free buy degeneracy):
  let prodGreedyTotal = 0 // S1: production's defaultMethodId, graded on active SUM
  let bottomUpGreedyTotal = 0 // S2: greedy on the SAME additive objective
  let dpTotal = 0 // S3: exact DP
  let s2_ne_s3 = 0 // separability check: nodes where bottom-up greedy ≠ DP
  let s1_ne_s3 = 0 // nodes where production greedy ≠ DP
  let nodesCompared = 0
  // Buy degeneracy (buy included, gold free):
  let buyChosenWhenFree = 0
  let buyNodesWithChoice = 0
  const PENALTY_PER_AMOUNT = 0.5 // proxy seconds per unit obtained via container
  let containerFlipsUnderPenalty = 0

  const containerPenalty = (m: Method) =>
    m.kind === 'container' ? (m.requiredAmount ?? 0) * PENALTY_PER_AMOUNT : 0

  for (const targetId of ALL_ITEM_IDS) {
    let graph: Graph
    try {
      graph = buildPlannerGraph(targetId, 1, {}, mods)
    } catch {
      continue
    }
    if (!graph.root) continue
    buildable++

    // A: walk production selection across every node reachable via defaultMethodId
    const greedyPick = pickGreedy(graph)
    const seen = new Set<string>()
    const stack = [graph.root.id]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = graph.nodesById[id]
      if (!node) continue
      const m = greedyPick(node)
      if (!m) continue
      totalSelected++
      kindCounts[m.kind] = (kindCounts[m.kind] ?? 0) + 1
      const hasCraftOrGatherAlt = node.methods.some(
        (x) => x.kind === 'craft' || x.kind === 'gather',
      )
      if ((m.kind === 'container' || m.kind === 'buy') && hasCraftOrGatherAlt)
        containerOrBuyOverAlt++
      for (const c of m.children ?? []) stack.push(c.nodeId)
    }

    // B/C: producible CORE (buy excluded). Three selection strategies, identical
    // active-SUM grading → isolates selection algorithm from the buy degeneracy.
    const dpCore = pickDP(graph, () => 0, true)
    const buGreedyCore = pickBottomUpGreedy(graph, true)
    const prodCoreCost = makeCoster(graph, (n) => {
      const m = greedyPick(n)
      return m && isCore(m) ? m : (n.methods.filter(isCore)[0] ?? null)
    })
    prodGreedyTotal += prodCoreCost(graph.root.id)
    bottomUpGreedyTotal += buGreedyCore.nodeCost(graph.root.id)
    dpTotal += dpCore.nodeCost(graph.root.id)

    for (const id of seen) {
      const node = graph.nodesById[id]
      const coreMethods = (node?.methods ?? []).filter(isCore)
      if (coreMethods.length < 2) continue
      nodesCompared++
      const dPick = dpCore.resolve(id)
      const s2Pick = buGreedyCore.resolve(id)
      const gPick = greedyPick(node)
      const gCore = gPick && isCore(gPick) ? gPick : coreMethods[0]
      if (dPick && s2Pick && dPick.id !== s2Pick.id) s2_ne_s3++
      if (dPick && gCore && dPick.id !== gCore.id) s1_ne_s3++
    }

    // Buy degeneracy: with buy free (gold=0), how often does unconstrained DP pick buy?
    const dpAll = pickDP(graph)
    for (const id of seen) {
      const node = graph.nodesById[id]
      if (!node || node.methods.length < 2) continue
      if (node.methods.some((m) => m.kind === 'buy')) {
        buyNodesWithChoice++
        if (dpAll.resolve(id)?.kind === 'buy') buyChosenWhenFree++
      }
    }

    // D: cost-model — under a nonzero container open penalty, how many core nodes flip off container?
    const dpPen = pickDP(graph, containerPenalty, true)
    for (const id of seen) {
      const node = graph.nodesById[id]
      if (!node || node.methods.filter(isCore).length < 2) continue
      const before = dpCore.resolve(id)
      const after = dpPen.resolve(id)
      if (before?.kind === 'container' && after && after.kind !== 'container')
        containerFlipsUnderPenalty++
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'n/a')
  const report = {
    A_symptom: {
      buildableTargets: buildable,
      totalSelectedNodes: totalSelected,
      selectionMix: kindCounts,
      containerOrBuyChosenWithCraftGatherAlt: containerOrBuyOverAlt,
      asPctOfSelected: pct(containerOrBuyOverAlt, totalSelected),
    },
    B_algorithmGap_producibleCore: {
      note: 'buy excluded to avoid gold-free degeneracy; all graded on active-time SUM',
      S1_productionGreedyCost: Math.round(prodGreedyTotal),
      S2_bottomUpGreedyCost: Math.round(bottomUpGreedyTotal),
      S3_dpOptimalCost: Math.round(dpTotal),
      S1_vs_S3_improvement: pct(prodGreedyTotal - dpTotal, prodGreedyTotal),
      nodesWhereProdGreedy_ne_DP: s1_ne_s3,
      nodesWhereBottomUpGreedy_ne_DP: s2_ne_s3,
      ofCoreNodesWithChoice: nodesCompared,
    },
    C_separability: {
      claim:
        'If S2 (bottom-up greedy) == S3 (DP), the separable core needs NO search — a correct greedy on the right objective is optimal.',
      bottomUpGreedyEqualsDP: s2_ne_s3 === 0,
      gapBetweenThem: pct(Math.abs(bottomUpGreedyTotal - dpTotal), dpTotal),
    },
    BUY_degeneracy: {
      note: 'gold free (goldPerMinute=0) → buy localCost=0. Confirms active-time needs a gold/passive-capacity constraint.',
      buyChosenWhenFree,
      ofBuyableNodesWithChoice: buyNodesWithChoice,
      asPct: pct(buyChosenWhenFree, buyNodesWithChoice),
    },
    D_costModel: {
      containerSelectionsThatFlipUnderOpenPenalty: containerFlipsUnderPenalty,
      penaltyPerUnit: PENALTY_PER_AMOUNT,
      note: 'proxy ∝ amount; shows container choice is sensitive to costing opens (Tier 1).',
    },
  }
  // eslint-disable-next-line no-console
  console.log(
    '\n===== ACQUISITION DP-vs-GREEDY PROTOTYPE =====\n' + JSON.stringify(report, null, 2),
  )
  expect(buildable).toBeGreaterThan(0)
})

test('acquisition optimizer — REAL SAVE (configured gold + inventory)', async () => {
  const savePath = process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json'
  const raw = await loadSave(savePath)
  const cfg = extractSaveConfig(raw)
  const awakenedCount = cfg.creatures.filter((c) => c.awakened).length
  const goldPerMinute = computeGoldPerMinute(awakenedCount, cfg.awakenGoldLevel, [])

  // Faithful real modifiers. CAVEATS: gardenFlowers + toolSpeedBonuses omitted
  // (planner-derived, affect time magnitude not buy/produce selection materially).
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

  const kindCounts: Record<string, number> = {}
  let totalSelected = 0
  let containerOrBuyOverAlt = 0
  let buyChosen = 0
  let containerChosen = 0
  let prodGreedyTotal = 0
  let dpCoreTotal = 0
  let s1_ne_s3 = 0
  let nodesCompared = 0
  const dpAllMix: Record<string, number> = {} // DP with buy graded (not free) — does it still flood buy?
  let dpBuyNodes = 0
  let dpBuyableWithChoice = 0

  for (const t of itemsData as { id: string }[]) {
    let graph: ReturnType<typeof buildPlannerGraph>
    try {
      graph = buildPlannerGraph(t.id, 1, inv, mods)
    } catch {
      continue
    }
    if (!graph.root) continue
    const greedyPick = (n: (typeof graph.nodesById)[string]) =>
      n.defaultMethodId ? (graph.methodsById[n.defaultMethodId] ?? null) : null

    const seen = new Set<string>()
    const stack = [graph.root.id]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = graph.nodesById[id]
      if (!node) continue
      const m = greedyPick(node)
      if (!m) continue
      totalSelected++
      kindCounts[m.kind] = (kindCounts[m.kind] ?? 0) + 1
      if (m.kind === 'buy') buyChosen++
      if (m.kind === 'container') containerChosen++
      const hasCraftGather = node.methods.some((x) => x.kind === 'craft' || x.kind === 'gather')
      if ((m.kind === 'buy' || m.kind === 'container') && hasCraftGather) containerOrBuyOverAlt++
      for (const c of m.children ?? []) stack.push(c.nodeId)
    }

    // greedy vs DP on producible core (buy excluded), active SUM
    const dpCore = pickDP(graph, () => 0, true)
    const prodCoreCost = makeCoster(graph, (n) => {
      const m = greedyPick(n)
      return m && isCore(m) ? m : (n.methods.filter(isCore)[0] ?? null)
    })
    prodGreedyTotal += prodCoreCost(graph.root.id)
    dpCoreTotal += dpCore.nodeCost(graph.root.id)

    // DP with buy graded by REAL gold cost — selection mix (is buy still dominant?)
    const dpAll = pickDP(graph)
    for (const id of seen) {
      const node = graph.nodesById[id]
      if (!node || node.methods.length < 2) continue
      const dPick = dpAll.resolve(id)
      if (dPick) dpAllMix[dPick.kind] = (dpAllMix[dPick.kind] ?? 0) + 1
      if (node.methods.some((m) => m.kind === 'buy')) {
        dpBuyableWithChoice++
        if (dPick?.kind === 'buy') dpBuyNodes++
      }
      if (node.methods.filter(isCore).length >= 2) {
        nodesCompared++
        const g = greedyPick(node)
        const gCore = g && isCore(g) ? g : node.methods.filter(isCore)[0]
        const d = dpCore.resolve(id)
        if (d && gCore && d.id !== gCore.id) s1_ne_s3++
      }
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'n/a')
  const report = {
    save: savePath,
    realInputs: {
      goldPerMinute,
      awakenedCount,
      awakenGoldLevel: cfg.awakenGoldLevel,
      inventoryItems: Object.keys(inv).length,
      jobTiers: Object.keys(cfg.jobTiers).length,
      machinesWithRecipe: Object.values(cfg.machineRecipes).filter(Boolean).length,
      fabricationAllocations: Object.keys(cfg.fabricationAllocations).length,
    },
    A_productionSelectionMix: {
      totalSelectedNodes: totalSelected,
      mix: kindCounts,
      buyChosen,
      containerChosen,
      buyOrContainerOverCraftGatherAlt: containerOrBuyOverAlt,
      asPct: pct(containerOrBuyOverAlt, totalSelected),
    },
    B_greedyVsDP_core: {
      prodGreedyCost: Math.round(prodGreedyTotal),
      dpOptimalCost: Math.round(dpCoreTotal),
      improvement: pct(prodGreedyTotal - dpCoreTotal, prodGreedyTotal),
      nodesProdGreedy_ne_DP: s1_ne_s3,
      ofCoreNodesWithChoice: nodesCompared,
    },
    BUY_underRealGold: {
      note: 'buy now graded by real gold cost, not free',
      dpChoseBuy: dpBuyNodes,
      ofBuyableNodesWithChoice: dpBuyableWithChoice,
      asPct: pct(dpBuyNodes, dpBuyableWithChoice),
      dpFullMix: dpAllMix,
    },
  }
  // eslint-disable-next-line no-console
  console.log('\n===== ACQUISITION REAL-SAVE =====\n' + JSON.stringify(report, null, 2))
  expect(totalSelected).toBeGreaterThan(0)
})
