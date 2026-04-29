<script setup lang="ts">
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PlannerNode } from '@/types'
import { itemTypeColor } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { extractModifierChips, type ModifierChip } from '@/utils/modifierChips'

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
    queuedAmounts?: Record<string, number>
    completionTimeByNode: Record<string, number>
    nodeAnnotations?: Record<string, string>
    subtreeCostByNode?: Record<string, number>
    forceCollapsible?: boolean
    recommendations?: Record<string, { text: string }>
  }>(),
  {
    nodeAnnotations: () => ({}),
    subtreeCostByNode: () => ({}),
    queuedAmounts: () => ({}),
    forceCollapsible: false,
    recommendations: () => ({}),
  },
)


const stockOnHand = computed(() => props.inventoryAmounts[props.node.itemId] ?? 0)
const queuedForItem = computed(() => props.queuedAmounts?.[props.node.itemId] ?? 0)
const totalNeeded = computed(() => props.node.grossAmount)
const deficit = computed(() => Math.max(0, props.node.requiredAmount - queuedForItem.value))


const activeMethod = computed(() => {
  const methodId = props.activeMethodIdByNode[props.node.id]
  return props.node.methods.find((m) => m.id === methodId) ?? null
})


const modifierChips = computed<ModifierChip[]>(() => {
  if (!activeMethod.value) return []
  return extractModifierChips(activeMethod.value.detailRows, activeMethod.value.title)
})


const activeChipIndex = ref<number | null>(null)
const activeChip = ref<ModifierChip | null>(null)
const popoverStyle = ref<Record<string, string>>({})


function onChipEnter(chip: ModifierChip, index: number, event: MouseEvent) {
  activeChipIndex.value = index
  activeChip.value = chip
  const target = event.currentTarget as HTMLElement
  if (!target) return
  const rect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 224 // w-56 = 14rem = 224px
  const GAP = 8
  const viewportWidth = document.documentElement.clientWidth
  let top = rect.bottom + GAP
  // Anchor to right edge of chip when near the right side of the viewport
  let left = rect.right - POPOVER_WIDTH
  // If that pushes past the left edge, center on chip instead
  if (left < GAP) left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
  // Final clamp
  left = Math.max(GAP, Math.min(left, viewportWidth - POPOVER_WIDTH - GAP))
  popoverStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px` }
}


function onChipLeave() {
  activeChipIndex.value = null
  activeChip.value = null
}


const barPopoverSegment = ref<'owned' | 'queued' | null>(null)
const barPopoverStyle = ref<Record<string, string>>({})


function onSegmentEnter(segment: 'owned' | 'queued', event: MouseEvent) {
  barPopoverSegment.value = segment
  updateBarPopoverPosition(event)
}


function onSegmentMove(event: MouseEvent) {
  if (!barPopoverSegment.value) return
  updateBarPopoverPosition(event)
}


function updateBarPopoverPosition(event: MouseEvent) {
  const POPOVER_WIDTH = 180
  const GAP = 12
  const viewportWidth = document.documentElement.clientWidth
  let top = event.clientY + GAP
  let left = event.clientX - POPOVER_WIDTH / 2
  left = Math.max(GAP, Math.min(left, viewportWidth - POPOVER_WIDTH - GAP))
  barPopoverStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px` }
}


function onSegmentLeave() {
  barPopoverSegment.value = null
}


const emit = defineEmits<{
  'select-node': [nodeId: string]
  'select-method': [methodId: string]
  'pin-method': [nodeId: string, methodId: string]
  'toggle-collapse': [nodeId: string]
}>()


