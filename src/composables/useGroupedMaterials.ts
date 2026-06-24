import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import { toTitleCase } from '@/utils/format/format'
import type { ModifierChip } from '@/utils/planner/modifierChips'
import {
  getSourceGroup,
  getGatherSource as gatherSourceForItem,
  sourceGroupOrder,
  type SourceGroup,
} from '@/utils/planner/plannerSourceGroups'

export type SortField = 'name' | 'progress' | 'complexity'
export type SortDirection = 'asc' | 'desc' | null

export interface SortState {
  field: SortField
  direction: SortDirection
}

// --- Tree (backing-tree) grouping entry: a sortedCosts row enriched with its tree index. ---
interface GroupedCostEntry {
  itemId: string
  itemName: string
  amount: number
  sortedIndex: number
}

// --- Flat (walked active-path) list entry: the All-materials List view input. ---
export interface FlatListEntry {
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

interface CostSubGroup<T> {
  label: string
  costs: T[]
}

interface CostGroup<T> {
  group: SourceGroup
  label: string
  costs: T[]
  subGroups: CostSubGroup<T>[] | null
}

type TreeRef = InstanceType<typeof SummoningMaterialTree>

/**
 * Shared "group by source → order → map → Gathered sub-group-by-job" pipeline that backs
 * both the Tree backing-trees order (`groupedCosts`) and the All-materials List
 * (`flatGroupedCosts`). The two callers only differ in how an entry's SourceGroup is
 * determined, how entries are sorted, and how an entry's gather job is derived — passed in
 * as `groupOf` / `sort` / `jobOf`.
 */
function buildSourceGroups<T>(
  entries: T[],
  labels: Record<SourceGroup, string>,
  groupOf: (entry: T) => SourceGroup,
  sort: (entries: T[]) => T[],
  jobOf: (entry: T) => string,
): CostGroup<T>[] {
  const groups = new Map<SourceGroup, T[]>()
  for (const entry of entries) {
    const group = groupOf(entry)
    const list = groups.get(group)
    if (list) list.push(entry)
    else groups.set(group, [entry])
  }

  return sourceGroupOrder
    .filter((g) => groups.has(g))
    .map((g) => {
      const costs = sort(groups.get(g)!)
      let subGroups: CostSubGroup<T>[] | null = null

      // Sub-group gathered items by job
      if (g === 'Gathered') {
        const byJob = new Map<string, T[]>()
        for (const cost of costs) {
          const jobId = jobOf(cost)
          const list = byJob.get(jobId)
          if (list) list.push(cost)
          else byJob.set(jobId, [cost])
        }
        subGroups = [...byJob.entries()]
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([jobId, items]) => ({ label: toTitleCase(jobId), costs: items }))
      }

      return { group: g, label: labels[g], costs, subGroups }
    })
}

interface UseGroupedMaterialsOptions {
  sortState: Ref<SortState>
  /** sortedCosts: the aggregate-cost rows (index-aligned with treeRefs). */
  sortedCosts: Ref<{ itemId: string; itemName: string; amount: number }[]>
  treeRefs: Ref<TreeRef[]>
  /** Live inventory amounts by itemId (for progress sort). */
  inventoryAmounts: Ref<Record<string, number>>
  /** Queued amounts by itemId, flattened across queues (for progress sort). */
  flatQueuedAmounts: Ref<Record<string, number>>
  /** Walked active-path entries that back the All-materials List view. */
  flatListEntries: Ref<FlatListEntry[]>
}

/**
 * Source grouping/sorting for both the All-materials List (flat) and Tree views. Owns the
 * localized source-group labels and the two sort comparators, and exposes `groupedCosts`
 * (tree-backed order) and `flatGroupedCosts` (List). See {@link buildSourceGroups}.
 */
export function useGroupedMaterials(opts: UseGroupedMaterialsOptions) {
  const { sortState, sortedCosts, treeRefs, inventoryAmounts, flatQueuedAmounts, flatListEntries } =
    opts
  const { t } = useI18n()

  // SourceGroup / sourceGroupOrder / getSourceGroup / getGatherSource are shared from
  // @/utils/plannerSourceGroups; only these localized labels stay view-local.
  const sourceGroupLabels: Record<SourceGroup, string> = {
    Refined: t('summoningPlanner.sourceGroups.refined'),
    Gathered: t('summoningPlanner.sourceGroups.gathered'),
    Expedition: t('summoningPlanner.sourceGroups.expedition'),
    Garden: t('summoningPlanner.sourceGroups.garden'),
    Merchant: t('summoningPlanner.sourceGroups.merchant'),
    Currency: t('summoningPlanner.sourceGroups.currency'),
    Other: t('summoningPlanner.sourceGroups.other'),
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
            (inventoryAmounts.value[a.itemId] ?? 0) + (flatQueuedAmounts.value[a.itemId] ?? 0)
          const invB =
            (inventoryAmounts.value[b.itemId] ?? 0) + (flatQueuedAmounts.value[b.itemId] ?? 0)
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

  const groupedCosts = computed<CostGroup<GroupedCostEntry>[]>(() => {
    const entries: GroupedCostEntry[] = sortedCosts.value.map((cost, i) => ({
      ...cost,
      sortedIndex: i,
    }))
    return buildSourceGroups(
      entries,
      sourceGroupLabels,
      (entry) => {
        const tree = treeRefs.value[entry.sortedIndex]
        const rootId = tree?.rootNode?.id
        const activeMethodKind = rootId ? tree?.getActiveMethod(rootId)?.kind : undefined
        return getSourceGroup(entry.itemId, activeMethodKind)
      },
      sortTreeEntries,
      (entry) => gatherSourceForItem(entry.itemId)?.jobId ?? 'other',
    )
  })

  const flatGroupedCosts = computed<CostGroup<FlatListEntry>[]>(() =>
    buildSourceGroups(
      flatListEntries.value,
      sourceGroupLabels,
      (entry) => entry.sourceGroup,
      sortFlatEntries,
      (entry) => entry.gatherJob ?? 'other',
    ),
  )

  return { sourceGroupLabels, sortTreeEntries, sortFlatEntries, groupedCosts, flatGroupedCosts }
}
