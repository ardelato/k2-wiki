<script setup lang="ts">
/**
 * Source-grouped objective list for the Single Item planner's List view, matching the
 * Summon planner's All Materials list: actionable materials rendered as SummoningObjectiveCard,
 * grouped by source (Refined / Gathered → job sub-groups / Expedition / …). Walks the active
 * recipe tree, dedupes by item, and classifies each via the shared plannerSourceGroups helper.
 *
 * NOTE: imports SummoningObjectiveCard cross-folder for now — that card is generic and will be
 * renamed/moved to planner/ (PlannerObjectiveCard) once the Summon refactor settles.
 */
import { ChevronDown } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SummoningObjectiveCard from '@/components/summoning-planner/SummoningObjectiveCard.vue'
import { itemById } from '@/data/indexes'
import type { ItemType, PlannerLockedGate, PlannerMethod, PlannerNode } from '@/types'
import { sourceLabel, toTitleCase } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { extractModifierChips, type ModifierChip } from '@/utils/planner/modifierChips'
import {
  getGatherJobId,
  getSourceGroup,
  type SourceGroup,
  sourceGroupLabels,
  sourceGroupOrder,
} from '@/utils/planner/plannerSourceGroups'

const { t } = useI18n()


const props = defineProps<{
  rootNode?: PlannerNode | null
  nodesById: Record<string, PlannerNode>
  getActiveMethod: (nodeId: string) => PlannerMethod | null
  inventoryAmounts: Record<string, number>
  queuedAmounts?: Record<string, number>
  lockedGateByNode?: Record<string, PlannerLockedGate>
}>()


interface ObjectiveEntry {
  itemId: string
  itemName: string
  itemType: ItemType
  totalNeeded: number
  inventoryAmount: number
  queuedAmount: number
  sourceLabel: string
  sourceIcon: string | null
  modifiers: ModifierChip[]
  lockedGate: PlannerLockedGate | null
  group: SourceGroup
}


// Source chip for an entry. A node being crafted/gathered has an active method; a stocked
// (fulfilled) node has none, so fall back to the item's inherent source.
function entrySource(
  node: PlannerNode,
  method: PlannerMethod | null,
): {
  label: string
  icon: string | null
  kind: string | undefined
  modifiers: ModifierChip[]
} {
  if (method) {
    return {
      label: method.title,
      icon: sourceIcons[method.title] ?? null,
      kind: method.kind,
      modifiers: extractModifierChips(method.detailRows, method.title, { compact: true }),
    }
  }
  const src = itemById.get(node.itemId)?.sources?.find(Boolean)
  const label = src ? sourceLabel(src) : t('plannerComponents.treeNode.inStock')
  return { label, icon: sourceIcons[label] ?? null, kind: undefined, modifiers: [] }
}


function addEntry(
  byItem: Map<string, ObjectiveEntry>,
  node: PlannerNode,
  method: PlannerMethod | null,
  creditInventory: boolean,
) {
  const existing = byItem.get(node.itemId)
  if (existing) {
    existing.totalNeeded += node.grossAmount
    return
  }
  const source = entrySource(node, method)
  byItem.set(node.itemId, {
    itemId: node.itemId,
    itemName: node.itemName,
    itemType: node.itemType,
    totalNeeded: node.grossAmount,
    // The target item (root) is crafted at the requested quantity regardless of how many
    // you own (deductRootInventory = false), so it isn't credited inventory here — otherwise
    // owning some would read as a misleading "complete" on a node you're still crafting.
    inventoryAmount: creditInventory ? (props.inventoryAmounts[node.itemId] ?? 0) : 0,
    queuedAmount: creditInventory ? (props.queuedAmounts?.[node.itemId] ?? 0) : 0,
    sourceLabel: source.label,
    sourceIcon: source.icon,
    modifiers: source.modifiers,
    lockedGate: props.lockedGateByNode?.[node.id] ?? null,
    group: getSourceGroup(node.itemId, source.kind),
  })
}


