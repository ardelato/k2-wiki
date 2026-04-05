<script setup lang="ts">
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, GitBranch, Layers } from 'lucide-vue-next'
import { computed } from 'vue'

import type { PlannerNode } from '@/types'
import {
  formatDuration,
  itemTypeColor,
  methodKindClasses,
  methodKindColor,
  methodKindLabel,
} from '@/utils/format'
import { upgradesIcon, sanctuaryIcon, machinesIcon, itemGridIcon, sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

defineOptions({
  name: 'PlannerTreeNode',
})


const props = withDefaults(
  defineProps<{
    node: PlannerNode
    nodesById: Record<string, PlannerNode>
    activeMethodIdByNode: Record<string, string | null>
    selectedNodeId: string | null
    selectedMethodId: string | null
    collapsedNodeIds: Set<string>
    inventoryAmounts: Record<string, number>
    completionTimeByNode: Record<string, number>
    nodeAnnotations?: Record<string, string>
    subtreeCostByNode?: Record<string, number>
    forceCollapsible?: boolean
  }>(),
  {
    nodeAnnotations: () => ({}),
    subtreeCostByNode: () => ({}),
    forceCollapsible: false,
  },
)


const stockOnHand = computed(() => props.inventoryAmounts[props.node.itemId] ?? 0)


const emit = defineEmits<{
  'select-node': [nodeId: string]
  'select-method': [methodId: string]
  'pin-method': [nodeId: string, methodId: string]
  'toggle-collapse': [nodeId: string]
}>()


const activeMethod = computed(() => {
  const methodId = props.activeMethodIdByNode[props.node.id]
  return props.node.methods.find((m) => m.id === methodId) ?? null
})


const modifierChips = computed(() => {
  if (!activeMethod.value) return []
  const chips: { label: string; color: string; icon?: string }[] = []
  for (const row of activeMethod.value.detailRows) {
    if (row.label === 'Awaken Tree') {
      chips.push({
        label: row.value,
        icon: upgradesIcon,
        color:
          'border-cyan-600/35 bg-cyan-100 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-400/20 dark:text-cyan-100',
      })
    } else if (row.label === 'Sanctuary') {
      chips.push({
        label: row.value,
        icon: sanctuaryIcon,
        color:
          'border-amber-600/35 bg-amber-100 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100',
      })
    } else if (row.label.startsWith('Machine')) {
      const machineName = row.label.replace('Machine — ', '')
      chips.push({
        label: `${machineName} ${row.value}`,
        icon: sourceIcons[machineName] ?? machinesIcon,
        color:
          'border-orange-600/35 bg-orange-100 text-orange-800 dark:border-orange-400/40 dark:bg-orange-400/20 dark:text-orange-100',
      })
    } else if (row.label.startsWith('Fabrication')) {
      chips.push({
        label: `Fab ${row.value}`,
        icon: itemGridIcon,
        color:
          'border-violet-600/35 bg-violet-100 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/20 dark:text-violet-100',
      })
    }
  }
  return chips
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


const annotation = computed(() => props.nodeAnnotations[props.node.id] ?? null)


const displayCost = computed(() => {
  const subtree = props.subtreeCostByNode[props.node.id]
  if (subtree != null && subtree > 0) return subtree
  return activeMethod.value?.cost ?? null
})


const hasChildren = computed(
  () => (activeMethod.value?.children.length ?? 0) > 0 || props.forceCollapsible,
)
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
  <div>
    <!-- Fulfilled (fully stocked) node — compact indicator -->
    <div
      v-if="node.fulfilled"
      class="flex w-full items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 opacity-70"
    >
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-md"
        :style="{
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 8%, transparent)`,
        }"
      >
        <img
          v-if="getItemImage({ id: node.itemId })"
          :src="getItemImage({ id: node.itemId })"
          :alt="node.itemName"
          class="size-5 object-contain"
          loading="lazy"
        />
        <span v-else class="text-[10px] font-bold" :style="{ color: itemTypeColor(node.itemType) }">
          {{ node.itemName.charAt(0) }}
        </span>
      </div>
      <span class="min-w-0 truncate text-sm font-semibold text-muted-foreground">{{
        node.itemName
      }}</span>
      <CheckCircle2 class="size-4 shrink-0 text-emerald-400" />
      <span
        class="bg-emerald-400/8 shrink-0 rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"
      >
        In stock
      </span>
    </div>

    <!-- Normal (unfulfilled) node -->
    <button
      v-else
      class="group flex w-full min-w-0 flex-row items-stretch overflow-hidden rounded-lg border border-border/40 text-left outline-none transition-colors"
      :class="[isSelected ? 'bg-primary/6 border-border/60' : 'hover:bg-muted/30']"
      :style="
        isSelected && activeMethod
          ? { borderLeftColor: methodKindColor(activeMethod.kind), borderLeftWidth: '3px' }
          : {}
      "
      @click="emit('select-node', node.id)"
    >
      <!-- Left image zone -->
      <div
        class="flex w-20 shrink-0 items-center justify-center rounded-l-lg"
        :style="{
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 8%, transparent)`,
        }"
      >
        <img
          v-if="getItemImage({ id: node.itemId })"
          :src="getItemImage({ id: node.itemId })"
          :alt="node.itemName"
          class="size-7 object-contain"
          loading="lazy"
        />
        <span v-else class="text-xs font-bold" :style="{ color: itemTypeColor(node.itemType) }">
          {{ node.itemName.charAt(0) }}
        </span>
      </div>

      <!-- Right content zone -->
      <div class="flex min-w-0 flex-1 flex-col gap-1.5 py-3.5 pl-2 pr-3">
        <!-- Row 1: Identity -->
        <div class="flex w-full items-center gap-2.5">
          <span
            v-if="hasChildren"
            class="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            role="button"
            @click.stop="emit('toggle-collapse', node.id)"
          >
            <component :is="isCollapsed ? ChevronRight : ChevronDown" class="size-4" />
          </span>
          <span v-else class="w-5 shrink-0" />

          <span class="min-w-0 truncate text-sm font-semibold text-foreground">{{
            node.itemName
          }}</span>

          <span
            class="shrink-0 font-mono text-sm font-semibold"
            style="color: var(--color-primary)"
          >
            x{{ node.requiredAmount.toLocaleString(undefined, { maximumFractionDigits: 3 }) }}
          </span>

          <span
            v-if="stockOnHand > 0"
            class="bg-emerald-400/8 shrink-0 rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"
          >
            {{ stockOnHand.toLocaleString() }} in stock
          </span>

          <span
            v-if="activeMethod && activeMethod.localTimeSeconds == null && !node.issues.length"
            class="bg-yellow-400/8 ml-auto shrink-0 rounded-full border border-yellow-400/30 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-300"
            title="Configure in Settings"
          >
            Needs config
          </span>
          <span
            v-else-if="node.issues.length"
            class="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
            title="Has issues"
          />
          <CheckCircle2
            v-if="
              isSelected &&
              !node.issues.length &&
              !(activeMethod && activeMethod.localTimeSeconds == null)
            "
            class="ml-auto size-4 shrink-0 text-primary"
          />
        </div>

        <!-- Row 2: Method details -->
        <div v-if="activeMethod" class="flex w-full items-center gap-2 pl-[1.875rem]">
          <span
            class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold"
            :class="methodKindClasses(activeMethod.kind)"
          >
            {{ methodKindLabel(activeMethod.kind) }}
          </span>
          <img
            v-if="sourceIcons[activeMethod.title]"
            :src="sourceIcons[activeMethod.title]"
            alt=""
            class="size-3.5 shrink-0"
            loading="lazy"
          />
          <span class="min-w-0 truncate text-xs text-muted-foreground">{{
            activeMethod.title
          }}</span>
          <span
            v-if="annotation"
            class="shrink-0 rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
          >
            {{ annotation }}
          </span>

          <div class="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
            <span
              v-if="activeMethod.localTimeSeconds != null"
              class="flex items-center gap-1"
              style="color: var(--color-green)"
              title="Step — time for this action alone"
            >
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
            <span
              v-if="displayCost != null && displayCost > 0"
              class="flex items-center gap-1"
              style="color: var(--color-yellow)"
              :title="
                displayCost !== activeMethod?.cost
                  ? 'Total gold cost (including sub-materials)'
                  : 'Gold cost'
              "
            >
              <img
                v-if="getItemImage({ id: 'gold' })"
                :src="getItemImage({ id: 'gold' })"
                alt="Gold"
                class="size-3 object-contain"
              />
              {{ Math.round(displayCost).toLocaleString() }}
            </span>
            <span
              v-if="activeMethod.kind === 'craft' && activeMethod.children.length"
              class="flex items-center gap-1"
              style="color: var(--color-primary)"
            >
              <Layers class="size-3" />
              {{ activeMethod.children.length }}&nbsp;ing.
            </span>
            <span v-if="node.methods.length > 1" class="flex items-center gap-1 text-foreground">
              <GitBranch class="size-3" />
              {{ node.methods.length }}
            </span>
          </div>
        </div>

        <!-- Row 3: Modifier chips -->
        <div
          v-if="activeMethod && modifierChips.length > 0"
          class="flex flex-wrap gap-1.5 pl-[1.875rem]"
        >
          <span
            v-for="(chip, i) in modifierChips"
            :key="i"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            :class="chip.color"
          >
            <img v-if="chip.icon" :src="chip.icon" alt="" class="size-3" loading="lazy" />
            {{ chip.label }}
          </span>
        </div>
      </div>
    </button>

    <div
      v-if="!node.fulfilled && hasChildren && !isCollapsed"
      class="ml-4 flex flex-col border-l-2 border-border/25 pl-4"
      :style="{ gap: childrenGap, paddingTop: childrenGap }"
    >
      <PlannerTreeNode
        v-for="child in activeMethod!.children"
        :key="child.nodeId"
        :node="nodesById[child.nodeId]"
        :nodes-by-id="nodesById"
        :active-method-id-by-node="activeMethodIdByNode"
        :selected-node-id="selectedNodeId"
        :selected-method-id="selectedMethodId"
        :collapsed-node-ids="collapsedNodeIds"
        :inventory-amounts="inventoryAmounts"
        :completion-time-by-node="completionTimeByNode"
        :node-annotations="nodeAnnotations"
        :subtree-cost-by-node="subtreeCostByNode"
        @select-node="emit('select-node', $event)"
        @select-method="emit('select-method', $event)"
        @pin-method="forwardPinMethod"
        @toggle-collapse="emit('toggle-collapse', $event)"
      />
    </div>

    <div
      v-if="!node.fulfilled && hasChildren && isCollapsed"
      class="ml-4 border-l-2 border-border/25 py-1 pl-4"
    >
      <span class="text-xs italic text-muted-foreground/60">
        ... {{ activeMethod!.children.length }} items hidden
      </span>
    </div>
  </div>
</template>
