<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import type { PlannerSkillGateSummary } from '@/types'

const { t } = useI18n()


// #2 skill-gate surfacing: a one-line roll-up shown when the plan needs resources the
// player can't yet acquire. Links to the Skills tab on the Crafting planner page.
const props = defineProps<{
  summary: PlannerSkillGateSummary | null
}>()


const target = computed(() =>
  props.summary
    ? {
        name: 'planner',
        query: {
          tab: 'skills',
          skill: props.summary.highest.skill.toLowerCase(),
          target: String(props.summary.highest.level),
        },
      }
    : null,
)
</script>

<template>
  <RouterLink
    v-if="summary && target"
    :to="target"
    class="group flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs font-medium text-warning-strong transition hover:bg-warning/10 dark:text-warning-strong"
  >
    <Lock class="size-3.5 shrink-0" />
    <i18n-t keypath="planner.skillGate.message" tag="span" class="min-w-0" :plural="summary.count">
      <template #count>{{ summary.count }}</template>
      <template #gate>
        <span class="font-semibold">{{ summary.highest.skill }} L{{ summary.highest.level }}</span>
      </template>
    </i18n-t>
    <span class="ml-auto shrink-0 font-semibold underline-offset-2 group-hover:underline">{{
      t('planner.skillGate.plan')
    }}</span>
  </RouterLink>
</template>
