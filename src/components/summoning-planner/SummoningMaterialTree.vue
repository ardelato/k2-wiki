<script setup lang="ts">
import { ChevronDown, ChevronRight, Clock3, Compass, GitBranch } from 'lucide-vue-next'
import { computed, ref, toRef } from 'vue'

import PlannerBadge from '@/components/planner/PlannerBadge.vue'
import PlannerTreeNode from '@/components/planner/PlannerTreeNode.vue'
import SummoningExpeditionPlan from '@/components/summoning-planner/SummoningExpeditionPlan.vue'
import { useCraftPlanner } from '@/composables/useCraftPlanner'
import type { Creature, Expedition } from '@/types'
import { findExpeditionPlans } from '@/utils/expeditionOptimizer'
import { formatDuration } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

const props = defineProps<{
  itemId: string
  quantity: number
  ownedCreatures: Creature[]
  creatureLevels: Record<string, number>
  expeditions: Expedition[]
}>()


const targetItemId = toRef(() => props.itemId)
const targetQuantity = toRef(() => props.quantity)


const {
  rootNode,
  nodesById,
  activeMethodIdByNode,
  schedule,
  summary,
  inventoryAmounts,
  flatQueuedAmounts,
  getActiveMethod,
  setPinnedMethod,
} = useCraftPlanner(targetItemId, targetQuantity, { deductRootInventory: true })


function collapseToLeaves() {
  const next = new Set<string>()
  for (const node of Object.values(nodesById.value)) {
    const methodId = activeMethodIdByNode.value[node.id]
    const method = node.methods.find((m) => m.id === methodId)
    if (method && method.children.length > 0) {
      next.add(node.id)
    }
  }
  // Also collapse root if it has expedition sources (expedition card acts as virtual child)
  if (rootNode.value && expeditionResult.value.best) {
    next.add(rootNode.value.id)
  }
  collapsedNodeIds.value = next
}


function expandAll() {
  collapsedNodeIds.value = new Set()
}


const selectedNode = computed(() =>
  selectedNodeId.value ? (nodesById.value[selectedNodeId.value] ?? null) : null,
)


const selectedMethodObj = computed(() => {
  if (!selectedMethodId.value || !selectedNode.value) return null
  return selectedNode.value.methods.find((m) => m.id === selectedMethodId.value) ?? null
})


const activeMethodForSelectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return getActiveMethod(selectedNodeId.value)
})


const emit = defineEmits<{
  activate: []
}>()


const isOpen = ref(false)
const collapsedNodeIds = ref(new Set<string>())
const selectedNodeId = ref<string | null>(null)
const selectedMethodId = ref<string | null>(null)


const itemImage = computed(() => getItemImage({ id: props.itemId }))


const expeditionResult = computed(() =>
  findExpeditionPlans(
    props.itemId,
    props.quantity,
    props.ownedCreatures,
    props.creatureLevels,
    props.expeditions,
  ),
)


const rootActiveMethod = computed(() => {
  if (!rootNode.value) return null
  const methodId = activeMethodIdByNode.value[rootNode.value.id]
  return rootNode.value.methods.find((m) => m.id === methodId) ?? null
})


const rootChildren = computed(() => rootActiveMethod.value?.children ?? [])


function toggleOpen() {
  isOpen.value = !isOpen.value
  if (rootNode.value) selectNode(rootNode.value.id)
}


function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId
  selectedMethodId.value = null
  emit('activate')
}


function selectMethod(methodId: string) {
  selectedMethodId.value = methodId
  emit('activate')
}


function pinMethod(nodeId: string, methodId: string) {
  setPinnedMethod(nodeId, methodId)
}


function toggleCollapse(nodeId: string) {
  const next = new Set(collapsedNodeIds.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  collapsedNodeIds.value = next
}


defineExpose({
  summary,
  collapseToLeaves,
  expandAll,
  nodesById,
  schedule,
  selectedNode,
  selectedMethodObj,
  activeMethodForSelectedNode,
  getActiveMethod,
  setPinnedMethod,
  selectNode,
  selectMethod,
  inventoryAmounts,
  expeditionResult,
  rootNode,
  activeMethodIdByNode,
  collapsedNodeIds,
  selectedNodeId,
  selectedMethodId,
  rootChildren,
})
</script>

<template>
  <div v-if="rootNode" class="surface-card overflow-hidden">
    <button
      class="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/15"
      @click="toggleOpen"
    >
      <component :is="isOpen ? ChevronDown : ChevronRight" class="size-4 text-muted-foreground" />
      <img
        v-if="itemImage"
        :src="itemImage"
        :alt="rootNode.itemName"
        class="size-6 object-contain"
      />
      <span class="text-sm font-bold text-foreground">
        {{ rootNode.itemName }}
      </span>
      <span class="font-mono text-sm font-semibold text-primary">
        x{{ quantity.toLocaleString() }}
      </span>

      <div v-if="summary" class="ml-auto flex items-center gap-2">
        <PlannerBadge v-if="summary.totalTimeSeconds != null" color="var(--color-green)">
          <Clock3 class="size-3" />
          {{ formatDuration(summary.totalTimeSeconds) }}
        </PlannerBadge>
        <PlannerBadge v-if="summary.totalCost > 0" color="var(--color-yellow)">
          <img
            v-if="getItemImage({ id: 'gold' })"
            :src="getItemImage({ id: 'gold' })"
            alt="Gold"
            class="size-3 object-contain"
          />
          {{ Math.round(summary.totalCost).toLocaleString() }}
        </PlannerBadge>
        <PlannerBadge v-if="summary.branchPointCount > 0" color="var(--color-primary)">
          <GitBranch class="size-3" />
          {{ summary.branchPointCount }}
        </PlannerBadge>
        <PlannerBadge v-if="expeditionResult.best" color="var(--color-primary)">
          <Compass class="size-3" />
          Expedition
        </PlannerBadge>
      </div>
    </button>

    <div
      v-if="isOpen && rootChildren.length > 0"
      class="flex flex-col gap-2 border-t border-border/40 px-4 py-4"
    >
      <PlannerTreeNode
        v-for="child in rootChildren"
        :key="child.nodeId"
        :node="nodesById[child.nodeId]"
        :nodes-by-id="nodesById"
        :active-method-id-by-node="activeMethodIdByNode"
        :selected-node-id="selectedNodeId"
        :selected-method-id="selectedMethodId"
        :collapsed-node-ids="collapsedNodeIds"
        :inventory-amounts="inventoryAmounts"
        :queued-amounts="flatQueuedAmounts"
        :completion-time-by-node="schedule?.completionTimeByNode ?? {}"
        @select-node="selectNode"
        @select-method="selectMethod"
        @pin-method="pinMethod"
        @toggle-collapse="toggleCollapse"
      />
    </div>

    <div
      v-if="isOpen && rootChildren.length === 0 && rootNode && !rootNode.fulfilled"
      class="border-t border-border/40 px-4 py-3 text-xs text-muted-foreground"
    >
      Leaf item — no sub-dependencies.
    </div>

    <div
      v-if="isOpen && expeditionResult.best && expeditionResult.all.length > 0"
      class="border-t border-border/40 px-4 py-3"
    >
      <SummoningExpeditionPlan :plans="expeditionResult.all" :best-plan="expeditionResult.best" />
    </div>
  </div>
</template>
