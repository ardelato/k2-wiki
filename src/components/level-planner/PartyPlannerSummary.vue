<script setup lang="ts">
import { Clock3, Repeat, Users, Flag, ArrowRightLeft } from 'lucide-vue-next'
import { computed } from 'vue'

import expeditionsData from '@/data/expeditions.json'
import type { PartyLevelingPlan } from '@/types'
import type { Creature } from '@/types'
import { formatDuration } from '@/utils/format'

const props = defineProps<{
  plan: PartyLevelingPlan
  creatures: Map<string, Creature>
}>()


const usedExpeditionCount = computed(
  () =>
    new Set(
      props.plan.steps.filter((step) => !step.isAwakeningStep).map((step) => step.expedition.id),
    ).size,
)


const totalExpeditionCount = (expeditionsData as { id: string }[]).length


const swapCount = computed(
  () => props.plan.steps.filter((s) => !s.isAwakeningStep && s.wasReconfigured).length,
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
        :class="plan.isComplete ? 'text-sky-400' : 'text-amber-400'"
      >
        <Users class="size-4" />
        {{ plan.plannedLevelerCount - plan.incompleteCreatureIds.length }}/{{
          plan.inputLevelerCount
        }}
        creature{{ plan.inputLevelerCount === 1 ? '' : 's' }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-amber-400">
        <Repeat class="size-4" />
        {{ plan.totalRuns.toLocaleString() }} runs
      </span>
      <span class="inline-flex items-center gap-1.5 text-purple-400">
        <Flag class="size-4" />
        {{ usedExpeditionCount }}/{{ totalExpeditionCount }} expeditions
      </span>
      <span
        class="inline-flex cursor-help items-center gap-1.5 text-rose-400"
        title="Party reconfigurations that reset an expedition's loop streak"
      >
        <ArrowRightLeft class="size-4" />
        {{ swapCount }} swap{{ swapCount === 1 ? '' : 's' }}
      </span>
    </div>
    <div
      v-if="!plan.isComplete"
      class="mt-3 rounded-lg bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-400"
    >
      <p class="font-semibold">
        Plan is incomplete: {{ plan.incompleteCreatureIds.length }} creature{{
          plan.incompleteCreatureIds.length === 1 ? '' : 's'
        }}
        still {{ plan.incompleteCreatureIds.length === 1 ? 'does' : 'do' }} not reach the target
        level.
      </p>
      <p class="mt-1 text-xs text-amber-400/70">
        The planner has a calculation limit to keep results fast. Some creatures may need more runs
        than the planner can simulate in one pass.
      </p>
    </div>
  </div>
</template>
