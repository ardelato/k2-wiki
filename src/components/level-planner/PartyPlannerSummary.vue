<script setup lang="ts">
import { Clock3, Repeat, Users, Flag, ArrowRightLeft } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import expeditionsData from '@/data/expeditions.json'
import { isRunPartyStep } from '@/types'
import type { PartyLevelingPlan } from '@/types'
import type { Creature } from '@/types'
import { formatDuration, formatNumber } from '@/utils/format/format'

const { t } = useI18n()


const props = defineProps<{
  plan: PartyLevelingPlan
  creatures: Map<string, Creature>
}>()


const usedExpeditionCount = computed(
  () => new Set(props.plan.steps.filter(isRunPartyStep).map((step) => step.expedition.id)).size,
)


const totalExpeditionCount = (expeditionsData as { id: string }[]).length


const swapCount = computed(
  () => props.plan.steps.filter((s) => s.kind === 'run' && s.wasReconfigured).length,
)
</script>

<template>
  <div class="surface-card px-4 py-3">
    <!-- Overall stats -->
    <div class="flex flex-wrap items-center justify-evenly gap-y-2 text-base font-semibold">
      <span class="inline-flex items-center gap-1.5" style="color: var(--color-green)">
        <Clock3 class="size-4" />
        {{ formatDuration(plan.totalTimeSeconds) }}
      </span>
      <span
        class="inline-flex items-center gap-1.5"
        :class="plan.isComplete ? 'text-info-strong' : 'text-warning-strong'"
      >
        <Users class="size-4" />
        {{
          t('levelPlannerComponents.partySummary.creatureCount', {
            planned: plan.plannedLevelerCount - plan.incompleteCreatureIds.length,
            input: plan.inputLevelerCount,
          })
        }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-warning-strong">
        <Repeat class="size-4" />
        {{
          t('levelPlannerComponents.partySummary.runs', {
            total: formatNumber(plan.totalRuns),
          })
        }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-reserved-strong">
        <Flag class="size-4" />
        {{
          t('levelPlannerComponents.partySummary.expeditions', {
            count: usedExpeditionCount + '/' + totalExpeditionCount,
          })
        }}
      </span>
      <span
        class="inline-flex cursor-help items-center gap-1.5 text-danger-strong"
        :title="t('levelPlannerComponents.partySummary.swapsTooltip')"
      >
        <ArrowRightLeft class="size-4" />
        {{ t('levelPlannerComponents.partySummary.swaps', { count: swapCount }) }}
      </span>
    </div>
    <div
      v-if="!plan.isComplete"
      class="mt-3 rounded-lg bg-warning/10 px-4 py-3 text-center text-sm text-warning-strong"
    >
      <p class="font-semibold">
        {{
          t('levelPlannerComponents.partySummary.incompleteWarning', {
            n: plan.incompleteCreatureIds.length,
          })
        }}
      </p>
      <p class="mt-1 text-xs text-warning-strong/70">
        {{ t('levelPlannerComponents.partySummary.incompleteHint') }}
      </p>
    </div>
  </div>
</template>
