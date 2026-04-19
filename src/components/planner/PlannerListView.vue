<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PlannerMethod, PlannerMethodKind, PlannerNode } from '@/types'
import { methodKindColor, methodKindLabel } from '@/utils/format'

import PlannerListGroup from './PlannerListGroup.vue'
import PlannerListRow from './PlannerListRow.vue'

const props = defineProps<{
  rootNode?: PlannerNode | null
  rootNodes?: PlannerNode[]
  nodesById: Record<string, PlannerNode>
  activeMethodIdByNode: Record<string, string | null>
  inventoryAmounts: Record<string, number>
  getActiveMethod: (nodeId: string) => PlannerMethod | null
  recommendations: Record<string, { text: string }>
}>()


// Ordered group keys as per plan spec
const GROUP_ORDER: PlannerMethodKind[] = [
  'gather',
  'garden',
  'expedition',
  'container',
  'machine',
  'fabrication',
  'craft',
  'buy',
]


interface GroupedNodes {
  kind: PlannerMethodKind
  label: string
  color: string
  nodes: PlannerNode[]
}


const groups = computed<GroupedNodes[]>(() => {
  const roots = props.rootNodes ?? (props.rootNode ? [props.rootNode] : [])
  if (roots.length === 0) return []

  // Walk tree collecting all non-fulfilled nodes by kind, deduplicating by itemId
  const byKind = new Map<PlannerMethodKind, PlannerNode[]>()
  const visited = new Set<string>()
  const seenItemIds = new Map<string, PlannerNode>() // itemId → node with aggregated amount

  function walk(node: PlannerNode, isRoot: boolean) {
    if (visited.has(node.id)) return
    visited.add(node.id)

    const method = props.getActiveMethod(node.id)

    // Skip fulfilled nodes (fully stocked) and the root node (target item)
    if (!isRoot && !node.fulfilled && method) {
      const kind: PlannerMethodKind = method.kind
      const existing = seenItemIds.get(node.itemId)
      if (existing) {
        // Deduplicate: sum requiredAmount into the first node we saw
        ;(existing as { requiredAmount: number }).requiredAmount += node.requiredAmount
      } else {
        // Create a shallow copy so we can mutate requiredAmount safely
        const nodeCopy = { ...node }
        seenItemIds.set(node.itemId, nodeCopy)
        const list = byKind.get(kind) ?? []
        list.push(nodeCopy)
        byKind.set(kind, list)
      }
    }

    if (!method) return
    for (const child of method.children) {
      const childNode = props.nodesById[child.nodeId]
      if (childNode) walk(childNode, false)
    }
  }

  for (const root of roots) {
    walk(root, true)
  }

  // Show groups in defined order, then any remaining kinds
  const orderedGroups: GroupedNodes[] = []
  for (const kind of GROUP_ORDER) {
    const nodes = byKind.get(kind)
    if (nodes)
      orderedGroups.push({
        kind,
        label: methodKindLabel(kind),
        color: methodKindColor(kind),
        nodes,
      })
  }
  // Include any kinds not in GROUP_ORDER (e.g. stocked, cycle, unknown)
  for (const [kind, nodes] of byKind) {
    if (!GROUP_ORDER.includes(kind)) {
      orderedGroups.push({
        kind,
        label: methodKindLabel(kind),
        color: methodKindColor(kind),
        nodes,
      })
    }
  }
  return orderedGroups
})


function subtreeCostForNode(_node: PlannerNode): number | null {
  // Subtree cost computation is complex; pass null for now and let PlannerListRow
  // fall back to activeMethod.cost for buy nodes
  return null
}


const collapsedGroups = ref(new Set<PlannerMethodKind>())


function toggleGroup(kind: PlannerMethodKind) {
  const next = new Set(collapsedGroups.value)
  if (next.has(kind)) next.delete(kind)
  else next.add(kind)
  collapsedGroups.value = next
}


function collapseAll() {
  collapsedGroups.value = new Set(groups.value.map((g) => g.kind))
}


function expandAll() {
  collapsedGroups.value = new Set()
}


defineExpose({ collapseAll, expandAll })
</script>

<template>
  <div v-if="groups.length > 0" class="flex flex-col gap-4">
    <PlannerListGroup
      v-for="group in groups"
      :key="group.kind"
      :label="group.label"
      :color="group.color"
      :item-count="group.nodes.length"
      :collapsed="collapsedGroups.has(group.kind)"
      @toggle="toggleGroup(group.kind)"
    >
      <PlannerListRow
        v-for="node in group.nodes"
        :key="node.id"
        :node="node"
        :active-method="getActiveMethod(node.id)"
        :inventory-amount="inventoryAmounts[node.itemId] ?? 0"
        :recommendation="recommendations[node.id] ?? null"
        :subtree-cost="subtreeCostForNode(node)"
      />
    </PlannerListGroup>
  </div>
  <div v-else class="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <p class="text-sm font-semibold text-emerald-500">All materials in stock</p>
    <p class="text-xs text-muted-foreground">
      Everything needed is already available. Switch to Tree view to see the full breakdown.
    </p>
  </div>
</template>
