<script setup lang="ts">
import { CheckCircle2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { ItemType } from '@/types'
import { itemTypeColor } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
import type { ModifierChip } from '@/utils/modifierChips'

const props = withDefaults(
  defineProps<{
    itemId: string
    itemName: string
    itemType: ItemType
    totalNeeded: number
    inventoryAmount: number
    queuedAmount?: number
    sourceLabel: string
    sourceIcon?: string | null
    modifiers?: ModifierChip[]
    compact?: boolean
  }>(),
  {
    modifiers: () => [],
    compact: false,
  },
)


const activeChipIndex = ref<number | null>(null)
const activeChip = ref<ModifierChip | null>(null)
const popoverStyle = ref<Record<string, string>>({})


function onChipEnter(chip: ModifierChip, index: number, event: MouseEvent) {
  activeChipIndex.value = index
  activeChip.value = chip
  const target = event.currentTarget as HTMLElement
  if (!target) return
  const rect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 224
  const GAP = 8
  const viewportWidth = document.documentElement.clientWidth
  let top = rect.bottom + GAP
  let left = rect.right - POPOVER_WIDTH
  if (left < GAP) left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
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


// Only fulfilled when raw inventory alone covers the need — queued items
// shouldn't mark an objective as complete since they're still being crafted.
const fulfilled = computed(() => props.inventoryAmount >= props.totalNeeded)


const progressPct = computed(() =>
  Math.min(100, Math.round((props.inventoryAmount / Math.max(1, props.totalNeeded)) * 100)),
)


const deficit = computed(() =>
  Math.max(0, props.totalNeeded - props.inventoryAmount - (props.queuedAmount ?? 0)),
)


function fmt(n: number): string {
  return n.toLocaleString()
}
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border"
    :class="[
      compact ? 'p-3' : 'p-3.5',
      fulfilled ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-border/40 bg-card/60',
    ]"
  >
    <div class="flex items-stretch gap-3">
      <!-- Item icon -->
      <div
        class="flex shrink-0 items-center justify-center rounded-lg"
        :class="compact ? 'size-14' : 'size-16'"
        :style="{
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(itemType)} 10%, transparent)`,
        }"
      >
        <img
          v-if="getItemImage({ id: itemId })"
          :src="getItemImage({ id: itemId })"
          :alt="itemName"
          :class="compact ? 'size-8' : 'size-9'"
          class="object-contain"
          loading="lazy"
        />
        <span v-else class="text-sm font-bold" :style="{ color: itemTypeColor(itemType) }">
          {{ itemName.charAt(0) }}
        </span>
      </div>

      <div class="min-w-0 flex-1">
        <!-- Name + source + status -->
        <div class="mb-2 flex items-center gap-2">
          <span class="min-w-0 truncate text-sm font-semibold text-foreground">
            {{ itemName }}
          </span>
          <template v-if="sourceLabel">
            <span class="shrink-0 text-muted-foreground/30">&middot;</span>
            <img
              v-if="sourceIcon"
              :src="sourceIcon"
              alt=""
              class="size-3.5 shrink-0 object-contain"
            />
            <span class="min-w-0 truncate text-xs text-muted-foreground">
              {{ sourceLabel }}
            </span>
          </template>
          <!-- Modifier chips -->
          <div v-if="modifiers.length > 0" class="ml-auto flex shrink-0 items-center gap-1">
            <span
              v-for="(chip, ci) in modifiers"
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
          <span
            v-if="fulfilled"
            class="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
            :class="{ 'ml-auto': modifiers.length === 0 }"
          >
            <CheckCircle2 class="size-3" />
            Complete
          </span>
        </div>

        <!-- Progress bar -->
        <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
          <div class="flex h-full">
            <div
              class="h-full rounded-l-full transition-all"
              :class="[
                fulfilled ? 'bg-emerald-500' : 'bg-amber-400',
                { 'rounded-r-full': !queuedAmount || queuedAmount === 0 },
              ]"
              :style="{ width: `${progressPct}%` }"
              @mouseenter="!fulfilled && onSegmentEnter('owned', $event)"
              @mousemove="!fulfilled && onSegmentMove($event)"
              @mouseleave="!fulfilled && onSegmentLeave()"
            />
            <div
              v-if="queuedAmount && queuedAmount > 0"
              class="h-full rounded-r-full bg-sky-400 transition-all"
              :style="{
                width: `${Math.min(100 - progressPct, Math.round((queuedAmount / Math.max(1, totalNeeded)) * 100))}%`,
              }"
              @mouseenter="!fulfilled && onSegmentEnter('queued', $event)"
              @mousemove="!fulfilled && onSegmentMove($event)"
              @mouseleave="!fulfilled && onSegmentLeave()"
            />
          </div>
        </div>

        <!-- Amounts -->
        <div class="mt-1.5 flex items-baseline justify-between">
          <span class="font-mono text-xs font-semibold">
            <span class="text-[10px] font-normal text-muted-foreground/50">Have </span>
            <span :class="fulfilled ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'">
              {{ fmt(inventoryAmount)
              }}<sup v-if="!fulfilled && queuedAmount && queuedAmount > 0" class="text-sky-500"
                >*</sup
              >
            </span>
            <span class="text-muted-foreground/50"> / {{ fmt(totalNeeded) }} </span>
            <span class="text-[10px] font-normal text-muted-foreground/50"> Total</span>
          </span>
          <span
            v-if="!fulfilled && deficit > 0"
            class="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400"
          >
            <span class="text-[10px] font-normal text-amber-600/60 dark:text-amber-400/60"
              >Need
            </span>
            {{ fmt(deficit) }}
          </span>
        </div>
      </div>
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
                {{ fmt(inventoryAmount) }}
              </span>
              <span class="text-[11px] text-muted-foreground">have</span>
            </template>
            <template v-else-if="barPopoverSegment === 'queued'">
              <span class="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                {{ fmt(queuedAmount ?? 0) }}
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
