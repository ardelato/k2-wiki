<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  Bug,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  Clock3,
  GitBranch,
  Info,
  List,
  ListChecks,
} from 'lucide-vue-next'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import PlannerTreeNode from '@/components/craft-planner/PlannerTreeNode.vue'
import SkillGateRollup from '@/components/craft-planner/SkillGateRollup.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import CreatureAvatarStack from '@/components/summoning-planner/CreatureAvatarStack.vue'
import ExpeditionPartyCard from '@/components/summoning-planner/ExpeditionPartyCard.vue'
import SummonCreaturePicker from '@/components/summoning-planner/SummonCreaturePicker.vue'
import SummonGatherAdvisoryList from '@/components/summoning-planner/SummonGatherAdvisoryList.vue'
import SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import SummoningObjectiveCard from '@/components/summoning-planner/SummoningObjectiveCard.vue'
import SummonPlanRail from '@/components/summoning-planner/SummonPlanRail.vue'
import { recoverTourDemo } from '@/composables/plannerTourDemo'
import {
  computeInventoryBudgets,
  summarizeLockedGates,
  usePlannerModifiers,
} from '@/composables/useCraftPlanner'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreaturePlan } from '@/composables/useCreaturePlan'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditionAllocation } from '@/composables/useExpeditionAllocation'
import { useGameConfig } from '@/composables/useGameConfig'
import { useGoldIncome } from '@/composables/useGoldIncome'
import {
  useGroupedMaterials,
  type FlatListEntry,
  type SortDirection,
  type SortField,
  type SortState,
} from '@/composables/useGroupedMaterials'
import { useSummoningPlanner } from '@/composables/useSummoningPlanner'
import { useSummonPlaybook } from '@/composables/useSummonPlaybook'
import { useSummonTourDemo } from '@/composables/useSummonTourDemo'

// Heal an interrupted tour's demo data before the planner composable reads localStorage.
recoverTourDemo()
import { expeditions } from '@/data/entityMaps'
import { itemById } from '@/data/indexes'
import type { PlannerLockedGate, PlannerNode } from '@/types'
import { formatDuration, itemName } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'
import { extractModifierChips, type ModifierChip } from '@/utils/planner/modifierChips'
import {
  getSourceGroup,
  getGatherSource as gatherSourceForItem,
  sourceGroupOrder,
  type SourceGroup,
} from '@/utils/planner/plannerSourceGroups'

const isDesktop = useMediaQuery('(min-width: 1024px)')
const { t } = useI18n()
const { creatures } = useCreatures()
const { ownedCreatureIds, getLevel, isAwakened, collectionLevels } = useCreatureCollection()
const gameConfig = useGameConfig()
const { goldPerMinute, breakdown: goldBreakdown } = useGoldIncome()
const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  toggleCreature: toggleInspectCreature,
  toggleCreatureById: toggleInspectCreatureById,
  closeDrawer: closeCreatureDrawer,
} = useCreatureDrawer()


const flatQueuedAmounts = computed(() => {
  const flat: Record<string, number> = {}
  for (const items of Object.values(gameConfig.queuedAmounts.value)) {
    for (const [id, amount] of Object.entries(items)) {
      if (amount > 0) flat[id] = (flat[id] ?? 0) + amount
    }
  }
  return flat
})


const ownedCreaturesList = computed(() =>
  creatures.value.filter((c) => ownedCreatureIds.value.has(c.id)),
)


const {
  selectedIds,
  unsummonedCreatures,
  selectedCreatures,
  aggregatedCosts,
  toggleCreature,
  selectOnly,
  toggleTier,
  clearSelection,
} = useSummoningPlanner()


// A "Plan Summoning" deep link replaces any existing plan with just the targeted creature.
const route = useRoute()
const router = useRouter()
watch(
  () => route.query.creature,
  (id) => {
    // Owned creatures are pruned from the selection automatically, so select unconditionally.
    if (typeof id === 'string' && id) selectOnly(id)
  },
  { immediate: true },
)


function resetSelection() {
  clearSelection()
  // Drop the deep-link param so it doesn't re-apply on refresh.
  if (route.query.creature !== undefined) {
    const { creature: _creature, ...query } = route.query
    router.replace({ query })
  }
}


// --- View mode ---
// Top tabs: 'plan' (per-creature, default) and 'materials' (All materials).
// The All-materials tab splits into a List / Tree sub-view (materialsView), which
// share the same source grouping and sort controls.
const viewMode = ref<'plan' | 'materials'>('plan')
const materialsView = ref<'list' | 'tree'>('list')
const isTreeView = computed(() => viewMode.value === 'materials' && materialsView.value === 'tree')
const isListView = computed(() => viewMode.value === 'materials' && materialsView.value === 'list')


// Guided-tour demo seeding/restore glue (registers + wires its own onBeforeUnmount).
useSummonTourDemo({ unsummonedCreatures, selectedIds, viewMode, materialsView })


// Queue/picker split: the creature filter opens from the "+ Add" control instead of
// sitting always-open, so the selected creatures read as a compact queue row.
const pickerOpen = ref(false)


// Page title tracks the selection, mirroring the mockup's "Summoning N creatures."
const headerTitle = computed(() => {
  const n = selectedIds.value.size
  if (n === 0) return t('summoningPlanner.header.empty')
  return t('summoningPlanner.header.count', { n }, n)
})


const viewTabs = computed(() => [
  {
    id: 'plan' as const,
    label: t('summoningPlanner.viewTabs.plan.label'),
    icon: ListChecks,
    description: t('summoningPlanner.viewTabs.plan.description'),
  },
  {
    id: 'materials' as const,
    label: t('summoningPlanner.viewTabs.materials.label'),
    icon: ClipboardList,
    description: t('summoningPlanner.viewTabs.materials.description'),
  },
])


// Sub-views inside the All-materials tab.
const materialsViewTabs = computed(() => [
  { id: 'list' as const, label: t('summoningPlanner.tabs.list'), icon: List },
  { id: 'tree' as const, label: t('summoningPlanner.tabs.tree'), icon: GitBranch },
])


