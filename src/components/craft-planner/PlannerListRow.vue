<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import ModifierChipPopover from '@/components/craft-planner/ModifierChipPopover.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import { useChipPopover } from '@/composables/core/useChipPopover'
import { usePopover } from '@/composables/core/usePopover'
import type { PlannerLockedGate, PlannerMethod, PlannerNode } from '@/types'
import { formatNumber, itemTypeColor } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'
import { extractModifierChips } from '@/utils/planner/modifierChips'

const { t } = useI18n()


import PlannerRecommendation from './PlannerRecommendation.vue'

const props = defineProps<{
  node: PlannerNode
  activeMethod: PlannerMethod | null
  inventoryAmount: number
  queuedAmount?: number
  recommendation: { text: string } | null
  subtreeCost: number | null
  lockedGate?: PlannerLockedGate | null
}>()


const lockedTarget = computed(() =>
  props.lockedGate
    ? {
        name: 'planner',
        query: {
          tab: 'skills',
          skill: props.lockedGate.skill.toLowerCase(),
          target: String(props.lockedGate.level),
        },
      }
    : null,
)


const modifierChips = computed(() => {
  if (!props.activeMethod) return []
  return extractModifierChips(props.activeMethod.detailRows, props.activeMethod.title, {
    compact: true,
  })
})


const displayCost = computed<number | null>(() => {
  if (props.subtreeCost != null && props.subtreeCost > 0) return props.subtreeCost
  return props.activeMethod?.cost ?? null
})


// Modifier chip popover — anchored below the chip, right-aligned.
const { activeChip, chipPop, onChipEnter, onChipLeave } = useChipPopover()


// inventoryAmount is a merged pool (raw + queued) from the planner graph.
// Derive the raw (non-queued) portion so the progress bar shows owned vs queued correctly.
const rawInventory = computed(() => Math.max(0, props.inventoryAmount - (props.queuedAmount ?? 0)))
const totalNeeded = computed(() => props.node.grossAmount)


const ownedPct = computed(() =>
  Math.min(100, Math.round((rawInventory.value / Math.max(1, totalNeeded.value)) * 100)),
)


const queuedPct = computed(() => {
  if (!props.queuedAmount || props.queuedAmount <= 0) return 0
  return Math.min(
    100 - ownedPct.value,
    Math.round((props.queuedAmount / Math.max(1, totalNeeded.value)) * 100),
  )
})


// Bar-segment popover — follows the cursor.
const barPopoverSegment = ref<'owned' | 'queued' | null>(null)
const barPop = usePopover({ width: 180, gap: 12 })


function onSegmentEnter(segment: 'owned' | 'queued', event: MouseEvent) {
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
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- Main row -->
    <div
      class="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border/40 px-3 py-2.5"
    >
      <!-- Item icon -->
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
        <span v-else class="text-3xs font-bold" :style="{ color: itemTypeColor(node.itemType) }">
          {{ node.itemName.charAt(0) }}
        </span>
      </div>

      <!-- Name + modifier micro icons -->
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="min-w-0 truncate text-sm font-semibold text-foreground">{{
            node.itemName
          }}</span>
          <!-- Modifier micro icons -->
          <div v-if="activeMethod" class="flex shrink-0 items-center gap-1.5">
            <span
              v-for="(chip, i) in modifierChips"
              :key="i"
              class="inline-flex size-6 cursor-default items-center justify-center rounded-md border"
              :class="chip.color"
              @mouseenter="onChipEnter(chip, i, $event)"
              @mouseleave="onChipLeave"
            >
              <img v-if="chip.icon" :src="chip.icon" alt="" class="size-4" loading="lazy" />
            </span>
          </div>
        </div>
        <!-- Source subtitle -->
        <div v-if="activeMethod" class="flex items-center gap-1">
          <img
            v-if="sourceIcons[activeMethod.title]"
            :src="sourceIcons[activeMethod.title]"
            alt=""
            class="size-3 shrink-0"
            loading="lazy"
          />
          <span class="min-w-0 truncate text-xs text-muted-foreground">{{
            activeMethod.title
          }}</span>
        </div>
        <!-- Skill-gate lock (#2): resource the player can't yet acquire -->
        <div v-if="lockedGate" class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
        <!-- Progress bar -->
        <div class="h-1 overflow-hidden rounded-full bg-border/30">
          <div class="flex h-full">
            <div
              class="h-full rounded-l-full bg-warning transition-all duration-300"
              :class="{ 'rounded-r-full': queuedPct === 0 }"
              :style="{ width: `${ownedPct}%` }"
              @mouseenter="onSegmentEnter('owned', $event)"
              @mousemove="onSegmentMove"
              @mouseleave="onSegmentLeave"
            />
            <div
              v-if="queuedPct > 0"
              class="h-full rounded-r-full bg-info transition-all duration-300"
              :style="{ width: `${queuedPct}%` }"
              @mouseenter="onSegmentEnter('queued', $event)"
              @mousemove="onSegmentMove"
              @mouseleave="onSegmentLeave"
            />
          </div>
        </div>
      </div>

      <!-- Right side: cost -->
      <div v-if="activeMethod && (displayCost ?? 0) > 0" class="flex shrink-0 items-center gap-3">
        <span
          class="flex items-center gap-0.5 font-mono text-xs font-semibold"
          style="color: var(--color-yellow)"
        >
          <img
            v-if="getItemImage({ id: 'gold' })"
            :src="getItemImage({ id: 'gold' })"
            alt="Gold"
            class="size-3 object-contain"
          />
          {{ formatNumber(Math.round(displayCost!)) }}
        </span>
      </div>
    </div>

    <!-- Recommendation hint -->
    <PlannerRecommendation v-if="recommendation" :text="recommendation.text" class="mx-1" />
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
          {{ formatNumber(rawInventory) }}
        </span>
        <span class="text-2xs text-muted-foreground">{{
          t('plannerComponents.listRow.have')
        }}</span>
      </template>
      <template v-else-if="barPopoverSegment === 'queued'">
        <span class="font-mono text-xs font-bold text-info-strong">
          {{ formatNumber(queuedAmount ?? 0) }}
        </span>
        <span class="text-2xs text-muted-foreground">{{
          t('plannerComponents.listRow.queued')
        }}</span>
      </template>
    </div>
  </FloatingPanel>

  <!-- Modifier chip popover -->
  <ModifierChipPopover :chip-pop="chipPop" :active-chip="activeChip" />
</template>
