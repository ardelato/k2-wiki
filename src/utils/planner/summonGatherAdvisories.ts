/**
 * Per-creature gather-rate advisories for the Summoning Action plan.
 *
 * Given a creature's still-needed ingredients, this walks the planner graphs to find
 * the gather volume per job, then prices the rate levers (Sanctuary tier, awaken yield,
 * awaken duration) by the REAL gather-time saved across that volume, scoped to one
 * creature. The Sanctuary lever additionally carries the concrete roster swap
 * (recommendPartyForJob + buildSanctuaryDiff) so the UI can show "change out your
 * Sanctuary party to target Fishing".
 */
import {
  buildPlannerGraph,
  getPassiveRate,
  type PlannerModifiers,
} from '@/composables/useCraftPlanner'
import { jobActivityIndex } from '@/data/indexes'
import { awakenPrerequisiteClosure, awakenUnlockCost } from '@/data/upgrades'
import type { AwakenGatherUpgrade } from '@/types'
import { itemName } from '@/utils/format/format'
import { PRE_AWAKEN_MAX } from '@/utils/formulas'
import { computeAcquisitionPlan, type ResourceDemand } from '@/utils/planner/acquisitionPlan'
import {
  computeGatherAdvisories,
  type GatherAdvisory,
  type GatherLeverSaving,
} from '@/utils/planner/gatherAdvisories'
import {
  JOB_TIER_BENEFITS,
  MAX_SANCTUARY_SLOTS,
  TIER_THRESHOLDS_RAW,
} from '@/utils/planner/sanctuaryConstants'
import { buildSanctuaryDiff, recommendPartyForJob } from '@/utils/planner/skillAdvisories'
import { calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

type Graph = ReturnType<typeof buildPlannerGraph>
type Node = NonNullable<Graph['root']>

/** A single gatherable resource and the volume of it this plan needs by hand. */
export interface JobVolume {
  itemId: string
  need: number
}

// The method the player would actually use. Container is a costing gap: when an item is
// also gatherable/craftable, don't route through opening containers.
function effectiveMethod(node: Node, graph: Graph) {
  let m = node.defaultMethodId ? graph.methodsById[node.defaultMethodId] : null
  if (m?.kind === 'container') {
    const alt =
      node.methods.find((x) => x.kind === 'gather') ?? node.methods.find((x) => x.kind === 'craft')
    if (alt) m = alt
  }
  return m
}

/** Per-unit active gather seconds for an item at the given modifiers. */
function perUnitAt(itemId: string, mods: PlannerModifiers): number {
  const g = buildPlannerGraph(itemId, 1000, {}, mods)
  const gm = g.root?.methods.find((x) => x.kind === 'gather')
  return gm?.localTimeSeconds != null ? gm.localTimeSeconds / 1000 : 0
}

/** Next Sanctuary tier above `cur` that actually improves duration or yield. */
function nextBeneficialTier(cur: number): number | null {
  const c = JOB_TIER_BENEFITS[cur]
  for (let t = cur + 1; t < JOB_TIER_BENEFITS.length; t++) {
    const b = JOB_TIER_BENEFITS[t]
    if (b.durationReduction > c.durationReduction || b.yieldBonus > c.yieldBonus) return t
  }
  return null
}

export interface GatherVolumes {
  /** Capitalized job name → the resources gathered for it (aggregated per item). */
  itemsByJob: Map<string, JobVolume[]>
  /** Capitalized job name → the TOP-LEVEL need ids whose tree uses that job. This is the
   * parent attribution: Exploring's gather (hide) traces back to the "carrot-cake" need. */
  parentsByJob: Map<string, Set<string>>
}

/** Walk the planner graphs for a set of needs; collect the by-hand gather volume per job and
 * remember which top-level need each job's gather serves (so advisories can name the parent). */
export function walkGatherVolumes(
  needs: { id: string; amount: number }[],
  mods: PlannerModifiers,
): GatherVolumes {
  const perItem = new Map<string, { job: string; need: number }>()
  const parentsByJob = new Map<string, Set<string>>()
  const noteParent = (job: string, parentId: string) => {
    ;(parentsByJob.get(job) ?? parentsByJob.set(job, new Set()).get(job)!).add(parentId)
  }
  for (const need of needs) {
    if (need.amount <= 0) continue
    let graph: Graph
    try {
      graph = buildPlannerGraph(need.id, need.amount, {}, mods)
    } catch {
      continue
    }
    if (!graph.root) continue

    // A top-level ingredient produced passively (fabrication / machine / garden) still has a
    // gather alternative — so the gather job's rate matters for the shortfall you hand-gather.
    // Record it by its gather alternative, mirroring useAcquisitionPlan's passiveDirect branch.
    const rootEff = effectiveMethod(graph.root, graph)
    if (
      rootEff &&
      (rootEff.kind === 'fabrication' || rootEff.kind === 'machine' || rootEff.kind === 'garden') &&
      graph.root.requiredAmount > 0 &&
      graph.root.methods.some((x) => x.kind === 'gather')
    ) {
      const job = jobActivityIndex.get(graph.root.itemId)?.[0]?.jobId
      if (job) {
        const e = perItem.get(graph.root.itemId) ?? { job, need: 0 }
        e.need += graph.root.requiredAmount
        perItem.set(graph.root.itemId, e)
        noteParent(job, need.id)
      }
    }

    const seen = new Set<string>()
    const stack = [graph.root.id]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = graph.nodesById[id]
      if (!node) continue
      const eff = effectiveMethod(node, graph)
      if (eff?.kind === 'gather' && node.requiredAmount > 0) {
        const job = jobActivityIndex.get(node.itemId)?.[0]?.jobId
        if (job) {
          const e = perItem.get(node.itemId) ?? { job, need: 0 }
          e.need += node.requiredAmount
          perItem.set(node.itemId, e)
          noteParent(job, need.id)
        }
      }
      for (const child of eff?.children ?? []) stack.push(child.nodeId)
    }
  }
  const itemsByJob = new Map<string, JobVolume[]>()
  for (const [itemId, { job, need }] of perItem) {
    ;(itemsByJob.get(job) ?? itemsByJob.set(job, []).get(job)!).push({ itemId, need })
  }
  return { itemsByJob, parentsByJob }
}

