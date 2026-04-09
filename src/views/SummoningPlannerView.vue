<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  Clock3,
  GanttChart,
  GitBranch,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import GoldRateBadge from '@/components/planner/GoldRateBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerInspector from '@/components/planner/PlannerInspector.vue'
import PlannerShoppingList from '@/components/planner/PlannerShoppingList.vue'
import PlannerTreeNode from '@/components/planner/PlannerTreeNode.vue'
import SummoningCreatureFilter from '@/components/summoning-planner/SummoningCreatureFilter.vue'
import SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import SummoningTimeline from '@/components/summoning-planner/SummoningTimeline.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useSummoningPlanner } from '@/composables/useSummoningPlanner'
import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import { expeditionSourceIndex, itemById, jobActivityIndex } from '@/data/indexes'
import type { PlannerNode, PlannerSummaryLeaf } from '@/types'
import type { Expedition } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, toTitleCase } from '@/utils/format'
import {
  calculateDuration,
  calculatePartyScore,
  getLootAmount,
  getRecommendedCreatures,
} from '@/utils/formulas'
import { expeditionTierIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { mergeSchedules } from '@/utils/mergeSchedules'
import { computePriorityWaves } from '@/utils/prioritySteps'

const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1280px)')
const { creatures } = useCreatures()
const { ownedCreatureIds, getLevel, isAwakened, collectionLevels } = useCreatureCollection()


const expeditions = expeditionsData as Expedition[]
const biomeMap = new Map((biomesData as import('@/types').Biome[]).map((b) => [b.id, b]))


const ownedCreaturesList = computed(() =>
  creatures.value.filter((c) => ownedCreatureIds.value.has(c.id)),
)


const {
  selectedIds,
  unsummonedCreatures,
  aggregatedCosts,
  toggleCreature,
  toggleTier,
  clearSelection,
} = useSummoningPlanner()


// --- Tab state ---
type SubTab = 'summary' | 'trees' | 'timeline'
const activeSubTab = ref<SubTab>('summary')


// --- Group collapse state ---
const collapsedGroups = ref(new Set<SourceGroup>())


function toggleGroup(group: SourceGroup) {
  const next = new Set(collapsedGroups.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  collapsedGroups.value = next
}


// --- Material sort ---
type MaterialSort = 'quantity' | 'name'
const materialSort = ref<MaterialSort>('quantity')


const sortedCosts = computed(() => {
  const costs = [...aggregatedCosts.value]
  if (materialSort.value === 'quantity') {
    return costs.toSorted((a, b) => b.amount - a.amount || a.itemName.localeCompare(b.itemName))
  }
  return costs // already alphabetical from composable
})


// --- Grouped costs by source type ---
type SourceGroup = 'Refined' | 'Gathered' | 'Expedition' | 'Garden' | 'Currency' | 'Other'


const sourceGroupOrder: SourceGroup[] = [
  'Refined',
  'Gathered',
  'Expedition',
  'Garden',
  'Currency',
  'Other',
]


const sourceGroupLabels: Record<SourceGroup, string> = {
  Refined: 'Refined Materials',
  Gathered: 'Gathered Resources',
  Expedition: 'Expedition Rewards',
  Garden: 'Garden Flowers',
  Currency: 'Currency',
  Other: 'Other',
}


function getSourceGroup(itemId: string): SourceGroup {
  const item = itemById.get(itemId)
  if (!item) return 'Other'
  if (item.type === 'Refined') return 'Refined'
  if (item.type === 'Currency') return 'Currency'
  if (item.type === 'Gathered') {
    // Garden items: no job source and no expedition source (flowers + raw essences)
    const hasJob = jobActivityIndex.has(itemId)
    const hasExpedition = expeditionSourceIndex.has(itemId)
    if (!hasJob && !hasExpedition) return 'Garden'
    // Expedition-only items: have expedition source but no job source
    if (hasExpedition && !hasJob) return 'Expedition'
    // Has job source — standard gathered
    return 'Gathered'
  }
  return 'Other'
}


function getGatherInfo(itemId: string): { jobId: string; levelRequirement: number } | null {
  const sources = jobActivityIndex.get(itemId)
  if (!sources || sources.length === 0) return null
  // Pick the lowest level source
  const best = sources.reduce((a, b) => (a.levelRequirement <= b.levelRequirement ? a : b))
  return { jobId: best.jobId, levelRequirement: best.levelRequirement }
}


interface GroupedCostEntry {
  itemId: string
  itemName: string
  amount: number
  sortedIndex: number
}


interface CostSubGroup {
  label: string
  costs: GroupedCostEntry[]
}


const groupedCosts = computed(() => {
  const groups = new Map<SourceGroup, GroupedCostEntry[]>()
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const cost = sortedCosts.value[i]
    const group = getSourceGroup(cost.itemId)
    const entry: GroupedCostEntry = { ...cost, sortedIndex: i }
    const list = groups.get(group)
    if (list) list.push(entry)
    else groups.set(group, [entry])
  }
  return sourceGroupOrder
    .filter((g) => groups.has(g))
    .map((g) => {
      const costs = groups.get(g)!
      let subGroups: CostSubGroup[] | null = null

      // Sub-group gathered items by job
      if (g === 'Gathered') {
        const byJob = new Map<string, GroupedCostEntry[]>()
        for (const cost of costs) {
          const info = getGatherInfo(cost.itemId)
          const jobId = info?.jobId ?? 'other'
          const list = byJob.get(jobId)
          if (list) list.push(cost)
          else byJob.set(jobId, [cost])
        }
        subGroups = [...byJob.entries()]
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([jobId, items]) => ({ label: toTitleCase(jobId), costs: items }))
      }

      return { group: g, label: sourceGroupLabels[g], costs, subGroups }
    })
})