const hasChildren = computed(
  () => (activeMethod.value?.children.length ?? 0) > 0 || props.forceCollapsible,
)
const isCollapsed = computed(() => props.collapsedNodeIds.has(props.node.id))


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
    <div v-if="node.fulfilled" class="flex min-w-0 items-center gap-1">
      <span class="w-5 shrink-0" />
      <div
        class="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 opacity-70"
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
          <span
            v-else
            class="text-[10px] font-bold"
            :style="{ color: itemTypeColor(node.itemType) }"
          >
            {{ node.itemName.charAt(0) }}
          </span>
        </div>
        <span class="min-w-0 truncate text-sm font-semibold text-muted-foreground">{{
          node.itemName
        }}</span>
        <CheckCircle2 class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span
          class="bg-emerald-600/8 dark:bg-emerald-400/8 shrink-0 rounded-full border border-emerald-600/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:border-emerald-400/30 dark:text-emerald-400"
        >
          In stock
        </span>
      </div>
    </div>

    <!-- Normal (unfulfilled) node -->
    <div v-else class="flex min-w-0 items-start gap-1">
      <!-- Expand/collapse chevron -->
      <button
        v-if="hasChildren"
        class="mt-4 shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
        @click="emit('toggle-collapse', node.id)"
      >
        <component :is="isCollapsed ? ChevronRight : ChevronDown" class="size-4" />
      </button>
      <span v-else class="mt-4 w-5 shrink-0" />

      <!-- Card-style node content -->
      <div class="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/40 bg-card/60 p-3">
        <div class="flex items-stretch gap-3">
          <!-- Item icon (square, full height) -->
          <div
            class="flex size-14 shrink-0 items-center justify-center rounded-lg"
            :style="{
              backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 10%, transparent)`,
            }"
          >
            <img
              v-if="getItemImage({ id: node.itemId })"
              :src="getItemImage({ id: node.itemId })"
              :alt="node.itemName"
              class="size-8 object-contain"
              loading="lazy"
            />
            <span v-else class="text-sm font-bold" :style="{ color: itemTypeColor(node.itemType) }">
              {{ node.itemName.charAt(0) }}
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <!-- Name + source -->
            <div class="mb-1.5 flex items-center gap-2">
              <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                {{ node.itemName }}
              </span>
              <template v-if="activeMethod && activeMethod.title">
                <span class="shrink-0 text-muted-foreground/30">&middot;</span>
                <img
                  v-if="sourceIcons[activeMethod.title]"
                  :src="sourceIcons[activeMethod.title]"
                  alt=""
                  class="size-3.5 shrink-0 object-contain"
                />
                <span class="min-w-0 truncate text-xs text-muted-foreground">
                  {{ activeMethod.title }}
                </span>
              </template>
              <!-- Modifier chips -->
              <div v-if="modifierChips.length > 0" class="ml-auto flex shrink-0 items-center gap-1">
                <span
                  v-for="(chip, ci) in modifierChips"
                  :key="ci"
                  class="inline-flex size-6 cursor-default items-center justify-center rounded-md border"
                  :class="chip.color"
                  :title="chip.label"
                  @mouseenter="onChipEnter(chip, ci, $event)"
                  @mouseleave="onChipLeave"
                >
                  <img v-if="chip.icon" :src="chip.icon" alt="" class="size-4" loading="lazy" />
                </span>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
              <div class="flex h-full">
                <div
                  class="h-full rounded-l-full bg-amber-400 transition-all duration-300"
                  :class="{ 'rounded-r-full': queuedForItem === 0 }"
                  :style="{
                    width: `${Math.min(100, Math.round((stockOnHand / Math.max(1, totalNeeded)) * 100))}%`,
                  }"
                  @mouseenter="onSegmentEnter('owned', $event)"
                  @mousemove="onSegmentMove"
                  @mouseleave="onSegmentLeave"
                />
                <div
                  v-if="queuedForItem > 0"
                  class="h-full rounded-r-full bg-sky-400 transition-all duration-300"
                  :style="{
                    width: `${Math.min(100 - Math.round((stockOnHand / Math.max(1, totalNeeded)) * 100), Math.round((queuedForItem / Math.max(1, totalNeeded)) * 100))}%`,
                  }"
                  @mouseenter="onSegmentEnter('queued', $event)"
                  @mousemove="onSegmentMove"
                  @mouseleave="onSegmentLeave"
                />
              </div>
            </div>

            <!-- Amounts -->
            <div class="mt-1.5 flex items-baseline justify-between">
              <span class="font-mono text-[11px] font-semibold">
                <span class="text-[10px] font-normal text-muted-foreground/50">Have </span>
                <span class="text-foreground">{{ stockOnHand.toLocaleString() }}</span>
                <span class="text-muted-foreground/50"> / {{ totalNeeded.toLocaleString() }}</span>
                <span class="text-[10px] font-normal text-muted-foreground/50"> Total</span>
              </span>
              <span
                v-if="deficit > 0"
                class="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400"
              >
                <span class="text-[10px] font-normal text-amber-600/60 dark:text-amber-400/60"
                  >Need
                </span>
                {{ deficit.toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Children -->
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
        :queued-amounts="queuedAmounts"
        :completion-time-by-node="completionTimeByNode"
        :node-annotations="nodeAnnotations"
        :subtree-cost-by-node="subtreeCostByNode"
        :recommendations="recommendations"
        @select-node="emit('select-node', $event)"
        @select-method="emit('select-method', $event)"
        @pin-method="forwardPinMethod"
        @toggle-collapse="emit('toggle-collapse', $event)"
      />
    </div>

    <!-- Collapsed indicator -->
    <div
      v-if="!node.fulfilled && hasChildren && isCollapsed"
      class="ml-4 border-l-2 border-border/25 py-1 pl-4"
    >
      <button
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/70 transition hover:bg-foreground/5 hover:text-muted-foreground"
        @click="emit('toggle-collapse', node.id)"
      >
        <ChevronRight class="size-3" />
        {{ activeMethod!.children.length }} items
      </button>
    </div>

    <!-- Bar segment popover -->
    <Teleport to="body">
      <Transition name="chip-popover">
        <div
          v-if="barPopoverSegment !== null"
          class="w-45 pointer-events-none z-50 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
          :style="barPopoverStyle"
        >
          <div class="flex items-center gap-1.5 px-3 py-2">
            <template v-if="barPopoverSegment === 'owned'">
              <span class="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                {{ stockOnHand.toLocaleString() }}
              </span>
              <span class="text-[11px] text-muted-foreground">have</span>
            </template>
            <template v-else-if="barPopoverSegment === 'queued'">
              <span class="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                {{ queuedForItem.toLocaleString() }}
              </span>
              <span class="text-[11px] text-muted-foreground">queued</span>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Modifier chip popover -->
    <Teleport to="body">
      <Transition name="chip-popover">
        <div
          v-if="activeChipIndex !== null && activeChip"
          class="pointer-events-none z-50 w-56 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
          :style="popoverStyle"
        >
          <div class="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
            <div
              class="flex size-7 shrink-0 items-center justify-center rounded-lg"
              :class="activeChip.color"
            >
              <img
                v-if="activeChip.icon"
                :src="activeChip.icon"
                alt=""
                class="size-4"
                loading="lazy"
              />
            </div>
            <div class="min-w-0">
              <span class="block text-sm font-bold leading-tight text-foreground">{{
                activeChip.label
              }}</span>
              <span class="block text-[11px] leading-tight text-muted-foreground">{{
                activeChip.subtitle
              }}</span>
            </div>
          </div>
          <div class="mx-3.5 border-t border-border/40" />
          <div class="flex flex-col gap-1 px-3.5 pb-3 pt-2">
            <div v-for="(stat, si) in activeChip.stats" :key="si" class="flex items-center gap-1.5">
              <span
                class="shrink-0 text-[10px] font-bold leading-none"
                :class="
                  stat.trimStart().startsWith('-')
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                "
                >{{ stat.trimStart().startsWith('-') ? '▼' : '▲' }}</span
              >
              <span class="text-xs font-medium text-foreground/90">{{ stat }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.chip-popover-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.chip-popover-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.chip-popover-enter-from,
.chip-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
