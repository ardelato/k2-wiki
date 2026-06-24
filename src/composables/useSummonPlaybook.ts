/**
 * useSummonPlaybook — the Action Plan as a per-creature PLAYBOOK.
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Each creature is a container with two action groups:
 *  - SETUP   — config changes to make NOW, carried in from finishing the PREVIOUS
 *              creature: seat that creature in the Sanctuary, spend the awaken point you
 *              just earned, and re-point your helper at this creature's gather. The first
 *              creature has no setup (the current real config is the assumed baseline).
 *  - ACQUIRE — gather the still-needed ingredients, then a link to the Awaken tab to
 *              rush this creature's awakening (so it's ready to deploy for the next one).
 *
 * So Setup(creature N) = the consequences of having summoned + awakened creature N-1.
 *
 * Walks creatures in completion order against a depleting shared pool (accurate "still
 * needs"), evolving the Sanctuary + helper across chapters from live save state.
 *
 * Payoff hours are advisory estimates (gross gather seconds × tier −%); "still needs"
 * counts stay inventory-accurate via buildCompletionQueue.
 */
import { computed, type Ref } from 'vue'

import { useAwakenGoals } from '@/composables/useAwakenGoals'
import {
  buildPlannerGraph,
  usePlannerModifiers,
  type PlannerModifiers,
} from '@/composables/useCraftPlanner'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { jobActivityIndex } from '@/data/indexes'
import type { Creature } from '@/types'
import { itemName } from '@/utils/format/format'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { buildCompletionQueue, type QueueInputCreature } from '@/utils/planner/completionQueue'
import type { GatherAdvisory } from '@/utils/planner/gatherAdvisories'
import { recommendSanctuarySwap, type SanctuarySwapRec } from '@/utils/planner/summonDeployment'
import {
  buildSummonGatherAdvisories,
  computeRemainingEtas,
} from '@/utils/planner/summonGatherAdvisories'
import { calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

type Graph = ReturnType<typeof buildPlannerGraph>
type Node = NonNullable<Graph['root']>

function effectiveMethod(node: Node, graph: Graph) {
  let m = node.defaultMethodId ? graph.methodsById[node.defaultMethodId] : null
  if (m?.kind === 'container') {
    const alt =
      node.methods.find((x) => x.kind === 'gather') ?? node.methods.find((x) => x.kind === 'craft')
    if (alt) m = alt
  }
  return m
}

/** Gross hand-gather seconds per job (Sanctuary duration zeroed). */
function gatherSecondsByJob(
  summoningCost: { id: string; amount: number }[],
  mods: PlannerModifiers,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ing of summoningCost) {
    let graph: Graph
    try {
      graph = buildPlannerGraph(ing.id, ing.amount, {}, mods)
    } catch {
      continue
    }
    if (!graph.root) continue
    const seen = new Set<string>()
    const stack = [graph.root.id]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = graph.nodesById[id]
      if (!node) continue
      const eff = effectiveMethod(node, graph)
      if (eff?.kind === 'gather' && eff.localTimeSeconds && node.requiredAmount > 0) {
        const job = jobActivityIndex.get(node.itemId)?.[0]?.jobId
        if (job) out[job] = (out[job] ?? 0) + eff.localTimeSeconds
      }
      for (const child of eff?.children ?? []) stack.push(child.nodeId)
    }
  }
  return out
}

export interface AcquireItem {
  itemId: string
  itemName: string
  stillNeed: number
  /** Hands-on seconds to gather this ingredient's remaining amount (passive credited). */
  etaSeconds: number
}

/**
 * What a creature contributes to the overall plan once it's summoned AND awakened
 * (awakening is the real prerequisite — a fresh summon can't be seated or set as a
 * helper until then). All fields reference the DOWNSTREAM creatures this one helps; the
 * last creature in the plan has no downstream demand.
 */
