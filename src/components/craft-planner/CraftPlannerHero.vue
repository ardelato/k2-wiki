<script setup lang="ts">
/**
 * Command card for the Craft (Single item) planner. One card carries the whole top of
 * the page: the target item (click to change), the quantity controls, and the summary
 * stats — so the item identity is shown exactly once. Mirrors the creature focus header's
 * mono-stat vocabulary (crafts left / est. time / % stocked) with emerald-done /
 * amber-short semantics. Controls + gold badge are injected by the parent via slots.
 */
import { ChevronDown, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { formatDuration } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const props = defineProps<{
  itemId: string
  itemName: string
  itemImage?: string
  /** Count of remaining craft sub-steps (summary.craftStepCount). */
  craftsLeft: number
  /** Schedule-aware total time; null when some steps lack a time estimate. */
  estTimeSeconds: number | null
  /** Inventory coverage across the plan's nodes, 0–100. */
  stockedPct: number
}>()


const emit = defineEmits<{ 'change-item': []; clear: [] }>()


const image = computed(() => getItemImage({ id: props.itemId, image: props.itemImage }))
const estTimeLabel = computed(() =>
  props.estTimeSeconds == null ? '—' : formatDuration(props.estTimeSeconds),
)
</script>

<template>
  <div class="surface-card flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
    <!-- Target item — click to change, with an attached clear (×) to deselect. -->
    <div class="flex min-w-0 items-center gap-1">
      <button
        type="button"
        class="focus-ring -m-1 flex min-w-0 items-center gap-3 rounded-lg p-1 text-left transition hover:bg-foreground/5"
        @click="emit('change-item')"
      >
        <span class="size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
          <img
            v-if="image"
            :src="image"
            :alt="itemName"
            class="size-full object-contain"
            loading="lazy"
          />
        </span>
        <span class="min-w-0">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-lg font-bold text-foreground">{{ itemName }}</span>
            <ChevronDown class="size-4 shrink-0 text-muted-foreground/60" />
          </span>
        </span>
      </button>
      <button
        type="button"
        class="focus-ring shrink-0 rounded-full p-1 text-muted-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
        :title="t('planner.clearSelectedItem')"
        :aria-label="t('planner.clearSelectedItem')"
        @click="emit('clear')"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- Quantity controls (stepper + multipliers). -->
    <div class="flex items-center gap-2">
      <slot name="controls" />
    </div>

    <!-- Summary stats. -->
    <div class="ml-auto flex shrink-0 items-start gap-5 sm:gap-7">
      <div class="text-right">
        <div
          class="font-mono text-2xl font-extrabold leading-none"
          :class="craftsLeft > 0 ? 'text-warning-strong' : 'text-success-strong'"
        >
          {{ craftsLeft }}
        </div>
        <div
          class="mt-1 font-mono text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground/50"
        >
          {{ t('planner.heroStats.craftsLeft') }}
        </div>
      </div>

      <div class="text-right">
        <div class="font-mono text-2xl font-extrabold leading-none text-foreground">
          {{ estTimeLabel }}
        </div>
        <div
          class="mt-1 font-mono text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground/50"
        >
          {{ t('planner.heroStats.estTime') }}
        </div>
      </div>

      <div class="text-right">
        <div class="font-mono text-2xl font-extrabold leading-none text-success-strong">
          {{ stockedPct }}<span class="text-sm text-muted-foreground/50">%</span>
        </div>
        <div
          class="mt-1 font-mono text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground/50"
        >
          {{ t('planner.heroStats.stocked') }}
        </div>
      </div>
    </div>
  </div>
</template>