// --- Tree refs & inspector ---
const treeRefs = ref<InstanceType<typeof SummoningMaterialTree>[]>([])
watch(
  () => sortedCosts.value.length,
  (len) => {
    treeRefs.value.splice(len)
  },
)
const activeTreeIndex = ref<number | null>(null)


const activeTree = computed(() => {
  if (activeTreeIndex.value == null) return null
  return treeRefs.value[activeTreeIndex.value] ?? null
})


const inspectorNode = computed(() => activeTree.value?.selectedNode ?? null)
const inspectorMethod = computed(() => activeTree.value?.selectedMethodObj ?? null)
const inspectorActiveMethod = computed(() => activeTree.value?.activeMethodForSelectedNode ?? null)
const inspectorNodesById = computed(() => activeTree.value?.nodesById ?? {})
const inspectorSchedule = computed(() => activeTree.value?.schedule ?? null)


function inspectorGetActiveMethod(nodeId: string) {
  return activeTree.value?.getActiveMethod(nodeId) ?? null
}


function handlePinMethod(nodeId: string, methodId: string) {
  activeTree.value?.setPinnedMethod(nodeId, methodId)
}


function handleSelectMethod(methodId: string) {
  activeTree.value?.selectMethod(methodId)
}


function handleSelectNode(nodeId: string) {
  activeTree.value?.selectNode(nodeId)
}


function handleOpenItemPlanner(itemId: string, quantity: number) {
  router.push({ name: 'planner', params: { id: itemId }, query: { qty: String(quantity) } })
}


// --- Merged leaf items (shopping list) ---
const mergedLeafItems = computed(() => {
  const merged = new Map<string, PlannerSummaryLeaf>()
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.summary) continue
    for (const leaf of tree.summary.leafItems) {
      const existing = merged.get(leaf.itemId)
      if (existing) {
        existing.amount += leaf.amount
        existing.stillNeeded += leaf.stillNeeded
        existing.inventoryAmount = Math.max(existing.inventoryAmount, leaf.inventoryAmount)
      } else {
        merged.set(leaf.itemId, { ...leaf })
      }
    }
  }
  return [...merged.values()].toSorted((a, b) => a.itemName.localeCompare(b.itemName))
})


const mergedShoppingListText = computed(() => {
  if (!mergedLeafItems.value.length) return ''
  const lines = mergedLeafItems.value.map((l) => `${l.amount}x ${l.itemName}`)
  return `Summoning Materials\n${lines.join('\n')}`
})


function formatAmount(value: number): string {
  return value.toLocaleString()
}


// --- Aggregate summary ---
const aggregateSummary = computed(() => {
  let totalCost = 0
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.summary) continue
    totalCost += tree.summary.totalCost
  }
  // Use the merged schedule's total time for a realistic estimate that
  // accounts for shared resource contention across all material trees.
  const merged = mergedSchedule.value
  const totalTime = merged.totalTime > 0 ? merged.totalTime : null
  return {
    totalTime,
    totalCost,
    materialCount: aggregatedCosts.value.length,
  }
})


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
      const info = getGatherInfo(node.itemId)
      if (info) {
        annotations[nodeId] = `Lv. ${info.levelRequirement}`
      }
    }
  }
  return annotations
}


