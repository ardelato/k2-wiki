<script setup lang="ts">
import { ref, computed } from 'vue'

import type { LevelingPlan } from '@/utils/levelPlanner'

import LevelPlannerSummary from './LevelPlannerSummary.vue'
import LevelPlannerTimelineStep from './LevelPlannerTimelineStep.vue'

const props = defineProps<{
  plan: LevelingPlan
  creatureName: string
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
    <LevelPlannerSummary :plan="plan" :from-level="fromLevel" :to-level="toLevel" />

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
        @toggle="toggleExpand(index)"
      />
    </div>
  </div>
</template>
