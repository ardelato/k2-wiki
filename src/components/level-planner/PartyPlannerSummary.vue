<script setup lang="ts">
import { Clock3, Repeat, Users, Flag } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PartyLevelingPlan } from '@/types'
import type { Creature } from '@/types'
import { formatDuration } from '@/utils/format'

const props = defineProps<{
  plan: PartyLevelingPlan
  creatures: Map<string, Creature>
}>()


const expanded = ref(false)


const waveCount = computed(() => {
  const times = new Set(props.plan.steps.map((s) => s.startTime ?? 0))
  return times.size
})
</script>

<template>
  <div class="surface-card px-4 py-3">
    <!-- Overall stats -->
    <div
      class="flex flex-wrap items-center justify-evenly gap-y-2 text-base font-semibold"
      :class="expanded ? 'border-b border-border/40 pb-3' : ''"
    >
      <span class="inline-flex items-center gap-1.5" style="color: var(--color-green)">
        <Clock3 class="size-4" />
        {{ formatDuration(plan.totalTimeSeconds) }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-sky-400">
        <Users class="size-4" />
        {{ plan.summaries.length }} creature{{ plan.summaries.length > 1 ? 's' : '' }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-amber-400">
        <Repeat class="size-4" />
        {{ plan.totalRuns.toLocaleString() }} runs
      </span>
      <span class="inline-flex items-center gap-1.5 text-purple-400">
        <Flag class="size-4" />
        {{ waveCount }} step{{ waveCount > 1 ? 's' : '' }}
      </span>
    </div>
  </div>
</template>
