<script setup lang="ts">
import { Coins, Target } from 'lucide-vue-next'
import { onMounted, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AwakenRushPlanner from '@/components/level-planner/AwakenRushPlanner.vue'
import PrestigeLoopPlanner from '@/components/level-planner/PrestigeLoopPlanner.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import { recoverTourDemo } from '@/composables/plannerTourDemo'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditionTierSelections } from '@/composables/useExpeditionTierSelections'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, PlannerStrategy } from '@/types'
import { expeditions as allExpeditions } from '@/utils/save/precomputedTables'

// Heal an interrupted tour's demo localStorage before any persisted planner state is read,
// on every LevelPlanner mount regardless of objective (matches the pre-split behavior).
recoverTourDemo()


const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { creatures } = useCreatures()
const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
const { excludedCreatureIds } = useGameConfig()
const {
  expeditionTierOverrides,
  includeAllExpeditions,
  defaultExpeditionTierSelections,
  effectiveExpeditionTierSelections,
} = useExpeditionTierSelections()


// Objective: the top-level choice (sub-project #9). Awaken-rush uses the existing
// single/party leveling planner; Prestige-loop is its own steady-state planner.
type PlannerObjective = 'awaken-rush' | 'prestige-loop'
const PLANNER_OBJECTIVES: PlannerObjective[] = ['awaken-rush', 'prestige-loop']
const AWAKEN_TARGET = 70


// When embedded in the Creature planner shell, the parent's tab drives the objective
// (Awaken / Prestige) and the in-view objective selector is hidden.
const props = defineProps<{
  forcedObjective?: 'awaken-rush' | 'prestige-loop'
}>()


const objective = ref<PlannerObjective>(
  props.forcedObjective ??
    (PLANNER_OBJECTIVES.includes(route.query.objective as PlannerObjective)
      ? (route.query.objective as PlannerObjective)
      : 'awaken-rush'),
)


watch(
  () => props.forcedObjective,
  (forced) => {
    if (forced) objective.value = forced
  },
)


// Mode: single or party
const mode = ref<'single' | 'party'>(route.query.mode === 'party' ? 'party' : 'single')


// Single mode state
const creatureId = ref(typeof route.query.creature === 'string' ? route.query.creature : '')
const targetLevel = ref(Number(route.query.target) > 1 ? Number(route.query.target) : 120)


// Party mode state — auto-computed from owned creatures
const partyTargetLevel = ref(
  Number(route.query.partyTarget) > 1 ? Number(route.query.partyTarget) : 120,
)


const partyStrategy = ref<PlannerStrategy>(
  route.query.strategy === 'hands-free' ? 'hands-free' : 'optimal',
)


// Creature override state (session-only, not persisted), shared by Custom party + Prestige.
const plannerExcluded = ref(new Set<string>())
const plannerIncluded = ref(new Set<string>())
const creatureOverrides = { plannerExcluded, plannerIncluded }


const overrideableCreatures = computed(() =>
  creatures.value
    .filter((c) => ownedCreatureIds.value.has(c.id))
    .toSorted((a, b) => a.name.localeCompare(b.name)),
)


function toggleCreatureOverride(id: string, basis: Set<string> = excludedCreatureIds.value) {
  const isGloballyExcluded = basis.has(id)


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


function toggleTierOverride(
  ids: string[],
  include: boolean,
  basis: Set<string> = excludedCreatureIds.value,
) {
  const nextExcluded = new Set(plannerExcluded.value)
  const nextIncluded = new Set(plannerIncluded.value)
  for (const id of ids) {
    const isGloballyExcluded = basis.has(id)
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


// Awaken-rush pins both planners to level 70 (the awakening milestone).
watch(
  objective,
  (o) => {
    if (o === 'awaken-rush') {
      targetLevel.value = AWAKEN_TARGET
      partyTargetLevel.value = AWAKEN_TARGET
    } else {
      // Custom/Prestige own their roster via the manual filter — clear any
      // queue-derived overrides left behind by the Awaken tab.
      resetCreatureOverrides()
    }
  },
  { immediate: true },
)


const awakenExpeditionIncludedCount = computed(
  () =>
    allExpeditions.filter(
      (e) => (effectiveExpeditionTierSelections.value[e.id] ?? [1, 2, 3, 4, 5]).length > 0,
    ).length,
)


// Prestige-loop state — the only objective-specific scalar the URL serializes here.
const prestigeCadenceHours = ref(Number(route.query.cadence) > 0 ? Number(route.query.cadence) : 12)


// Creature lookup map for party / prestige results
const creatureMap = computed(() => {
  const map = new Map<string, Creature>()
  for (const c of creatures.value) map.set(c.id, c)
  return map
})


// The live awaken queue length + first creature name, bubbled up from the Awaken child
// for the heading.
const awakenQueueLength = ref(0)
const awakenQueueFirstName = ref('')
function onAwakenQueue(payload: { length: number; firstName: string }) {
  awakenQueueLength.value = payload.length
  awakenQueueFirstName.value = payload.firstName
}


// URL sync
watch(
  [mode, creatureId, partyStrategy, objective, prestigeCadenceHours],
  ([m, cId, ps, obj, cad]) => {
    // Embedded in the Creature shell: keep the parent's creature tab, don't write
    // tab=levelup/objective (the shell owns the page + tab). Standalone: full sync.
    const embeddedTab = obj === 'prestige-loop' ? 'prestige' : 'awaken'
    const query: Record<string, string> = props.forcedObjective
      ? { tab: (route.query.tab as string) || embeddedTab }
      : { tab: 'levelup', objective: obj as string }
    if (obj === 'prestige-loop') {
      if (cad !== 12) query.cadence = String(cad)
    } else {
      query.mode = m as string
      // Awaken-rush is pinned to 70.
      if (m === 'single') {
        if (cId) query.creature = cId as string
      } else {
        if (ps !== 'optimal') query.strategy = ps as string
      }
    }
    router.replace({ path: route.path, query })
  },
)


// Strip query params left behind by removed features (rotation strategy, hybrid allocator) so a
// stale bookmark doesn't keep carrying them. One-shot on mount; preserves all other params.
onMounted(() => {
  if (!('pstrategy' in route.query) && !('palloc' in route.query)) return
  const query = { ...route.query }
  delete query.pstrategy
  delete query.palloc
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


const OBJECTIVE_META = computed<Record<PlannerObjective, { label: string; icon: typeof Target }>>(
  () => ({
    'awaken-rush': { label: t('levelPlanner.objective.awakenRush'), icon: Target },
    'prestige-loop': { label: t('levelPlanner.objective.prestigeLoop'), icon: Coins },
  }),
)


const headingTitle = computed(() => {
  if (objective.value === 'awaken-rush') {
    const n = awakenQueueLength.value
    if (n === 0) return t('levelPlanner.heading.awakenRush')
    if (n === 1)
      return t('levelPlanner.heading.awakenOne', {
        name: awakenQueueFirstName.value,
      }).trim()
    return t('levelPlanner.heading.awakenMany', { n })
  }
  return t('levelPlanner.heading.prestigeLoop')
})


const headingSubtitle = computed(() => {
  if (objective.value === 'awaken-rush') {
    return t('levelPlanner.heading.subtitleAwaken')
  }
  if (objective.value === 'prestige-loop') {
    return t('levelPlanner.heading.subtitlePrestige')
  }
  if (mode.value === 'party') {
    return partyStrategy.value === 'hands-free'
      ? t('levelPlanner.heading.subtitlePartyHandsFree')
      : t('levelPlanner.heading.subtitlePartyOptimal')
  }
  return t('levelPlanner.heading.subtitleSingle')
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="space-y-2">
        <SectionEyebrow>{{
          objective === 'awaken-rush' ? 'Awaken' : t('levelPlanner.eyebrow.levelUp')
        }}</SectionEyebrow>
        <h1 class="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          {{ headingTitle }}
        </h1>
        <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {{ headingSubtitle }}
        </p>
      </div>
    </div>

    <!-- Objective selector (hidden when the Creature shell drives the objective) -->
    <div v-if="!forcedObjective" class="flex items-center gap-3">
      <div
        class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
      >
        <template v-for="(obj, i) in PLANNER_OBJECTIVES" :key="obj">
          <div v-if="i > 0" class="w-px self-stretch bg-border/40" />
          <button
            class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
            :class="
              objective === obj
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            @click="objective = obj"
          >
            <component :is="OBJECTIVE_META[obj].icon" class="size-3.5" />
            {{ OBJECTIVE_META[obj].label }}
          </button>
        </template>
      </div>
    </div>

    <!-- ===== AWAKEN-RUSH (queue-driven) ===== -->
    <AwakenRushPlanner
      v-if="objective === 'awaken-rush'"
      v-model:creature-id="creatureId"
      :register-for-objective="objective === 'awaken-rush'"
      :creatures="creatures"
      :creature-map="creatureMap"
      :owned-creature-ids="ownedCreatureIds"
      :excluded-creature-ids="excludedCreatureIds"
      :get-level="getLevel"
      :is-awakened="isAwakened"
      :effective-expedition-tier-selections="effectiveExpeditionTierSelections"
      :expedition-tier-overrides="expeditionTierOverrides"
      :include-all-expeditions="includeAllExpeditions"
      :expedition-included-count="awakenExpeditionIncludedCount"
      :toggle-expedition-tier="toggleExpeditionTier"
      :remove-expedition-override="removeExpeditionOverride"
      :reset-expedition-overrides="resetExpeditionOverrides"
      @update:include-all-expeditions="includeAllExpeditions = $event"
      @update:queue="onAwakenQueue"
    />

    <!-- ===== PRESTIGE-LOOP MODE ===== -->
    <PrestigeLoopPlanner
      v-if="objective === 'prestige-loop'"
      v-model:cadence-hours="prestigeCadenceHours"
      :creature-map="creatureMap"
      :overrideable-creatures="overrideableCreatures"
      :excluded-creature-ids="excludedCreatureIds"
      :get-level="getLevel"
      :is-awakened="isAwakened"
      :creature-overrides="creatureOverrides"
      :effective-expedition-tier-selections="effectiveExpeditionTierSelections"
      :expedition-tier-overrides="expeditionTierOverrides"
      :include-all-expeditions="includeAllExpeditions"
      :expedition-included-count="awakenExpeditionIncludedCount"
      :toggle-creature-override="toggleCreatureOverride"
      :toggle-tier-override="toggleTierOverride"
      :reset-creature-overrides="resetCreatureOverrides"
      :toggle-expedition-tier="toggleExpeditionTier"
      :remove-expedition-override="removeExpeditionOverride"
      :reset-expedition-overrides="resetExpeditionOverrides"
      @update:include-all-expeditions="includeAllExpeditions = $event"
      @go-to-awaken="objective = 'awaken-rush'"
    />
  </div>
</template>
