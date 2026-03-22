<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LevelPlannerCreaturePicker from '@/components/level-planner/LevelPlannerCreaturePicker.vue'
import LevelPlannerResults from '@/components/level-planner/LevelPlannerResults.vue'
import PlannerBadge from '@/components/planner/PlannerBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerToolbar from '@/components/planner/PlannerToolbar.vue'
import { useLevelPlanner } from '@/composables/useLevelPlanner'

const route = useRoute()
const router = useRouter()


const creatureId = ref(typeof route.query.creature === 'string' ? route.query.creature : '')
const targetLevel = ref(
  Number(route.query.target) > 1 ? Math.min(120, Number(route.query.target)) : 120,
)


const { creature, startLevel, plan, totalXpNeeded, isMaxLevel, awakened } = useLevelPlanner(
  creatureId,
  targetLevel,
)


watch([creatureId, targetLevel], ([cId, tl]) => {
  const query: Record<string, string> = { tab: 'levelup' }
  if (cId) query.creature = cId
  if (tl !== 120) query.target = String(tl)
  router.replace({ path: route.path, query })
})


watch(
  () => route.query.creature,
  (val) => {
    if (typeof val === 'string' && val !== creatureId.value) {
      creatureId.value = val
    }
  },
)


function clampLevel(val: string): number {
  const n = Number(val)
  if (!Number.isFinite(n) || n < 2) return 2
  return Math.min(120, Math.round(n))
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Level Up
      </p>
      <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {{ creature ? `${creature.name} Leveling` : 'Level Up Planner' }}
      </h1>
      <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Optimal expedition path to level your creature as fast as possible.
      </p>
    </div>

    <PlannerToolbar picker-label="Creature">
      <template #picker>
        <LevelPlannerCreaturePicker v-model="creatureId" />
      </template>

      <template #controls>
        <div class="flex items-center gap-2">
          <label class="text-xs font-semibold text-muted-foreground">Target</label>
          <div
            class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
          >
            <button
              v-for="preset in [70, 120]"
              :key="preset"
              class="focus-ring h-8 px-3 text-sm font-semibold transition"
              :class="
                targetLevel === preset
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="targetLevel = preset"
            >
              {{ preset }}
            </button>
          </div>
          <input
            type="number"
            min="2"
            max="120"
            inputmode="numeric"
            :value="targetLevel"
            class="focus-ring h-8 w-16 rounded-lg border border-border/70 bg-background/70 px-2 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            @blur="targetLevel = clampLevel(($event.target as HTMLInputElement).value)"
            @change="targetLevel = clampLevel(($event.target as HTMLInputElement).value)"
          />
        </div>
      </template>

      <template v-if="creature && !isMaxLevel && totalXpNeeded > 0" #summary>
        <PlannerBadge color="var(--color-primary)">
          <Zap class="size-3.5" />
          {{ totalXpNeeded.toLocaleString() }} XP needed
        </PlannerBadge>
        <PlannerBadge> LVL {{ startLevel }} </PlannerBadge>
      </template>
    </PlannerToolbar>

    <!-- No creature selected -->
    <PlannerEmptyState
      v-if="!creature && !creatureId"
      title="Choose a creature to begin planning."
      subtitle="Select a creature above to find the fastest expedition leveling path."
    />

    <!-- Already max level -->
    <PlannerEmptyState
      v-else-if="isMaxLevel"
      title="Already at max level!"
      :subtitle="
        !awakened && startLevel >= 70
          ? `${creature?.name} is at level 70 — awaken to continue leveling to 120.`
          : `${creature?.name} is already at level ${startLevel} — nothing left to grind.`
      "
    />

    <!-- Plan -->
    <LevelPlannerResults
      v-else-if="plan && plan.steps.length > 0"
      :plan="plan"
      :creature-name="creature?.name ?? ''"
    />
  </div>
</template>
