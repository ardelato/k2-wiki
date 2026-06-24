<script setup lang="ts">
import { ArrowUpRight, CheckCircle2, ChevronDown, ChevronRight, Lock } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import DungeonSourceCallout from '@/components/craft-planner/DungeonSourceCallout.vue'
import ModifierChipPopover from '@/components/craft-planner/ModifierChipPopover.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import { useChipPopover } from '@/composables/core/useChipPopover'
import { usePopover } from '@/composables/core/usePopover'
import type { PlannerLockedGate, PlannerNode } from '@/types'
import { formatNumber, itemTypeColor } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'
import { extractModifierChips, type ModifierChip } from '@/utils/planner/modifierChips'

const { t } = useI18n()


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
    lockedGateByNode?: Record<string, PlannerLockedGate>
    /** Opt-in (Summon focus pane): global owned stock per item. When set, a node whose
     * available amount has been depleted by creatures earlier in the plan shows the violet
     * reserved/earmarked treatment — matching the top-level SummoningObjectiveCard. */
    ownedTotalByItem?: Record<string, number>
  }>(),
  {
    nodeAnnotations: () => ({}),
    subtreeCostByNode: () => ({}),
    queuedAmounts: () => ({}),
    forceCollapsible: false,
    recommendations: () => ({}),
    lockedGateByNode: () => ({}),
  },
)


const lockedGate = computed<PlannerLockedGate | null>(
  () => props.lockedGateByNode[props.node.id] ?? null,
)
const lockedTarget = computed(() =>
  lockedGate.value
    ? {
        name: 'planner',
        query: {
          tab: 'skills',
          skill: lockedGate.value.skill.toLowerCase(),
          target: String(lockedGate.value.level),
        },
      }
    : null,
)


const queuedForItem = computed(() => props.queuedAmounts?.[props.node.itemId] ?? 0)
// inventoryAmounts is a merged pool (raw + queued) used by the planner graph.
// Derive the raw (non-queued) portion so the progress bar shows owned vs queued correctly.
const stockOnHand = computed(() => {
  const merged = props.inventoryAmounts[props.node.itemId] ?? 0
  return Math.max(0, merged - queuedForItem.value)
})
const totalNeeded = computed(() => props.node.grossAmount)
// requiredAmount is already net of all claimed stock (raw + queued), so it IS the deficit.
const deficit = computed(() => props.node.requiredAmount)


// Shared-pool depletion (Summon focus pane): the available stock here is the per-creature
// budget; `ownedTotalByItem` is the global stock. The gap is what creatures earlier in the
// plan claimed — shown as a violet "reserved" slice so a low "Have" reads as earmarked,
// not a true shortage. Inert (ownedTotalByItem unset) on the Skill/Craft planner trees.
const ownedTotalForItem = computed(() => props.ownedTotalByItem?.[props.node.itemId])
const availableHere = computed(() => props.inventoryAmounts[props.node.itemId] ?? 0)
const reservedEarlier = computed(() =>
  ownedTotalForItem.value != null ? Math.max(0, ownedTotalForItem.value - availableHere.value) : 0,
)
const isDepleted = computed(() => reservedEarlier.value > 0 && deficit.value > 0)
const ownsEnough = computed(
  () => ownedTotalForItem.value != null && ownedTotalForItem.value >= totalNeeded.value,
)
const earmarkedOnly = computed(() => isDepleted.value && ownsEnough.value)


// Bar segments as % of need: owned, queued, then the reserved (striped) slice.
const ownedPct = computed(() =>
  Math.min(100, Math.round((stockOnHand.value / Math.max(1, totalNeeded.value)) * 100)),
)
const queuedPct = computed(() =>
  Math.min(
    100 - ownedPct.value,
    Math.round((queuedForItem.value / Math.max(1, totalNeeded.value)) * 100),
  ),
)
const reservedPct = computed(() => {
  if (!isDepleted.value) return 0
  const track = 100 - ownedPct.value - queuedPct.value
  return Math.min(track, Math.round((reservedEarlier.value / Math.max(1, totalNeeded.value)) * 100))
})
const hasReserved = computed(() => reservedPct.value > 0)


