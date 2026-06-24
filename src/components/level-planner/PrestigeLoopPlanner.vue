<script setup lang="ts">
import { Bug, Clock3, Compass, Play, RefreshCw, SlidersHorizontal, Target } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import AwakenExpeditionPicker from '@/components/level-planner/AwakenExpeditionPicker.vue'
import PrestigeDebugPanel from '@/components/level-planner/PrestigeDebugPanel.vue'
import PrestigeLoopResults from '@/components/level-planner/PrestigeLoopResults.vue'
import PrestigeRosterRail from '@/components/level-planner/PrestigeRosterRail.vue'
import InfoHint from '@/components/shared/InfoHint.vue'
import SummonCreaturePicker from '@/components/summoning-planner/SummonCreaturePicker.vue'
import { usePrestigeLoopPlanner } from '@/composables/usePrestigeLoopPlanner'
import type { Creature } from '@/types'
import { getItemImage } from '@/utils/images/itemImages'
import { COMPARISON_CADENCE_HOURS } from '@/utils/planner/prestigeLoopPlanner'
import { expeditions as allExpeditions } from '@/utils/save/precomputedTables'

const props = defineProps<{
  cadenceHours: number
  // Shared collection / config (parent-owned, passed down)
  creatureMap: Map<string, Creature>
  overrideableCreatures: Creature[]
  excludedCreatureIds: Set<string>
  sanctuaryCreatureIds: string[]
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
  // Shared session override set (parent-owned, shared with custom-party)
  creatureOverrides: {
    plannerExcluded: { value: Set<string> }
    plannerIncluded: { value: Set<string> }
  }
  // Shared expedition scope (parent-owned)
  effectiveExpeditionTierSelections: Record<string, number[]>
  expeditionTierOverrides: Record<string, number[]>
  includeAllExpeditions: boolean
  expeditionIncludedCount: number
  toggleCreatureOverride: (id: string, basis?: Set<string>) => void
  toggleTierOverride: (ids: string[], include: boolean, basis?: Set<string>) => void
  resetCreatureOverrides: () => void
  toggleExpeditionTier: (expeditionId: string, tier: number) => void
  removeExpeditionOverride: (expeditionId: string) => void
  resetExpeditionOverrides: () => void
}>()


const emit = defineEmits<{
  'update:cadenceHours': [value: number]
  'update:includeAllExpeditions': [value: boolean]
  'go-to-awaken': []
}>()


const { t } = useI18n()


const prestigeCadenceHours = computed({
  get: () => props.cadenceHours,
  set: (v: number) => emit('update:cadenceHours', v),
})
// 9a found ~3 held boosters optimal across rosters and cadences — fixed, not user-tunable.
const prestigeBoosterCount = ref(3)
const cadencePresets = COMPARISON_CADENCE_HOURS


// The prestige loop reassigns creatures across expeditions, so a Sanctuary-seated creature
// is still a valid candidate — drop Sanctuary members from the auto-excluded basis (other
// deployments stay excluded, surfaced via the picker's busy toggle).
const prestigeExcludedBasis = computed(() => {
  const set = new Set(props.excludedCreatureIds)
  for (const id of props.sanctuaryCreatureIds) set.delete(id)
  return set
})
// Same include/exclude semantics as the shared handlers, but keyed off the prestige basis
// so toggling a Sanctuary creature excludes it (rather than force-including an already-in one).
const togglePrestigeCreature = (id: string) =>
  props.toggleCreatureOverride(id, prestigeExcludedBasis.value)
const togglePrestigeTier = (ids: string[], include: boolean) =>
  props.toggleTierOverride(ids, include, prestigeExcludedBasis.value)


const effectiveExpeditionTierSelections = computed(() => props.effectiveExpeditionTierSelections)
const prestigeExcludedBasisRef = computed(() => prestigeExcludedBasis.value)