/** Per-job gather volumes only (parent attribution dropped). */
export function gatherVolumesByJob(
  needs: { id: string; amount: number }[],
  mods: PlannerModifiers,
): Map<string, JobVolume[]> {
  return walkGatherVolumes(needs, mods).itemsByJob
}

export interface GatherSavingsOptions {
  /** Resolve the Sanctuary tier this lever targets for `job` (currently at `currentTier`).
   * Return null to omit the Sanctuary lever. Defaults to the next beneficial tier. */
  resolveSanctuaryTarget?: (job: string, currentTier: number) => number | null
}

/** Awaken node ids use roman numerals (upgrades.ts): index 0 = tier I, …. The next node to
 * buy for a lever sits at the current tier count. */
const AWAKEN_ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi']

/** What it costs to fund an awaken node and how to earn the point — the same data the
 * Skill Planner surfaces, scoped to the Summon plan. Supplied by the playbook. */
export interface AwakenFundingContext {
  /** Unspent Awaken Points the player holds. */
  pointsAvailable: number
  /** Owned, not-yet-awakened creatures — awakening any one earns +1 point. */
  ownedUnawakened: { id: string; name: string; level: number; jobs?: Record<string, number> }[]
}

/** Awaken nodes already allocated for a gathering job, closed over prerequisites — so the
 * next node is priced by its true unowned cost (node + any unowned prereq chain). */
function allocatedGatherNodes(job: string, up: AwakenGatherUpgrade | undefined): Set<string> {
  const j = job.toLowerCase()
  const set = new Set<string>()
  const addTier = (type: string, count: number) => {
    for (let k = 0; k < count; k++) set.add(`${j}-${type}-${AWAKEN_ROMAN[k]}`)
  }
  addTier('yield', up?.yieldBonus ?? 0)
  addTier('duration', up?.durationTier ?? 0)
  addTier('xp', up?.xpTier ?? 0)
  return awakenPrerequisiteClosure(set)
}

/** Price each rate lever (Sanctuary tier, awaken yield, awaken duration) for every job by
 * the real gather-time saved across its volume. Pure formatting/ranking is left to
 * computeGatherAdvisories. */
