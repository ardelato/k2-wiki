import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import type { RailEntry } from '@/components/summoning-planner/SummonPlanRail.vue'
import {
  computeInventoryBudgets,
  getPassiveRate,
  type PlannerModifiers,
} from '@/composables/useCraftPlanner'
import type { FlatListEntry } from '@/composables/useGroupedMaterials'
import type { PlaybookChapter } from '@/composables/useSummonPlaybook'
import type { Creature, ItemType, PlannerLockedGate } from '@/types'
import { sourceIcons } from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { computeAcquisitionTimeline } from '@/utils/planner/acquisitionTimeline'
import { buildCompletionQueue } from '@/utils/planner/completionQueue'
import type { GatherAdvisory } from '@/utils/planner/gatherAdvisories'
import type { ModifierChip } from '@/utils/planner/modifierChips'

type TreeRef = InstanceType<typeof SummoningMaterialTree>

type PlanSort = 'step' | 'ready' | 'name'
type PlanSortDir = 'asc' | 'desc'

interface PlanRequirement {
  itemId: string
  itemName: string
  itemType: ItemType
  need: number
  have: number
  inventoryAmount: number
  queuedAmount: number
  /** Global stock (inventory + queued) for this item before the shared pool is depleted —
   * the "have" you'd see on All Materials. `have` is what's left after creatures ahead. */
  ownedTotal: number
  /** Creatures earlier in the completion order that also draw from this shared stock. */
  reservedBy: { id: string; name: string; image: string | null }[]
  modifiers: ModifierChip[]
  sortedIndex: number
  gate: PlannerLockedGate | null
  crafted: boolean
  /** Other creatures needing this item, sorted by plan order (next-to-summon first).
   * `highlighted` marks the ones earlier in the plan that the reserved call-out names. */
  sharedWith: { id: string; name: string; image: string | null; highlighted?: boolean }[]
  sourceLabel: string
  sourceIcon: string | null
}

interface PlanEntry {
  creature: Creature
  image: string | null
  requirements: PlanRequirement[]
  readiness: number
  fulfilled: number
  total: number
  blocked: boolean
}

interface FocusRequirement extends PlanRequirement {
  effectiveRemaining: number | null
}

/** Per-creature cost group as enriched by the view's by-creature grouping. */
interface CreatureCostGroup {
  creatureId: string
  creatureName: string
  creatureImage: string | null
  costs: FlatListEntry[]
}

