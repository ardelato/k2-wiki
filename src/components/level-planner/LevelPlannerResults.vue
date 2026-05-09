<script setup lang="ts">
import { ref, computed } from 'vue'

import type { Creature } from '@/types'
import type { LevelingPlan } from '@/utils/levelPlanner'

import LevelPlannerSummary from './LevelPlannerSummary.vue'
import LevelPlannerTimelineStep from './LevelPlannerTimelineStep.vue'

const props = defineProps<{
  plan: LevelingPlan
  creatureName: string
  creatureImage?: string
  creature?: Creature | null
  overriddenFromLevels?: Set<number>
  hasRouteOverrides?: boolean
}>()


const emit = defineEmits<{
  selectAlternative: [fromLevel: number, toLevel: number, expeditionId: string, tier: number]
  resetOverride: [fromLevel: number]
  resetAllOverrides: []
}>()


const expandedIndex = ref<number | null>(null)


function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}


const fromLevel = computed(() => props.plan.steps[0]?.fromLevel ?? 1)
const toLevel = computed(() => props.plan.steps[props.plan.steps.length - 1]?.toLevel ?? 1)


const timePercents = computed(() =>
  props.plan.steps.map((step) =>
    props.plan.totalTimeSeconds > 0
      ? (step.timeSeconds / props.plan.totalTimeSeconds) * 100
      : 100 / props.plan.steps.length,
  ),
)
</script>

<template>
  <div class="space-y-4">
    <LevelPlannerSummary
      :plan="plan"
      :from-level="fromLevel"
      :to-level="toLevel"
      :creature-name="creatureName"
      :creature-image="creatureImage"
      :creature="creature"
      :has-route-overrides="hasRouteOverrides"
      @reset-all-overrides="emit('resetAllOverrides')"
    />

    <div>
      <LevelPlannerTimelineStep
        v-for="(step, index) in plan.steps"
        :key="index"
        :step="step"
        :index="index"
        :creature-name="creatureName"
        :is-first="index === 0"
        :is-last="index === plan.steps.length - 1"
        :expanded="expandedIndex === index"
        :time-percent="timePercents[index]"
        :has-override="overriddenFromLevels?.has(step.fromLevel)"
        @toggle="toggleExpand(index)"
        @select-alternative="(...args) => emit('selectAlternative', ...args)"
        @reset-override="(...args) => emit('resetOverride', ...args)"
      />
    </div>
  </div>
</template>