// --- Debug drawer state (dev only) ---
const isDev = import.meta.env.DEV
const debugDrawerOpen = ref(false)
const SummoningDebugPanel = isDev
  ? defineAsyncComponent(() => import('@/components/summoning-planner/SummoningDebugPanel.vue'))
  : null


// --- Group collapse state ---
const collapsedGroups = ref(new Set<SourceGroup>())


function toggleGroup(group: SourceGroup) {
  const next = new Set(collapsedGroups.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  collapsedGroups.value = next
}


function collapseAllGroups() {
  collapsedGroups.value = new Set(sourceGroupOrder)
}


function expandAllGroups() {
  collapsedGroups.value = new Set()
}


// --- Material sort ---
const sortState = ref<SortState>({ field: 'name', direction: null })


function toggleSort(field: SortField) {
  if (sortState.value.field !== field) {
    sortState.value = { field, direction: 'asc' }
  } else {
    const next: SortDirection =
      sortState.value.direction === null
        ? 'asc'
        : sortState.value.direction === 'asc'
          ? 'desc'
          : null
    sortState.value = { field, direction: next }
  }
}


// materialSort drives sortedCosts (the backing trees order)
const materialSort = computed(() => {
  if (sortState.value.field === 'name' && sortState.value.direction) return 'name'
  return 'quantity'
})


const sortedCosts = computed(() => {
  const costs = [...aggregatedCosts.value]
  if (materialSort.value === 'quantity') {
    return costs.toSorted((a, b) => b.amount - a.amount || a.itemName.localeCompare(b.itemName))
  }
  return costs // already alphabetical from composable
})


// --- Cross-tree inventory budgets (shared stock pool) ---
const { mergedInventory, modifiers: plannerModifiers } = usePlannerModifiers()


// The player's selected, not-yet-owned creatures — the canonical plan input.
const realSelectedCreatures = computed(() =>
  creatures.value.filter((c) => selectedIds.value.has(c.id) && !ownedCreatureIds.value.has(c.id)),
)


// Action plan = per-creature playbook (Acquire → Deploy → Payoff), Sanctuary evolving
// across chapters. See useSummonPlaybook.
// Feed the real skill-gate status into the playbook so Step order sinks blocked creatures
// last (matching the rail's "Most ready" sort), instead of ranking them by readiness.
// Late-bound holder: the playbook's blocked-predicate is wired here, but `plan`
// (= useCreaturePlan(...), which itself consumes playbookChapters) is declared far
// below. Reading `plan` directly throws a TDZ ReferenceError if the chapters computed
// evaluates during setup. A reactive holder is always initialized (empty until `plan`
// syncs into it below), breaking the init cycle while staying reactive.
const blockedCreatureIdsHolder = ref<Set<string>>(new Set())
const { chapters: playbookChapters } = useSummonPlaybook(realSelectedCreatures, (id) =>
  blockedCreatureIdsHolder.value.has(id),
)


const inventoryBudgets = computed(() => {
  const costs = sortedCosts.value
  if (costs.length === 0) return {}
  const targets = costs.map((c) => ({ itemId: c.itemId, quantity: c.amount }))
  return computeInventoryBudgets(targets, mergedInventory.value, plannerModifiers.value)
})


// --- Tree refs & inspector ---
const treeRefs = ref<InstanceType<typeof SummoningMaterialTree>[]>([])


// #2 skill-gate surfacing: union the locked resources from every material tree,
// deduped by itemId — feeds both the per-card flags and the plan-level roll-up.
const lockedGateByItemAll = computed(() => {
  const byItem: Record<string, PlannerLockedGate> = {}
  for (const tree of treeRefs.value) {
    const gates = tree?.lockedGateByItem as Record<string, PlannerLockedGate> | undefined
    if (!gates) continue
    for (const [itemId, gate] of Object.entries(gates)) byItem[itemId] = gate
  }
  return byItem
})
const skillGateSummary = computed(() => summarizeLockedGates(lockedGateByItemAll.value))
watch(
  () => sortedCosts.value.length,
  (len) => {
    treeRefs.value.splice(len)
  },
)
const activeTreeIndex = ref<number | null>(null)


// --- Tree controls ---
function collapseAllTrees() {
  for (const tree of treeRefs.value) {
    tree?.collapseToLeaves()
  }
}


function expandAllTrees() {
  for (const tree of treeRefs.value) {
    tree?.expandAll()
  }
}


// --- Tree node event forwarding (for direct PlannerTreeNode rendering) ---
function treeSelectNode(treeIndex: number, nodeId: string) {
  activeTreeIndex.value = treeIndex
  treeRefs.value[treeIndex]?.selectNode(nodeId)
}


function treeSelectMethod(treeIndex: number, methodId: string) {
  activeTreeIndex.value = treeIndex
  treeRefs.value[treeIndex]?.selectMethod(methodId)
}


function treePinMethod(_treeIndex: number, nodeId: string, methodId: string) {
  treeRefs.value[_treeIndex]?.setPinnedMethod(nodeId, methodId)
}


function treeToggleCollapse(treeIndex: number, nodeId: string) {
  const tree = treeRefs.value[treeIndex]
  if (!tree) return
  const next = new Set(tree.collapsedNodeIds)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  tree.collapsedNodeIds = next
}


// --- Subtree cost computation ---
function buildSubtreeCosts(treeIndex: number): Record<string, number> {
  const tree = treeRefs.value[treeIndex]
  if (!tree?.nodesById || !tree?.activeMethodIdByNode) return {}


  const costs: Record<string, number> = {}
  const nodesById = tree.nodesById
  const activeMethodIdByNode = tree.activeMethodIdByNode


  function computeCost(nodeId: string): number {
    if (costs[nodeId] != null) return costs[nodeId]


    const node = nodesById[nodeId]
    if (!node || node.fulfilled) {
      costs[nodeId] = 0
      return 0
    }


    const methodId = activeMethodIdByNode[nodeId]
    const method = methodId ? node.methods.find((m) => m.id === methodId) : null
    const localCost = method?.cost ?? 0


    let childrenCost = 0
    if (method) {
      for (const child of method.children) {
        childrenCost += computeCost(child.nodeId)
      }
    }


    costs[nodeId] = localCost + childrenCost
    return localCost + childrenCost
  }


  for (const nodeId of Object.keys(nodesById)) {
    computeCost(nodeId)
  }


  return costs
}


// --- Node annotations (gather levels) ---
function buildNodeAnnotations(treeIndex: number): Record<string, string> {
  const tree = treeRefs.value[treeIndex]
  if (!tree?.nodesById) return {}
  const annotations: Record<string, string> = {}
  for (const [nodeId, node] of Object.entries(tree.nodesById)) {
    if (node.itemType === 'Gathered') {
      const info = gatherSourceForItem(node.itemId)
      if (info) {
        annotations[nodeId] = t('summoningPlanner.gatherLevel', { n: info.levelRequirement })
      }
    }
  }
  return annotations
}


// --- Expedition party recommendations with deconfliction ---
const {
  getActiveExpeditionParty,
  selectExpeditionVariant,
  getDisplayedAlternatives,
  conflictedCreatureIds,
  conflictPopover,
  onConflictEnter,
  onConflictLeave,
} = useExpeditionAllocation({
  sortedCosts,
  treeRefs,
  ownedCreaturesList,
  collectionLevels,
})


// --- Source label for objective cards ---
function getNodeSource(
  node: PlannerNode,
  treeIndex: number,
): { label: string; icon: string | null } {
  const tree = treeRefs.value[treeIndex]
  if (!tree) return { label: '', icon: null }
  const methodId = tree.activeMethodIdByNode[node.id]
  const method = methodId
    ? node.methods.find((m: import('@/types').PlannerMethod) => m.id === methodId)
    : null
  if (method?.title && method.kind !== 'container' && method.kind !== 'buy') {
    return { label: method.title, icon: sourceIcons[method.title] ?? null }
  }
  // Fallback: check if any method is a garden method (for raw essences)
  const gardenMethod = node.methods.find(
    (m: import('@/types').PlannerMethod) => m.kind === 'garden',
  )
  if (gardenMethod?.title) {
    const flowerId = gardenMethod.title.toLowerCase().replace(/ /g, '-')
    return { label: gardenMethod.title, icon: getItemImage({ id: flowerId }) ?? null }
  }
  // Static fallback for raw essences → garden flower source
  const essenceFlowerMap: Record<string, string> = {
    'raw-fire-essence': 'fire-flower',
    'raw-wind-essence': 'wind-flower',
    'raw-earth-essence': 'earth-flower',
    'raw-water-essence': 'water-flower',
  }
  const flowerId = essenceFlowerMap[node.itemId]
  if (flowerId) {
    const flowerName = itemName(flowerId)
    return { label: flowerName, icon: getItemImage({ id: flowerId }) ?? null }
  }
  return { label: '', icon: null }
}


// --- Total gold needed across all trees ---
const totalGold = computed(() => {
  let total = 0
  for (const tree of treeRefs.value) {
    if (tree?.summary?.totalCost) total += tree.summary.totalCost
  }
  return Math.round(total)
})


const goldInventory = computed(() => gameConfig.inventoryAmounts.value['gold'] ?? 0)
const hasCurrencyGroup = computed(() => groupedCosts.value.some((g) => g.group === 'Currency'))


const goldModifiers = computed<ModifierChip[]>(() => {
  if (goldPerMinute.value <= 0) return []
  return [
    {
      label: t('summoningPlanner.goldIncome.title'),
      value: t('summoningPlanner.goldIncome.perMin', { n: goldPerMinute.value.toFixed(0) }),
      icon: getItemImage({ id: 'gold' }) ?? undefined,
      color:
        'border-gold/35 bg-gold/10 text-gold-strong dark:border-gold/40 dark:bg-gold/20 dark:text-gold-strong',
      accentColor: 'bg-gold',
      subtitle: t('summoningPlanner.goldIncome.passive'),
      stats: [
        ...(goldBreakdown.value.creatureGoldPerMin > 0
          ? [
              t('summoningPlanner.goldIncome.fromCreatures', {
                n: goldBreakdown.value.creatureGoldPerMin,
              }),
            ]
          : []),
        ...(goldBreakdown.value.flowerGoldPerMin > 0
          ? [
              t('summoningPlanner.goldIncome.fromFlowers', {
                n: goldBreakdown.value.flowerGoldPerMin,
              }),
            ]
          : []),
      ],
    },
  ]
})


// --- Flattened list of all nodes across all trees ---
const flatListEntries = computed<FlatListEntry[]>(() => {
  // Walk each tree's active method path recursively (matching what the tree view shows).
  // Deduplicate by itemId across all trees, summing amounts.
  const merged = new Map<string, FlatListEntry>()

  function walkNode(
    node: PlannerNode,
    treeIndex: number,
    treeRef: InstanceType<typeof SummoningMaterialTree>,
  ) {
    const inv = gameConfig.inventoryAmounts.value[node.itemId] ?? 0
    const queued = flatQueuedAmounts.value[node.itemId] ?? 0
    const existing = merged.get(node.itemId)

    if (existing) {
      existing.totalNeeded += node.grossAmount
      existing.maxDepth = Math.max(existing.maxDepth, node.depth)
    } else {
      const source = getNodeSource(node, treeIndex)
      const methodId = treeRef.activeMethodIdByNode[node.id]
      const activeMethod = methodId
        ? node.methods.find((m: import('@/types').PlannerMethod) => m.id === methodId)
        : null
      const group = getSourceGroup(node.itemId, activeMethod?.kind)
      const gatherInfo = gatherSourceForItem(node.itemId)
      merged.set(node.itemId, {
        itemId: node.itemId,
        itemName: node.itemName,
        itemType: node.itemType,
        totalNeeded: node.grossAmount,
        inventoryAmount: inv,
        queuedAmount: queued,
        sourceLabel: source.label,
        sourceIcon: source.icon,
        sourceGroup: group,
        gatherJob: gatherInfo?.jobId ?? null,
        modifiers: activeMethod
          ? extractModifierChips(activeMethod.detailRows, activeMethod.title)
          : [],
        maxDepth: node.depth,
      })
    }

    // Recurse into active method's children only
    if (!node.fulfilled) {
      const methodId = treeRef.activeMethodIdByNode[node.id]
      const method = methodId
        ? node.methods.find((m: import('@/types').PlannerMethod) => m.id === methodId)
        : null
      if (method) {
        for (const child of method.children) {
          const childNode = treeRef.nodesById[child.nodeId]
          if (childNode) walkNode(childNode, treeIndex, treeRef)
        }
      }
    }
  }

  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.rootNode || !tree?.nodesById) continue
    walkNode(tree.rootNode, i, tree)
  }

  // Add aggregate gold entry from all tree summaries
  if (totalGold.value > 0) {
    merged.set('gold', {
      itemId: 'gold',
      itemName: t('summoningPlanner.gold'),
      itemType: 'Currency',
      totalNeeded: totalGold.value,
      inventoryAmount: goldInventory.value,
      queuedAmount: 0,
      sourceLabel: '',
      sourceIcon: getItemImage({ id: 'gold' }) ?? null,
      sourceGroup: 'Currency',
      gatherJob: null,
      modifiers: goldModifiers.value,
      maxDepth: 0,
    })
  }

  return [...merged.values()]
})


