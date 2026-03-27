<script setup lang="ts">
import { CheckCircle2, Clock3, Loader2, Route } from 'lucide-vue-next'

import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import { formatDuration } from '@/utils/format'

defineProps<{
  subtitle: string
  progressPercent: number
  elapsedMs: number
  exploredStates: number
  bestCompleteTime: number | null
}>()


function formatElapsedMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}
</script>

<template>
  <PlannerEmptyState title="Finding the best routes..." :subtitle="subtitle">
    <template #action>
      <div class="w-full max-w-xl space-y-4">
        <Loader2 class="mx-auto size-8 animate-spin text-primary" />

        <div class="flex items-center gap-3">
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-border/60">
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <span class="min-w-[3ch] text-right text-xs tabular-nums text-muted-foreground">
            {{ progressPercent }}%
          </span>
        </div>

        <div
          class="grid grid-cols-2 gap-3"
          :class="{ 'sm:grid-cols-3': bestCompleteTime !== null }"
        >
          <div class="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <Clock3 class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Elapsed
              </p>
              <p class="truncate text-sm font-semibold tabular-nums">
                {{ formatElapsedMs(elapsedMs) }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <Route class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Routes explored
              </p>
              <p class="truncate text-sm font-semibold tabular-nums">
                {{ exploredStates.toLocaleString() }}
              </p>
            </div>
          </div>
          <div
            v-if="bestCompleteTime !== null"
            class="col-span-2 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 sm:col-span-1"
          >
            <CheckCircle2 class="size-4 shrink-0 text-green-500" />
            <div class="min-w-0">
              <p
                class="text-[10px] font-medium uppercase tracking-wider text-green-600 dark:text-green-400"
              >
                Best time
              </p>
              <p
                class="truncate text-sm font-semibold tabular-nums text-green-700 dark:text-green-300"
              >
                {{ formatDuration(bestCompleteTime) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </PlannerEmptyState>
</template>
