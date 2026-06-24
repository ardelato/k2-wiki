<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import {
  ChevronDown,
  Clock3,
  Compass,
  Play,
  Plus,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Users,
  X,
  Zap,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import AwakenExpeditionPicker from '@/components/level-planner/AwakenExpeditionPicker.vue'
import AwakenPlanRail from '@/components/level-planner/AwakenPlanRail.vue'
import LevelPlannerCalculatePrompt from '@/components/level-planner/LevelPlannerCalculatePrompt.vue'
import LevelPlannerResults from '@/components/level-planner/LevelPlannerResults.vue'
import PartyPlannerResults from '@/components/level-planner/PartyPlannerResults.vue'
import PlannerLoadingProgress from '@/components/level-planner/PlannerLoadingProgress.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import SummonCreaturePicker from '@/components/summoning-planner/SummonCreaturePicker.vue'
import { recoverTourDemo } from '@/composables/plannerTourDemo'
import { useAwakenBoosterRoster } from '@/composables/useAwakenBoosterRoster'
import { useAwakenHandsFree } from '@/composables/useAwakenHandsFree'
import { useAwakenTourDemo } from '@/composables/useAwakenTourDemo'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useLevelPlanner } from '@/composables/useLevelPlanner'
import { usePartyPlanner } from '@/composables/usePartyPlanner'
import { isRunPartyStep } from '@/types'
import type { Creature, PartyLevelingPlan, PlannerStrategy, PlannerTimeBudget } from '@/types'
import { formatDuration, formatNumber } from '@/utils/format/format'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { expeditions as allExpeditions } from '@/utils/save/precomputedTables'

const AWAKEN_TARGET = 70


const props = defineProps<{
  /** Whether this view instance owns the awaken-rush objective at setup (tour registration gate). */
  registerForObjective: boolean
  // Shared collection / config (parent-owned, passed down)
  creatures: Creature[]
  creatureMap: Map<string, Creature>
  ownedCreatureIds: Set<string>
  excludedCreatureIds: Set<string>
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
  // Shared expedition scope (parent-owned)
  effectiveExpeditionTierSelections: Record<string, number[]>
  expeditionTierOverrides: Record<string, number[]>
  includeAllExpeditions: boolean
  expeditionIncludedCount: number
  toggleExpeditionTier: (expeditionId: string, tier: number) => void
  removeExpeditionOverride: (expeditionId: string) => void
  resetExpeditionOverrides: () => void
}>()


const emit = defineEmits<{
  'update:includeAllExpeditions': [value: boolean]
  /** Bubble the live queue (count + first resolvable name) so the parent's heading can reflect it. */
  'update:queue': [payload: { length: number; firstName: string }]
}>()


// creatureId is parent-owned (route-query sync + standalone continuity); awaken mirrors the
// lone queued creature into it.
const creatureId = defineModel<string>('creatureId', { required: true })


const { t } = useI18n()


const creatures = computed(() => props.creatures)
const creatureMap = computed(() => props.creatureMap)
const ownedCreatureIds = computed(() => props.ownedCreatureIds)
const isAwakened = (id: string) => props.isAwakened(id)
const getLevel = (id: string) => props.getLevel(id)
const effectiveExpeditionTierSelections = computed(() => props.effectiveExpeditionTierSelections)


// Awaken-rush pins the planner to level 70 (the awakening milestone).
const targetLevel = ref(AWAKEN_TARGET)


const {
  creature,
  startLevel,
  plan,
  isMaxLevel,
  selectAlternative,
  resetOverride,
  resetAllOverrides: resetRouteOverrides,
  hasOverrides: hasRouteOverrides,
  overriddenFromLevels,
  hasCalculated: singleHasCalculated,
  calculate: singleCalculate,
} = useLevelPlanner(creatureId, targetLevel, effectiveExpeditionTierSelections)


// ===== Awaken-rush queue =====
// Awaken-rush is driven by a curated queue of unawakened creatures (persisted). The
// calculator auto-routes: 1 queued → single planner; 2+ → party planner scoped to the
// queue (already-awakened creatures stay available as escorts via the override seam).
const isAwaken = computed(() => true)
// Heal an interrupted tour's demo queue before useLocalStorage reads it below.
recoverTourDemo()
const awakenQueue = useLocalStorage<string[]>('awaken-planner-queue', [])
const awakenPickerOpen = ref(false)
const awakenExpeditionPickerOpen = ref(false)
const awakenExpeditionIncludedCount = computed(() => props.expeditionIncludedCount)