// Walk the active recipe tree, collecting every material once. Both actionable nodes (to
// acquire) and already-stocked nodes are included — the latter render as "Completed" cards,
// matching the Tree view and the Summon list. The target item (root) is included without
// inventory credit so it reads "need N" rather than a false "complete".
const entries = computed<ObjectiveEntry[]>(() => {
  const root = props.rootNode
  if (!root) return []
  const visited = new Set<string>()
  const byItem = new Map<string, ObjectiveEntry>()

  function walk(node: PlannerNode, isRoot: boolean) {
    if (visited.has(node.id)) return
    visited.add(node.id)

    const method = props.getActiveMethod(node.id)
    addEntry(byItem, node, method, !isRoot)

    if (!method) return
    for (const child of method.children) {
      const childNode = props.nodesById[child.nodeId]
      if (childNode) walk(childNode, false)
    }
  }

  walk(root, true)
  return [...byItem.values()]
})


interface ObjectiveGroup {
  group: SourceGroup
  label: string
  entries: ObjectiveEntry[]
  subGroups: { label: string; entries: ObjectiveEntry[] }[] | null
}


const groups = computed<ObjectiveGroup[]>(() => {
  const byGroup = new Map<SourceGroup, ObjectiveEntry[]>()
  for (const entry of entries.value) {
    const list = byGroup.get(entry.group)
    if (list) list.push(entry)
    else byGroup.set(entry.group, [entry])
  }

  return sourceGroupOrder
    .filter((g) => byGroup.has(g))
    .map((g) => {
      const list = byGroup.get(g)!.toSorted((a, b) => a.itemName.localeCompare(b.itemName))
      let subGroups: ObjectiveGroup['subGroups'] = null

      // Sub-group gathered resources by job, like the Summon list.
      if (g === 'Gathered') {
        const byJob = new Map<string, ObjectiveEntry[]>()
        for (const entry of list) {
          const jobId = getGatherJobId(entry.itemId) ?? 'other'
          const jobList = byJob.get(jobId)
          if (jobList) jobList.push(entry)
          else byJob.set(jobId, [entry])
        }
        subGroups = [...byJob.entries()]
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([jobId, items]) => ({ label: toTitleCase(jobId), entries: items }))
      }

      return { group: g, label: sourceGroupLabels[g], entries: list, subGroups }
    })
})


const collapsedGroups = ref(new Set<SourceGroup>())


function toggleGroup(group: SourceGroup) {
  const next = new Set(collapsedGroups.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  collapsedGroups.value = next
}


function collapseAll() {
  collapsedGroups.value = new Set(groups.value.map((g) => g.group))
}


function expandAll() {
  collapsedGroups.value = new Set()
}


defineExpose({ collapseAll, expandAll })
</script>

<template>
  <div v-if="groups.length > 0" class="space-y-6">
    <div v-for="section in groups" :key="section.group" class="space-y-3">
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
        <span class="text-3xs text-muted-foreground/40">({{ section.entries.length }})</span>
        <span class="h-px flex-1 bg-border/40" />
      </button>

      <div v-if="!collapsedGroups.has(section.group)">
        <!-- Gathered → job sub-groups -->
        <template v-if="section.subGroups">
          <div v-for="sub in section.subGroups" :key="sub.label" class="mb-4 space-y-2">
            <p
              class="pl-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/45"
            >
              {{ sub.label }}
            </p>
            <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <SummoningObjectiveCard
                v-for="entry in sub.entries"
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
                :locked-gate="entry.lockedGate"
              />
            </div>
          </div>
        </template>

        <!-- Flat list -->
        <template v-else>
          <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <SummoningObjectiveCard
              v-for="entry in section.entries"
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
              :locked-gate="entry.lockedGate"
            />
          </div>
        </template>
      </div>
    </div>
  </div>

  <div v-else class="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <p class="text-sm font-semibold text-success-strong">
      {{ t('plannerComponents.listView.allInStock') }}
    </p>
    <p class="text-xs text-muted-foreground">
      {{ t('plannerComponents.listView.allAvailable') }}
    </p>
  </div>
</template>
