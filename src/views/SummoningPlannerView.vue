<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bug,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  Clock3,
  GanttChart,
  Network,
} from 'lucide-vue-next'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerTreeNode from '@/components/planner/PlannerTreeNode.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import SummoningCreatureFilter from '@/components/summoning-planner/SummoningCreatureFilter.vue'
import SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import SummoningObjectiveCard from '@/components/summoning-planner/SummoningObjectiveCard.vue'
import SummoningTimeline from '@/components/summoning-planner/SummoningTimeline.vue'
import { computeInventoryBudgets, usePlannerModifiers } from '@/composables/useCraftPlanner'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { useGoldIncome } from '@/composables/useGoldIncome'
import { useSummoningPlanner } from '@/composables/useSummoningPlanner'
import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import { expeditionSourceIndex, itemById, jobActivityIndex } from '@/data/indexes'
import type { Expedition, PlannerNode } from '@/types'
import { applyByProductCreditsToSchedule, computeByProductCredits } from '@/utils/byProductCredits'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, itemName, toTitleCase } from '@/utils/format'
import {
  calculateDuration,
  calculatePartyScore,
  getLootAmount,
  getRecommendedCreatures,
} from '@/utils/formulas'
import { expeditionTierIcons, sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { mergeSchedules } from '@/utils/mergeSchedules'
import { extractModifierChips, type ModifierChip } from '@/utils/modifierChips'
import { computePriorityWaves } from '@/utils/prioritySteps'

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


// --- View mode ---
const viewMode = ref<'list' | 'tree' | 'timeline'>('list')


const viewTabs = computed(() => [
  {
    id: 'list' as const,
    label: t('summoningPlanner.tabs.list'),
    icon: ClipboardList,
    description: t('summoningPlanner.tabs.listDescription'),
  },
  {
    id: 'tree' as const,
    label: t('summoningPlanner.tabs.tree'),
    icon: Network,
    description: t('summoningPlanner.tabs.treeDescription'),
  },
  {
    id: 'timeline' as const,
    label: t('summoningPlanner.tabs.timeline'),
    icon: GanttChart,
    description: t('summoningPlanner.tabs.timelineDescription'),
  },
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
type SortField = 'name' | 'progress' | 'complexity'
type SortDirection = 'asc' | 'desc' | null


interface SortState {
  field: SortField
  direction: SortDirection
}


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


const inventoryBudgets = computed(() => {
  const costs = sortedCosts.value
  if (costs.length === 0) return {}
  const targets = costs.map((c) => ({ itemId: c.itemId, quantity: c.amount }))
  return computeInventoryBudgets(targets, mergedInventory.value, plannerModifiers.value)
})


// --- Grouped costs by source type ---
type SourceGroup =
  | 'Refined'
  | 'Gathered'
  | 'Expedition'
  | 'Garden'
  | 'Merchant'
  | 'Currency'
  | 'Other'


const sourceGroupOrder: SourceGroup[] = [
  'Refined',
  'Gathered',
  'Expedition',
  'Garden',
  'Merchant',
  'Currency',
  'Other',
]


const sourceGroupLabels: Record<SourceGroup, string> = {
  Refined: t('summoningPlanner.sourceGroups.refined'),
  Gathered: t('summoningPlanner.sourceGroups.gathered'),
  Expedition: t('summoningPlanner.sourceGroups.expedition'),
  Garden: t('summoningPlanner.sourceGroups.garden'),
  Merchant: t('summoningPlanner.sourceGroups.merchant'),
  Currency: t('summoningPlanner.sourceGroups.currency'),
  Other: t('summoningPlanner.sourceGroups.other'),
}


function getSourceGroup(itemId: string, activeMethodKind?: string): SourceGroup {
  if (activeMethodKind === 'buy') return 'Merchant'
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


function sortTreeEntries(entries: GroupedCostEntry[]): GroupedCostEntry[] {
  const { field, direction } = sortState.value
  if (!direction) return entries
  const dir = direction === 'asc' ? 1 : -1
  return entries.toSorted((a, b) => {
    switch (field) {
      case 'name':
        return dir * a.itemName.localeCompare(b.itemName)
      case 'progress': {
        const invA =
          (gameConfig.inventoryAmounts.value[a.itemId] ?? 0) +
          (flatQueuedAmounts.value[a.itemId] ?? 0)
        const invB =
          (gameConfig.inventoryAmounts.value[b.itemId] ?? 0) +
          (flatQueuedAmounts.value[b.itemId] ?? 0)
        const pctA = a.amount > 0 ? invA / a.amount : 1
        const pctB = b.amount > 0 ? invB / b.amount : 1
        return dir * (pctA - pctB) || a.itemName.localeCompare(b.itemName)
      }
      case 'complexity': {
        const stepsA = treeRefs.value[a.sortedIndex]?.summary?.craftStepCount ?? 0
        const stepsB = treeRefs.value[b.sortedIndex]?.summary?.craftStepCount ?? 0
        return dir * (stepsA - stepsB) || a.itemName.localeCompare(b.itemName)
      }
      default:
        return 0
    }
  })
}


const groupedCosts = computed(() => {
  const groups = new Map<SourceGroup, GroupedCostEntry[]>()
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const cost = sortedCosts.value[i]
    const tree = treeRefs.value[i]
    const rootId = tree?.rootNode?.id
    const activeMethodKind = rootId ? tree?.getActiveMethod(rootId)?.kind : undefined
    const group = getSourceGroup(cost.itemId, activeMethodKind)
    const entry: GroupedCostEntry = { ...cost, sortedIndex: i }
    const list = groups.get(group)
    if (list) list.push(entry)
    else groups.set(group, [entry])
  }
  return sourceGroupOrder
    .filter((g) => groups.has(g))
    .map((g) => {
      const costs = sortTreeEntries(groups.get(g)!)
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
        annotations[nodeId] = t('summoningPlanner.gatherLevel', { n: info.levelRequirement })
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
interface CreatureExpeditionEntry {
  name: string
  rewardItemId: string
}


const creatureExpeditionMap = computed(() => {
  const map = new Map<string, CreatureExpeditionEntry[]>()
  for (const [sortedIndex] of expeditionAllocations.value) {
    const active = getActiveExpeditionParty(sortedIndex)
    if (!active) continue
    const entry: CreatureExpeditionEntry = {
      name: active.expeditionName,
      rewardItemId: active.rewardItemId,
    }
    for (const member of active.activeVariant.party) {
      const list = map.get(member.creature.id)
      if (list) list.push(entry)
      else map.set(member.creature.id, [entry])
    }
  }
  return map
})


const conflictedCreatureIds = computed(() => {
  const conflicts = new Set<string>()
  for (const [id, entries] of creatureExpeditionMap.value) {
    if (entries.length > 1) conflicts.add(id)
  }
  return conflicts
})


// Conflict popover state
const conflictPopover = ref<{
  creatureId: string
  otherExpeditions: CreatureExpeditionEntry[]
  style: Record<string, string>
} | null>(null)


function onConflictEnter(creatureId: string, currentExpedition: string, event: MouseEvent) {
  if (!conflictedCreatureIds.value.has(creatureId)) return
  const target = event.currentTarget as HTMLElement
  if (!target) return
  const rect = target.getBoundingClientRect()
  const GAP = 8
  const POPOVER_WIDTH = 288
  const viewportWidth = document.documentElement.clientWidth
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
  left = Math.max(GAP, Math.min(left, viewportWidth - POPOVER_WIDTH - GAP))
  const allExpeditions = creatureExpeditionMap.value.get(creatureId) ?? []
  const otherExpeditions = allExpeditions.filter((e) => e.name !== currentExpedition)
  conflictPopover.value = {
    creatureId,
    otherExpeditions,
    style: { position: 'fixed', top: `${rect.top - GAP}px`, left: `${left}px` },
  }
}


function onConflictLeave() {
  conflictPopover.value = null
}


// --- Timeline tab computeds ---


/** Trees that have valid schedule data, collected once to ensure consistent indexing */
const validTrees = computed(() => {
  const result: InstanceType<typeof SummoningMaterialTree>[] = []
  for (let i = 0; i < sortedCosts.value.length; i++) {
    const tree = treeRefs.value[i]
    if (!tree?.schedule || !tree?.rootNode || !tree?.nodesById) continue
    result.push(tree)
  }
  // Sort by root item name so mergeSchedules receives a stable input order
  // regardless of the UI sort state (prevents treeIndex tie-breaker drift)
  return result.toSorted((a, b) => a.rootNode!.itemName.localeCompare(b.rootNode!.itemName))
})


const byProductCredits = computed(() => {
  const treeData: {
    nodesById: Record<string, import('@/types').PlannerNode>
    activeMethodIdByNode: Record<string, string | null>
  }[] = []
  for (const tree of validTrees.value) {
    treeData.push({
      nodesById: tree.nodesById,
      activeMethodIdByNode: tree.activeMethodIdByNode,
    })
  }
  return computeByProductCredits(treeData)
})


const mergedSchedule = computed(() => {
  const schedules: { itemName: string; schedule: import('@/types').PlannerSchedule }[] = []
  for (const tree of validTrees.value) {
    schedules.push({ itemName: tree.rootNode!.itemName, schedule: tree.schedule! })
  }
  const merged = mergeSchedules(schedules)
  return applyByProductCreditsToSchedule(merged, byProductCredits.value)
})


const mergedNodesById = computed(() => {
  const merged: Record<string, PlannerNode> = {}
  for (let treeIndex = 0; treeIndex < validTrees.value.length; treeIndex++) {
    const tree = validTrees.value[treeIndex]
    if (tree.nodesById) {
      for (const [nodeId, node] of Object.entries(tree.nodesById)) {
        merged[`tree${treeIndex}/${nodeId}`] = node
      }
    }
  }
  return merged
})


const priorityWaves = computed(() =>
  computePriorityWaves(mergedSchedule.value, mergedNodesById.value, flatQueuedAmounts.value),
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


// --- Parallel estimate (moved from SummoningTimeline) ---
const parallelEstimate = computed(() => {
  const { tasks } = mergedSchedule.value
  if (tasks.length === 0) return null

  let maxPassive = 0
  let maxActive = 0

  for (const task of tasks) {
    if (task.kind === 'expedition' || task.kind === 'garden') {
      maxPassive = Math.max(maxPassive, task.endTime)
    } else {
      maxActive = Math.max(maxActive, task.endTime)
    }
  }

  if (maxPassive > 0 && maxActive > 0) {
    return Math.max(maxPassive, maxActive)
  }

  return null
})


// --- Readiness (top-level aggregated costs vs inventory) ---
const readiness = computed(() => {
  const costs = aggregatedCosts.value
  if (costs.length === 0) return { percent: 0, fulfilled: 0, total: 0 }

  let fulfilled = 0
  for (const cost of costs) {
    const owned =
      (gameConfig.inventoryAmounts.value[cost.itemId] ?? 0) +
      (flatQueuedAmounts.value[cost.itemId] ?? 0)
    if (owned >= cost.amount) fulfilled++
  }
  const percent = Math.round((fulfilled / costs.length) * 100)
  return { percent, fulfilled, total: costs.length }
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
        'border-yellow-600/35 bg-yellow-100 text-yellow-800 dark:border-yellow-400/40 dark:bg-yellow-400/20 dark:text-yellow-100',
      accentColor: 'bg-yellow-500',
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
interface FlatListEntry {
  itemId: string
  itemName: string
  itemType: import('@/types').ItemType
  totalNeeded: number
  inventoryAmount: number
  queuedAmount: number
  sourceLabel: string
  sourceIcon: string | null
  sourceGroup: SourceGroup
  gatherJob: string | null
  modifiers: ModifierChip[]
  maxDepth: number
}


const flatListEntries = computed(() => {
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
      const gatherInfo = getGatherInfo(node.itemId)
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


function sortFlatEntries(entries: FlatListEntry[]): FlatListEntry[] {
  const { field, direction } = sortState.value
  if (!direction) return entries
  const dir = direction === 'asc' ? 1 : -1
  return entries.toSorted((a, b) => {
    switch (field) {
      case 'name':
        return dir * a.itemName.localeCompare(b.itemName)
      case 'progress': {
        const pctA = a.totalNeeded > 0 ? a.inventoryAmount / a.totalNeeded : 1
        const pctB = b.totalNeeded > 0 ? b.inventoryAmount / b.totalNeeded : 1
        return dir * (pctA - pctB) || a.itemName.localeCompare(b.itemName)
      }
      case 'complexity':
        return dir * (a.maxDepth - b.maxDepth) || a.itemName.localeCompare(b.itemName)
      default:
        return 0
    }
  })
}


const flatGroupedCosts = computed(() => {
  const groups = new Map<SourceGroup, FlatListEntry[]>()
  for (const entry of flatListEntries.value) {
    const list = groups.get(entry.sourceGroup)
    if (list) list.push(entry)
    else groups.set(entry.sourceGroup, [entry])
  }

  return sourceGroupOrder
    .filter((g) => groups.has(g))
    .map((g) => {
      const costs = sortFlatEntries(groups.get(g)!)
      let subGroups: { label: string; costs: FlatListEntry[] }[] | null = null

      if (g === 'Gathered') {
        const byJob = new Map<string, FlatListEntry[]>()
        for (const cost of costs) {
          const jobId = cost.gatherJob ?? 'other'
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
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {{ t('summoningPlanner.title') }}
      </p>
      <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {{ t('summoningPlanner.costsTitle') }}
      </h1>
      <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {{ t('summoningPlanner.description') }}
      </p>
    </div>

    <SummoningCreatureFilter
      :creatures="unsummonedCreatures"
      :selected-ids="selectedIds"
      :get-level="getLevel"
      :is-awakened="isAwakened"
      :readiness-percent="readiness.percent"
      :objectives-fulfilled="readiness.fulfilled"
      :objectives-total="readiness.total"
      :total-time="mergedSchedule.totalTime"
      :parallel-estimate="parallelEstimate"
      @toggle="toggleCreature"
      @toggle-tier="toggleTier"
      @reset="clearSelection"
    />

    <!-- Empty state -->
    <PlannerEmptyState
      v-if="aggregatedCosts.length === 0"
      :title="t('summoningPlanner.emptyState.chooseCreatures')"
      :subtitle="t('summoningPlanner.emptyState.selectCreatures')"
    />

    <PlannerEmptyState
      v-else-if="!isDesktop"
      :title="t('summoningPlanner.emptyState.desktopOnly')"
      :subtitle="t('summoningPlanner.emptyState.desktopOnlyHint')"
    />

    <!-- Main content -->
    <div v-else-if="aggregatedCosts.length > 0" class="space-y-6">
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg border border-border/60 p-0.5">
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

        <template v-if="viewMode === 'list' || viewMode === 'tree'">
          <div class="h-5 w-px bg-border/40" />
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium text-muted-foreground/60">{{
              t('summoningPlanner.controls.groups')
            }}</span>
            <div class="flex rounded-lg border border-border/60 p-0.5">
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="collapseAllGroups()"
              >
                <ChevronsDownUp class="size-3.5" />
                {{ t('summoningPlanner.controls.collapse') }}
              </button>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="expandAllGroups()"
              >
                <ChevronsUpDown class="size-3.5" />
                {{ t('summoningPlanner.controls.expand') }}
              </button>
            </div>
          </div>
        </template>
        <template v-if="viewMode === 'tree'">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium text-muted-foreground/60">{{
              t('summoningPlanner.controls.nodes')
            }}</span>
            <div class="flex rounded-lg border border-border/60 p-0.5">
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="collapseAllTrees()"
              >
                <ChevronsDownUp class="size-3.5" />
                {{ t('summoningPlanner.controls.collapse') }}
              </button>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="expandAllTrees()"
              >
                <ChevronsUpDown class="size-3.5" />
                {{ t('summoningPlanner.controls.expand') }}
              </button>
            </div>
          </div>
        </template>

        <!-- Sort controls -->
        <div
          v-if="viewMode === 'list' || viewMode === 'tree'"
          class="ml-auto flex items-center gap-1.5"
        >
          <span class="text-[11px] font-medium text-muted-foreground/60">{{
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
              class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
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

      <!-- List view (flat objective cards from all tree nodes) -->
      <div v-if="viewMode === 'list'" class="space-y-6">
        <div v-for="section in flatGroupedCosts" :key="section.group" class="space-y-3">
          <button
            class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2 text-left transition hover:opacity-80"
            @click="toggleGroup(section.group)"
          >
            <ChevronDown
              class="size-3.5 text-muted-foreground transition-transform"
              :class="{ '-rotate-90': collapsedGroups.has(section.group) }"
            />
            <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {{ section.label }}
            </span>
            <span class="text-[10px] text-muted-foreground/40"> ({{ section.costs.length }}) </span>
            <span class="h-px flex-1 bg-border/40" />
          </button>
          <div v-if="!collapsedGroups.has(section.group)">
            <!-- With sub-groups (e.g., Gathered -> Fishing, Mining, etc.) -->
            <template v-if="section.subGroups">
              <div v-for="sub in section.subGroups" :key="sub.label" class="mb-4 space-y-2">
                <p
                  class="pl-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/45"
                >
                  {{ sub.label }}
                </p>
                <div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
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
                  />
                </div>
              </div>
            </template>

            <!-- Flat list (no sub-groups) -->
            <template v-else>
              <div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
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
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Timeline view -->
      <SummoningTimeline
        v-else-if="viewMode === 'timeline'"
        :schedule="mergedSchedule"
        :nodes-by-id="mergedNodesById"
        :waves="priorityWaves"
        :expedition-parties="expeditionPartiesByItemId"
        :queue-offsets="gameConfig.queuedTimes.value"
        :queued-amounts="flatQueuedAmounts"
      />

      <!-- Tree view -->
      <div v-else-if="viewMode === 'tree'" class="space-y-6">
        <div v-for="section in groupedCosts" :key="section.group" class="space-y-3">
          <button
            class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2 text-left transition hover:opacity-80"
            @click="toggleGroup(section.group)"
          >
            <ChevronDown
              class="size-3.5 text-muted-foreground transition-transform"
              :class="{ '-rotate-90': collapsedGroups.has(section.group) }"
            />
            <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {{ section.label }}
            </span>
            <span class="text-[10px] text-muted-foreground/40"> ({{ section.costs.length }}) </span>
            <span class="h-px flex-1 bg-border/40" />
          </button>
          <div v-if="!collapsedGroups.has(section.group)" class="space-y-3">
            <!-- With sub-groups (e.g., Gathered -> Fishing, Mining, etc.) -->
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
                    :queued-amounts="flatQueuedAmounts"
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
                              expeditionTierIcons[getActiveExpeditionParty(cost.sortedIndex)!.tier]
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
                          <RightClickHint
                            v-for="member in getActiveExpeditionParty(cost.sortedIndex)!
                              .activeVariant.party"
                            :key="member.creature.id"
                            @contextmenu="toggleInspectCreature(member.creature)"
                          >
                            <div
                              class="inline-flex cursor-default items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-2"
                              :class="
                                conflictedCreatureIds.has(member.creature.id)
                                  ? 'cursor-default border-amber-500/50 bg-amber-500/10'
                                  : 'border-border bg-muted/35'
                              "
                              @mouseenter="
                                onConflictEnter(
                                  member.creature.id,
                                  getActiveExpeditionParty(cost.sortedIndex)!.expeditionName,
                                  $event,
                                )
                              "
                              @mouseleave="onConflictLeave"
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
                          </RightClickHint>
                        </div>
                        <div class="flex shrink-0 items-center gap-1.5 font-mono text-xs">
                          <span class="text-muted-foreground">
                            {{
                              getActiveExpeditionParty(cost.sortedIndex)!.activeVariant.runsNeeded
                            }}
                            {{ t('summoningPlanner.runs') }}
                          </span>
                          <span
                            class="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"
                          >
                            <Clock3 class="size-3" />
                            {{
                              formatDuration(
                                getActiveExpeditionParty(cost.sortedIndex)!.activeVariant.totalTime,
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
                              >{{ t('summoningPlanner.altButton') }}</span
                            >
                            <div class="flex min-w-0 flex-1 flex-wrap gap-1">
                              <RightClickHint
                                v-for="member in variant.party"
                                :key="member.creature.id"
                                @contextmenu="toggleInspectCreature(member.creature)"
                              >
                                <div
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
                              </RightClickHint>
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

      <!-- Gold total when no other Currency items exist -->
      <div v-if="!hasCurrencyGroup && totalGold > 0" class="space-y-3">
        <div class="flex w-full items-center gap-2 border-l-2 border-primary/30 pl-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {{ t('summoningPlanner.currency') }}
          </span>
          <span class="h-px flex-1 bg-border/40" />
        </div>
        <div :class="viewMode === 'tree' ? 'flex min-w-0 items-start gap-1' : ''">
          <span v-if="viewMode === 'tree'" class="mt-4 w-5 shrink-0" />
          <div :class="viewMode === 'tree' ? 'min-w-0 flex-1' : ''">
            <SummoningObjectiveCard
              item-id="gold"
              :item-name="t('summoningPlanner.gold')"
              item-type="Currency"
              :total-needed="totalGold"
              :inventory-amount="goldInventory"
              source-label=""
              :source-icon="getItemImage({ id: 'gold' })"
              :modifiers="goldModifiers"
              :compact="viewMode === 'tree'"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Debug drawer trigger (dev only) -->
    <template v-if="isDev">
      <button
        v-if="aggregatedCosts.length > 0"
        class="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-card px-3 py-2 text-xs font-medium text-amber-600 shadow-lg transition hover:bg-amber-500/10 dark:text-amber-400"
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
          class="pointer-events-none z-50 w-72 -translate-y-full overflow-hidden rounded-xl border border-amber-500/40 bg-card shadow-xl shadow-black/30"
          :style="conflictPopover.style"
        >
          <div class="flex items-center gap-2 px-3 py-2.5">
            <div
              class="flex size-6 shrink-0 items-center justify-center rounded-md border border-amber-500/50 bg-amber-500/15"
            >
              <span class="text-xs font-bold text-amber-500">!</span>
            </div>
            <div class="min-w-0">
              <span class="block text-xs font-semibold text-foreground">{{
                t('summoningPlanner.conflict.title')
              }}</span>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-1">
                <span class="text-[11px] text-muted-foreground">{{
                  t('summoningPlanner.conflict.alsoAssignedTo')
                }}</span>
                <template v-for="(exp, ni) in conflictPopover.otherExpeditions" :key="ni">
                  <span v-if="ni > 0" class="text-[11px] text-muted-foreground/50">,</span>
                  <span class="inline-flex items-center gap-1">
                    <img
                      v-if="getItemImage({ id: exp.rewardItemId })"
                      :src="getItemImage({ id: exp.rewardItemId })"
                      :alt="exp.name"
                      class="size-3.5 shrink-0 object-contain"
                    />
                    <span class="text-[11px] font-semibold text-amber-400">{{ exp.name }}</span>
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
