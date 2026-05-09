<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { Clock3, Play, RefreshCw, Users, User, Zap } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LevelPlannerCalculatePrompt from '@/components/level-planner/LevelPlannerCalculatePrompt.vue'
import LevelPlannerResults from '@/components/level-planner/LevelPlannerResults.vue'
import PartyCreatureFilter from '@/components/level-planner/PartyCreatureFilter.vue'
import PartyExpeditionFilter from '@/components/level-planner/PartyExpeditionFilter.vue'
import PartyPlannerResults from '@/components/level-planner/PartyPlannerResults.vue'
import PlannerLoadingProgress from '@/components/level-planner/PlannerLoadingProgress.vue'
import PlannerBadge from '@/components/planner/PlannerBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerToolbar from '@/components/planner/PlannerToolbar.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditionTierSelections } from '@/composables/useExpeditionTierSelections'
import { useGameConfig } from '@/composables/useGameConfig'
import { useLevelPlanner } from '@/composables/useLevelPlanner'
import { usePartyPlanner } from '@/composables/usePartyPlanner'
import type { PlannerStrategy, PlannerTimeBudget } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { maxLevelForState } from '@/utils/formulas'
import { toolIcons } from '@/utils/icons'
import { expeditions as allExpeditions } from '@/utils/precomputedTables'

const route = useRoute()
const router = useRouter()
const { creatures } = useCreatures()
const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
const { excludedCreatureIds, expeditionToolXpBonus } = useGameConfig()
const {
  expeditionTierOverrides,
  includeAllExpeditions,
  defaultExpeditionTierSelections,
  effectiveExpeditionTierSelections,
} = useExpeditionTierSelections()


// Mode: single or party
const mode = ref<'single' | 'party'>(route.query.mode === 'party' ? 'party' : 'single')


// Single mode state
const creatureId = ref(typeof route.query.creature === 'string' ? route.query.creature : '')
const targetLevel = ref(Number(route.query.target) > 1 ? Number(route.query.target) : 120)


const singleCreatureMax = computed(() =>
  creatureId.value ? maxLevelForState(isAwakened(creatureId.value)) : 120,
)


const singleTargetPresets = [70, 120]


const {
  creature,
  startLevel,
  plan,
  needsAwaken,
  totalXpNeeded,
  isMaxLevel,
  selectAlternative,
  resetOverride,
  resetAllOverrides: resetRouteOverrides,
  hasOverrides: hasRouteOverrides,
  overriddenFromLevels,
  hasCalculated: singleHasCalculated,
  calculate: singleCalculate,
} = useLevelPlanner(creatureId, targetLevel, effectiveExpeditionTierSelections)


// Party mode state — auto-computed from owned creatures
const partyTargetLevel = ref(
  Number(route.query.partyTarget) > 1 ? Number(route.query.partyTarget) : 120,
)


const partyStrategy = ref<PlannerStrategy>(
  route.query.strategy === 'hands-free' ? 'hands-free' : 'optimal',
)


const otherStrategy = computed<PlannerStrategy>(() =>
  partyStrategy.value === 'optimal' ? 'hands-free' : 'optimal',
)


const partyTimeBudget = ref<PlannerTimeBudget>('quick')


// Creature override state (session-only, not persisted)
const plannerExcluded = ref(new Set<string>())
const plannerIncluded = ref(new Set<string>())
const creatureOverrides = { plannerExcluded, plannerIncluded }


const hasOverrides = computed(
  () => plannerExcluded.value.size > 0 || plannerIncluded.value.size > 0,
)


const overrideableCreatures = computed(() =>
  creatures.value
    .filter((c) => ownedCreatureIds.value.has(c.id))
    .toSorted((a, b) => a.name.localeCompare(b.name)),
)