const {
  plan: prestigePlan,
  lastInput: prestigeLastInput,
  eligibleEntries: prestigeEligibleEntries,
  rosterEntries: prestigeRosterEntries,
  hasEligible: hasPrestigeEligible,
  isComputing: prestigeComputing,
  calculate: prestigeCalculate,
  recalculate: prestigeRecalculate,
} = usePrestigeLoopPlanner(
  prestigeCadenceHours,
  prestigeBoosterCount,
  props.creatureOverrides,
  effectiveExpeditionTierSelections,
  prestigeExcludedBasisRef,
)


// Tokens/day for each comparison cadence (the presets plus the current value), surfaced on
// the Check-in cadence card so picking a cadence shows its pay-off in place — this replaces
// the old Compare tab.
const prestigeCadenceRates = computed(() =>
  (prestigePlan.value?.comparison.byCadence ?? [])
    .map((r) => ({ cadenceHours: r.cadenceHours, tokensPerDay: r.tokensPerHour * 24 }))
    .toSorted((a, b) => a.cadenceHours - b.cadenceHours),
)
const prestigeBestCadenceTokens = computed(() =>
  Math.max(0, ...prestigeCadenceRates.value.map((r) => r.tokensPerDay)),
)
function fmtTokensPerDay(n: number): string {
  return n.toFixed(2)
}
// Prestige-token asset, shown beside each cadence's token rate.
const prestigeTokenIcon = getItemImage({ id: 'prestige-points' })


const isDev = import.meta.env.DEV
const prestigeDebugOpen = ref(false)


// Creature lookup map for results
const creatureMap = computed(() => props.creatureMap)


// ===== Prestige-loop sidebar (roster + expeditions) =====
const prestigeRosterPickerOpen = ref(false)
const prestigeExpeditionPickerOpen = ref(false)


// Only awakened, owned creatures can prestige — the toggleable universe for the picker.
const prestigeRosterCandidates = computed(() =>
  props.overrideableCreatures.filter((c) => props.isAwakened(c.id)),
)


// The creatures actually in the loop right now (override-aware), as the picker's selection.
const prestigeSelectedIds = computed(
  () => new Set(prestigeEligibleEntries.value.map((e) => e.creatureId)),
)


// Roster rail sort (Awaken/Summon-style): same sort flips direction, a new sort resets asc.
type PrestigeRailSort = 'level' | 'tier' | 'name'
const prestigeRailSort = ref<PrestigeRailSort>('tier')
const prestigeRailSortDir = ref<'asc' | 'desc'>('desc')
const prestigeRailSortOptions = computed<{ id: PrestigeRailSort; label: string }[]>(() => [
  { id: 'tier', label: t('levelPlanner.rail.sortTier') },
  { id: 'level', label: t('levelPlanner.rail.sortLevel') },
  { id: 'name', label: t('levelPlanner.rail.sortName') },
])
function setPrestigeRailSort(sort: PrestigeRailSort) {
  if (prestigeRailSort.value === sort) {
    prestigeRailSortDir.value = prestigeRailSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    prestigeRailSort.value = sort
    prestigeRailSortDir.value = sort === 'name' ? 'asc' : 'desc'
  }
}
const prestigeRailEntries = computed(() => {
  const dir = prestigeRailSortDir.value === 'asc' ? 1 : -1
  const sort = prestigeRailSort.value
  return prestigeRosterEntries.value.toSorted((a, b) => {
    if (sort === 'name') return dir * a.name.localeCompare(b.name)
    if (sort === 'tier') return dir * (a.tier - b.tier || a.name.localeCompare(b.name))
    return dir * (a.level - b.level || a.name.localeCompare(b.name))
  })
})


function clampCadence(val: string): number {
  const n = Number(val)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(168, Math.round(n))
}


defineExpose({ prestigeCalculate, prestigeRecalculate })
</script>

