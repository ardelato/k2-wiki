<script setup lang="ts">
import { CheckCircle2, Clock3, Loader2, Route } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import { formatDuration, formatNumber } from '@/utils/format/format'

const { t } = useI18n()


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
  <PlannerEmptyState
    :title="t('levelPlannerComponents.loadingProgress.findingRoutes')"
    :subtitle="subtitle"
  >
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
              <p class="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
                {{ t('levelPlannerComponents.loadingProgress.elapsed') }}
              </p>
              <p class="truncate text-sm font-semibold tabular-nums">
                {{ formatElapsedMs(elapsedMs) }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <Route class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
                {{ t('levelPlannerComponents.loadingProgress.routesExplored') }}
              </p>
              <p class="truncate text-sm font-semibold tabular-nums">
                {{ formatNumber(exploredStates) }}
              </p>
            </div>
          </div>
          <div
            v-if="bestCompleteTime !== null"
            class="col-span-2 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 sm:col-span-1"
          >
            <CheckCircle2 class="size-4 shrink-0 text-success-strong" />
            <div class="min-w-0">
              <p class="text-3xs font-medium uppercase tracking-wider text-success-strong">
                {{ t('levelPlannerComponents.loadingProgress.bestTime') }}
              </p>
              <p class="truncate text-sm font-semibold tabular-nums text-success-strong">
                {{ formatDuration(bestCompleteTime) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </PlannerEmptyState>
</template>