export interface AwakenRole {
  /** The creature is in the player's Awaken-plan queue (awaken-planner-queue). */
  inAwakenPlan: boolean
  /** Heaviest remaining downstream gather job — where its earned awaken point is best
   *  spent. Null when no later creature still gathers anything. */
  pointJob: string | null
  /** Job a Sanctuary seat would lift for the downstream creatures, if any. Qualitative:
   *  we surface which job, not a (passive-eroded, double-counted) minute estimate. */
  deploymentJob: string | null
  /** Whether any later creature still has gather demand at all. */
  hasDownstream: boolean
}

/**
 * Pure derivation of a creature's post-summon role from its downstream demand and the
 * Sanctuary-swap recommendation. Side-effect free so it can be unit-tested without the
 * reactive forward pass.
 */
export function deriveAwakenRole(
  beneficiaries: Record<string, number>,
  swap: Pick<SanctuarySwapRec, 'action' | 'improvements'>,
  inAwakenPlan: boolean,
): AwakenRole {
  const downstream = Object.entries(beneficiaries).filter(([, seconds]) => seconds > 0)
  const hasDownstream = downstream.length > 0
  const pointJob = downstream.toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
  let deploymentJob: string | null = null
  if (swap.action === 'add' || swap.action === 'swap') {
    deploymentJob =
      swap.improvements
        .map((imp) => imp.job)
        .toSorted((a, b) => (beneficiaries[b] ?? 0) - (beneficiaries[a] ?? 0))[0] ?? null
  }
  return { inAwakenPlan, pointJob, deploymentJob, hasDownstream }
}

export interface PlaybookChapter {
  creatureId: string
  name: string
  image: string | null
  readiness: number
  fulfilled: number
  total: number
  ready: boolean
  /** Post-summon role: what this creature does for the overall plan once awakened. */
  awakenRole: AwakenRole
  acquire: AcquireItem[]
  /** Hands-on seconds to gather everything this creature still needs (passive credited). */
  etaSeconds: number
  /** Rate-improvement levers for this creature's still-needed gathers (Sanctuary roster
   * swap toward the gather job, awaken nodes), ranked by real gather-time saved. */
  worthALook: GatherAdvisory[]
}

