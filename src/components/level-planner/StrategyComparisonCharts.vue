<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PartyLevelingPlan, PlannerStrategy } from '@/types'

const { t } = useI18n()
import { formatDuration } from '@/utils/format/format'
import { deriveTimeSeries } from '@/utils/planner/strategyChartData'

import StrategyChart from './StrategyChart.vue'

const props = withDefaults(
  defineProps<{
    plan: PartyLevelingPlan
    otherPlan: PartyLevelingPlan | null
    strategy: PlannerStrategy
    otherComputing: boolean
    targetLevel: number
    filterCreatureId?: string
  }>(),
  {
    filterCreatureId: '',
  },
)


const primarySeries = computed(() =>
  deriveTimeSeries(props.plan, props.targetLevel, props.filterCreatureId || undefined),
)
const secondarySeries = computed(() =>
  props.otherPlan
    ? deriveTimeSeries(props.otherPlan, props.targetLevel, props.filterCreatureId || undefined)
    : null,
)


const primaryLabel = computed(() =>
  props.strategy === 'optimal'
    ? t('levelPlanner.controls.optimal')
    : t('levelPlanner.controls.handsFree'),
)
const secondaryLabel = computed(() =>
  props.strategy === 'optimal'
    ? t('levelPlanner.controls.handsFree')
    : t('levelPlanner.controls.optimal'),
)


const primaryColor = computed(() =>
  props.strategy === 'optimal' ? 'rgb(129,140,248)' : 'rgb(251,191,36)',
)
const secondaryColor = computed(() =>
  props.strategy === 'optimal' ? 'rgb(251,191,36)' : 'rgb(129,140,248)',
)
</script>

<template>
  <div class="space-y-4">
    <!-- Summary badges -->
    <div class="flex flex-wrap gap-3 text-xs">
      <div
        class="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5"
      >
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: primaryColor }" />
        <span class="font-semibold">{{ primaryLabel }}</span>
        <span class="text-muted-foreground">
          {{ formatDuration(props.plan.totalTimeSeconds) }} &middot; {{ props.plan.totalRuns }}
          {{ t('levelPlannerComponents.strategyComparison.runs') }} &middot;
          {{ props.plan.steps.filter((s) => s.wasReconfigured).length }}
          {{ t('levelPlannerComponents.strategyComparison.swaps') }}
        </span>
      </div>
      <div
        v-if="props.otherPlan"
        class="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5"
      >
        <span
          class="inline-block size-2 rounded-full"
          :style="{ backgroundColor: secondaryColor }"
        />
        <span class="font-semibold">{{ secondaryLabel }}</span>
        <span class="text-muted-foreground">
          {{ formatDuration(props.otherPlan.totalTimeSeconds) }} &middot;
          {{ props.otherPlan.totalRuns }}
          {{ t('levelPlannerComponents.strategyComparison.runs') }} &middot;
          {{ props.otherPlan.steps.filter((s) => s.wasReconfigured).length }}
          {{ t('levelPlannerComponents.strategyComparison.swaps') }}
        </span>
      </div>
      <div
        v-else-if="otherComputing"
        class="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5"
      >
        <span
          class="inline-block size-2 rounded-full"
          :style="{ backgroundColor: secondaryColor }"
        />
        <span class="font-semibold">{{ secondaryLabel }}</span>
        <span class="animate-pulse text-muted-foreground">{{
          t('levelPlannerComponents.strategyComparison.computing')
        }}</span>
      </div>
    </div>

    <!-- Charts -->
    <StrategyChart
      :title="t('levelPlannerComponents.strategyComparison.xpRate')"
      :y-label="t('levelPlannerComponents.strategyComparison.xpPerSec')"
      :primary-series="primarySeries.xpRate"
      :secondary-series="secondarySeries?.xpRate ?? null"
      :primary-label="primaryLabel"
      :secondary-label="secondaryLabel"
      :primary-color="primaryColor"
      :secondary-color="secondaryColor"
      :format-value="(v: number) => v.toFixed(1)"
      :secondary-loading="otherComputing"
    />

    <StrategyChart
      :title="t('levelPlannerComponents.strategyComparison.swapRate')"
      :y-label="t('levelPlannerComponents.strategyComparison.swapsPerHr')"
      :primary-series="primarySeries.swapRate"
      :secondary-series="secondarySeries?.swapRate ?? null"
      :primary-label="primaryLabel"
      :secondary-label="secondaryLabel"
      :primary-color="primaryColor"
      :secondary-color="secondaryColor"
      :step-mode="true"
      :format-value="(v: number) => String(Math.round(v))"
      :secondary-loading="otherComputing"
    />

    <StrategyChart
      :title="t('levelPlannerComponents.strategyComparison.levelingProgress')"
      :y-label="t('levelPlannerComponents.strategyComparison.avgPct')"
      :primary-series="primarySeries.levelingProgress"
      :secondary-series="secondarySeries?.levelingProgress ?? null"
      :primary-label="primaryLabel"
      :secondary-label="secondaryLabel"
      :primary-color="primaryColor"
      :secondary-color="secondaryColor"
      :format-value="(v: number) => (v * 100).toFixed(0) + '%'"
      :secondary-loading="otherComputing"
    />
  </div>
</template>