function toggleCreatureOverride(id: string) {
  const isGloballyExcluded = excludedCreatureIds.value.has(id)


  if (isGloballyExcluded) {
    // Toggle force-include for globally-excluded creatures
    const next = new Set(plannerIncluded.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    plannerIncluded.value = next
  } else {
    // Toggle planner-exclude for normally-available creatures
    const next = new Set(plannerExcluded.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    plannerExcluded.value = next
  }
}


function toggleTierOverride(ids: string[], include: boolean) {
  const nextExcluded = new Set(plannerExcluded.value)
  const nextIncluded = new Set(plannerIncluded.value)
  for (const id of ids) {
    const isGloballyExcluded = excludedCreatureIds.value.has(id)
    if (include) {
      // Include: remove from planner excluded, add to planner included if globally excluded
      nextExcluded.delete(id)
      if (isGloballyExcluded) nextIncluded.add(id)
    } else {
      // Exclude: add to planner excluded if not globally excluded, remove from planner included
      nextIncluded.delete(id)
      if (!isGloballyExcluded) nextExcluded.add(id)
    }
  }
  plannerExcluded.value = nextExcluded
  plannerIncluded.value = nextIncluded
}


function resetCreatureOverrides() {
  plannerExcluded.value = new Set()
  plannerIncluded.value = new Set()
}


// Expedition filter handlers
function toggleExpeditionTier(expeditionId: string, tier: number) {
  if (includeAllExpeditions.value) includeAllExpeditions.value = false
  const defaults = defaultExpeditionTierSelections.value[expeditionId] ?? []
  const current = expeditionTierOverrides.value[expeditionId]
  // Start from override if present, otherwise from effective selections
  const selected = current
    ? [...current]
    : [...(effectiveExpeditionTierSelections.value[expeditionId] ?? [1, 2, 3, 4, 5])]


  const idx = selected.indexOf(tier)
  if (idx >= 0) {
    selected.splice(idx, 1)
  } else {
    selected.push(tier)
    selected.sort((a, b) => a - b)
  }


  // If result matches default, remove override
  const defaultsSorted = [...defaults].toSorted((a, b) => a - b)
  if (
    selected.length === defaultsSorted.length &&
    selected.every((v, i) => v === defaultsSorted[i])
  ) {
    removeExpeditionOverride(expeditionId)
    return
  }


  expeditionTierOverrides.value = {
    ...expeditionTierOverrides.value,
    [expeditionId]: selected,
  }
}


function removeExpeditionOverride(expeditionId: string) {
  const updated = { ...expeditionTierOverrides.value }
  delete updated[expeditionId]
  expeditionTierOverrides.value = updated
}


function resetExpeditionOverrides() {
  expeditionTierOverrides.value = {}
  includeAllExpeditions.value = false
}


const {
  plan: partyPlan,
  levelers,
  hasLevelers,
  isComputing: partyComputing,
  progress: partyProgress,
  calculate: partyCalculate,
  recalculate: partyRecalculate,
} = usePartyPlanner(partyTargetLevel, partyStrategy, partyTimeBudget, creatureOverrides)


const {
  plan: otherPartyPlan,
  isComputing: otherPartyComputing,
  calculate: otherPartyCalculate,
  recalculate: otherPartyRecalculate,
} = usePartyPlanner(partyTargetLevel, otherStrategy, partyTimeBudget, creatureOverrides)


const hasAnyPlan = computed(
  () =>
    (partyPlan.value && partyPlan.value.steps.length > 0) ||
    (otherPartyPlan.value && otherPartyPlan.value.steps.length > 0),
)


const anyComputing = computed(() => partyComputing.value || otherPartyComputing.value)


function calculateBoth() {
  partyCalculate()
  otherPartyCalculate()
}


function recalculateBoth() {
  partyRecalculate()
  otherPartyRecalculate()
}


// Creature lookup map for party results
const creatureMap = computed(() => {
  const map = new Map<string, (typeof creatures.value)[0]>()
  for (const c of creatures.value) map.set(c.id, c)
  return map
})


// URL sync
watch([mode, creatureId, targetLevel, partyTargetLevel, partyStrategy], ([m, cId, tl, ptl, ps]) => {
  const query: Record<string, string> = { tab: 'levelup', mode: m }
  if (m === 'single') {
    if (cId) query.creature = cId
    if (tl !== 120) query.target = String(tl)
  } else {
    if (ptl !== 120) query.partyTarget = String(ptl)
    if (ps !== 'optimal') query.strategy = ps
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


const now = useNow({ interval: 100 })


const partyElapsedMs = computed(() => {
  if (!partyProgress.value) return 0
  return Math.max(0, +now.value - partyProgress.value.startedAtMs)
})


const partySearchRatio = computed(() => {
  if (!partyProgress.value || partyProgress.value.maxIterations <= 0) return 0
  const iterationRatio = partyProgress.value.iteration / partyProgress.value.maxIterations
  const raw = iterationRatio
  // Cap at 95% while still computing — the bar completes when the result arrives and progress clears
  return Math.max(0, Math.min(0.95, raw))
})


const partyProgressSubtitle = computed(() => {
  if (!partyProgress.value) return 'Exploring route combinations...'
  switch (partyProgress.value.phase) {
    case 'initializing':
      return 'Setting up...'
    case 'candidates':
      return 'Evaluating expedition options...'
    case 'waves':
      return 'Building expedition waves...'
    case 'beam':
      return 'Narrowing down the best routes...'
    case 'finalizing':
      return 'Wrapping up...'
    default:
      return 'Exploring route combinations...'
  }
})


const partyProgressPercent = computed(() => Math.round(partySearchRatio.value * 100))


const partyBestCompleteTime = computed(() => partyProgress.value?.bestCompleteTimeSeconds ?? null)
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
            ? partyStrategy === 'hands-free'
              ? 'Stable expedition assignments that run for hours without needing swaps.'
              : 'Optimal expedition plan to level your entire collection simultaneously.'
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
      <PartyCreatureFilter
        :creatures="overrideableCreatures"
        :get-level="getLevel"
        :is-awakened="isAwakened"
        :select-mode="true"
        :selected-id="creatureId"
        @select="creatureId = $event"
      />

      <PlannerToolbar>
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
          <PlannerBadge v-if="expeditionToolXpBonus > 1" color="rgb(217, 119, 6)">
            <img :src="toolIcons.sword" alt="" class="size-3.5" loading="lazy" />
            +{{ Math.round((expeditionToolXpBonus - 1) * 100) }}% Sword
          </PlannerBadge>
          <button
            v-if="plan && plan.steps.length > 0"
            class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            @click="singleCalculate"
          >
            <RefreshCw class="size-3.5" />
            Recalculate
          </button>
        </template>
      </PlannerToolbar>

      <PartyExpeditionFilter
        :expeditions="allExpeditions"
        :effective-tier-selections="effectiveExpeditionTierSelections"
        :overrides="expeditionTierOverrides"
        :include-all="includeAllExpeditions"
        @toggle-tier="toggleExpeditionTier"
        @remove-override="removeExpeditionOverride"
        @reset="resetExpeditionOverrides"
        @update:include-all="includeAllExpeditions = $event"
      />

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

      <!-- Ready to calculate (no plan yet) -->
      <LevelPlannerCalculatePrompt
        v-else-if="creature && (!singleHasCalculated || !plan)"
        :creature-name="creature.name"
        :creature-image="getCreatureImage(creature)"
        :creature="creature"
        :from-level="startLevel"
        :to-level="targetLevel"
        @calculate="singleCalculate"
      />

      <!-- Plan -->
      <LevelPlannerResults
        v-else-if="plan && plan.steps.length > 0"
        :plan="plan"
        :creature-name="creature?.name ?? ''"
        :creature-image="creature ? getCreatureImage(creature) : undefined"
        :creature="creature"
        :overridden-from-levels="overriddenFromLevels"
        :has-route-overrides="hasRouteOverrides"
        @select-alternative="selectAlternative"
        @reset-override="resetOverride"
        @reset-all-overrides="resetRouteOverrides()"
      />
    </template>

    <!-- ===== PARTY MODE ===== -->
    <template v-if="mode === 'party'">
      <!-- Creature filter overrides -->
      <PartyCreatureFilter
        :creatures="overrideableCreatures"
        :global-excluded-ids="excludedCreatureIds"
        :planner-excluded="plannerExcluded"
        :planner-included="plannerIncluded"
        :get-level="getLevel"
        :is-awakened="isAwakened"
        :has-overrides="hasOverrides"
        @toggle="toggleCreatureOverride"
        @toggle-tier="toggleTierOverride"
        @reset="resetCreatureOverrides"
      />

      <PartyExpeditionFilter
        :expeditions="allExpeditions"
        :effective-tier-selections="effectiveExpeditionTierSelections"
        :overrides="expeditionTierOverrides"
        :include-all="includeAllExpeditions"
        @toggle-tier="toggleExpeditionTier"
        @remove-override="removeExpeditionOverride"
        @reset="resetExpeditionOverrides"
        @update:include-all="includeAllExpeditions = $event"
      />

      <section class="surface-card relative z-20">
        <div class="flex min-h-[56px] flex-wrap items-center gap-4 px-4 py-3">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div class="flex items-center gap-2">
              <label
                class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                >Target</label
              >
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
                @blur="
                  partyTargetLevel = clampLevel(($event.target as HTMLInputElement).value, 120)
                "
                @change="
                  partyTargetLevel = clampLevel(($event.target as HTMLInputElement).value, 120)
                "
              />
            </div>

            <div class="flex items-center gap-2">
              <label
                class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                >Budget</label
              >
              <div
                class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
              >
                <button
                  v-for="opt in ['quick', 'thorough'] as const"
                  :key="opt"
                  class="focus-ring h-8 px-3 text-sm font-semibold capitalize transition"
                  :class="
                    partyTimeBudget === opt
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                  "
                  @click="partyTimeBudget = opt"
                >
                  {{ opt }}
                </button>
              </div>
              <span class="text-[10px] text-muted-foreground/60">Mainly affects optimal</span>
            </div>

            <button
              v-if="hasAnyPlan"
              class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              :disabled="anyComputing"
              :class="{ 'cursor-not-allowed opacity-50': anyComputing }"
              @click="recalculateBoth"
            >
              <RefreshCw class="size-3.5" :class="{ 'animate-spin': anyComputing }" />
              Recalculate
            </button>
          </div>

          <div v-if="hasLevelers" class="ml-auto flex items-center gap-4">
            <PlannerBadge color="var(--color-primary)">
              <Users class="size-3.5" />
              {{ levelers.length }} to level
            </PlannerBadge>
            <PlannerBadge v-if="hasOverrides" color="var(--color-primary)"> Filtered </PlannerBadge>
            <PlannerBadge v-if="expeditionToolXpBonus > 1" color="rgb(217, 119, 6)">
              <img :src="toolIcons.sword" alt="" class="size-3.5" loading="lazy" />
              +{{ Math.round((expeditionToolXpBonus - 1) * 100) }}% Sword
            </PlannerBadge>
          </div>
        </div>

        <div v-if="hasAnyPlan" class="flex items-center gap-2 border-t border-border/40 px-4 py-3">
          <label class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
            >Strategy</label
          >
          <div
            class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
          >
            <button
              class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
              :class="
                partyStrategy === 'optimal'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="partyStrategy = 'optimal'"
            >
              <Zap class="size-3.5" />
              Optimal
            </button>
            <div class="w-px self-stretch bg-border/40" />
            <button
              class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
              :class="
                partyStrategy === 'hands-free'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="partyStrategy = 'hands-free'"
            >
              <Clock3 class="size-3.5" />
              Hands-Free
            </button>
          </div>
        </div>
      </section>

      <!-- Computing -->
      <PlannerLoadingProgress
        v-if="anyComputing && !hasAnyPlan"
        :subtitle="partyProgressSubtitle"
        :progress-percent="partyProgressPercent"
        :elapsed-ms="partyElapsedMs"
        :explored-states="partyProgress?.exploredStates ?? 0"
        :best-complete-time="partyBestCompleteTime"
      />

      <!-- No owned creatures to level -->
      <PlannerEmptyState
        v-else-if="!hasLevelers"
        title="No creatures to level."
        subtitle="Add creatures to your collection and set their levels in the Beastiary to use party mode."
      />

      <!-- Ready to calculate (no plan yet) -->
      <PlannerEmptyState
        v-else-if="!hasAnyPlan && !anyComputing"
        title="Ready to plan."
        subtitle="Choose your target level and budget, then click Calculate to find the best expedition routes."
      >
        <template #action>
          <button
            class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            @click="calculateBoth"
          >
            <Play class="size-4" />
            Calculate
          </button>
        </template>
      </PlannerEmptyState>

      <!-- Party plan results -->
      <template v-else-if="hasAnyPlan">
        <PartyPlannerResults
          v-if="partyPlan && partyPlan.steps.length > 0"
          :plan="partyPlan"
          :creatures="creatureMap"
          :other-plan="otherPartyPlan"
          :strategy="partyStrategy"
          :other-computing="otherPartyComputing"
          :target-level="partyTargetLevel"
        />

        <PlannerLoadingProgress
          v-else-if="!partyPlan && anyComputing"
          :subtitle="partyProgressSubtitle"
          :progress-percent="partyProgressPercent"
          :elapsed-ms="partyElapsedMs"
          :explored-states="partyProgress?.exploredStates ?? 0"
          :best-complete-time="partyBestCompleteTime"
        />
      </template>
    </template>
  </div>
</template>