export function useSummonPlaybook(
  selectedCreatures: Ref<Creature[]>,
  // Whether a creature is skill-gate blocked. Threaded in so the completion queue can sink
  // blocked creatures last (matching the rail's "Most ready" sort) instead of ranking them
  // by readiness. The playbook itself has no gate info, so the caller supplies it.
  isBlocked?: (creatureId: string) => boolean,
): {
  chapters: Ref<PlaybookChapter[]>
} {
  const { modifiers } = usePlannerModifiers()
  const gameConfig = useGameConfig()
  const { isOwned, isAwakened, getLevel } = useCreatureCollection()
  const { creatures: allCreatures } = useCreatures()
  const { isInAwakenQueue } = useAwakenGoals()

  const chapters = computed<PlaybookChapter[]>(() => {
    const mods = modifiers.value
    const inv = gameConfig.inventoryAmounts.value
    const baseSanctuary = gameConfig.sanctuaryCreatureIds.value

    // Awaken-point funding for the "Allocate Awaken node" advisories: how many points the
    // player holds and which owned creatures they'd awaken to earn one. Global current
    // state (not simulated forward), shared by every chapter's advisories.
    const awakenFunding = {
      pointsAvailable: inv['awaken-points'] ?? 0,
      ownedUnawakened: allCreatures.value
        .filter((c) => isOwned(c.id) && !isAwakened(c.id))
        .map((c) => ({ id: c.id, name: c.name, level: getLevel(c.id), jobs: c.jobs })),
    }

    const remaining = selectedCreatures.value

    // Gross gather seconds per job (Sanctuary duration zeroed so a tier's −% applies cleanly).
    const grossMods: PlannerModifiers = { ...mods, jobTiers: {} }
    const secondsByCreature = new Map<string, Record<string, number>>()
    for (const c of remaining) {
      secondsByCreature.set(c.id, gatherSecondsByJob(c.summoningCost, grossMods))
    }

    // Completion order + true "still needs" against the depleting shared pool.
    const queueInput: QueueInputCreature[] = remaining.map((c) => ({
      id: c.id,
      name: c.name,
      image: getCreatureImage(c) ?? null,
      blocked: isBlocked?.(c.id) ?? false,
      requirements: c.summoningCost.map((cost) => ({
        itemId: cost.id,
        itemName: itemName(cost.id),
        need: cost.amount,
        have: inv[cost.id] ?? 0,
        sourceLabel: '',
        sourceIcon: null,
      })),
    }))
    const ordered = buildCompletionQueue(queueInput)

    // Suffix demand: gather seconds per job for creatures[k..end] (sets the awaken-point
    // target and which downstream gathers a Sanctuary seat would lift).
    const suffix: Record<string, number>[] = Array.from({ length: ordered.length + 1 }, () => ({}))
    for (let k = ordered.length - 1; k >= 0; k--) {
      const next = { ...suffix[k + 1] }
      const mine = secondsByCreature.get(ordered[k].id) ?? {}
      for (const [job, s] of Object.entries(mine)) next[job] = (next[job] ?? 0) + s
      suffix[k] = next
    }

    // Forward pass — evolve the Sanctuary as the creatures are summoned + awakened,
    // starting from the live roster.
    const sanctuary = [...baseSanctuary]
    const summonedSoFar = new Set<string>()
    // A creature can be slotted if it's owned + awakened now, or summoned earlier in the
    // plan (each summon rushes its awakening, so it's available downstream).
    const canSlot = (id: string) => (isOwned(id) && isAwakened(id)) || summonedSoFar.has(id)

    const remainingChapters = ordered.map<PlaybookChapter>((entry, k) => {
      // "Worth a look" — rate levers for THIS creature's still-needed gathers, measured
      // against the Sanctuary as it stands at this point in the plan (creatures summoned in
      // earlier chapters are already seated; this one is not yet, since you're still
      // gathering for it). Ready creatures have no remaining gather → no advisories.
      const sanctuarySnapshot = [...sanctuary]
      const chapterMods: PlannerModifiers = {
        ...mods,
        jobTiers: calculateJobTiersFromSanctuary(sanctuarySnapshot),
      }
      const remainingNeeds = entry.remaining.map((r) => ({
        id: r.itemId,
        amount: Math.max(0, r.need - r.have),
      }))
      const worthALook = buildSummonGatherAdvisories({
        remaining: remainingNeeds,
        mods: chapterMods,
        sanctuaryIds: sanctuarySnapshot,
        candidates: allCreatures.value,
        isEligible: canSlot,
        awakenFunding,
      })
      const etas = computeRemainingEtas(remainingNeeds, chapterMods)

      // Post-summon role: once THIS creature is summoned + awakened it can be seated / set
      // as a helper to benefit the DOWNSTREAM creatures (suffix[k + 1]). Seat it now in the
      // evolving Sanctuary so later chapters' advisories see it, mirroring the real plan.
      const beneficiaries = suffix[k + 1]
      const neededJobs = new Set(Object.keys(beneficiaries).filter((j) => beneficiaries[j] > 0))
      const swap = recommendSanctuarySwap({
        creatureId: entry.id,
        sanctuaryIds: sanctuary,
        neededJobs,
      })
      const awakenRole = deriveAwakenRole(beneficiaries, swap, isInAwakenQueue(entry.id))
      if (swap.action === 'add') sanctuary.push(entry.id)
      else if (swap.action === 'swap' && swap.benchId) {
        const i = sanctuary.indexOf(swap.benchId)
        if (i >= 0) sanctuary[i] = entry.id
      }

      summonedSoFar.add(entry.id)

      return {
        creatureId: entry.id,
        name: entry.name,
        image: entry.image,
        readiness: entry.readiness,
        fulfilled: entry.fulfilled,
        total: entry.total,
        ready: entry.fulfilled >= entry.total,
        awakenRole,
        acquire: entry.remaining.map((r) => ({
          itemId: r.itemId,
          itemName: r.itemName,
          stillNeed: Math.max(0, r.need - r.have),
          etaSeconds: etas.byItem.get(r.itemId) ?? 0,
        })),
        etaSeconds: etas.totalSeconds,
        worthALook,
      }
    })

    return remainingChapters
  })

  return { chapters }
}