const activeMethod = computed(() => {
  const methodId = props.activeMethodIdByNode[props.node.id]
  return props.node.methods.find((m) => m.id === methodId) ?? null
})


const modifierChips = computed<ModifierChip[]>(() => {
  if (!activeMethod.value) return []
  return extractModifierChips(activeMethod.value.detailRows, activeMethod.value.title)
})


// Modifier chip popover — anchored below the chip, right-aligned.
const { activeChip, chipPop, onChipEnter, onChipLeave } = useChipPopover()


// Bar-segment popover — follows the cursor.
const barPopoverSegment = ref<'owned' | 'queued' | 'reserved' | null>(null)
const barPop = usePopover({ width: 180, gap: 12 })


function onSegmentEnter(segment: 'owned' | 'queued' | 'reserved', event: MouseEvent) {
  barPopoverSegment.value = segment
  barPop.openAtPoint(event.clientX, event.clientY)
}


function onSegmentMove(event: MouseEvent) {
  if (!barPopoverSegment.value) return
  barPop.openAtPoint(event.clientX, event.clientY)
}


function onSegmentLeave() {
  barPopoverSegment.value = null
  barPop.close()
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


// Root nodes line up with the List view's SummoningObjectiveCard, so they borrow its
// fuller chrome (larger icon, roomier padding, amber lock state + compact lock chip).
// Nested nodes keep the denser tree styling.
const isRoot = computed(() => props.node.depth === 0)


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
    <div v-if="node.fulfilled" class="flex min-w-0 items-start gap-1">
      <span class="w-5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div
          class="flex min-w-0 items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2 opacity-70"
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
              class="text-3xs font-bold"
              :style="{ color: itemTypeColor(node.itemType) }"
            >
              {{ node.itemName.charAt(0) }}
            </span>
          </div>
          <span class="min-w-0 truncate text-sm font-semibold text-muted-foreground">{{
            node.itemName
          }}</span>
          <CheckCircle2 class="size-4 shrink-0 text-success-strong" />
          <span
            class="bg-success/8 dark:bg-success/8 shrink-0 rounded-full border border-success/30 px-2 py-0.5 text-2xs font-semibold text-success-strong dark:border-success/30 dark:text-success-strong"
          >
            {{ t('plannerComponents.treeNode.inStock') }}
          </span>
        </div>
        <!-- Dungeon combat rewards: alternative-source hint, even when in stock. -->
        <DungeonSourceCallout :item-id="node.itemId" />
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
      <div
        class="min-w-0 flex-1 overflow-hidden rounded-xl border"
        :class="[
          isRoot ? 'p-3.5' : 'p-3',
          isRoot && lockedGate ? 'border-warning/60 bg-card/60' : 'border-border/40 bg-card/60',
        ]"
      >
        <div class="flex items-stretch gap-3">
          <!-- Item icon (square, full height) -->
          <div
            class="flex shrink-0 items-center justify-center rounded-lg"
            :class="isRoot ? 'size-16' : 'size-14'"
            :style="{
              backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 10%, transparent)`,
            }"
          >
            <img
              v-if="getItemImage({ id: node.itemId })"
              :src="getItemImage({ id: node.itemId })"
              :alt="node.itemName"
              class="object-contain"
              :class="isRoot ? 'size-9' : 'size-8'"
              loading="lazy"
            />
            <span v-else class="text-sm font-bold" :style="{ color: itemTypeColor(node.itemType) }">
              {{ node.itemName.charAt(0) }}
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <!-- Name + source -->
            <div class="flex items-center gap-2" :class="isRoot ? 'mb-2' : 'mb-1.5'">
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
                  :aria-label="chip.label"
                  @mouseenter="onChipEnter(chip, ci, $event)"
                  @mouseleave="onChipLeave"
                >
                  <img v-if="chip.icon" :src="chip.icon" alt="" class="size-4" loading="lazy" />
                </span>
              </div>
            </div>

            <!-- Skill-gate lock (#2): resource the player can't yet acquire.
                 Root nodes surface the lock as a compact chip in the amounts row
                 (mirroring the List card), so the text row is nested-only. -->
            <div
              v-if="lockedGate && !isRoot"
              class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
            >
              <span class="inline-flex items-center gap-1 text-2xs font-medium text-warning-strong">
                <Lock class="size-3 shrink-0" />
                {{ lockedGate.skill }} Lv{{ lockedGate.level }}
                <span class="text-warning-strong/60">(you're {{ lockedGate.current }})</span>
              </span>
              <RouterLink
                v-if="lockedTarget"
                :to="lockedTarget"
                class="text-2xs font-semibold text-warning-strong underline-offset-2 hover:underline dark:text-warning-strong"
              >
                Plan {{ lockedGate.skill }} →
              </RouterLink>
            </div>

            <!-- Progress bar: owned + queued (available here), then a violet striped slice
                 for stock reserved by creatures earlier in the plan. -->
            <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
              <div class="flex h-full">
                <div
                  class="h-full rounded-l-full bg-warning transition-all duration-300"
                  :class="{ 'rounded-r-full': queuedForItem === 0 && !hasReserved }"
                  :style="{ width: `${ownedPct}%` }"
                  @mouseenter="onSegmentEnter('owned', $event)"
                  @mousemove="onSegmentMove"
                  @mouseleave="onSegmentLeave"
                />
                <div
                  v-if="queuedForItem > 0"
                  class="h-full bg-info transition-all duration-300"
                  :class="{ 'rounded-r-full': !hasReserved }"
                  :style="{ width: `${queuedPct}%` }"
                  @mouseenter="onSegmentEnter('queued', $event)"
                  @mousemove="onSegmentMove"
                  @mouseleave="onSegmentLeave"
                />
                <div
                  v-if="hasReserved"
                  class="reserved-stripe h-full rounded-r-full transition-all duration-300"
                  :style="{ width: `${reservedPct}%` }"
                  @mouseenter="onSegmentEnter('reserved', $event)"
                  @mousemove="onSegmentMove"
                  @mouseleave="onSegmentLeave"
                />
              </div>
            </div>

            <!-- Amounts -->
            <div class="mt-1.5 flex items-baseline justify-between">
              <span class="font-mono font-semibold" :class="isRoot ? 'text-xs' : 'text-2xs'">
                <!-- "Here" once a shared pool is depleted: what's left for THIS creature, not
                     the global stock — surfaced as "owned" alongside. -->
                <span class="text-3xs font-normal text-muted-foreground/50">{{
                  isDepleted
                    ? t('plannerComponents.treeNode.here')
                    : t('plannerComponents.treeNode.have')
                }}</span>
                <span class="text-foreground"
                  >{{ formatNumber(stockOnHand)
                  }}<sup v-if="queuedForItem > 0" class="text-info-strong">*</sup></span
                >
                <span class="text-muted-foreground/50"> / {{ formatNumber(totalNeeded) }}</span>
                <span class="text-3xs font-normal text-muted-foreground/50">
                  {{ t('plannerComponents.treeNode.total') }}</span
                >
                <span v-if="isDepleted" class="ml-1 text-xs font-medium text-reserved-strong">
                  · {{ formatNumber(ownedTotalForItem ?? 0) }}
                  {{ t('plannerComponents.treeNode.owned') }}
                </span>
              </span>
              <!-- Root lock chip (mirrors the List card): the chip is the CTA, replacing
                   the "Need" value; nested nodes keep the text row above instead. -->
              <AppTooltip v-if="isRoot && lockedGate && lockedTarget" position="top">
                <RouterLink
                  :to="lockedTarget"
                  class="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 font-mono text-2xs font-bold text-warning-strong transition hover:bg-warning/25 dark:text-warning-strong"
                >
                  <Lock class="size-3" />
                  L{{ lockedGate.level }}
                  <ArrowUpRight class="size-3" />
                </RouterLink>
                <template #content>
                  <div class="flex flex-col gap-0.5">
                    <span class="font-semibold text-card-foreground">
                      Requires {{ lockedGate.skill }} Lv{{ lockedGate.level }}
                      <span class="font-normal text-muted-foreground"
                        >(LVL {{ lockedGate.current }})</span
                      >
                    </span>
                    <span class="mt-0.5 italic text-muted-foreground">
                      Click to plan {{ lockedGate.skill }}
                    </span>
                  </div>
                </template>
              </AppTooltip>
              <!-- Earmarked, not short: same "Need" amount, but violet instead of amber — you
                   own enough overall; this slice is claimed by creatures earlier in the plan. -->
              <span
                v-else-if="earmarkedOnly"
                class="font-mono font-semibold text-reserved-strong"
                :class="isRoot ? 'text-xs' : 'text-2xs'"
              >
                <span class="text-3xs font-normal text-reserved-strong/60">Need </span>
                {{ formatNumber(deficit) }}
              </span>
              <span
                v-else-if="deficit > 0"
                class="font-mono font-semibold text-warning-strong"
                :class="isRoot ? 'text-xs' : 'text-2xs'"
              >
                <span class="text-3xs font-normal text-warning-strong/60"
                  >{{ t('plannerComponents.treeNode.need') }}
                </span>
                {{ formatNumber(deficit) }}
              </span>
            </div>

            <!-- Dungeon combat rewards: alternative-source hint, matching the List card. -->
            <DungeonSourceCallout :item-id="node.itemId" />
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
        :locked-gate-by-node="lockedGateByNode"
        :owned-total-by-item="ownedTotalByItem"
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
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-muted-foreground/70 transition hover:bg-foreground/5 hover:text-muted-foreground"
        @click="emit('toggle-collapse', node.id)"
      >
        <ChevronRight class="size-3" />
        {{ activeMethod!.children.length }} {{ t('plannerComponents.treeNode.items') }}
      </button>
    </div>

    <!-- Bar segment popover -->
    <FloatingPanel
      :is-open="barPop.isOpen"
      :el-ref="barPop.setPanelEl"
      :style="barPop.style"
      class="w-45 pointer-events-none z-50 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
    >
      <div class="flex items-center gap-1.5 px-3 py-2">
        <template v-if="barPopoverSegment === 'owned'">
          <span class="font-mono text-xs font-bold text-warning-strong">
            {{ formatNumber(stockOnHand) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('plannerComponents.treeNode.have2')
          }}</span>
        </template>
        <template v-else-if="barPopoverSegment === 'queued'">
          <span class="font-mono text-xs font-bold text-info-strong">
            {{ formatNumber(queuedForItem) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('plannerComponents.treeNode.queued')
          }}</span>
        </template>
        <template v-else-if="barPopoverSegment === 'reserved'">
          <span class="font-mono text-xs font-bold text-reserved-strong">
            {{ formatNumber(reservedEarlier) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('plannerComponents.treeNode.usedByEarlierCreatures')
          }}</span>
        </template>
      </div>
    </FloatingPanel>

    <!-- Modifier chip popover -->
    <ModifierChipPopover :chip-pop="chipPop" :active-chip="activeChip" />
  </div>
</template>

<style scoped>
/* Reserved-by-earlier-creatures bar slice: a violet diagonal stripe reads "spoken for,
   not available here" — distinct from amber (available) and sky (queued). */
.reserved-stripe {
  background-color: rgb(167 139 250 / 0.3);
  background-image: repeating-linear-gradient(
    45deg,
    rgb(167 139 250 / 0.55) 0 2px,
    transparent 2px 5px
  );
}
</style>
