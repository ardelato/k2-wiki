<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, GitBranch, Layers } from 'lucide-vue-next'
import type { PlannerNode } from '@/types'
import { getItemImage } from '@/utils/itemImages'
import { formatDuration, itemTypeColor, methodKindClasses, methodKindColor, methodKindLabel } from '@/utils/format'

defineOptions({
  name: 'PlannerTreeNode',
})

const props = defineProps<{
  node: PlannerNode
  nodesById: Record<string, PlannerNode>
  activeMethodIdByNode: Record<string, string | null>
  selectedNodeId: string | null
  selectedMethodId: string | null
  collapsedNodeIds: Set<string>
  inventoryAmounts: Record<string, number>
  completionTimeByNode: Record<string, number>
}>()

const stockOnHand = computed(() => props.inventoryAmounts[props.node.itemId] ?? 0)

const emit = defineEmits<{
  'select-node': [nodeId: string]
  'select-method': [methodId: string]
  'pin-method': [nodeId: string, methodId: string]
  'toggle-collapse': [nodeId: string]
}>()

const activeMethod = computed(() => {
  const methodId = props.activeMethodIdByNode[props.node.id]
  return props.node.methods.find(m => m.id === methodId) ?? null
})

const nodeCompletionTime = computed(() => props.completionTimeByNode[props.node.id] ?? null)

const nodeTotalTime = computed(() => {
  if (nodeCompletionTime.value != null) return nodeCompletionTime.value
  return activeMethod.value?.totalTimeSeconds ?? null
})

const nodeDepsTime = computed(() => {
  const total = nodeTotalTime.value
  const step = activeMethod.value?.localTimeSeconds
  if (total == null || step == null) return null
  return total > step ? total - step : null
})

const hasChildren = computed(() => (activeMethod.value?.children.length ?? 0) > 0)
const isCollapsed = computed(() => props.collapsedNodeIds.has(props.node.id))
const isSelected = computed(() => props.selectedNodeId === props.node.id)

const childrenGap = computed(() => {
  const maxGap = 12
  const minGap = 4
  const decay = 0.5
  const gap = Math.max(minGap, Math.round(maxGap * Math.pow(decay, props.node.depth)))
  return `${gap}px`
})

function forwardPinMethod(nodeId: string, methodId: string) {
  emit('pin-method', nodeId, methodId)
}
</script>

<template>
  <div v-if="!node.fulfilled">
    <button
      class="group flex w-full min-w-0 flex-row items-stretch overflow-hidden rounded-lg border border-border/40 text-left outline-none transition-colors"
      :class="[
        isSelected
          ? 'border-border/60 bg-primary/6'
          : 'hover:bg-muted/30',
      ]"
      :style="isSelected && activeMethod ? { borderLeftColor: methodKindColor(activeMethod.kind), borderLeftWidth: '3px' } : {}"
      @click="emit('select-node', node.id)">
      <!-- Left image zone -->
      <div class="flex w-20 shrink-0 items-center justify-center rounded-l-lg"
        :style="{ backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 8%, transparent)` }">
        <img v-if="getItemImage({ id: node.itemId })" :src="getItemImage({ id: node.itemId })" :alt="node.itemName"
          class="size-7 object-contain" />
        <span v-else class="text-xs font-bold" :style="{ color: itemTypeColor(node.itemType) }">
          {{ node.itemName.charAt(0) }}
        </span>
      </div>

      <!-- Right content zone -->
      <div class="flex min-w-0 flex-1 flex-col gap-1.5 py-3.5 pr-3 pl-2">
        <!-- Row 1: Identity -->
        <div class="flex w-full items-center gap-2.5">
          <span v-if="hasChildren"
            class="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            role="button" @click.stop="emit('toggle-collapse', node.id)">
            <component :is="isCollapsed ? ChevronRight : ChevronDown" class="size-4" />
          </span>
          <span v-else class="w-5 shrink-0" />

          <span class="min-w-0 truncate text-sm font-semibold text-foreground">{{ node.itemName }}</span>

          <span class="shrink-0 font-mono text-sm font-semibold" style="color: var(--color-primary)">
            x{{ node.requiredAmount.toLocaleString(undefined, { maximumFractionDigits: 3 }) }}
          </span>

          <span v-if="stockOnHand > 0"
            class="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/8 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            {{ stockOnHand.toLocaleString() }} in stock
          </span>

          <span
            v-if="activeMethod && activeMethod.localTimeSeconds == null && !node.issues.length"
            class="ml-auto shrink-0 rounded-full border border-yellow-400/30 bg-yellow-400/8 px-2 py-0.5 text-[10px] font-semibold text-yellow-300"
            title="Configure in Settings"
          >
            Needs config
          </span>
          <span v-else-if="node.issues.length" class="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
            title="Has issues" />
          <CheckCircle2 v-if="isSelected && !node.issues.length && !(activeMethod && activeMethod.localTimeSeconds == null)" class="ml-auto size-4 shrink-0 text-primary" />
        </div>

        <!-- Row 2: Method details -->
        <div v-if="activeMethod" class="flex w-full items-center gap-2 pl-[1.875rem]">
          <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold"
            :class="methodKindClasses(activeMethod.kind)">
            {{ methodKindLabel(activeMethod.kind) }}
          </span>
          <span class="min-w-0 truncate text-xs text-muted-foreground">{{ activeMethod.title }}</span>

          <div class="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
            <span v-if="activeMethod.localTimeSeconds != null" class="flex items-center gap-1"
              style="color: var(--color-green)" title="Step — time for this action alone">
              <Clock3 class="size-3" />
              {{ formatDuration(activeMethod.localTimeSeconds) }}
            </span>
            <template v-if="nodeDepsTime != null && nodeTotalTime != null">
              <span class="text-muted-foreground" title="Deps — time to complete all dependencies">
                / +{{ formatDuration(nodeDepsTime) }}
              </span>
              <span class="text-foreground" title="Total — step time plus dependencies">
                / {{ formatDuration(nodeTotalTime) }}
              </span>
            </template>
            <span v-if="activeMethod.kind === 'craft' && activeMethod.children.length" class="flex items-center gap-1"
              style="color: var(--color-primary)">
              <Layers class="size-3" />
              {{ activeMethod.children.length }}&nbsp;ing.
            </span>
            <span v-if="node.methods.length > 1" class="flex items-center gap-1 text-foreground">
              <GitBranch class="size-3" />
              {{ node.methods.length }}
            </span>
          </div>
        </div>
      </div>
    </button>

    <div v-if="hasChildren && !isCollapsed" class="ml-4 flex flex-col border-l-2 border-border/25 pl-4" :style="{ gap: childrenGap, paddingTop: childrenGap }">
      <PlannerTreeNode v-for="child in activeMethod!.children" :key="child.nodeId" :node="nodesById[child.nodeId]"
        :nodes-by-id="nodesById" :active-method-id-by-node="activeMethodIdByNode" :selected-node-id="selectedNodeId"
        :selected-method-id="selectedMethodId" :collapsed-node-ids="collapsedNodeIds"
        :inventory-amounts="inventoryAmounts" :completion-time-by-node="completionTimeByNode"
        @select-node="emit('select-node', $event)"
        @select-method="emit('select-method', $event)" @pin-method="forwardPinMethod"
        @toggle-collapse="emit('toggle-collapse', $event)" />
    </div>

    <div v-if="hasChildren && isCollapsed" class="ml-4 border-l-2 border-border/25 pl-4 py-1">
      <span class="text-xs italic text-muted-foreground/60">
        ... {{ activeMethod!.children.length }} items hidden
      </span>
    </div>
  </div>
</template>