interface UseCreaturePlanOptions {
  selectedCreatures: Ref<Creature[]>
  byCreatureGroups: Ref<CreatureCostGroup[]>
  sortedCosts: Ref<{ itemId: string; itemName: string; amount: number }[]>
  treeRefs: Ref<TreeRef[]>
  lockedGateByItemAll: Ref<Record<string, PlannerLockedGate>>
  playbookChapters: Ref<PlaybookChapter[]>
  mergedInventory: Ref<Record<string, number>>
  plannerModifiers: Ref<PlannerModifiers>
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-creature plan (rail + focus) — the Summon tab's primary view.
//
// A *lens* over the aggregate hidden trees: each creature's requirements link
// back to the shared `treeRefs`/`lockedGateByItemAll` so stock accounting and
// skill gates stay correct (per-creature trees would double-count shared stock).
// ─────────────────────────────────────────────────────────────────────────────
export function useCreaturePlan(opts: UseCreaturePlanOptions) {
  const {
    selectedCreatures,
    byCreatureGroups,
    sortedCosts,
    treeRefs,
    lockedGateByItemAll,
    playbookChapters,
    mergedInventory,
    plannerModifiers,
  } = opts
  const { t } = useI18n()

  const planSort = ref<PlanSort>('step')
  const planSortDir = ref<PlanSortDir>('asc')
  const planSortOptions = computed(() => [
    { id: 'step' as const, label: t('summoningPlanner.planSort.step') },
    { id: 'ready' as const, label: t('summoningPlanner.planSort.ready') },
    { id: 'name' as const, label: t('summoningPlanner.controls.name') },
  ])
  // Natural starting direction per field; re-picking the active field flips it.
  const planSortDefaults: Record<PlanSort, PlanSortDir> = {
    step: 'asc',
    ready: 'desc',
    name: 'asc',
  }
  function setPlanSort(sort: PlanSort) {
    if (planSort.value === sort) {
      planSortDir.value = planSortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      planSort.value = sort
      planSortDir.value = planSortDefaults[sort]
    }
  }

  // itemId → index in sortedCosts, so a creature's requirement can reuse the
  // already-mounted aggregate tree for its recipe chain.
  const treeIndexByItem = computed(() => {
    const m = new Map<string, number>()
    sortedCosts.value.forEach((c, i) => m.set(c.itemId, i))
    return m
  })

  // itemId → the selected creatures that need it (drives the "also needed by" avatars).
  const creaturesByItem = computed(() => {
    const m = new Map<string, Creature[]>()
    for (const creature of selectedCreatures.value) {
      for (const c of creature.summoningCost) {
        const list = m.get(c.id)
        if (list) list.push(creature)
        else m.set(c.id, [creature])
      }
    }
    return m
  })

  // Requirement card order within a creature: actionable → blocked → completed.
  // "Completed" = nothing left to obtain (inventory + queue cover the need, so the tree
  // would read ×0); "blocked" = skill-gated.
  function requirementOrder(r: PlanRequirement): number {
    if (r.have >= r.need) return 2
    if (r.gate) return 1
    return 0
  }

  const creaturePlan = computed<PlanEntry[]>(() => {
    // Raw per-creature requirements — global inventory is credited to every creature here;
    // the shared pool is depleted below so a stock shared across creatures isn't counted twice.
    const raw = byCreatureGroups.value.map((group) => {
      const creature = selectedCreatures.value.find((c) => c.id === group.creatureId)!
      const requirements: PlanRequirement[] = group.costs.map((c) => {
        const have = c.inventoryAmount + c.queuedAmount
        const sortedIndex = treeIndexByItem.value.get(c.itemId) ?? -1
        const tree = sortedIndex >= 0 ? treeRefs.value[sortedIndex] : null
        return {
          itemId: c.itemId,
          itemName: c.itemName,
          itemType: c.itemType,
          need: c.totalNeeded,
          have,
          inventoryAmount: c.inventoryAmount,
          queuedAmount: c.queuedAmount,
          ownedTotal: have,
          reservedBy: [],
          modifiers: c.modifiers,
          sortedIndex,
          gate: lockedGateByItemAll.value[c.itemId] ?? null,
          crafted: (tree?.rootChildren?.length ?? 0) > 0,
          sharedWith: (creaturesByItem.value.get(c.itemId) ?? [])
            .filter((other) => other.id !== creature.id)
            .map((other) => ({
              id: other.id,
              name: other.name,
              image: getCreatureImage(other) ?? null,
            })),
          sourceLabel: c.sourceLabel,
          sourceIcon: c.sourceIcon,
        }
      })
      return {
        creature,
        image: group.creatureImage,
        blocked: requirements.some((r) => r.gate),
        requirements,
      }
    })

    // Deplete the shared inventory pool across creatures (same engine as the Action plan):
    // most-ready-first, blocked last, so each creature's readiness + still-need reflect what's
    // left after the creatures ahead of it consume the shared stock.
    const pooled = buildCompletionQueue(
      raw.map((e) => ({
        id: e.creature.id,
        name: e.creature.name,
        image: e.image,
        blocked: e.blocked,
        requirements: e.requirements.map((r) => ({
          itemId: r.itemId,
          itemName: r.itemName,
          need: r.need,
          have: r.have,
          sourceLabel: r.sourceLabel,
          sourceIcon: r.sourceIcon,
        })),
      })),
    )
    const byId = new Map(pooled.map((q) => [q.id, q]))
    // Completion-order index per creature → who is "ahead" of whom in the plan.
    const orderIndex = new Map(pooled.map((q, i) => [q.id, i]))

    return raw.map((e) => {
      const q = byId.get(e.creature.id)
      const myIndex = orderIndex.get(e.creature.id) ?? Infinity
      const pooledHave = new Map((q?.requirements ?? []).map((r) => [r.itemId, r.have]))
      const requirements = e.requirements.map((r) => {
        const have = pooledHave.get(r.itemId) ?? r.have
        // Re-split the pool-limited total into inventory-first, then queued, for the card.
        const inventoryAmount = Math.min(r.inventoryAmount, have)
        const queuedAmount = have - inventoryAmount
        // `r.have` here is still the global stock (set before this override) → ownedTotal.
        // Sort co-needers by plan order (next-to-summon first); flag the ones EARLIER than
        // this creature — those are who drew the shared stock down (the reserved call-out).
        const sharedWith = r.sharedWith
          .map((o) => ({ ...o, highlighted: (orderIndex.get(o.id) ?? Infinity) < myIndex }))
          .toSorted(
            (a, b) => (orderIndex.get(a.id) ?? Infinity) - (orderIndex.get(b.id) ?? Infinity),
          )
        const reservedBy = sharedWith.filter((o) => o.highlighted)
        return {
          ...r,
          have,
          inventoryAmount,
          queuedAmount,
          ownedTotal: r.have,
          sharedWith,
          reservedBy,
        }
      })
      const orderedRequirements = requirements.toSorted(
        (a, b) => requirementOrder(a) - requirementOrder(b),
      )
      return {
        creature: e.creature,
        image: e.image,
        requirements: orderedRequirements,
        readiness: q?.readiness ?? (e.requirements.length ? 0 : 100),
        fulfilled: q?.fulfilled ?? 0,
        total: e.requirements.length,
        blocked: e.blocked,
      }
    })
  })

  // Auto-order only for now (manual drag deferred). Blocked creatures sink to the
  // bottom under "Most ready".
  function planByName(a: PlanEntry, b: PlanEntry) {
    return a.creature.name.localeCompare(b.creature.name)
  }

  // Creatures blocked by a skill gate, from the same per-creature flag the rail shows. Fed
  // into the playbook (above) so Step order sinks them last rather than ranking by readiness.
  const blockedCreatureIds = computed(
    () => new Set(creaturePlan.value.filter((e) => e.blocked).map((e) => e.creature.id)),
  )

  // Step order = the planner's completion sequence (buildCompletionQueue), the same order
  // the "Do this now" focus follows. Maps creatureId → 1-based step for the rail + numbering.
  const stepIndexById = computed(() => {
    const map = new Map<string, number>()
    playbookChapters.value.forEach((c, i) => map.set(c.creatureId, i + 1))
    return map
  })

  const sortedCreaturePlan = computed<PlanEntry[]>(() => {
    const entries = [...creaturePlan.value]
    const dir = planSortDir.value === 'asc' ? 1 : -1
    if (planSort.value === 'name') return entries.toSorted((a, b) => dir * planByName(a, b))
    if (planSort.value === 'step') {
      const idx = stepIndexById.value
      const big = Number.MAX_SAFE_INTEGER
      return entries.toSorted(
        (a, b) =>
          dir * ((idx.get(a.creature.id) ?? big) - (idx.get(b.creature.id) ?? big)) ||
          planByName(a, b),
      )
    }
    // Ready: blocked always sink to the bottom; direction flips the readiness order.
    return entries.toSorted((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
      return dir * (a.readiness - b.readiness) || planByName(a, b)
    })
  })

  // Canonical completion order (most-ready-first, blocked last) — independent of the rail's
  // UI sort. Stock depletes along THIS order, matching the pooled `have` the queue produced.
  const completionOrderedPlan = computed<PlanEntry[]>(() =>
    [...creaturePlan.value].toSorted((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
      return b.readiness - a.readiness || planByName(a, b)
    }),
  )

  // Per-creature inventory budgets in completion order: each creature's crafted-item tree sees
  // only the stock left after the creatures ahead of it consume theirs — so a shared refined
  // material (e.g. cake) isn't credited to every creature. Keyed `${creatureId}:${itemId}`.
  const orderedPlanBudgets = computed(() => {
    const targets: { itemId: string; quantity: number; key: string }[] = []
    for (const entry of completionOrderedPlan.value) {
      for (const r of entry.requirements) {
        if (r.need > 0) {
          targets.push({
            itemId: r.itemId,
            quantity: r.need,
            key: `${entry.creature.id}:${r.itemId}`,
          })
        }
      }
    }
    return computeInventoryBudgets(targets, mergedInventory.value, plannerModifiers.value)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Passive-aware acquisition timeline (Phase 1).
  //
  // While you actively work the earlier creatures in the rail, shared passive
  // producers (fabrication / machine / garden) accrue materials for the queued
  // ones. An item reads passive only when that shared pool can deliver it by the
  // time you reach the creature; otherwise it stays the active gather source.
  // See docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md.
  // ─────────────────────────────────────────────────────────────────────────────

  // Per-creature active hands-on time: sum the active-time rollup of each
  // requirement's shared aggregate tree (consistent with the view's stock pooling).
  function creatureActiveSeconds(entry: PlanEntry): number {
    let total = 0
    for (const r of entry.requirements) {
      if (r.sortedIndex < 0) continue
      total += treeRefs.value[r.sortedIndex]?.summary?.timeBreakdown?.activeTimeSeconds ?? 0
    }
    return total
  }

  const acquisitionTimeline = computed(() =>
    computeAcquisitionTimeline(
      sortedCreaturePlan.value.map((entry) => ({
        creatureId: entry.creature.id,
        activeTimeSeconds: creatureActiveSeconds(entry),
        requirements: entry.requirements.map((r) => ({
          itemId: r.itemId,
          need: Math.max(0, r.need - r.have), // amount still required after inventory/queue
          passiveRate: getPassiveRate(r.itemId, plannerModifiers.value).rate,
        })),
      })),
    ),
  )

  // Active gather source for an item that flips active (the "Fabrication → Mining" fix):
  // the passive default-method title is wrong once the timeline says you'd gather it.
  function getGatherSource(sortedIndex: number): { label: string; icon: string | null } | null {
    if (sortedIndex < 0) return null
    const node = treeRefs.value[sortedIndex]?.rootNode
    const gather = node?.methods.find((m) => m.kind === 'gather')
    return gather?.title ? { label: gather.title, icon: sourceIcons[gather.title] ?? null } : null
  }

  const planSelectedId = ref<string | null>(null)

  const focusedEntry = computed<PlanEntry | null>(() => {
    const list = sortedCreaturePlan.value
    if (list.length === 0) return null
    return list.find((e) => e.creature.id === planSelectedId.value) ?? list[0]
  })

  // Keep the focused creature valid; default to the top of the plan.
  // NOTE: intentionally NOT immediate — an immediate watch evaluates sortedCreaturePlan
  // during setup, which traverses stepIndexById → playbookChapters → chapters computed →
  // isBlocked callback → plan.blockedCreatureIds, but plan is still being assigned at that
  // point (TDZ). focusedEntry's own `?? list[0]` fallback covers the initial null case.
  watch(sortedCreaturePlan, (list) => {
    if (list.length === 0) {
      planSelectedId.value = null
    } else if (!list.some((e) => e.creature.id === planSelectedId.value)) {
      planSelectedId.value = list[0].creature.id
    }
  })

  function selectPlanCreature(id: string) {
    planSelectedId.value = id
  }

  // Focus-pane requirements, relabeled by the acquisition timeline: still-needed items
  // read their active gather source (+ effectiveRemaining); items the shared passive pool
  // covers by the time you reach this creature read passive with no active work remaining.
  const focusedRequirements = computed<FocusRequirement[]>(() => {
    const entry = focusedEntry.value
    if (!entry) return []
    const tl = acquisitionTimeline.value.get(entry.creature.id)
    return entry.requirements.map((r): FocusRequirement => {
      const res = tl?.get(r.itemId)
      // No timeline data, or inventory/queue already covers it: leave untouched.
      if (!res || r.have >= r.need) {
        return { ...r, effectiveRemaining: null }
      }
      if (res.source === 'active') {
        const gather = getGatherSource(r.sortedIndex) // swap passive default → real gather source
        return {
          ...r,
          sourceLabel: gather?.label ?? r.sourceLabel,
          sourceIcon: gather?.icon ?? r.sourceIcon,
          effectiveRemaining: res.effectiveRemaining,
        }
      }
      // Fully covered by the shared passive pool before you reach this creature.
      return { ...r, effectiveRemaining: 0 }
    })
  })

  // Efficiency advisories for the focused creature → feeds the focus pane's "Worth a
  // look". Reuses the Action plan's playbook so both surface identical gather-speed
  // advice (raise a Sanctuary tier / buy an awaken node) rather than gate-unlock hints.
  const focusedWorthALook = computed<GatherAdvisory[]>(() => {
    const id = focusedEntry.value?.creature.id
    if (!id) return []
    return playbookChapters.value.find((c) => c.creatureId === id)?.worthALook ?? []
  })

  // Time-to-ready + "do this now" emphasis for the focus header, folded in from the old
  // Action plan: the focused creature's hands-on ETA, and whether it's the current
  // bottleneck (the first not-ready creature in completion order).
  const focusedChapter = computed(() => {
    const id = focusedEntry.value?.creature.id
    return id ? (playbookChapters.value.find((c) => c.creatureId === id) ?? null) : null
  })
  const summonHeroId = computed(
    () => playbookChapters.value.find((c) => !c.ready)?.creatureId ?? null,
  )
  const focusedIsActive = computed(
    () => !!focusedEntry.value && focusedEntry.value.creature.id === summonHeroId.value,
  )

  // Does any requirement read lower than what you own because creatures ahead claim it?
  // Drives the focus pane's sequential-amounts legend.
  const focusHasReserved = computed(() =>
    focusedRequirements.value.some((r) => r.ownedTotal > r.have),
  )

  // "Who's ahead" note for a depleted requirement. The specific creatures are already
  // pointed out by the violet rings on the shared-stack avatars, so this stays generic.
  function reservedNote(r: FocusRequirement): string {
    const n = r.reservedBy.length
    if (n === 0) return ''
    return t('summoningPlanner.focus.reservedNote', { n }, n)
  }

  const railEntries = computed<RailEntry[]>(() =>
    sortedCreaturePlan.value.map((e) => ({
      id: e.creature.id,
      name: e.creature.name,
      image: e.image,
      tier: e.creature.tier,
      readiness: e.readiness,
      blocked: e.blocked,
      step: stepIndexById.value.get(e.creature.id),
    })),
  )

  return {
    planSort,
    planSortDir,
    planSortOptions,
    setPlanSort,
    planSelectedId,
    selectPlanCreature,
    creaturePlan,
    sortedCreaturePlan,
    blockedCreatureIds,
    stepIndexById,
    orderedPlanBudgets,
    railEntries,
    focusedEntry,
    focusedRequirements,
    focusedWorthALook,
    focusedChapter,
    focusedIsActive,
    focusHasReserved,
    reservedNote,
  }
}