// --- Source grouping/sorting for both the List (flat) and Tree views ---
const { groupedCosts, flatGroupedCosts } = useGroupedMaterials({
  sortState,
  sortedCosts,
  treeRefs,
  inventoryAmounts: gameConfig.inventoryAmounts,
  flatQueuedAmounts,
  flatListEntries,
})


// --- By-creature grouping (mockup's "By creature" mode) ---
// Top-level summon ingredients per selected creature, enriched from the flat list
// where the item appears as a tree root (source label/icon, type).
const flatEntryById = computed(() => {
  const m = new Map<string, FlatListEntry>()
  for (const entry of flatListEntries.value) m.set(entry.itemId, entry)
  return m
})


interface CreatureCostGroup {
  creatureId: string
  creatureName: string
  creatureImage: string | null
  costs: FlatListEntry[]
}


const byCreatureGroups = computed<CreatureCostGroup[]>(() =>
  selectedCreatures.value.map((creature) => {
    const costs: FlatListEntry[] = creature.summoningCost.map((c) => {
      const enrich = flatEntryById.value.get(c.id)
      const item = itemById.get(c.id)
      return {
        itemId: c.id,
        itemName: enrich?.itemName ?? itemName(c.id),
        itemType: enrich?.itemType ?? item?.type ?? 'Refined',
        totalNeeded: c.amount,
        inventoryAmount: gameConfig.inventoryAmounts.value[c.id] ?? 0,
        queuedAmount: flatQueuedAmounts.value[c.id] ?? 0,
        sourceLabel: enrich?.sourceLabel ?? '',
        sourceIcon: enrich?.sourceIcon ?? null,
        sourceGroup: enrich?.sourceGroup ?? 'Other',
        gatherJob: enrich?.gatherJob ?? null,
        modifiers: enrich?.modifiers ?? [],
        maxDepth: 0,
      }
    })
    return {
      creatureId: creature.id,
      creatureName: creature.name,
      creatureImage: getCreatureImage(creature) ?? null,
      costs,
    }
  }),
)


