<script setup lang="ts">
/**
 * Collapsible top-level material card — the header shell extracted from
 * SummoningMaterialTree so the Single Item planner's tree can match the Summon planner's
 * craft-node presentation: a type-colored item icon + name + ×qty, a cluster of summary
 * badges (time / cost / branch points), and a bordered body slot for the recursive
 * PlannerTreeNode children. Presentational only — open state and body are owned by the
 * parent.
 */
import { ChevronDown, ChevronRight, Clock3, GitBranch } from 'lucide-vue-next'

import PlannerBadge from '@/components/craft-planner/PlannerBadge.vue'
import BaseCard from '@/components/shared/BaseCard.vue'
import type { ItemType } from '@/types'
import { formatDuration, formatNumber, itemTypeColor } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

defineProps<{
  itemId: string
  itemName: string
  itemType?: ItemType
  requiredAmount: number
  /** Roll-up badges; pass the planner's `summary` output. */
  summary?: { totalTimeSeconds: number | null; totalCost: number; branchPointCount: number } | null
  open: boolean
}>()


defineEmits<{ toggle: [] }>()
</script>

<template>
  <BaseCard variant="default" class="overflow-hidden">
    <button
      class="focus-ring flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-muted/15"
      @click="$emit('toggle')"
    >
      <component
        :is="open ? ChevronDown : ChevronRight"
        class="size-4 shrink-0 text-muted-foreground"
      />
      <div
        class="flex size-16 shrink-0 items-center justify-center rounded-lg"
        :class="itemType ? '' : 'bg-muted/30'"
        :style="
          itemType
            ? {
                backgroundColor: `color-mix(in oklch, ${itemTypeColor(itemType)} 10%, transparent)`,
              }
            : {}
        "
      >
        <img
          v-if="getItemImage({ id: itemId })"
          :src="getItemImage({ id: itemId })"
          :alt="itemName"
          class="size-9 object-contain"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="min-w-0 truncate text-sm font-semibold text-foreground">{{ itemName }}</span>
          <span class="shrink-0 font-mono text-sm font-semibold text-primary">
            ×{{ formatNumber(requiredAmount) }}
          </span>
        </div>
      </div>

      <div v-if="summary" class="flex shrink-0 items-center gap-2">
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
          {{ formatNumber(Math.round(summary.totalCost)) }}
        </PlannerBadge>
        <PlannerBadge v-if="summary.branchPointCount > 0" color="var(--color-primary)">
          <GitBranch class="size-3" />
          {{ summary.branchPointCount }}
        </PlannerBadge>
        <!-- Consumer-specific badges (e.g. expedition). -->
        <slot name="badges" />
      </div>
    </button>

    <div v-if="open" class="flex flex-col gap-2 border-t border-border/40 px-4 py-4">
      <slot />
    </div>
  </BaseCard>
</template>