// Owned, not-yet-awakened creatures are the only valid awaken targets.
const awakenEligibleCreatures = computed(() =>
  creatures.value
    .filter((c) => ownedCreatureIds.value.has(c.id) && !isAwakened(c.id))
    .toSorted((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
)
const awakenEligibleIds = computed(() => new Set(awakenEligibleCreatures.value.map((c) => c.id)))


// Guided-tour demo creatures temporarily queued even when not owned (so the tour shows a
// real party on a fresh account). Exempt from the eligibility prune below; cleared on tour end.
const awakenTourDemoIds = ref(new Set<string>())
// Staggered start levels for those demo creatures, so their independent hands-free plans
// visibly diverge on the timeline instead of stacking on one expedition. Cleared on tour end.
const awakenTourDemoLevels = ref(new Map<string, number>())
// Start level for an awaken-queue creature: a tour-demo override wins, else the owned level.
// Keeps the queue rail (L→70, progress) in sync with the overridden plan the planner builds.
const awakenStartLevel = (id: string) => awakenTourDemoLevels.value.get(id) ?? getLevel(id)


// Drop ids that are no longer eligible (got awakened, sold, etc.) so the queue self-heals.
// Tour-demo ids are kept so a seeded party survives even though those creatures aren't owned.
watch([awakenEligibleIds, isAwaken], () => {
  if (!isAwaken.value) return
  const pruned = awakenQueue.value.filter(
    (id) => awakenEligibleIds.value.has(id) || awakenTourDemoIds.value.has(id),
  )
  if (pruned.length !== awakenQueue.value.length) awakenQueue.value = pruned
})


const awakenQueueSet = computed(() => new Set(awakenQueue.value))
const awakenQueueCreatures = computed(() =>
  awakenQueue.value
    .map((id) => creatures.value.find((c) => c.id === id))
    .filter((c): c is Creature => !!c),
)
// Queue size routes the planner: a lone creature uses the rich single Level-Up planner
// (step cards, alternatives, overrides); two or more switch to the party optimizer.
const awakenSingle = computed(() => isAwaken.value && awakenQueue.value.length === 1)
const awakenMulti = computed(() => isAwaken.value && awakenQueue.value.length >= 2)


// Mirror the lone queued creature into the single planner's creature id.
watch(
  [awakenSingle, awakenQueue],
  () => {
    if (awakenSingle.value) creatureId.value = awakenQueue.value[0]
  },
  { immediate: true },
)


// Bubble queue length + first resolvable creature name to the parent for the heading
// (mirrors the original parent heading which read awakenQueueCreatures[0]?.name).
watch(
  [awakenQueue, awakenQueueCreatures],
  () =>
    emit('update:queue', {
      length: awakenQueue.value.length,
      firstName: awakenQueueCreatures.value[0]?.name ?? '',
    }),
  { immediate: true, deep: true },
)


function toggleAwakenQueue(id: string) {
  awakenQueue.value = awakenQueueSet.value.has(id)
    ? awakenQueue.value.filter((x) => x !== id)
    : [...awakenQueue.value, id]
}
function toggleAwakenTier(ids: string[], select: boolean) {
  if (select) {
    const existing = new Set(awakenQueue.value)
    awakenQueue.value = [...awakenQueue.value, ...ids.filter((id) => !existing.has(id))]
  } else {
    const removing = new Set(ids)
    awakenQueue.value = awakenQueue.value.filter((id) => !removing.has(id))
  }
}
function clearAwakenQueue() {
  awakenQueue.value = []
}


// Multi-creature awakening uses the party beam search with a one-leveler-per-party
// cap: queued creatures level solo while the rest of the owned roster fills the
// booster slots. Levelers/boosters are scoped through a dedicated override set so
// the Custom party planner is untouched.
const awakenTargetRef = computed(() => AWAKEN_TARGET)
const awakenBudget = ref<PlannerTimeBudget>('quick')
const awakenExcluded = ref(new Set<string>())
const awakenIncluded = ref(new Set<string>())
const awakenOverrides = { plannerExcluded: awakenExcluded, plannerIncluded: awakenIncluded }


// ===== Booster roster =====
// Eligible boosters are owned, already-awakened creatures that aren't queued targets.
// By default we auto-pick the strongest few (a focused pool keeps the plan from
// pulling in the whole awakened roster); the Booster Roster modal lets the user
// override that with explicit exclude/include sets.
// Inspect a roster chip to open that creature in the shared drawer.
const {
  selectedCreature: inspectedCreature,
  drawerOpen: inspectDrawerOpen,
  toggleCreatureById: inspectCreatureById,
  closeDrawer: closeInspectDrawer,
} = useCreatureDrawer()
// Booster derivation + the persisted exclude/include overrides live in a dedicated composable
// (the strongest-N auto pool, the resolved allowed set, the toggle/reset controls and chip
// preview). The side-effecting watch below — which projects the allowed set onto the party
// planner's override refs — intentionally stays here, next to that shared planner state.
const {
  awakenBoosterPickerOpen,
  awakenBoosterCandidates,
  awakenAllowedBoosterIds,
  toggleAwakenBooster,
  toggleAwakenBoosterTier,
  resetAwakenBoosters,
  awakenBoosterHint,
  awakenBoosterChips,
} = useAwakenBoosterRoster({ awakenQueue, awakenQueueSet })


watch(
  [isAwaken, awakenQueue, ownedCreatureIds, awakenAllowedBoosterIds],
  () => {
    if (!isAwaken.value) return
    const queue = awakenQueueSet.value
    const allowed = awakenAllowedBoosterIds.value
    const nextExcluded = new Set<string>()
    const nextIncluded = new Set<string>()
    for (const c of creatures.value) {
      if (!ownedCreatureIds.value.has(c.id)) continue
      if (queue.has(c.id)) {
        // Queued creatures are levelers; force-include if globally excluded.
        if (props.excludedCreatureIds.has(c.id)) nextIncluded.add(c.id)
      } else if (isAwakened(c.id)) {
        if (allowed.has(c.id)) {
          // Allowed booster — force-include if globally excluded.
          if (props.excludedCreatureIds.has(c.id)) nextIncluded.add(c.id)
        } else {
          // Awakened but not in the booster roster → keep out of the plan.
          nextExcluded.add(c.id)
        }
      } else {
        // Owned, unawakened, not queued → keep out of the plan entirely.
        nextExcluded.add(c.id)
      }
    }
    awakenExcluded.value = nextExcluded
    awakenIncluded.value = nextIncluded
  },
  { deep: true, immediate: true },
)


const awakenStrategyRef = ref<PlannerStrategy>('optimal')
const {
  plan: awakenPartyPlan,
  isComputing: awakenComputing,
  progress: awakenProgress,
  calculate: awakenCalculate,
} = usePartyPlanner(awakenTargetRef, awakenStrategyRef, awakenBudget, awakenOverrides, {
  // Solo levelers — counter-intuitively this also produces FASTER plans: forcing
  // creatures apart makes each graduate to its own best expedition, whereas
  // co-leveling lets the search clump everyone on one cheap starter expedition.
  maxLevelersPerParty: 1,
  cacheNamespace: 'awaken',
})


const awakenHasPlan = computed(
  () => !!awakenPartyPlan.value && awakenPartyPlan.value.steps.length > 0,
)
const awakenProgressPercent = computed(() => {
  const p = awakenProgress.value
  if (!p || p.maxIterations <= 0) return 0
  return Math.round(Math.min(0.95, p.iteration / p.maxIterations) * 100)
})
const awakenSummaryById = computed(() => {
  const map = new Map<string, PartyLevelingPlan['summaries'][number]>()
  for (const s of awakenPartyPlan.value?.summaries ?? []) map.set(s.creatureId, s)
  return map
})


// Secondary "hands-free" strategy: independent per-creature sticky plans, the
// "set it up once and leave for hours" mode — the default; Optimal is the coordinated,
// faster-but-more-reassignments alternative.
const awakenMode = ref<'optimal' | 'hands-free'>('hands-free')
const awakenIsHandsFree = computed(() => awakenMode.value === 'hands-free')
const {
  plansById: handsFreePlans,
  partyPlan: handsFreePartyPlan,
  hasPlan: handsFreeHasPlan,
  lastFinishSeconds: handsFreeLastFinish,
  calculate: handsFreeCalculate,
} = useAwakenHandsFree(
  awakenQueue,
  awakenTargetRef,
  effectiveExpeditionTierSelections,
  awakenAllowedBoosterIds,
  awakenTourDemoLevels,
)


// Both modes render through the same PartyPlannerResults UI; only the plan differs.
const awakenActivePartyPlan = computed(() =>
  awakenIsHandsFree.value ? handsFreePartyPlan.value : awakenPartyPlan.value,
)


// Mode-aware state for the multi-creature template.
const awakenMultiHasPlan = computed(() =>
  awakenIsHandsFree.value ? handsFreeHasPlan.value : awakenHasPlan.value,
)
const awakenMultiComputing = computed(() =>
  awakenIsHandsFree.value ? false : awakenComputing.value,
)
function awakenMultiCalculate() {
  if (awakenIsHandsFree.value) handsFreeCalculate()
  else awakenCalculate()
}
function setAwakenMode(next: 'optimal' | 'hands-free') {
  if (awakenMode.value === next) return
  awakenMode.value = next
  // Auto-calculate the newly-selected strategy if its plan isn't ready yet.
  if (!awakenMultiHasPlan.value) awakenMultiCalculate()
}


// ===== Guided-tour demo seeding =====
// Only the awaken-rush instance registers; prestige/custom instances skip this.
const includeAllExpeditionsModel = computed({
  get: () => props.includeAllExpeditions,
  set: (v: boolean) => emit('update:includeAllExpeditions', v),
})
const { restoreAwakenDemo, unregisterAwakenDemo } = useAwakenTourDemo({
  isAwaken,
  registerForObjective: props.registerForObjective,
  creatures,
  isAwakened,
  awakenQueue,
  awakenMode,
  awakenTourDemoIds,
  awakenTourDemoLevels,
  includeAllExpeditions: includeAllExpeditionsModel,
  awakenMultiCalculate,
})
onBeforeUnmount(() => {
  restoreAwakenDemo() // safety net if the tour is still open when navigating away
  unregisterAwakenDemo?.()
})


function awakenEtaFor(id: string): number | null {
  if (awakenSingle.value) {
    return creature.value?.id === id ? (plan.value?.totalTimeSeconds ?? null) : null
  }
  if (awakenIsHandsFree.value) return handsFreePlans.value.get(id)?.totalTimeSeconds ?? null
  return awakenSummaryById.value.get(id)?.totalTimeSeconds ?? null
}


// Header stat: single plan total for one creature, else the active mode's last-finish.
const awakenLastFinishSeconds = computed(() => {
  if (awakenSingle.value) return plan.value?.totalTimeSeconds ?? null
  if (awakenIsHandsFree.value) return handsFreeLastFinish.value
  return awakenPartyPlan.value?.totalTimeSeconds ?? null
})
const awakenLastFinishLabel = computed(() =>
  awakenLastFinishSeconds.value != null && awakenLastFinishSeconds.value > 0
    ? formatDuration(awakenLastFinishSeconds.value)
    : '—',
)


// Calm results hero (mirrors the Prestige hero): the strategy is explained rather than shouted,
// and the denser plan metrics live behind "Learn more" instead of a busy chip row.
const awakenLearnMoreOpen = ref(false)
const awakenUsedExpeditionCount = computed(() => {
  const p = awakenActivePartyPlan.value
  if (!p) return 0
  return new Set(p.steps.filter(isRunPartyStep).map((s) => s.expedition.id)).size
})
const awakenSwapCount = computed(() => {
  const p = awakenActivePartyPlan.value
  if (!p) return 0
  return p.steps.filter((s) => s.kind === 'run' && s.wasReconfigured).length
})
const awakenStrategyShort = computed(() =>
  awakenIsHandsFree.value
    ? t('levelPlanner.awaken.strategyShortHandsFree')
    : t('levelPlanner.awaken.strategyShortOptimal'),
)
const awakenStrategyExplainer = computed(() =>
  awakenIsHandsFree.value
    ? t('levelPlanner.awaken.strategyExplainerHandsFree')
    : t('levelPlanner.awaken.strategyExplainerOptimal'),
)


// Rail selection + sort (Summon-style left rail).
type AwakenRailSort = 'eta' | 'level' | 'name'
const awakenRailSort = ref<AwakenRailSort>('eta')
const awakenRailSortDir = ref<'asc' | 'desc'>('asc')
const awakenSortOptions = computed<{ id: AwakenRailSort; label: string }[]>(() => [
  { id: 'eta', label: t('levelPlanner.rail.sortEta') },
  { id: 'level', label: t('levelPlanner.rail.sortLevel') },
  { id: 'name', label: t('levelPlanner.rail.sortName') },
])
// Same sort again flips direction; a new sort resets to ascending (Summon-style).
function setAwakenRailSort(sort: AwakenRailSort) {
  if (awakenRailSort.value === sort) {
    awakenRailSortDir.value = awakenRailSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    awakenRailSort.value = sort
    awakenRailSortDir.value = 'asc'
  }
}
// null = "whole queue" overview (multi only); single mode pins to its one creature.
const selectedAwakenId = ref<string | null>(null)
watch(
  [awakenQueue, isAwaken, awakenSingle],
  () => {
    if (!isAwaken.value) return
    if (awakenSingle.value) {
      selectedAwakenId.value = awakenQueue.value[0] ?? null
    } else if (selectedAwakenId.value && !awakenQueueSet.value.has(selectedAwakenId.value)) {
      selectedAwakenId.value = null
    }
  },
  { immediate: true },
)
const awakenRailEntries = computed(() => {
  const entries = awakenQueueCreatures.value.map((c) => ({
    id: c.id,
    name: c.name,
    image: getCreatureImage(c) ?? null,
    tier: c.tier,
    fromLevel: awakenStartLevel(c.id),
    toLevel: AWAKEN_TARGET,
    etaSeconds: awakenEtaFor(c.id),
    progress: Math.min(100, Math.round((awakenStartLevel(c.id) / AWAKEN_TARGET) * 100)),
  }))
  const sort = awakenRailSort.value
  const dir = awakenRailSortDir.value === 'asc' ? 1 : -1
  return entries.toSorted((a, b) => {
    if (sort === 'name') return dir * a.name.localeCompare(b.name)
    if (sort === 'level') return dir * (a.fromLevel - b.fromLevel || a.name.localeCompare(b.name))
    const ae = a.etaSeconds ?? Infinity
    const be = b.etaSeconds ?? Infinity
    return dir * (ae - be || a.name.localeCompare(b.name))
  })
})
// Click a selected entry again to return to the whole-queue overview.
function selectAwaken(id: string) {
  selectedAwakenId.value = selectedAwakenId.value === id ? null : id
}


defineExpose({ awakenQueueCreatures })
</script>

<template>
  <!-- ===== AWAKEN-RUSH (queue-driven) ===== -->
  <!-- Reused Summon picker, scoped to unawakened creatures -->
  <SummonCreaturePicker
    :open="awakenPickerOpen"
    :title="t('levelPlanner.awaken.addCreaturesTitle')"
    :creatures="awakenEligibleCreatures"
    :selected-ids="awakenQueueSet"
    :get-level="getLevel"
    :is-awakened="isAwakened"
    @toggle="toggleAwakenQueue"
    @toggle-tier="toggleAwakenTier"
    @reset="clearAwakenQueue"
    @close="awakenPickerOpen = false"
  />

  <!-- Booster roster: which awakened creatures may escort the queue -->
  <SummonCreaturePicker
    :open="awakenBoosterPickerOpen"
    :title="t('levelPlanner.awaken.allowBoostersTitle')"
    level-sort
    initial-sort="level"
    initial-sort-dir="desc"
    show-activity
    :hint="awakenBoosterHint"
    :creatures="awakenBoosterCandidates"
    :selected-ids="awakenAllowedBoosterIds"
    :get-level="getLevel"
    :is-awakened="isAwakened"
    @toggle="toggleAwakenBooster"
    @toggle-tier="toggleAwakenBoosterTier"
    @reset="resetAwakenBoosters"
    @close="awakenBoosterPickerOpen = false"
  />

  <!-- Expeditions the calculator may route through -->
  <AwakenExpeditionPicker
    :open="awakenExpeditionPickerOpen"
    :expeditions="allExpeditions"
    :effective-tier-selections="effectiveExpeditionTierSelections"
    :overrides="expeditionTierOverrides"
    :include-all="includeAllExpeditions"
    @toggle-tier="toggleExpeditionTier"
    @remove-override="removeExpeditionOverride"
    @reset="resetExpeditionOverrides"
    @update:include-all="emit('update:includeAllExpeditions', $event)"
    @close="awakenExpeditionPickerOpen = false"
  />

  <!-- Shared inspect drawer opened from roster chips. -->
  <CreatureDetail
    :creature="inspectedCreature"
    :open="inspectDrawerOpen"
    @close="closeInspectDrawer"
  />

  <!-- Rail stays mounted even with an empty queue (Summon-style), so adding the
         first creature populates the plan in place instead of swapping the layout. -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    <!-- Left column: the queue rail + planner-scope controls -->
    <div class="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:self-start">
      <AwakenPlanRail
        data-tour="awaken-rail"
        class="min-h-0 flex-1"
        :entries="awakenRailEntries"
        :selected-id="selectedAwakenId"
        :sort="awakenRailSort"
        :sort-dir="awakenRailSortDir"
        :sort-options="awakenSortOptions"
        :computing="awakenMultiComputing && !awakenMultiHasPlan"
        @select="selectAwaken"
        @update:sort="setAwakenRailSort"
        @add="awakenPickerOpen = true"
      />

      <!-- Booster roster: who may escort the queue. A plain container — each chip
             removes itself, and the dashed chip opens the add/remove picker. -->
      <div
        data-tour="awaken-boosters"
        class="surface-card flex shrink-0 flex-col gap-2 px-3 py-2.5"
      >
        <div class="flex items-center gap-2">
          <Shield class="size-4 text-muted-foreground" />
          <span class="text-sm font-semibold text-foreground">{{
            t('levelPlanner.awaken.boosterRoster')
          }}</span>
        </div>
        <div
          class="flex max-h-40 flex-wrap content-start gap-x-1.5 gap-y-2 overflow-y-auto pr-1.5 pt-1.5"
        >
          <RightClickHint
            v-for="b in awakenBoosterChips"
            :key="b.id"
            @contextmenu="inspectCreatureById(b.id)"
          >
            <span
              class="relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-2 pr-3"
              :title="t('levelPlanner.awaken.boosterChipTitle', { name: b.name, level: b.level })"
            >
              <span class="block size-6 shrink-0 overflow-hidden rounded-full bg-card">
                <img
                  v-if="b.image"
                  :src="b.image"
                  :alt="b.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
              </span>
              <span class="max-w-[8rem] truncate text-xs font-semibold">{{ b.name }}</span>
              <span class="font-mono text-3xs font-bold text-muted-foreground">
                {{ b.level }}
              </span>
              <button
                class="focus-ring absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400"
                :title="t('levelPlanner.awaken.removeBooster', { name: b.name })"
                @click="toggleAwakenBooster(b.id)"
              >
                <X class="size-2.5" />
              </button>
            </span>
          </RightClickHint>
          <button
            class="focus-ring inline-flex h-[30px] items-center gap-1 rounded-lg border border-dashed border-border/70 px-2.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            @click="awakenBoosterPickerOpen = true"
          >
            <Plus class="size-3.5" />
            {{ t('levelPlanner.controls.addRemove') }}
          </button>
        </div>
      </div>

      <!-- Strategy: how the queue runs — set-and-leave (Hands-free) vs coordinated (Optimal).
             Only relevant with 2+ queued; mirrors the Prestige sidebar's strategy card. -->
      <div
        v-if="awakenMulti"
        data-tour="awaken-strategy"
        class="surface-card flex shrink-0 flex-col gap-2 px-3 py-2.5"
      >
        <span class="flex items-center gap-2">
          <Zap class="size-4 text-muted-foreground" />
          <span class="text-sm font-semibold text-foreground">{{
            t('levelPlanner.controls.strategy')
          }}</span>
        </span>
        <div
          class="inline-flex items-center self-start overflow-hidden rounded-lg border border-border/70 bg-background/70"
        >
          <button
            class="focus-ring flex h-8 items-center gap-1.5 px-3 text-xs font-semibold transition"
            :class="
              awakenIsHandsFree
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            :title="t('levelPlanner.awaken.handsFreeTitle')"
            @click="setAwakenMode('hands-free')"
          >
            <Clock3 class="size-3.5" />
            {{ t('levelPlanner.awaken.handsFree') }}
          </button>
          <div class="w-px self-stretch bg-border/40" />
          <button
            class="focus-ring flex h-8 items-center gap-1.5 px-3 text-xs font-semibold transition"
            :class="
              !awakenIsHandsFree
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            :title="t('levelPlanner.awaken.optimalTitle')"
            @click="setAwakenMode('optimal')"
          >
            <Zap class="size-3.5" />
            {{ t('levelPlanner.controls.optimal') }}
          </button>
        </div>
      </div>

      <!-- Scope controls: open the expeditions modal to tune the calculator -->
      <div
        data-tour="awaken-expeditions"
        class="surface-card flex shrink-0 items-center justify-between gap-2 px-3 py-2.5"
      >
        <span class="flex items-center gap-2">
          <Compass class="size-4 text-muted-foreground" />
          <span class="flex items-baseline gap-1.5">
            <span class="text-sm font-semibold text-foreground">Expeditions</span>
            <span class="font-mono text-2xs font-bold text-muted-foreground">
              {{ awakenExpeditionIncludedCount }}/{{ allExpeditions.length }}
            </span>
          </span>
        </span>
        <button
          class="focus-ring inline-flex h-[30px] items-center gap-1 rounded-lg border border-border/70 bg-background/70 px-2.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          @click="awakenExpeditionPickerOpen = true"
        >
          <SlidersHorizontal class="size-3.5" />
          {{ t('levelPlanner.controls.manage') }}
        </button>
      </div>
    </div>

    <!-- Focus pane -->
    <div data-tour="awaken-focus" class="min-w-0 space-y-5">
      <!-- Empty queue prompt (the rail stays mounted alongside) -->
      <PlannerEmptyState
        v-if="awakenQueue.length === 0"
        :title="t('levelPlanner.awaken.emptyTitle')"
        :subtitle="t('levelPlanner.awaken.emptySubtitle')"
      />

      <template v-else>
        <!-- Single queued creature: the rich Level-Up planner (steps, alternatives) -->
        <template v-if="awakenSingle && creature">
          <PlannerEmptyState
            v-if="isMaxLevel"
            :title="t('levelPlanner.awaken.alreadyMaxTitle')"
            :subtitle="t('levelPlanner.awaken.alreadyMaxSubtitle', { name: creature.name })"
          />
          <LevelPlannerCalculatePrompt
            v-else-if="!singleHasCalculated || !plan"
            :creature-name="creature.name"
            :creature-image="getCreatureImage(creature)"
            :creature="creature"
            :from-level="startLevel"
            :to-level="AWAKEN_TARGET"
            @calculate="singleCalculate"
          />
          <LevelPlannerResults
            v-else-if="plan && plan.steps.length > 0"
            :plan="plan"
            :creature-name="creature.name"
            :creature-image="getCreatureImage(creature)"
            :creature="creature"
            :overridden-from-levels="overriddenFromLevels"
            :has-route-overrides="hasRouteOverrides"
            @select-alternative="selectAlternative"
            @reset-override="resetOverride"
            @reset-all-overrides="resetRouteOverrides()"
          />
        </template>

        <!-- Two or more: the party optimizer -->
        <template v-else-if="awakenMulti">
          <!-- Results hero (mirrors the Prestige hero): the ETA is the headline figure, the
                 strategy reads as a quiet caption, and the dense plan metrics live behind "Learn
                 more". The strategy itself is chosen from the sidebar Strategy card. -->
          <section v-if="awakenMultiHasPlan" class="surface-card px-4 py-4">
            <div class="flex items-start justify-between gap-2">
              <p class="flex items-baseline gap-2 font-bold text-foreground">
                <Clock3 class="size-7 shrink-0 self-center text-primary" />
                <span class="text-3xl tabular-nums sm:text-4xl">≈ {{ awakenLastFinishLabel }}</span>
                <span class="text-base text-muted-foreground">{{
                  t('levelPlanner.awaken.toFinish')
                }}</span>
              </p>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  v-if="selectedAwakenId"
                  class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  @click="selectedAwakenId = null"
                >
                  <Users class="size-3.5" />
                  {{ t('levelPlanner.awaken.wholeQueue') }}
                </button>
                <button
                  class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  :disabled="awakenMultiComputing"
                  :class="{ 'cursor-not-allowed opacity-50': awakenMultiComputing }"
                  @click="awakenMultiCalculate"
                >
                  <RefreshCw class="size-3.5" :class="{ 'animate-spin': awakenMultiComputing }" />
                  {{ t('levelPlanner.controls.recalculate') }}
                </button>
              </div>
            </div>

            <p
              class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground"
            >
              <span class="font-semibold text-foreground">{{
                awakenIsHandsFree
                  ? t('levelPlanner.awaken.handsFree')
                  : t('levelPlanner.controls.optimal')
              }}</span>
              <span>· {{ awakenStrategyShort }}</span>
              <span class="text-muted-foreground/40">·</span>
              <button
                class="focus-ring inline-flex items-center gap-0.5 rounded text-xs font-semibold text-primary transition hover:text-primary/80"
                @click="awakenLearnMoreOpen = !awakenLearnMoreOpen"
              >
                {{ t('levelPlanner.learnMore') }}
                <ChevronDown
                  class="size-3.5 transition-transform"
                  :class="{ 'rotate-180': awakenLearnMoreOpen }"
                />
              </button>
            </p>

            <div
              v-if="awakenLearnMoreOpen && awakenActivePartyPlan"
              class="mt-3 space-y-3 border-t border-border/40 pt-3 text-sm leading-relaxed text-muted-foreground"
            >
              <p>{{ awakenStrategyExplainer }}</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                <span>
                  <span class="text-muted-foreground/60">{{
                    t('levelPlanner.awaken.metricRuns')
                  }}</span>
                  {{ formatNumber(awakenActivePartyPlan.totalRuns) }}
                </span>
                <span>
                  <span class="text-muted-foreground/60">Expeditions</span>
                  {{ awakenUsedExpeditionCount }}/{{ allExpeditions.length }}
                </span>
                <span>
                  <span class="text-muted-foreground/60">{{
                    t('levelPlanner.awaken.metricSwaps')
                  }}</span>
                  {{ awakenSwapCount }}
                </span>
              </div>
              <p
                v-if="!awakenActivePartyPlan.isComplete"
                class="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-strong"
              >
                {{
                  t(
                    'levelPlanner.awaken.incompleteWarning',
                    { n: awakenActivePartyPlan.incompleteCreatureIds.length },
                    awakenActivePartyPlan.incompleteCreatureIds.length,
                  )
                }}
              </p>
            </div>
          </section>

          <!-- Computing (Optimal only) -->
          <PlannerLoadingProgress
            v-if="awakenMultiComputing && !awakenMultiHasPlan"
            :subtitle="t('levelPlanner.awaken.coordinatingSubtitle')"
            :progress-percent="awakenProgressPercent"
            :elapsed-ms="0"
            :explored-states="awakenProgress?.exploredStates ?? 0"
            :best-complete-time="awakenProgress?.bestCompleteTimeSeconds ?? null"
          />

          <!-- Ready to calculate -->
          <PlannerEmptyState
            v-else-if="!awakenMultiHasPlan"
            :title="t('levelPlanner.emptyState.readyToPlan')"
            :subtitle="
              awakenIsHandsFree
                ? t('levelPlanner.awaken.readySubtitleHandsFree')
                : t('levelPlanner.awaken.readySubtitleOptimal')
            "
          >
            <template #action>
              <button
                class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                @click="awakenMultiCalculate"
              >
                <Play class="size-4" />
                {{ t('levelPlanner.controls.calculate') }}
              </button>
            </template>
          </PlannerEmptyState>

          <!-- Both modes render the same way: timeline by expedition + per-creature
                 steps. Selecting a creature in the rail focuses it; "Whole queue" clears it. -->
          <PartyPlannerResults
            v-else-if="awakenActivePartyPlan"
            :plan="awakenActivePartyPlan"
            :creatures="creatureMap"
            :other-plan="null"
            :strategy="awakenStrategyRef"
            :other-computing="false"
            :target-level="AWAKEN_TARGET"
            :focus-creature-id="selectedAwakenId ?? ''"
            hide-chart
            hide-creature-filter
            hide-summary
          />
        </template>
      </template>
    </div>
  </div>
</template>