// ─────────────────────────────────────────────────────────────────────────────
// Per-creature plan (rail + focus) — the Summon tab's primary view. See useCreaturePlan.
// ─────────────────────────────────────────────────────────────────────────────
const plan = useCreaturePlan({
  selectedCreatures,
  byCreatureGroups,
  sortedCosts,
  treeRefs,
  lockedGateByItemAll,
  playbookChapters,
  mergedInventory,
  plannerModifiers,
})
// `plan` now exists: sync its real blocked set into the holder the playbook reads above.
watch(plan.blockedCreatureIds, (ids) => (blockedCreatureIdsHolder.value = ids), {
  immediate: true,
})
const {
  planSort,
  planSortDir,
  planSortOptions,
  setPlanSort,
  planSelectedId,
  selectPlanCreature,
  orderedPlanBudgets,
  railEntries,
  focusedEntry,
  focusedRequirements,
  focusedWorthALook,
  focusedChapter,
  focusedIsActive,
  focusHasReserved,
  reservedNote,
} = plan
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div data-tour="summon-header" class="space-y-2">
        <SectionEyebrow>K2 Wiki · Planner</SectionEyebrow>
        <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          {{ headerTitle }}
        </h1>
        <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {{ t('summoningPlanner.header.subtitle') }}
        </p>
      </div>
    </div>

    <SummonCreaturePicker
      :open="pickerOpen"
      :creatures="unsummonedCreatures"
      :selected-ids="selectedIds"
      :get-level="getLevel"
      :is-awakened="isAwakened"
      @toggle="toggleCreature"
      @toggle-tier="toggleTier"
      @reset="resetSelection"
      @close="pickerOpen = false"
    />

    <!-- Mobile guard -->
    <PlannerEmptyState
      v-if="!isDesktop"
      :title="t('summoningPlanner.emptyState.desktopOnly')"
      :subtitle="t('summoningPlanner.emptyState.desktopOnlyHint')"
    />

    <!-- Main content: the rail stays mounted even with an empty selection, so adding the
         first creature populates the plan in place instead of swapping the whole layout. -->
    <div v-else class="space-y-6">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div data-tour="summon-views" class="flex rounded-lg border border-border/60 p-0.5">
          <button
            v-for="tab in viewTabs"
            :key="tab.id"
            class="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition"
            :class="
              viewMode === tab.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            :title="tab.description"
            @click="viewMode = tab.id"
          >
            <component :is="tab.icon" class="size-4" />
            {{ tab.label }}
          </button>
        </div>

        <!-- All-materials sub-view: List vs Tree -->
        <template v-if="viewMode === 'materials'">
          <div class="h-5 w-px bg-border/40" />
          <div class="flex rounded-lg border border-border/60 p-0.5">
            <button
              v-for="sub in materialsViewTabs"
              :key="sub.id"
              class="focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
              :class="
                materialsView === sub.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="materialsView = sub.id"
            >
              <component :is="sub.icon" class="size-3.5" />
              {{ sub.label }}
            </button>
          </div>
        </template>

        <template v-if="viewMode === 'materials'">
          <div class="h-5 w-px bg-border/40" />
          <div class="flex items-center gap-1.5">
            <span class="text-2xs font-medium text-muted-foreground/60">{{
              t('summoningPlanner.controls.groups')
            }}</span>
            <div class="flex rounded-lg border border-border/60 p-0.5">
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="collapseAllGroups()"
              >
                <ChevronsDownUp class="size-3.5" />
                {{ t('summoningPlanner.controls.collapse') }}
              </button>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="expandAllGroups()"
              >
                <ChevronsUpDown class="size-3.5" />
                {{ t('summoningPlanner.controls.expand') }}
              </button>
            </div>
          </div>
        </template>
        <template v-if="isTreeView">
          <div class="flex items-center gap-1.5">
            <span class="text-2xs font-medium text-muted-foreground/60">{{
              t('summoningPlanner.controls.nodes')
            }}</span>
            <div class="flex rounded-lg border border-border/60 p-0.5">
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="collapseAllTrees()"
              >
                <ChevronsDownUp class="size-3.5" />
                {{ t('summoningPlanner.controls.collapse') }}
              </button>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="expandAllTrees()"
              >
                <ChevronsUpDown class="size-3.5" />
                {{ t('summoningPlanner.controls.expand') }}
              </button>
            </div>
          </div>
        </template>

        <!-- Sort controls -->
        <div v-if="viewMode === 'materials'" class="ml-auto flex items-center gap-1.5">
          <span class="text-2xs font-medium text-muted-foreground/60">{{
            t('summoningPlanner.controls.sort')
          }}</span>
          <div class="flex rounded-lg border border-border/60 p-0.5">
            <button
              v-for="opt in [
                { value: 'name', label: t('summoningPlanner.controls.name') },
                { value: 'progress', label: t('summoningPlanner.controls.progress') },
                { value: 'complexity', label: t('summoningPlanner.controls.steps') },
              ] as const"
              :key="opt.value"
              class="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-2xs font-semibold transition"
              :class="
                sortState.field === opt.value && sortState.direction
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="toggleSort(opt.value)"
            >
              {{ opt.label }}
              <template v-if="sortState.field === opt.value && sortState.direction">
                <ArrowUp v-if="sortState.direction === 'asc'" class="size-3" />
                <ArrowDown v-else class="size-3" />
              </template>
              <ArrowUpDown v-else class="size-3 opacity-30" />
            </button>
          </div>
        </div>
      </div>

      <!-- Skill-gate roll-up (#2): Plan surfaces gates per creature; List has none. -->
      <SkillGateRollup v-if="isTreeView" :summary="skillGateSummary" class="mb-3" />

      <!-- Plan view: ordered rail + focused creature (requirements / next actions / worth a look) -->
      <div
        v-if="viewMode === 'plan'"
        class="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6"
      >
        <SummonPlanRail
          data-tour="summon-rail"
          :sort="planSort"
          :sort-dir="planSortDir"
          :entries="railEntries"
          :selected-id="planSelectedId"
          :sort-options="planSortOptions"
          class="lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:self-start"
          @update:sort="setPlanSort"
          @select="selectPlanCreature"
          @inspect="toggleInspectCreatureById"
          @add="pickerOpen = true"
        />

        <div v-if="focusedEntry" data-tour="summon-focus" class="min-w-0 space-y-6">
          <!-- Focus header -->
          <div class="surface-card flex items-center gap-3 p-4">
            <span class="size-12 shrink-0 overflow-hidden rounded-full bg-card">
              <img
                v-if="focusedEntry.image"
                :src="focusedEntry.image"
                :alt="focusedEntry.creature.name"
                class="size-full object-cover"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-lg font-bold text-foreground">
                  {{ focusedEntry.creature.name }}
                </h2>
                <span class="font-mono text-3xs uppercase tracking-wider text-muted-foreground/50">
                  T{{ focusedEntry.creature.tier + 1 }}
                </span>
                <span
                  v-if="focusedIsActive"
                  class="rounded-full bg-primary/15 px-2 py-0.5 text-3xs font-bold uppercase tracking-[0.12em] text-primary"
                >
                  {{ t('summoningPlanner.focus.doThisNow') }}
                </span>
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{
                  t('summoningPlanner.focus.requirementsStocked', {
                    fulfilled: focusedEntry.fulfilled,
                    total: focusedEntry.total,
                  })
                }}
              </p>
            </div>
            <div class="shrink-0 text-right">
              <div
                class="font-mono text-2xl font-extrabold leading-none"
                :class="
                  focusedEntry.blocked
                    ? 'text-warning-strong'
                    : focusedEntry.readiness >= 100
                      ? 'text-success-strong'
                      : 'text-foreground'
                "
              >
                {{ focusedEntry.readiness }}<span class="text-sm text-muted-foreground/50">%</span>
              </div>
              <div
                class="mt-1 font-mono text-3xs font-bold uppercase tracking-[0.12em]"
                :class="
                  focusedEntry.blocked
                    ? 'text-warning-strong'
                    : focusedEntry.readiness >= 100
                      ? 'text-success-strong'
                      : 'text-muted-foreground/50'
                "
              >
                {{
                  focusedEntry.blocked
                    ? t('summoningPlanner.focus.status.blocked')
                    : focusedEntry.readiness >= 100
                      ? t('summoningPlanner.focus.status.ready')
                      : t('summoningPlanner.focus.status.inProgress')
                }}
              </div>
              <div
                v-if="
                  focusedChapter &&
                  focusedChapter.etaSeconds > 0 &&
                  !focusedEntry.blocked &&
                  focusedEntry.readiness < 100
                "
                class="mt-1 flex items-center justify-end gap-1 font-mono text-2xs text-muted-foreground"
              >
                <Clock3 class="size-3" />{{
                  t('summoningPlanner.focus.toReady', {
                    duration: formatDuration(focusedChapter.etaSeconds),
                  })
                }}
              </div>
            </div>
          </div>

          <!-- Ways to improve · efficiency levers that speed up this creature's gathers
               (same engine as the Action plan). Hidden when nothing would help. -->
          <section v-if="focusedWorthALook.length" class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                {{ t('summoningPlanner.focus.waysToImprove') }}
              </span>
              <AppTooltip position="top">
                <Info class="size-3 shrink-0 text-muted-foreground/50" />
                <template #content>
                  {{ t('summoningPlanner.focus.waysToImproveHint') }}
                </template>
              </AppTooltip>
              <span class="h-px flex-1 bg-border/40" />
            </div>
            <SummonGatherAdvisoryList
              :advisories="focusedWorthALook"
              @inspect="toggleInspectCreatureById"
            />
          </section>

          <!-- Requirements: crafted → expandable chain, raw → have/need card with lock chip -->
          <section class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                {{ t('summoningPlanner.focus.requirements') }}
              </span>
              <span class="h-px flex-1 bg-border/40" />
            </div>
            <!-- Sequential-amounts legend: explains why a number here can read below what you
                 own (creatures ahead spend shared stock first). Shown only when it happens. -->
            <div
              v-if="focusHasReserved"
              class="flex items-start gap-2 rounded-lg border border-reserved/25 bg-reserved/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/80"
            >
              <Bookmark class="mt-0.5 size-4 shrink-0 text-reserved-strong" />
              <i18n-t keypath="summoningPlanner.focus.sequentialLegend.text" tag="span">
                <template #sequential>
                  <span class="font-semibold text-foreground">{{
                    t('summoningPlanner.focus.sequentialLegend.sequential')
                  }}</span>
                </template>
                <template #violet>
                  <span class="font-semibold text-reserved-strong">{{
                    t('summoningPlanner.focus.sequentialLegend.violet')
                  }}</span>
                </template>
                <template #need>
                  <span class="font-semibold text-reserved-strong">{{
                    t('summoningPlanner.focus.sequentialLegend.need')
                  }}</span>
                </template>
                <template #earmarked>
                  <span class="font-semibold text-foreground">{{
                    t('summoningPlanner.focus.sequentialLegend.earmarked')
                  }}</span>
                </template>
              </i18n-t>
            </div>
            <!-- Roomier gap between each crafting node (now that shared-stack callouts sit
                 above them), without inflating the header/legend spacing. -->
            <div class="space-y-6">
              <div v-for="r in focusedRequirements" :key="r.itemId" class="space-y-1.5">
                <!-- One hover group, sized to its content: hovering anywhere over the row's
                     left content (label, avatars, or icon) spreads the avatars and slides the
                     reserved note open together. inline-flex keeps the group as wide as its
                     content, so the empty space to the right doesn't trigger it. -->
                <div
                  v-if="r.sharedWith.length > 0"
                  class="group/shared inline-flex flex-wrap items-center gap-x-2 gap-y-1 pl-1"
                >
                  <span class="font-mono text-2xs text-muted-foreground">{{
                    t('summoningPlanner.focus.alsoNeededBy')
                  }}</span>
                  <CreatureAvatarStack :creatures="r.sharedWith" />
                  <span
                    v-if="r.ownedTotal > r.have && r.reservedBy.length"
                    class="inline-flex items-center text-xs font-medium text-reserved-strong"
                  >
                    <Bookmark class="size-3.5 shrink-0" />
                    <span
                      class="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover/shared:grid-cols-[1fr]"
                    >
                      <span class="overflow-hidden whitespace-nowrap pl-1">{{
                        reservedNote(r)
                      }}</span>
                    </span>
                  </span>
                </div>
                <SummoningMaterialTree
                  v-if="r.crafted && r.have < r.need"
                  :item-id="r.itemId"
                  :item-type="r.itemType"
                  :quantity="r.need"
                  :owned-creatures="ownedCreaturesList"
                  :creature-levels="collectionLevels"
                  :expeditions="expeditions"
                  :inventory-budget="orderedPlanBudgets[`${focusedEntry.creature.id}:${r.itemId}`]"
                  :owned-total-by-item="mergedInventory"
                />
                <SummoningObjectiveCard
                  v-else
                  :item-id="r.itemId"
                  :item-name="r.itemName"
                  :item-type="r.itemType"
                  :total-needed="r.need"
                  :inventory-amount="r.have >= r.need ? r.have : r.inventoryAmount"
                  :queued-amount="r.have >= r.need ? 0 : r.queuedAmount"
                  :source-label="r.sourceLabel"
                  :source-icon="r.sourceIcon"
                  :modifiers="r.modifiers"
                  :locked-gate="r.gate"
                  :effective-remaining="r.effectiveRemaining"
                  :owned-total="r.ownedTotal"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- All materials · List: aggregated objective cards, by source -->
      <div v-else-if="isListView" data-tour="summon-materials" class="min-w-0 space-y-6">
        <!-- By source -->
        <div v-for="section in flatGroupedCosts" :key="section.group" class="space-y-3">
          <button
            class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2 text-left transition hover:opacity-80"
            @click="toggleGroup(section.group)"
          >
            <ChevronDown
              class="size-3.5 text-muted-foreground transition-transform"
              :class="{ '-rotate-90': collapsedGroups.has(section.group) }"
            />
            <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              {{ section.label }}
            </span>
            <span class="text-3xs text-muted-foreground/40"> ({{ section.costs.length }}) </span>
            <span class="h-px flex-1 bg-border/40" />
          </button>
          <div v-if="!collapsedGroups.has(section.group)">
            <!-- With sub-groups (e.g., Gathered -> Fishing, Mining, etc.) -->
            <template v-if="section.subGroups">
              <div v-for="sub in section.subGroups" :key="sub.label" class="mb-4 space-y-2">
                <p
                  class="pl-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/45"
                >
                  {{ sub.label }}
                </p>
                <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <SummoningObjectiveCard
                    v-for="entry in sub.costs"
                    :key="entry.itemId"
                    :item-id="entry.itemId"
                    :item-name="entry.itemName"
                    :item-type="entry.itemType"
                    :total-needed="entry.totalNeeded"
                    :inventory-amount="entry.inventoryAmount"
                    :queued-amount="entry.queuedAmount"
                    :source-label="entry.sourceLabel"
                    :source-icon="entry.sourceIcon"
                    :modifiers="entry.modifiers"
                    :locked-gate="lockedGateByItemAll[entry.itemId] ?? null"
                  />
                </div>
              </div>
            </template>

            <!-- Flat list (no sub-groups) -->
            <template v-else>
              <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <SummoningObjectiveCard
                  v-for="entry in section.costs"
                  :key="entry.itemId"
                  :item-id="entry.itemId"
                  :item-name="entry.itemName"
                  :item-type="entry.itemType"
                  :total-needed="entry.totalNeeded"
                  :inventory-amount="entry.inventoryAmount"
                  :queued-amount="entry.queuedAmount"
                  :source-label="entry.sourceLabel"
                  :source-icon="entry.sourceIcon"
                  :modifiers="entry.modifiers"
                  :locked-gate="lockedGateByItemAll[entry.itemId] ?? null"
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- All materials · Tree: full craft trees, by source -->
      <div v-else-if="isTreeView" class="space-y-6">
        <div v-for="section in groupedCosts" :key="section.group" class="space-y-3">
          <button
            class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2 text-left transition hover:opacity-80"
            @click="toggleGroup(section.group)"
          >
            <ChevronDown
              class="size-3.5 text-muted-foreground transition-transform"
              :class="{ '-rotate-90': collapsedGroups.has(section.group) }"
            />
            <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              {{ section.label }}
            </span>
            <span class="text-3xs text-muted-foreground/40"> ({{ section.costs.length }}) </span>
            <span class="h-px flex-1 bg-border/40" />
          </button>
          <div v-if="!collapsedGroups.has(section.group)" class="space-y-3">
            <!-- With sub-groups (e.g., Gathered -> Fishing, Mining, etc.) -->
            <template v-if="section.subGroups">
              <div v-for="sub in section.subGroups" :key="sub.label" class="space-y-2">
                <p
                  class="pl-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/45"
                >
                  {{ sub.label }}
                </p>
                <template v-for="cost in sub.costs" :key="cost.itemId">
                  <PlannerTreeNode
                    v-if="treeRefs[cost.sortedIndex]?.rootNode"
                    :node="treeRefs[cost.sortedIndex].rootNode!"
                    :nodes-by-id="treeRefs[cost.sortedIndex].nodesById"
                    :active-method-id-by-node="treeRefs[cost.sortedIndex].activeMethodIdByNode"
                    :selected-node-id="treeRefs[cost.sortedIndex].selectedNodeId"
                    :selected-method-id="treeRefs[cost.sortedIndex].selectedMethodId"
                    :collapsed-node-ids="treeRefs[cost.sortedIndex].collapsedNodeIds"
                    :inventory-amounts="treeRefs[cost.sortedIndex].inventoryAmounts"
                    :queued-amounts="flatQueuedAmounts"
                    :completion-time-by-node="
                      treeRefs[cost.sortedIndex].schedule?.completionTimeByNode ?? {}
                    "
                    :node-annotations="buildNodeAnnotations(cost.sortedIndex)"
                    :subtree-cost-by-node="buildSubtreeCosts(cost.sortedIndex)"
                    :locked-gate-by-node="treeRefs[cost.sortedIndex].lockedGateByNode"
                    @select-node="treeSelectNode(cost.sortedIndex, $event)"
                    @select-method="treeSelectMethod(cost.sortedIndex, $event)"
                    @pin-method="
                      (nodeId: string, methodId: string) =>
                        treePinMethod(cost.sortedIndex, nodeId, methodId)
                    "
                    @toggle-collapse="treeToggleCollapse(cost.sortedIndex, $event)"
                  />
                </template>
              </div>
            </template>

            <!-- Flat list (no sub-groups) — used by Expedition, Garden, Currency, Other -->
            <template v-else>
              <!-- Gold total card (Currency group only) -->
              <div
                v-if="section.group === 'Currency' && totalGold > 0"
                class="flex min-w-0 items-start gap-1"
              >
                <span class="mt-4 w-5 shrink-0" />
                <div class="min-w-0 flex-1">
                  <SummoningObjectiveCard
                    item-id="gold"
                    :item-name="t('summoningPlanner.gold')"
                    item-type="Currency"
                    :total-needed="totalGold"
                    :inventory-amount="goldInventory"
                    source-label=""
                    :source-icon="getItemImage({ id: 'gold' })"
                    :modifiers="goldModifiers"
                    compact
                  />
                </div>
              </div>
              <template v-for="cost in section.costs" :key="cost.itemId">
                <div v-if="treeRefs[cost.sortedIndex]?.rootNode" class="space-y-1.5">
                  <PlannerTreeNode
                    :node="treeRefs[cost.sortedIndex].rootNode!"
                    :nodes-by-id="treeRefs[cost.sortedIndex].nodesById"
                    :active-method-id-by-node="treeRefs[cost.sortedIndex].activeMethodIdByNode"
                    :selected-node-id="treeRefs[cost.sortedIndex].selectedNodeId"
                    :selected-method-id="treeRefs[cost.sortedIndex].selectedMethodId"
                    :collapsed-node-ids="treeRefs[cost.sortedIndex].collapsedNodeIds"
                    :inventory-amounts="treeRefs[cost.sortedIndex].inventoryAmounts"
                    :queued-amounts="flatQueuedAmounts"
                    :completion-time-by-node="
                      treeRefs[cost.sortedIndex].schedule?.completionTimeByNode ?? {}
                    "
                    :node-annotations="buildNodeAnnotations(cost.sortedIndex)"
                    :subtree-cost-by-node="buildSubtreeCosts(cost.sortedIndex)"
                    :locked-gate-by-node="treeRefs[cost.sortedIndex].lockedGateByNode"
                    :force-collapsible="
                      section.group === 'Expedition' && !!getActiveExpeditionParty(cost.sortedIndex)
                    "
                    @select-node="treeSelectNode(cost.sortedIndex, $event)"
                    @select-method="treeSelectMethod(cost.sortedIndex, $event)"
                    @pin-method="
                      (nodeId: string, methodId: string) =>
                        treePinMethod(cost.sortedIndex, nodeId, methodId)
                    "
                    @toggle-collapse="treeToggleCollapse(cost.sortedIndex, $event)"
                  />
                  <!-- Expedition child card -->
                  <div
                    v-if="
                      section.group === 'Expedition' &&
                      getActiveExpeditionParty(cost.sortedIndex) &&
                      !treeRefs[cost.sortedIndex].collapsedNodeIds.has(
                        treeRefs[cost.sortedIndex].rootNode!.id,
                      )
                    "
                    class="ml-4 border-l-2 border-border/25 pl-4 pt-2"
                  >
                    <ExpeditionPartyCard
                      :party="getActiveExpeditionParty(cost.sortedIndex)!"
                      :alternatives="getDisplayedAlternatives(cost.sortedIndex)"
                      :conflicted-creature-ids="conflictedCreatureIds"
                      @inspect="toggleInspectCreature"
                      @conflict-enter="onConflictEnter"
                      @conflict-leave="onConflictLeave"
                      @select-variant="selectExpeditionVariant(cost.itemId, $event)"
                    />
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- Gold total when no other Currency items exist -->
      <div v-if="!hasCurrencyGroup && totalGold > 0" class="space-y-3">
        <div class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2">
          <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
            {{ t('summoningPlanner.currency') }}
          </span>
          <span class="h-px flex-1 bg-border/40" />
        </div>
        <div :class="isTreeView ? 'flex min-w-0 items-start gap-1' : ''">
          <span v-if="isTreeView" class="mt-4 w-5 shrink-0" />
          <div :class="isTreeView ? 'min-w-0 flex-1' : ''">
            <SummoningObjectiveCard
              item-id="gold"
              :item-name="t('summoningPlanner.gold')"
              item-type="Currency"
              :total-needed="totalGold"
              :inventory-amount="goldInventory"
              source-label=""
              :source-icon="getItemImage({ id: 'gold' })"
              :modifiers="goldModifiers"
              :compact="isTreeView"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Debug drawer trigger (dev only) -->
    <template v-if="isDev">
      <button
        v-if="aggregatedCosts.length > 0"
        class="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-warning/40 bg-card px-3 py-2 text-xs font-medium text-warning-strong shadow-lg transition hover:bg-warning/10 dark:text-warning-strong"
        @click="debugDrawerOpen = true"
      >
        <Bug class="size-4" />
        {{ t('summoningPlanner.debug') }}
      </button>
      <SummoningDebugPanel
        :open="debugDrawerOpen"
        :tree-refs="treeRefs"
        @close="debugDrawerOpen = false"
      />
    </template>

    <!-- Hidden trees for data (always rendered so summaries/schedules stay computed) -->
    <div v-if="aggregatedCosts.length > 0" class="hidden">
      <SummoningMaterialTree
        v-for="(cost, index) in sortedCosts"
        :key="cost.itemId"
        :ref="
          (el: any) => {
            if (el) treeRefs[index] = el
          }
        "
        :item-id="cost.itemId"
        :quantity="cost.amount"
        :owned-creatures="ownedCreaturesList"
        :creature-levels="collectionLevels"
        :expeditions="expeditions"
        :inventory-budget="inventoryBudgets[cost.itemId]"
        @activate="activeTreeIndex = index"
      />
    </div>

    <!-- Conflict popover -->
    <Teleport to="body">
      <Transition name="conflict-popover">
        <div
          v-if="conflictPopover"
          class="pointer-events-none z-50 w-72 -translate-y-full overflow-hidden rounded-xl border border-warning/40 bg-card shadow-xl shadow-black/30"
          :style="conflictPopover.style"
        >
          <div class="flex items-center gap-2 px-3 py-2.5">
            <div
              class="flex size-6 shrink-0 items-center justify-center rounded-md border border-warning/50 bg-warning/15"
            >
              <span class="text-xs font-bold text-warning-strong">!</span>
            </div>
            <div class="min-w-0">
              <span class="block text-xs font-semibold text-foreground">{{
                t('summoningPlanner.conflict.title')
              }}</span>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-1">
                <span class="text-2xs text-muted-foreground">{{
                  t('summoningPlanner.conflict.alsoAssignedTo')
                }}</span>
                <template v-for="(exp, ni) in conflictPopover.otherExpeditions" :key="ni">
                  <span v-if="ni > 0" class="text-2xs text-muted-foreground/50">,</span>
                  <span class="inline-flex items-center gap-1">
                    <img
                      v-if="getItemImage({ id: exp.rewardItemId })"
                      :src="getItemImage({ id: exp.rewardItemId })"
                      :alt="exp.name"
                      class="size-3.5 shrink-0 object-contain"
                    />
                    <span class="text-2xs font-semibold text-warning-strong">{{ exp.name }}</span>
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CreatureDetail
      :creature="inspectedCreature"
      :open="creatureDrawerOpen"
      @close="closeCreatureDrawer"
    />
  </div>
</template>

<style scoped>
.conflict-popover-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.conflict-popover-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.conflict-popover-enter-from,
.conflict-popover-leave-to {
  opacity: 0;
  transform: translateY(calc(-100% + 4px));
}
</style>