function buildGatherSavings(
  itemsByJob: Map<string, JobVolume[]>,
  mods: PlannerModifiers,
  options: GatherSavingsOptions = {},
): GatherLeverSaving[] {
  const resolveSanctuaryTarget =
    options.resolveSanctuaryTarget ?? ((_job, cur) => nextBeneficialTier(cur))
  const savings: GatherLeverSaving[] = []
  for (const [job, items] of itemsByJob) {
    const curAwaken = mods.awakenGatherUpgrades[job] ?? {
      durationTier: 0,
      yieldBonus: 0,
      xpTier: 0,
    }
    const sumAt = (m: PlannerModifiers) =>
      items.reduce((s, it) => s + it.need * perUnitAt(it.itemId, m), 0)
    const currentSeconds = sumAt(mods)
    const withJobTier = (tier: number): PlannerModifiers => ({
      ...mods,
      jobTiers: { ...mods.jobTiers, [job]: tier },
    })
    const withAwaken = (over: {
      durationTier?: number
      yieldBonus?: number
    }): PlannerModifiers => ({
      ...mods,
      awakenGatherUpgrades: { ...mods.awakenGatherUpgrades, [job]: { ...curAwaken, ...over } },
    })

    const targetTier = resolveSanctuaryTarget(job, mods.jobTiers[job] ?? 0)
    if (targetTier != null) {
      savings.push({
        job,
        lever: 'sanctuary',
        targetTier,
        currentSeconds,
        boostedSeconds: sumAt(withJobTier(targetTier)),
      })
    }
    if ((curAwaken.yieldBonus ?? 0) < 2) {
      savings.push({
        job,
        lever: 'awakenYield',
        currentSeconds,
        boostedSeconds: sumAt(withAwaken({ yieldBonus: (curAwaken.yieldBonus ?? 0) + 1 })),
        awakenNodeId: `${job.toLowerCase()}-yield-${AWAKEN_ROMAN[curAwaken.yieldBonus ?? 0]}`,
      })
    }
    if ((curAwaken.durationTier ?? 0) < 4) {
      savings.push({
        job,
        lever: 'awakenDuration',
        currentSeconds,
        boostedSeconds: sumAt(withAwaken({ durationTier: (curAwaken.durationTier ?? 0) + 1 })),
        awakenNodeId: `${job.toLowerCase()}-duration-${AWAKEN_ROMAN[curAwaken.durationTier ?? 0]}`,
      })
    }
  }
  return savings
}

export interface SummonGatherAdvisoryParams {
  /** This creature's net still-needed ingredients (after the depleting pool). */
  remaining: { id: string; amount: number }[]
  /** Live planner modifiers, but with jobTiers set to the chapter's simulated Sanctuary. */
  mods: PlannerModifiers
  /** The chapter's simulated Sanctuary roster (what the swap diffs against). */
  sanctuaryIds: string[]
  /** Candidate creatures for the roster (all creatures, with lowercase job scores). */
  candidates: { id: string; name: string; jobs?: Record<string, number> }[]
  /** Who can be slotted: owned + awakened, or summoned earlier in the plan. */
  isEligible: (id: string) => boolean
  /** When provided, awaken-node advisories carry their point cost + funding cascade
   * (the player's points and the owned creatures they'd awaken to earn one). */
  awakenFunding?: AwakenFundingContext
}

/**
 * Build the per-creature "Worth a look" rate advisories. The Sanctuary lever targets the
 * tier the recommended (full, eligible) party actually reaches, carries the concrete roster
 * diff, and is priced at that reached tier — so headline, tier delta, chips, and time saved
 * all describe the same swap.
 */