// --- Expedition party recommendations with deconfliction ---
interface ExpeditionPartyVariant {
  party: { creature: import('@/types').Creature; rating: number }[]
  durationPerRun: number
  totalTime: number
  runsNeeded: number
}


interface ExpeditionAllocation {
  expeditionName: string
  rewardItemId: string
  tier: number
  lootPerRun: number
  primary: ExpeditionPartyVariant
  alternatives: ExpeditionPartyVariant[]
}


function buildPartyVariant(
  recommended: { creature: import('@/types').Creature; rating: number; level: number }[],
  expedition: import('@/types').Expedition,
  tier: number,
  targetAmount: number,
  sourceAmount: number,
  biome: import('@/types').Biome | undefined,
): ExpeditionPartyVariant | null {
  if (recommended.length === 0) return null


  // Find minimal party with diminishing returns threshold
  let bestPartySize = 1
  let bestTime = Infinity


  for (let size = 1; size <= Math.min(expedition.maxPartySize, recommended.length); size++) {
    const party = recommended.slice(0, size).map((p) => p.creature)
    const score = calculatePartyScore(party, expedition, collectionLevels.value, biome)
    const duration = calculateDuration(score, expedition, tier)
    const loot = getLootAmount(sourceAmount, tier)
    const runs = Math.ceil(targetAmount / loot)
    const totalTime = runs * duration


    if (size === 1) {
      bestTime = totalTime
      bestPartySize = 1
    } else {
      const improvement = (bestTime - totalTime) / bestTime
      if (improvement > 0.1) {
        bestTime = totalTime
        bestPartySize = size
      } else {
        break
      }
    }
  }


  const minimalParty = recommended.slice(0, bestPartySize)
  const partyCreatures = minimalParty.map((p) => p.creature)
  const score = calculatePartyScore(partyCreatures, expedition, collectionLevels.value, biome)
  const loot = getLootAmount(sourceAmount, tier)


  return {
    party: minimalParty.map((p) => ({ creature: p.creature, rating: p.rating })),
    durationPerRun: calculateDuration(score, expedition, tier),
    totalTime: bestTime,
    runsNeeded: Math.ceil(targetAmount / loot),
  }
}


// Track user-selected party variant per item
const selectedVariantByItem = ref<Record<string, number>>({}) // itemId → variant index (0 = primary)


