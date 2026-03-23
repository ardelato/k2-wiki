<script setup lang="ts">
import { Zap, Users, User } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LevelPlannerCreaturePicker from '@/components/level-planner/LevelPlannerCreaturePicker.vue'
import LevelPlannerResults from '@/components/level-planner/LevelPlannerResults.vue'
import PartyPlannerResults from '@/components/level-planner/PartyPlannerResults.vue'
import PlannerBadge from '@/components/planner/PlannerBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerToolbar from '@/components/planner/PlannerToolbar.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useLevelPlanner } from '@/composables/useLevelPlanner'
import { usePartyPlanner } from '@/composables/usePartyPlanner'
import { maxLevelForState } from '@/utils/formulas'

const route = useRoute()
const router = useRouter()
const { creatures } = useCreatures()
const { isAwakened } = useCreatureCollection()


// Mode: single or party
const mode = ref<'single' | 'party'>(route.query.mode === 'party' ? 'party' : 'single')


// Single mode state
const creatureId = ref(typeof route.query.creature === 'string' ? route.query.creature : '')
const targetLevel = ref(Number(route.query.target) > 1 ? Number(route.query.target) : 120)


const singleCreatureMax = computed(() =>
  creatureId.value ? maxLevelForState(isAwakened(creatureId.value)) : 120,
)


const singleTargetPresets = [70, 120]


const { creature, startLevel, plan, needsAwaken, totalXpNeeded, isMaxLevel } = useLevelPlanner(
  creatureId,
  targetLevel,
)


// Party mode state — auto-computed from owned creatures
const partyTargetLevel = ref(
  Number(route.query.partyTarget) > 1 ? Number(route.query.partyTarget) : 120,
)


const {
  plan: partyPlan,
  levelers,
  boosters,
  hasLevelers,
  isComputing: partyComputing,
} = usePartyPlanner(partyTargetLevel)


// Creature lookup map for party results
const creatureMap = computed(() => {
  const map = new Map<string, (typeof creatures.value)[0]>()
  for (const c of creatures.value) map.set(c.id, c)
  return map
})


// URL sync
watch([mode, creatureId, targetLevel, partyTargetLevel], ([m, cId, tl, ptl]) => {
  const query: Record<string, string> = { tab: 'levelup', mode: m }
  if (m === 'single') {
    if (cId) query.creature = cId
    if (tl !== 120) query.target = String(tl)
  } else {
    if (ptl !== 120) query.partyTarget = String(ptl)
  }
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


function clampLevel(val: string, max: number): number {
  const n = Number(val)
  if (!Number.isFinite(n) || n < 2) return 2
  return Math.min(max, Math.round(n))
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Level Up
      </p>
      <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {{
          mode === 'single' && creature
            ? `${creature.name} Leveling`
            : mode === 'party'
              ? 'Party Level Up'
              : 'Level Up Planner'
        }}
      </h1>
      <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {{
          mode === 'party'
            ? 'Optimal expedition plan to level your entire collection simultaneously.'
            : 'Optimal expedition path to level your creature as fast as possible.'
        }}
      </p>
    </div>

    <!-- Mode toggle -->
    <div class="flex items-center gap-3">
      <div
        class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
      >
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            mode === 'single'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="mode = 'single'"
        >
          <User class="size-3.5" />
          Single
        </button>
        <div class="w-px self-stretch bg-border/40" />
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            mode === 'party'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="mode = 'party'"
        >
          <Users class="size-3.5" />
          Party
        </button>
      </div>
    </div>

    <!-- ===== SINGLE MODE ===== -->
    <template v-if="mode === 'single'">
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
                v-for="preset in singleTargetPresets"
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
              :max="singleCreatureMax"
              inputmode="numeric"
              :value="targetLevel"
              class="focus-ring h-8 w-16 rounded-lg border border-border/70 bg-background/70 px-2 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              @blur="
                targetLevel = clampLevel(
                  ($event.target as HTMLInputElement).value,
                  singleCreatureMax,
                )
              "
              @change="
                targetLevel = clampLevel(
                  ($event.target as HTMLInputElement).value,
                  singleCreatureMax,
                )
              "
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
          needsAwaken
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
    </template>

    <!-- ===== PARTY MODE ===== -->
    <template v-if="mode === 'party'">
      <PlannerToolbar picker-label="Target Level">
        <template #picker>
          <div class="flex items-center gap-2">
            <div
              class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
            >
              <button
                v-for="preset in [70, 120]"
                :key="preset"
                class="focus-ring h-8 px-3 text-sm font-semibold transition"
                :class="
                  partyTargetLevel === preset
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                "
                @click="partyTargetLevel = preset"
              >
                {{ preset }}
              </button>
            </div>
            <input
              type="number"
              min="2"
              max="120"
              inputmode="numeric"
              :value="partyTargetLevel"
              class="focus-ring h-8 w-16 rounded-lg border border-border/70 bg-background/70 px-2 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              @blur="partyTargetLevel = clampLevel(($event.target as HTMLInputElement).value, 120)"
              @change="
                partyTargetLevel = clampLevel(($event.target as HTMLInputElement).value, 120)
              "
            />
          </div>
        </template>

        <template v-if="hasLevelers" #summary>
          <PlannerBadge color="var(--color-primary)">
            <Users class="size-3.5" />
            {{ levelers.length }} to level
          </PlannerBadge>
          <PlannerBadge v-if="boosters.length > 0">
            {{ boosters.length }} booster{{ boosters.length > 1 ? 's' : '' }}
          </PlannerBadge>
        </template>
      </PlannerToolbar>

      <!-- Computing -->
      <PlannerEmptyState
        v-if="partyComputing"
        title="Computing optimal plan..."
        subtitle="Simulating parallel expedition routes for your collection."
      />

      <!-- No owned creatures to level -->
      <PlannerEmptyState
        v-else-if="!hasLevelers"
        title="No creatures to level."
        subtitle="Add creatures to your collection and set their levels in the Beastiary to use party mode."
      />

      <!-- Party plan results -->
      <PartyPlannerResults
        v-else-if="partyPlan && partyPlan.steps.length > 0"
        :plan="partyPlan"
        :creatures="creatureMap"
      />
    </template>
  </div>
</template>