export function buildSummonGatherAdvisories(params: SummonGatherAdvisoryParams): GatherAdvisory[] {
  const { remaining, mods, sanctuaryIds, candidates, isEligible } = params
  const { itemsByJob, parentsByJob } = walkGatherVolumes(remaining, mods)
  if (itemsByJob.size === 0) return []

  // Per job: the best full eligible party and the tier it reaches.
  const recByJob = new Map<string, ReturnType<typeof recommendPartyForJob>>()
  for (const job of itemsByJob.keys()) {
    recByJob.set(
      job,
      recommendPartyForJob(
        candidates,
        job.toLowerCase(),
        TIER_THRESHOLDS_RAW,
        MAX_SANCTUARY_SLOTS,
        isEligible,
      ),
    )
  }

  const savings = buildGatherSavings(itemsByJob, mods, {
    resolveSanctuaryTarget: (job, cur) => {
      const reached = recByJob.get(job)?.reachedTier ?? 0
      return reached > cur ? reached : null
    },
  })

  // Attach the concrete roster swap to each Sanctuary saving.
  for (const s of savings) {
    if (s.lever !== 'sanctuary') continue
    const rec = recByJob.get(s.job)
    if (!rec) continue
    s.partyDiff = buildSanctuaryDiff(
      candidates,
      sanctuaryIds,
      rec.party,
      s.job.toLowerCase(),
      s.job,
      calculateJobTiersFromSanctuary,
    )
  }

  const advisories = computeGatherAdvisories(savings)

  // Name the parent acquire items each job's gather serves (e.g. Exploring → "Carrot Cake").
  for (const a of advisories) {
    const parents = parentsByJob.get(a.job)
    if (parents) {
      a.forItems = [...parents]
        .map((id) => ({ itemId: id, itemName: itemName(id) }))
        .sort((x, y) => x.itemName.localeCompare(y.itemName))
    }
  }

  // Awaken levers: attach the node's point cost + funding cascade so the UI can show
  // "you need a point — awaken one of these owned creatures to earn it" instead of
  // silently assuming the node is allocatable (mirrors the Skill Planner).
  if (params.awakenFunding) {
    const { pointsAvailable, ownedUnawakened } = params.awakenFunding
    for (const a of advisories) {
      if ((a.lever !== 'awakenYield' && a.lever !== 'awakenDuration') || !a.awakenNodeId) continue
      const allocated = allocatedGatherNodes(a.job, mods.awakenGatherUpgrades[a.job])
      const j = a.job.toLowerCase()
      a.awakenPointCost = awakenUnlockCost(a.awakenNodeId, allocated)
      a.awakenPointsAvailable = pointsAvailable
      // Any owned, unawakened creature earns a point; surface awaken-ready and
      // job-synergistic ones first (awakening them also lifts this job's Sanctuary tier).
      a.awakenSources = {
        owned: ownedUnawakened
          .map((c) => ({
            id: c.id,
            name: c.name,
            contribution: c.jobs?.[j] ?? 0,
            level: c.level,
            ready: c.level >= PRE_AWAKEN_MAX,
          }))
          .sort(
            (x, y) =>
              Number(y.ready) - Number(x.ready) ||
              y.contribution - x.contribution ||
              y.level - x.level,
          )
          .slice(0, 4),
        summon: [],
      }
    }
  }
  return advisories
}

export interface ChapterEtas {
  /** Hands-on seconds to gather everything this creature still needs (serial across
   * resources, passive supply credited in parallel). */
  totalSeconds: number
  /** Top-level need id → standalone hands-on seconds to acquire just that ingredient. */
  byItem: Map<string, number>
}

/** Flatten per-job gather volumes into resource demands for the acquisition engine,
 * pricing each leaf by its gather time and crediting its passive supply. */
function demandsFor(
  itemsByJob: Map<string, JobVolume[]>,
  mods: PlannerModifiers,
  perUnitCache: Map<string, number>,
): ResourceDemand[] {
  const demands: ResourceDemand[] = []
  for (const items of itemsByJob.values()) {
    for (const it of items) {
      let perUnit = perUnitCache.get(it.itemId)
      if (perUnit == null) {
        perUnit = perUnitAt(it.itemId, mods)
        perUnitCache.set(it.itemId, perUnit)
      }
      demands.push({
        itemId: it.itemId,
        totalNeed: it.need,
        perUnitGatherSeconds: perUnit,
        passiveRatePerSecond: getPassiveRate(it.itemId, mods).rate,
        creatureIds: [],
      })
    }
  }
  return demands
}

/**
 * ETA to acquire a creature's still-needed ingredients: per top-level item and for the
 * whole creature. Time is the hands-on gather time of each ingredient's gather tree, with
 * shared passive producers (machines / garden / fabrication) credited in parallel — the
 * same active basis the "Worth a look" savings are measured against, so an item's ETA and
 * its rate advisory's saving reconcile. Items with no gatherable/passive source read 0.
 */
export function computeRemainingEtas(
  needs: { id: string; amount: number }[],
  mods: PlannerModifiers,
): ChapterEtas {
  const perUnitCache = new Map<string, number>()
  const byItem = new Map<string, number>()
  for (const need of needs) {
    if (need.amount <= 0) {
      byItem.set(need.id, 0)
      continue
    }
    const plan = computeAcquisitionPlan(
      demandsFor(gatherVolumesByJob([need], mods), mods, perUnitCache),
    )
    byItem.set(need.id, plan.horizonSeconds)
  }
  const totalSeconds = computeAcquisitionPlan(
    demandsFor(gatherVolumesByJob(needs, mods), mods, perUnitCache),
  ).horizonSeconds
  return { totalSeconds, byItem }
}