const expeditionAllocations = computed(() => {
  const allocations = new Map<number, ExpeditionAllocation>()

  // 1. Collect all expedition-group items with their best expedition
  interface ExpeditionEntry {
    sortedIndex: number
    itemId: string
    targetAmount: number
    expedition: import('@/types').Expedition
    tier: number
    sourceAmount: number
  }

  const entries: ExpeditionEntry[] = []
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const cost = sortedCosts.value[i]
    if (getSourceGroup(cost.itemId) !== 'Expedition') continue
    const tree = treeRefs.value[i]
    if (!tree?.expeditionResult?.best) continue

    const best = tree.expeditionResult.best
    const sources = expeditionSourceIndex.get(cost.itemId)
    const source = sources?.find((s) => s.expeditionId === best.expedition.id)
    if (!source) continue

    const targetAmount = tree.rootNode?.requiredAmount ?? cost.amount
    if (targetAmount <= 0) continue // Fully stocked, no expedition needed

    entries.push({
      sortedIndex: i,
      itemId: cost.itemId,
      targetAmount,
      expedition: best.expedition,
      tier: best.tier,
      sourceAmount: source.amount,
    })
  }

  // 2. Sort by total time desc (hardest bottleneck gets first pick of creatures)
  entries.sort((a, b) => {
    const timeA = treeRefs.value[a.sortedIndex]?.expeditionResult?.best?.totalTime ?? 0
    const timeB = treeRefs.value[b.sortedIndex]?.expeditionResult?.best?.totalTime ?? 0
    return timeB - timeA
  })

  // 3. Greedily allocate creatures
  const reservedCreatureIds = new Set<string>()

  for (const entry of entries) {
    const biome = biomeMap.get(entry.expedition.biome)

    // Primary: best available creatures (excluding reserved)
    const availableForPrimary = getRecommendedCreatures(
      ownedCreaturesList.value,
      entry.expedition,
      collectionLevels.value,
      biome,
      reservedCreatureIds,
    )
    const primary = buildPartyVariant(
      availableForPrimary,
      entry.expedition,
      entry.tier,
      entry.targetAmount,
      entry.sourceAmount,
      biome,
    )

    // Generate alternatives
    const alternatives: ExpeditionPartyVariant[] = []

    if (primary) {
      // Alt 1: Use all creatures (ignoring reservations) — shows what's optimal if no conflicts
      const allCreatures = getRecommendedCreatures(
        ownedCreaturesList.value,
        entry.expedition,
        collectionLevels.value,
        biome,
      )
      const unrestricted = buildPartyVariant(
        allCreatures,
        entry.expedition,
        entry.tier,
        entry.targetAmount,
        entry.sourceAmount,
        biome,
      )
      // Only add if different from primary
      if (unrestricted && unrestricted.totalTime < primary.totalTime * 0.95) {
        alternatives.push(unrestricted)
      }

      // Alt 2: Smaller party (1 fewer creature from primary)
      if (primary.party.length > 1) {
        const smallerRecommended = availableForPrimary.slice(0, primary.party.length - 1)
        const smaller = buildPartyVariant(
          smallerRecommended,
          entry.expedition,
          entry.tier,
          entry.targetAmount,
          entry.sourceAmount,
          biome,
        )
        if (smaller) {
          alternatives.push(smaller)
        }
      }

      // Reserve creatures from primary party
      for (const member of primary.party) {
        reservedCreatureIds.add(member.creature.id)
      }
    }

    if (primary) {
      allocations.set(entry.sortedIndex, {
        expeditionName: entry.expedition.name,
        rewardItemId: entry.expedition.rewards[0]?.itemId ?? '',
        tier: entry.tier,
        lootPerRun: getLootAmount(entry.sourceAmount, entry.tier),
        primary,
        alternatives,
      })
    }
  }

  return allocations
})


function getActiveExpeditionParty(
  sortedIndex: number,
): (ExpeditionAllocation & { activeVariant: ExpeditionPartyVariant }) | null {
  const allocation = expeditionAllocations.value.get(sortedIndex)
  if (!allocation) return null
  const itemId = sortedCosts.value[sortedIndex]?.itemId
  const variantIndex = itemId ? (selectedVariantByItem.value[itemId] ?? 0) : 0
  const activeVariant =
    variantIndex === 0
      ? allocation.primary
      : (allocation.alternatives[variantIndex - 1] ?? allocation.primary)
  return { ...allocation, activeVariant }
}


function selectExpeditionVariant(itemId: string, variantIndex: number) {
  selectedVariantByItem.value = { ...selectedVariantByItem.value, [itemId]: variantIndex }
}


/** Get the alternatives to show — swaps active selection back into the list and removes it from alts */
function getDisplayedAlternatives(
  sortedIndex: number,
): { variant: ExpeditionPartyVariant; targetIndex: number }[] {
  const allocation = expeditionAllocations.value.get(sortedIndex)
  if (!allocation) return []
  const itemId = sortedCosts.value[sortedIndex]?.itemId
  const activeIndex = itemId ? (selectedVariantByItem.value[itemId] ?? 0) : 0


  const result: { variant: ExpeditionPartyVariant; targetIndex: number }[] = []


  // If an alt is active, show the original primary as a swappable option
  if (activeIndex > 0) {
    result.push({ variant: allocation.primary, targetIndex: 0 })
  }


  // Show non-active alternatives
  for (let i = 0; i < allocation.alternatives.length; i++) {
    if (i + 1 !== activeIndex) {
      result.push({ variant: allocation.alternatives[i], targetIndex: i + 1 })
    }
  }


  return result
}


// Detect creatures used in multiple active parties
const conflictedCreatureIds = computed(() => {
  const creatureCounts = new Map<string, number>()
  for (const [sortedIndex] of expeditionAllocations.value) {
    const active = getActiveExpeditionParty(sortedIndex)
    if (!active) continue
    for (const member of active.activeVariant.party) {
      creatureCounts.set(member.creature.id, (creatureCounts.get(member.creature.id) ?? 0) + 1)
    }
  }
  const conflicts = new Set<string>()
  for (const [id, count] of creatureCounts) {
    if (count > 1) conflicts.add(id)
  }
  return conflicts
})