<template>
  <!-- ===== PRESTIGE-LOOP MODE ===== -->
  <!-- Roster picker: which awakened creatures run the loop -->
  <SummonCreaturePicker
    :open="prestigeRosterPickerOpen"
    :title="t('levelPlanner.prestigeLoop.choosePrestigeCreatures')"
    level-sort
    initial-sort="level"
    initial-sort-dir="desc"
    show-activity
    :creatures="prestigeRosterCandidates"
    :selected-ids="prestigeSelectedIds"
    :get-level="getLevel"
    :is-awakened="isAwakened"
    @toggle="togglePrestigeCreature"
    @toggle-tier="togglePrestigeTier"
    @reset="resetCreatureOverrides"
    @close="prestigeRosterPickerOpen = false"
  />

  <!-- Expeditions the loop may route through (shared global scope) -->
  <AwakenExpeditionPicker
    :open="prestigeExpeditionPickerOpen"
    :expeditions="allExpeditions"
    :effective-tier-selections="effectiveExpeditionTierSelections"
    :overrides="expeditionTierOverrides"
    :include-all="includeAllExpeditions"
    @toggle-tier="toggleExpeditionTier"
    @remove-override="removeExpeditionOverride"
    @reset="resetExpeditionOverrides"
    @update:include-all="emit('update:includeAllExpeditions', $event)"
    @close="prestigeExpeditionPickerOpen = false"
  />

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    <!-- Left column: planner-scope controls -->
    <div class="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:self-start">
      <!-- Roster: which awakened creatures run the loop, as an Awaken-style rail.
             Once a plan exists each row shows its planned role (live legend); before
             that it shows level. Add/remove + inspect happen via the rail itself.
             Capped in height and scrolls internally so it doesn't push the cadence /
             expeditions controls below the fold. -->
      <PrestigeRosterRail
        data-tour="prestige-roster"
        :entries="prestigeRailEntries"
        :sort="prestigeRailSort"
        :sort-dir="prestigeRailSortDir"
        :sort-options="prestigeRailSortOptions"
        @update:sort="setPrestigeRailSort"
        @add="prestigeRosterPickerOpen = true"
      />

      <!-- Check-in cadence -->
      <div
        data-tour="prestige-cadence"
        class="surface-card flex shrink-0 flex-col gap-2 px-3 py-2.5"
      >
        <span class="flex items-center gap-2">
          <Clock3 class="size-4 text-muted-foreground" />
          <span class="text-sm font-semibold text-foreground">{{
            t('levelPlanner.prestigeLoop.checkInCadence')
          }}</span>
          <InfoHint term="cadence" />
        </span>
        <div class="flex items-center gap-2">
          <div
            class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
          >
            <button
              v-for="preset in cadencePresets"
              :key="preset"
              class="focus-ring h-8 px-3 text-sm font-semibold transition"
              :class="
                prestigeCadenceHours === preset
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="prestigeCadenceHours = preset"
            >
              {{ t('levelPlanner.prestigeLoop.hoursShort', { h: preset }) }}
            </button>
          </div>
          <input
            type="number"
            min="1"
            max="168"
            inputmode="numeric"
            :value="prestigeCadenceHours"
            class="focus-ring h-8 w-16 rounded-lg border border-border/70 bg-background/70 px-2 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            @blur="prestigeCadenceHours = clampCadence(($event.target as HTMLInputElement).value)"
            @change="prestigeCadenceHours = clampCadence(($event.target as HTMLInputElement).value)"
          />
        </div>
        <!-- What each cadence pays off — picking a cadence is the comparison, in place. -->
        <div v-if="prestigeCadenceRates.length" class="border-t border-border/40 pt-2">
          <div class="space-y-0.5">
            <div
              v-for="row in prestigeCadenceRates"
              :key="row.cadenceHours"
              class="flex items-baseline justify-between rounded-md px-2 py-1 text-sm"
              :class="
                row.cadenceHours === prestigeCadenceHours
                  ? 'bg-primary/10 font-semibold text-foreground'
                  : 'text-muted-foreground'
              "
            >
              <span>{{ t('levelPlanner.prestigeLoop.everyHours', { h: row.cadenceHours }) }}</span>
              <span
                class="inline-flex items-center gap-1 tabular-nums"
                :class="
                  row.tokensPerDay >= prestigeBestCadenceTokens && prestigeBestCadenceTokens > 0
                    ? 'font-semibold text-primary'
                    : ''
                "
              >
                {{ fmtTokensPerDay(row.tokensPerDay) }}
                <img
                  v-if="prestigeTokenIcon"
                  :src="prestigeTokenIcon"
                  :alt="t('levelPlanner.prestigeLoop.chart.prestigeTokensAlt')"
                  class="size-3.5 shrink-0 object-contain"
                />
                <span class="font-normal text-muted-foreground">{{
                  t('levelPlanner.prestigeLoop.perDay')
                }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Scope controls: open the expeditions modal to tune the calculator -->
      <div
        data-tour="prestige-expeditions"
        class="surface-card flex shrink-0 items-center justify-between gap-2 px-3 py-2.5"
      >
        <span class="flex items-center gap-2">
          <Compass class="size-4 text-muted-foreground" />
          <span class="flex items-baseline gap-1.5">
            <span class="text-sm font-semibold text-foreground">Expeditions</span>
            <span class="font-mono text-2xs font-bold text-muted-foreground">
              {{ expeditionIncludedCount }}/{{ allExpeditions.length }}
            </span>
          </span>
        </span>
        <button
          class="focus-ring inline-flex h-[30px] items-center gap-1 rounded-lg border border-border/70 bg-background/70 px-2.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          @click="prestigeExpeditionPickerOpen = true"
        >
          <SlidersHorizontal class="size-3.5" />
          {{ t('levelPlanner.controls.manage') }}
        </button>
      </div>
    </div>

    <!-- Focus pane -->
    <div class="min-w-0 space-y-5">
      <!-- No eligible creatures -->
      <PlannerEmptyState
        v-if="!hasPrestigeEligible"
        :title="t('levelPlanner.prestigeLoop.noEligibleTitle')"
        :subtitle="t('levelPlanner.prestigeLoop.noEligibleSubtitle')"
      >
        <template #action>
          <button
            class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            @click="emit('go-to-awaken')"
          >
            <Target class="size-4" />
            {{ t('levelPlanner.prestigeLoop.goToAwaken') }}
          </button>
        </template>
      </PlannerEmptyState>

      <!-- Computing -->
      <div
        v-else-if="prestigeComputing"
        class="surface-card flex items-center justify-center gap-3 px-6 py-12 text-muted-foreground"
      >
        <RefreshCw class="size-5 animate-spin" />
        <span class="text-sm font-semibold">{{ t('levelPlanner.prestigeLoop.simulating') }}</span>
      </div>

      <!-- Ready to calculate -->
      <PlannerEmptyState
        v-else-if="!prestigePlan"
        :title="t('levelPlanner.prestigeLoop.readyTitle')"
        :subtitle="t('levelPlanner.prestigeLoop.readySubtitle')"
      >
        <template #action>
          <button
            class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            @click="prestigeCalculate"
          >
            <Play class="size-4" />
            {{ t('levelPlanner.controls.calculate') }}
          </button>
        </template>
      </PlannerEmptyState>

      <!-- Results -->
      <PrestigeLoopResults
        v-else
        :plan="prestigePlan"
        :creatures="creatureMap"
        :get-level="getLevel"
        :is-awakened="isAwakened"
        :computing="prestigeComputing"
        @recalculate="prestigeRecalculate"
      />

      <!-- Floating debug toggle (dev only) -->
      <button
        v-if="isDev && prestigePlan"
        class="focus-ring fixed bottom-6 right-6 z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-4 text-sm font-semibold text-warning-strong shadow-lg backdrop-blur transition hover:bg-warning/20 dark:text-warning-strong"
        @click="prestigeDebugOpen = true"
      >
        <Bug class="size-4" />
        Debug
      </button>

      <PrestigeDebugPanel
        v-if="isDev"
        :open="prestigeDebugOpen"
        :input="prestigeLastInput"
        :plan="prestigePlan"
        @close="prestigeDebugOpen = false"
      />
    </div>
  </div>
</template>