// --- Timeline tab computeds ---
const mergedSchedule = computed(() => {
  const schedules: { itemName: string; schedule: import('@/types').PlannerSchedule }[] = []
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.schedule || !tree?.rootNode) continue
    schedules.push({ itemName: tree.rootNode.itemName, schedule: tree.schedule })
  }
  return mergeSchedules(schedules)
})


const mergedNodesById = computed(() => {
  const merged: Record<string, PlannerNode> = {}
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.nodesById) continue
    for (const [nodeId, node] of Object.entries(tree.nodesById)) {
      merged[`tree${i}/${nodeId}`] = node
    }
  }
  return merged
})


const priorityWaves = computed(() =>
  computePriorityWaves(mergedSchedule.value, mergedNodesById.value),
)


const expeditionPartiesByItemId = computed(() => {
  const map: Record<
    string,
    { expeditionName: string; party: { creature: import('@/types').Creature; rating: number }[] }
  > = {}
  for (const [sortedIndex, allocation] of expeditionAllocations.value) {
    const itemId = sortedCosts.value[sortedIndex]?.itemId
    if (!itemId) continue
    const active = getActiveExpeditionParty(sortedIndex)
    if (!active) continue
    map[itemId] = {
      expeditionName: allocation.expeditionName,
      party: active.activeVariant.party,
    }
  }
  return map
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Summoning Planner
      </p>
      <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        Summoning Costs
      </h1>
      <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Select unsummoned creatures to see the full crafting breakdown for all required materials.
      </p>
      <GoldRateBadge />
    </div>

    <SummoningCreatureFilter
      :creatures="unsummonedCreatures"
      :selected-ids="selectedIds"
      :get-level="getLevel"
      :is-awakened="isAwakened"
      @toggle="toggleCreature"
      @toggle-tier="toggleTier"
      @reset="clearSelection"
    />

    <!-- Empty state -->
    <PlannerEmptyState
      v-if="aggregatedCosts.length === 0"
      title="Choose creatures to plan summoning costs."
      subtitle="Select creatures above to see the full material breakdown with crafting trees."
    />

    <!-- Tab content -->
    <template v-if="aggregatedCosts.length > 0">
      <!-- Sub-tab buttons -->
      <div class="flex justify-center">
        <div class="inline-flex rounded-xl border border-border/60 bg-card/60 p-1">
          <button
            class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
            :class="
              activeSubTab === 'summary'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
            "
            @click="activeSubTab = 'summary'"
          >
            <ClipboardList class="size-4" />
            Summary
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
            :class="
              activeSubTab === 'trees'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
            "
            @click="activeSubTab = 'trees'"
          >
            <GitBranch class="size-4" />
            Craft Trees
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
            :class="
              activeSubTab === 'timeline'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
            "
            @click="activeSubTab = 'timeline'"
          >
            <GanttChart class="size-4" />
            Timeline
          </button>
        </div>
      </div>

      <!-- ═══ Summary Tab ═══ -->
      <div v-if="activeSubTab === 'summary'" class="space-y-6">
        <!-- Totals bar -->
        <div
          v-if="aggregateSummary.totalTime != null || aggregateSummary.totalCost > 0"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-card/60 px-4 py-2.5 text-sm"
        >
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Total
          </span>
          <span
            v-if="aggregateSummary.totalTime != null"
            class="inline-flex items-center gap-1.5 font-semibold text-foreground"
          >
            <Clock3 class="size-3.5 text-emerald-600 dark:text-emerald-400" />
            {{ formatDuration(aggregateSummary.totalTime) }}
          </span>
          <span
            v-if="aggregateSummary.totalCost > 0"
            class="inline-flex items-center gap-1.5 font-semibold text-foreground"
          >
            <img
              v-if="getItemImage({ id: 'gold' })"
              :src="getItemImage({ id: 'gold' })"
              alt="Gold"
              class="size-3.5 object-contain"
            />
            {{ Math.round(aggregateSummary.totalCost).toLocaleString() }}
          </span>
          <span class="text-xs text-muted-foreground">
            {{ aggregateSummary.materialCount }} materials
          </span>
        </div>

        <!-- Shopping list -->
        <PlannerShoppingList
          v-if="mergedLeafItems.length > 0"
          :leaf-items="mergedLeafItems"
          :format-amount="formatAmount"
          :shopping-list-text="mergedShoppingListText"
        />
      </div>

      <!-- ═══ Craft Trees Tab ═══ -->
      <div v-else-if="activeSubTab === 'trees'" class="space-y-4">
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Materials ({{ aggregatedCosts.length }})
          </p>
          <div
            class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
          >
            <button
              class="focus-ring flex h-7 items-center gap-1 px-2.5 text-[11px] font-semibold transition"
              :class="
                materialSort === 'quantity'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="materialSort = 'quantity'"
            >
              <ArrowDownWideNarrow class="size-3" />
              Quantity
            </button>
            <button
              class="focus-ring flex h-7 items-center px-2.5 text-[11px] font-semibold transition"
              :class="
                materialSort === 'name'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="materialSort = 'name'"
            >
              Name
            </button>
          </div>
          <button
            class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
            @click="collapseAllTrees"
          >
            <ChevronsDownUp class="size-3.5" />
            Collapse to Leaves
          </button>
          <button
            class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
            @click="expandAllTrees"
          >
            <ChevronsUpDown class="size-3.5" />
            Expand All
          </button>
        </div>

        <!-- Trees + Inspector grid -->
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div class="space-y-6">
            <div v-for="section in groupedCosts" :key="section.group" class="space-y-3">
              <button
                class="flex items-center gap-2 text-left transition hover:opacity-80"
                @click="toggleGroup(section.group)"
              >
                <ChevronDown
                  class="size-3.5 text-muted-foreground/50 transition-transform"
                  :class="{ '-rotate-90': collapsedGroups.has(section.group) }"
                />
                <span
                  class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60"
                >
                  {{ section.label }}
                </span>
                <span class="text-[10px] text-muted-foreground/40">
                  ({{ section.costs.length }})
                </span>
              </button>
              <div v-if="!collapsedGroups.has(section.group)" class="space-y-3">
                <!-- With sub-groups (e.g., Gathered → Fishing, Mining, etc.) -->
                <template v-if="section.subGroups">
                  <div v-for="sub in section.subGroups" :key="sub.label" class="space-y-2">
                    <p
                      class="pl-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/45"
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
                        :completion-time-by-node="
                          treeRefs[cost.sortedIndex].schedule?.completionTimeByNode ?? {}
                        "
                        :node-annotations="buildNodeAnnotations(cost.sortedIndex)"
                        :subtree-cost-by-node="buildSubtreeCosts(cost.sortedIndex)"
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
                        :completion-time-by-node="
                          treeRefs[cost.sortedIndex].schedule?.completionTimeByNode ?? {}
                        "
                        :node-annotations="buildNodeAnnotations(cost.sortedIndex)"
                        :subtree-cost-by-node="buildSubtreeCosts(cost.sortedIndex)"
                        :force-collapsible="
                          section.group === 'Expedition' &&
                          !!getActiveExpeditionParty(cost.sortedIndex)
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
                        <div class="rounded-lg border border-border/40 bg-card/50 px-3 py-2.5">
                          <!-- Row 1: Reward icon + Expedition name | Duration + Tier -->
                          <div class="flex items-center gap-2">
                            <div class="flex min-w-0 flex-1 items-center gap-1.5">
                              <img
                                v-if="
                                  getItemImage({
                                    id: getActiveExpeditionParty(cost.sortedIndex)!.rewardItemId,
                                  })
                                "
                                :src="
                                  getItemImage({
                                    id: getActiveExpeditionParty(cost.sortedIndex)!.rewardItemId,
                                  })
                                "
                                :alt="getActiveExpeditionParty(cost.sortedIndex)!.expeditionName"
                                class="size-5 shrink-0 object-contain"
                              />
                              <p class="truncate text-sm font-semibold text-foreground">
                                {{ getActiveExpeditionParty(cost.sortedIndex)!.expeditionName }}
                              </p>
                            </div>
                            <div class="flex shrink-0 items-center gap-1.5">
                              <span
                                class="text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                              >
                                {{
                                  formatDuration(
                                    getActiveExpeditionParty(cost.sortedIndex)!.activeVariant
                                      .durationPerRun,
                                  )
                                }}
                              </span>
                              <img
                                :src="
                                  expeditionTierIcons[
                                    getActiveExpeditionParty(cost.sortedIndex)!.tier
                                  ]
                                "
                                :alt="`Tier ${getActiveExpeditionParty(cost.sortedIndex)!.tier}`"
                                class="size-4 object-contain"
                              />
                            </div>
                          </div>

                          <!-- Divider -->
                          <div class="my-2 border-t border-border/40" />

                          <!-- Active party -->
                          <div class="flex items-center gap-1.5">
                            <div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
                              <div
                                v-for="member in getActiveExpeditionParty(cost.sortedIndex)!
                                  .activeVariant.party"
                                :key="member.creature.id"
                                class="inline-flex items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-2"
                                :class="
                                  conflictedCreatureIds.has(member.creature.id)
                                    ? 'border-amber-500/50 bg-amber-500/10'
                                    : 'border-border bg-muted/35'
                                "
                              >
                                <div class="size-5 overflow-hidden rounded-md bg-card">
                                  <img
                                    v-if="getCreatureImage(member.creature)"
                                    :src="getCreatureImage(member.creature)"
                                    :alt="member.creature.name"
                                    class="size-full object-cover"
                                  />
                                </div>
                                <span class="text-[10px] font-semibold text-foreground">{{
                                  member.creature.name
                                }}</span>
                              </div>
                            </div>
                            <div class="flex shrink-0 items-center gap-1.5 font-mono text-xs">
                              <span class="text-muted-foreground">
                                {{
                                  getActiveExpeditionParty(cost.sortedIndex)!.activeVariant
                                    .runsNeeded
                                }}
                                runs
                              </span>
                              <span
                                class="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"
                              >
                                <Clock3 class="size-3" />
                                {{
                                  formatDuration(
                                    getActiveExpeditionParty(cost.sortedIndex)!.activeVariant
                                      .totalTime,
                                  )
                                }}
                              </span>
                            </div>
                          </div>

                          <!-- Alternative parties (swaps with primary when selected) -->
                          <template v-if="getDisplayedAlternatives(cost.sortedIndex).length">
                            <div class="mt-2 space-y-1">
                              <button
                                v-for="{ variant, targetIndex } in getDisplayedAlternatives(
                                  cost.sortedIndex,
                                )"
                                :key="targetIndex"
                                class="flex w-full items-center gap-1.5 rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-left transition hover:border-primary/30 hover:bg-primary/5"
                                @click="selectExpeditionVariant(cost.itemId, targetIndex)"
                              >
                                <span
                                  class="text-[9px] font-semibold uppercase text-muted-foreground/50"
                                  >Alt</span
                                >
                                <div class="flex min-w-0 flex-1 flex-wrap gap-1">
                                  <div
                                    v-for="member in variant.party"
                                    :key="member.creature.id"
                                    class="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/25 py-0.5 pl-0.5 pr-1.5"
                                  >
                                    <div class="size-4 overflow-hidden rounded bg-card">
                                      <img
                                        v-if="getCreatureImage(member.creature)"
                                        :src="getCreatureImage(member.creature)"
                                        :alt="member.creature.name"
                                        class="size-full object-cover"
                                      />
                                    </div>
                                    <span class="text-[9px] font-semibold text-muted-foreground">{{
                                      member.creature.name
                                    }}</span>
                                  </div>
                                </div>
                                <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
                                  {{ formatDuration(variant.totalTime) }}
                                </span>
                              </button>
                            </div>
                          </template>
                        </div>
                      </div>
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>

          <PlannerInspector
            v-if="isDesktop"
            :focus-node="inspectorNode"
            :focus-method="inspectorMethod"
            :active-method="inspectorActiveMethod"
            :nodes-by-id="inspectorNodesById"
            :schedule="inspectorSchedule"
            :get-active-method-for-node="inspectorGetActiveMethod"
            :format-amount="formatAmount"
            :is-root-node="false"
            @pin-method="handlePinMethod"
            @select-method="handleSelectMethod"
            @select-node="handleSelectNode"
            @open-item-planner="handleOpenItemPlanner"
          />
        </div>
      </div>

      <!-- ═══ Timeline Tab ═══ -->
      <SummoningTimeline
        v-else-if="activeSubTab === 'timeline'"
        :schedule="mergedSchedule"
        :nodes-by-id="mergedNodesById"
        :waves="priorityWaves"
        :expedition-parties="expeditionPartiesByItemId"
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
        @activate="activeTreeIndex = index"
      />
    </div>
  </div>
</template>
