<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { AlertCircle, ChevronDown, Clock3, Layers, Plus, Trash2, X, Zap } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import summonedIcon from '@/assets/icons/summoned.webp'
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import SanctuaryPlannerSuggestion from '@/components/skill-planner/SanctuaryPlannerSuggestion.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useSanctuary } from '@/composables/useSanctuary'
import type { Creature, ElementType, Jobs } from '@/types'
import { typeColor } from '@/utils/format/format'
import {
  helpersIcon,
  machinesIcon,
  expeditionsIcon,
  dungeonsIcon,
  jobIcons,
} from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'
import {
  MAX_SANCTUARY_SLOTS,
  SANCTUARY_JOBS,
  JOB_COLORS,
  JOB_TIER_BENEFITS,
  TIER_THRESHOLDS_RAW,
  jobTierLabel,
  tierBenefitType,
  tierIncrementalLabel,
  progressPercent,
  targetPercent,
  isScoreAtThreshold,
} from '@/utils/planner/sanctuaryConstants'
import { buildSanctuaryDiff, recommendPartyForJob } from '@/utils/planner/skillAdvisories'
import { calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

const { t } = useI18n()


const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')


const {
  sanctuaryCreatureIds,
  partySlots,
  activeSlotIndex,
  hasEmptySlot,
  jobProgress,
  targetTiers,
  recommendedCreatures,
  showExcludedCreatures,
  ownedOnly,
  setActiveSlot,
  assignCreatureToSlot,
  removeCreatureFromSlot,
  setTargetTier,
  setAllTargets,
  clearSanctuary,
  setParty,
  isOwned,
  isAwakened,
  getCreatureStatus,
  jobScores,
  jobTiers,
} = useSanctuary()
const { creatures } = useCreatures()
const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  toggleCreature: toggleInspectCreature,
  closeDrawer: closeCreatureDrawer,
} = useCreatureDrawer()


// ── Mobile section handling ──
type MobileSection = 'sanctuary' | 'creatures'


function normalizeSection(value: unknown): MobileSection {
  if (value === 'creatures') return 'creatures'
  return 'sanctuary'
}


const mobileSection = computed<MobileSection>({
  get() {
    return normalizeSection(route.query.section)
  },
  set(value) {
    router.replace({ query: { ...route.query, section: value } })
  },
})


// ── Creature filters ──
const creatureSearch = ref('')
const selectedCreatureType = ref<ElementType | 'all'>('all')
const selectedCreatureTiers = ref<number[]>([])
const showMoreCreatureFilters = ref(false)
const creatureTypes: ElementType[] = ['Fire', 'Water', 'Wind', 'Earth']
const sortByJob = ref<string>('recommended')


// Deep-link from a planner "Open in Sanctuary" advisory: ?job=<Job>&target=<tier>.
// Rather than silently overwriting the player's target tier, we surface a visible
// suggestion panel (so original vs suggested is obvious) with the recommended party,
// the remove/add/keep swap, and the shared-slot trade-off. The picker is still sorted
// by the job; on mobile the picker is its own section, so switch to it and scroll in.
const suggestionJob = ref<string | null>(null)
const suggestionTier = ref(0)


onMounted(() => {
  const job = typeof route.query.job === 'string' ? route.query.job : null
  if (!job || !(SANCTUARY_JOBS as readonly string[]).includes(job)) return
  sortByJob.value = job
  const target = Number(route.query.target)
  if (Number.isFinite(target) && target > 0) {
    suggestionJob.value = job
    suggestionTier.value = target
    // Suggestions can include excluded/busy creatures, so reveal them in the picker.
    showExcludedCreatures.value = true
  }
  if (!isDesktop.value) mobileSection.value = 'creatures'
  nextTick(() => {
    document
      .getElementById('creature-browser')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})


// Recommended single-job party + the concrete roster diff (remove/add/keep + the
// collateral tier moves on other shared-slot jobs) for the suggested job.
const suggestion = computed(() => {
  const job = suggestionJob.value
  if (!job) return null
  const rec = recommendPartyForJob(
    creatures.value,
    job.toLowerCase(),
    TIER_THRESHOLDS_RAW,
    MAX_SANCTUARY_SLOTS,
    // Include excluded/busy creatures — they're still the best fit; the tiles flag
    // their status and we auto-enable "Show Excluded" so they appear in the picker.
    (id) => isOwned(id) && isAwakened(id),
  )
  const diff = buildSanctuaryDiff(
    creatures.value,
    sanctuaryCreatureIds.value,
    rec.party,
    job.toLowerCase(),
    job,
    calculateJobTiersFromSanctuary,
  )
  // Order the Add list to match the "Select Creature" picker (displayRecommended),
  // so the two line up; creatures not in the picker (filtered out) sort last.
  const pickerOrder = new Map(displayRecommended.value.map((r, i) => [r.creature.id, i]))
  const swapIn = [...diff.swapIn].toSorted(
    (a, b) =>
      (pickerOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (pickerOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
  return { job, rec, diff: { ...diff, swapIn } }
})


function applySuggestion() {
  const s = suggestion.value
  if (!s) return
  setTargetTier(s.job, suggestionTier.value)
  setParty(s.rec.party)
  suggestionJob.value = null
  suggestionTier.value = 0
}


function dismissSuggestion() {
  suggestionJob.value = null
  suggestionTier.value = 0
}


const hasTargets = computed(() => Object.values(targetTiers.value).some((t) => t > 0))


const highlightedJobs = computed<Set<string>>(() => {
  const jobs = new Set<string>()
  if (sortByJob.value !== 'recommended') jobs.add(sortByJob.value)
  if (hasTargets.value) {
    for (const job of SANCTUARY_JOBS) {
      if ((targetTiers.value[job] ?? 0) > 0) jobs.add(job)
    }
  }
  return jobs
})


const creatureTierOptions = computed(() => {
  const tiers = new Set(recommendedCreatures.value.map(({ creature }) => creature.tier))
  return Array.from(tiers).toSorted((a, b) => a - b)
})


const allCreatureTiersSelected = computed(() => {
  return (
    creatureTierOptions.value.length > 0 &&
    creatureTierOptions.value.every((tier) => selectedCreatureTiers.value.includes(tier))
  )
})


watch(
  creatureTierOptions,
  (tiers, oldTiers) => {
    // If the user had every previous tier selected (i.e. no active tier filter), keep
    // selecting all — otherwise a newly-appearing tier would silently make the filter
    // look partial ("all but one or two"). Only preserve a genuine partial selection.
    const wasAllSelected =
      !oldTiers || oldTiers.every((tier) => selectedCreatureTiers.value.includes(tier))
    if (wasAllSelected) {
      selectedCreatureTiers.value = [...tiers]
      return
    }
    const preserved = selectedCreatureTiers.value.filter((tier) => tiers.includes(tier))
    selectedCreatureTiers.value = preserved.length ? preserved : [...tiers]
  },
  { immediate: true },
)


const hasSecondaryCreatureFilters = computed(
  () => selectedCreatureType.value !== 'all' || !allCreatureTiersSelected.value,
)


const filteredRecommended = computed(() => {
  return recommendedCreatures.value.filter(({ creature }) => {
    const query = creatureSearch.value.toLowerCase()
    const matchesSearch =
      creature.name.toLowerCase().includes(query) || creature.trait.toLowerCase().includes(query)
    const matchesType =
      selectedCreatureType.value === 'all' || creature.types.includes(selectedCreatureType.value)
    const matchesTier =
      selectedCreatureTiers.value.length === 0 ||
      selectedCreatureTiers.value.includes(creature.tier)
    return matchesSearch && matchesType && matchesTier
  })
})


const displayRecommended = computed(() => {
  const list = ownedOnly.value
    ? filteredRecommended.value.filter(({ creature }) => isOwned(creature.id))
    : filteredRecommended.value

  if (sortByJob.value === 'recommended') return list

  const jobKey = sortByJob.value.toLowerCase() as keyof Jobs
  return [...list].toSorted(
    (a, b) => (b.creature.jobs[jobKey] ?? 0) - (a.creature.jobs[jobKey] ?? 0),
  )
})


// Check which targeted jobs are unreachable with the currently displayed creatures
const unreachableTargets = computed<string[]>(() => {
  const targets = targetTiers.value
  const tiers = jobTiers.value
  const scores = jobScores.value

  const unmetJobs = SANCTUARY_JOBS.filter((job) => {
    const target = targets[job] ?? 0
    const tier = tiers[job] ?? 0
    return target > tier
  })
  if (unmetJobs.length === 0) return []

  const emptySlots = MAX_SANCTUARY_SLOTS - sanctuaryCreatureIds.value.length
  if (emptySlots <= 0) return unmetJobs

  const available = displayRecommended.value.map(({ creature }) => creature)

  // Greedy simulation: pick creatures that contribute most toward remaining deficits
  const simScores = { ...scores }
  const picked = new Set<string>()

  for (let slot = 0; slot < emptySlots && picked.size < available.length; slot++) {
    let bestCreature: Creature | null = null
    let bestValue = -1

    for (const c of available) {
      if (picked.has(c.id)) continue
      let value = 0
      for (const job of unmetJobs) {
        const key = job.toLowerCase() as keyof Jobs
        const contribution = c.jobs[key] ?? 0
        const target = targets[job] ?? 0
        const remaining = TIER_THRESHOLDS_RAW[target - 1] - simScores[job]
        if (remaining > 0) value += Math.min(contribution, remaining)
      }
      if (value > bestValue) {
        bestValue = value
        bestCreature = c
      }
    }

    if (!bestCreature) break
    picked.add(bestCreature.id)
    for (const job of SANCTUARY_JOBS) {
      const key = job.toLowerCase() as keyof Jobs
      simScores[job] += bestCreature.jobs[key] ?? 0
    }
  }

  return unmetJobs.filter((job) => {
    const target = targets[job] ?? 0
    return simScores[job] < TIER_THRESHOLDS_RAW[target - 1]
  })
})


const activeCreatureFilters = computed<ActiveFilter[]>(() => {
  const filters: ActiveFilter[] = []
  if (creatureSearch.value)
    filters.push({
      key: 'search',
      group: 'Search',
      label:
        creatureSearch.value.length > 20
          ? `${creatureSearch.value.slice(0, 20)}…`
          : creatureSearch.value,
    })
  if (selectedCreatureType.value !== 'all')
    filters.push({
      key: 'type',
      group: 'Type',
      label: selectedCreatureType.value,
      color: typeColor(selectedCreatureType.value),
    })
  if (!allCreatureTiersSelected.value) {
    for (const tier of selectedCreatureTiers.value) {
      filters.push({ key: `tier:${tier}`, group: 'Tier', label: `T${tier + 1}` })
    }
  }
  if (!ownedOnly.value)
    filters.push({
      key: 'ownedOnly',
      group: 'Summoned',
      label: t('common.showingAll'),
      image: summonedIcon,
    })
  if (showExcludedCreatures.value)
    filters.push({ key: 'showExcluded', group: 'Filter', label: t('common.showingExcluded') })
  return filters
})


function removeCreatureFilter(key: string) {
  if (key === 'search') creatureSearch.value = ''
  else if (key === 'type') selectedCreatureType.value = 'all'
  else if (key === 'ownedOnly') ownedOnly.value = true
  else if (key === 'showExcluded') showExcludedCreatures.value = false
  else if (key.startsWith('tier:')) selectedCreatureTiers.value = [...creatureTierOptions.value]
}


function clearCreatureFilters() {
  creatureSearch.value = ''
  selectedCreatureType.value = 'all'
  selectedCreatureTiers.value = [...creatureTierOptions.value]
  ownedOnly.value = true
  showExcludedCreatures.value = false
  sortByJob.value = 'recommended'
}


function toggleCreatureType(type: ElementType) {
  selectedCreatureType.value = selectedCreatureType.value === type ? 'all' : type
}


function toggleCreatureTier(tier: number) {
  if (allCreatureTiersSelected.value) {
    selectedCreatureTiers.value = [tier]
    return
  }
  if (selectedCreatureTiers.value.includes(tier)) {
    if (selectedCreatureTiers.value.length === 1) {
      selectedCreatureTiers.value = [...creatureTierOptions.value]
      return
    }
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter((t_val) => t_val !== tier)
  } else {
    selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
  }
}


function clearAll() {
  clearSanctuary()
  setAllTargets(0)
  clearCreatureFilters()
}


function chooseCreature(creature: Creature) {
  if (!hasEmptySlot.value) return
  assignCreatureToSlot(creature)
  if (!isDesktop.value) {
    mobileSection.value = 'sanctuary'
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Page header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-extrabold">{{ t('sanctuaryView.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('sanctuaryView.subtitle') }}
        </p>
      </div>
      <button
        v-if="sanctuaryCreatureIds.length > 0"
        class="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger-strong transition hover:bg-danger/20"
        @click="clearAll"
      >
        <Trash2 class="size-3.5" />
        {{ t('sanctuaryView.clearAll') }}
      </button>
    </div>

    <!-- Skill Planner suggestion (deep-link arrival) -->
    <SanctuaryPlannerSuggestion
      v-if="suggestion"
      :job="suggestion.job"
      :suggested-tier="suggestionTier"
      :diff="suggestion.diff"
      @apply="applySuggestion"
      @dismiss="dismissSuggestion"
      @inspect="
        (id) => {
          const c = creatures.find((cr) => cr.id === id)
          if (c) toggleInspectCreature(c)
        }
      "
    />

    <!-- Mobile tabs -->
    <div class="surface-card p-2 lg:hidden">
      <div class="grid grid-cols-2 gap-2">
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'sanctuary'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'sanctuary'"
        >
          {{ t('sanctuaryView.sanctuary') }}
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'creatures'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'creatures'"
        >
          {{ t('sanctuaryView.creatures') }}
        </button>
      </div>
    </div>

    <!-- Main layout: Left/Right split -->
    <div
      class="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12rem)] lg:grid-cols-[minmax(340px,1fr)_minmax(320px,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <!-- ═══ Left: Party + Tier Benefits ═══ -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'sanctuary' ? 'hidden' : ''"
      >
        <div class="flex-1 overflow-y-auto p-4">
          <!-- Party Slots -->
          <div class="mb-5">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {{ t('sanctuaryView.party') }}
                <span class="ml-1 normal-case tracking-normal text-muted-foreground/70">
                  {{ sanctuaryCreatureIds.length }}/{{ MAX_SANCTUARY_SLOTS }}
                </span>
              </h3>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-3xs font-semibold text-danger-strong transition hover:bg-danger/20"
                :class="sanctuaryCreatureIds.length === 0 ? 'invisible' : ''"
                @click="clearSanctuary"
              >
                <X class="size-3" />
                {{ t('sanctuaryView.clearParty') }}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <div
                v-for="(slot, index) in partySlots"
                :key="index"
                class="flex flex-col items-center"
              >
                <div
                  class="relative size-14 overflow-hidden rounded-lg border transition"
                  :class="[
                    slot
                      ? 'border-border bg-card/50 hover:border-primary/50'
                      : activeSlotIndex === index
                        ? 'border-dashed border-primary bg-primary/10'
                        : 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45',
                  ]"
                  @click="!slot ? setActiveSlot(index) : undefined"
                >
                  <template v-if="slot">
                    <RightClickHint @contextmenu="toggleInspectCreature(slot)">
                      <img
                        :src="getCreatureImage(slot)"
                        :alt="slot.name"
                        class="size-full object-cover"
                        loading="lazy"
                      />
                      <div
                        class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-0.5 py-0.5"
                      >
                        <p class="truncate text-center text-3xs font-semibold text-white">
                          {{ slot.name }}
                        </p>
                      </div>
                    </RightClickHint>
                    <button
                      class="focus-ring absolute right-0 top-0 rounded-bl rounded-tr-lg bg-black/70 p-0.5 text-white/80 transition hover:bg-destructive hover:text-white"
                      @click.stop="removeCreatureFromSlot(index)"
                    >
                      <X class="size-3" />
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex size-full flex-col items-center justify-center">
                      <Plus class="size-3 text-muted-foreground/50" />
                      <span v-if="activeSlotIndex === index" class="text-3xs text-primary">
                        {{ t('sanctuaryView.select') }}
                      </span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Tier Benefit Cards -->
          <div>
            <div class="mb-2 flex items-start justify-between gap-2">
              <h3 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {{ t('sanctuaryView.skillBenefits') }}
              </h3>
              <div class="flex items-center gap-2">
                <AppTooltip
                  v-if="unreachableTargets.length > 0"
                  :text="t('sanctuaryView.unreachableTooltip')"
                  position="bottom"
                >
                  <div class="flex items-center gap-1 text-3xs font-semibold text-warning-strong">
                    <AlertCircle class="size-3 shrink-0" />
                    <template v-for="(job, i) in unreachableTargets" :key="job">
                      <span v-if="i > 0">,</span>
                      <img
                        :src="jobIcons[job.toLowerCase() as keyof typeof jobIcons]"
                        :alt="job"
                        class="size-3"
                      />
                      <span>{{ job }}</span>
                    </template>
                    <span>{{ t('sanctuaryView.unreachable') }}</span>
                  </div>
                </AppTooltip>
                <button
                  class="focus-ring inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-3xs font-semibold text-danger-strong transition hover:bg-danger/20"
                  :class="hasTargets ? '' : 'invisible'"
                  @click="setAllTargets(0)"
                >
                  <X class="size-3" />
                  {{ t('sanctuaryView.clearTargets') }}
                </button>
              </div>
            </div>
            <div class="space-y-2">
              <div
                v-for="jp in jobProgress"
                :key="jp.job"
                class="rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5"
              >
                <!-- Header: icon + name + active benefit pills -->
                <div class="mb-1.5 flex min-h-7 items-center gap-1.5">
                  <img
                    :src="jobIcons[jp.job.toLowerCase() as keyof typeof jobIcons]"
                    :alt="jp.job"
                    class="size-4"
                    loading="lazy"
                  />
                  <span class="text-sm font-semibold">{{ jp.job }}</span>
                  <div v-if="jp.tier > 0" class="ml-auto flex flex-wrap justify-end gap-1">
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].xpBonus > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-success/25 bg-success/10 px-1.5 py-0.5 text-3xs font-semibold text-success-strong dark:bg-success/15 dark:text-success-strong"
                    >
                      <Zap class="size-2.5" />
                      {{ t('sanctuary.xpBonus', { n: JOB_TIER_BENEFITS[jp.tier].xpBonus }) }}
                    </span>
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].durationReduction > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-3xs font-semibold text-warning-strong dark:bg-warning/15 dark:text-warning-strong"
                    >
                      <Clock3 class="size-2.5" />
                      -{{ JOB_TIER_BENEFITS[jp.tier].durationReduction }}%
                    </span>
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].yieldBonus > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-reserved/25 bg-reserved/10 px-1.5 py-0.5 text-3xs font-semibold text-reserved-strong dark:bg-reserved/15 dark:text-reserved-strong"
                    >
                      <Layers class="size-2.5" />
                      +{{ JOB_TIER_BENEFITS[jp.tier].yieldBonus }}
                    </span>
                  </div>
                  <span v-else class="ml-auto text-3xs text-muted-foreground/50">
                    {{ t('sanctuary.noBonuses') }}
                  </span>
                </div>

                <!-- Progress bar with tier markers -->
                <div class="space-y-0.5">
                  <div class="relative">
                    <div
                      class="relative h-3 overflow-hidden rounded-full border border-border/40 bg-muted/30 dark:border-transparent"
                    >
                      <div
                        class="absolute inset-y-0 left-0 transition-all duration-500"
                        :class="isScoreAtThreshold(jp.score) ? 'rounded-l-full' : 'rounded-full'"
                        :style="{
                          width: `${progressPercent(jp.score)}%`,
                          backgroundColor: JOB_COLORS[jp.job.toLowerCase()],
                        }"
                      />
                    </div>
                    <!-- Tier threshold markers (overlaid on top of bar) -->
                    <div
                      v-for="t_val in [1, 2, 3, 4, 5]"
                      :key="t_val"
                      class="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/30"
                      :style="{ left: `${targetPercent(t_val)}%` }"
                    />
                    <!-- Target marker -->
                    <div
                      v-if="(targetTiers[jp.job] ?? 0) > jp.tier"
                      class="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary shadow-sm shadow-primary/50"
                      :style="{ left: `${targetPercent(targetTiers[jp.job])}%` }"
                    />
                  </div>
                  <!-- Tier benefit labels below bar -->
                  <div class="relative h-3.5">
                    <span
                      v-for="t_val in [1, 2, 3, 4, 5]"
                      :key="t_val"
                      class="absolute -translate-x-1/2 text-3xs font-semibold"
                      :class="jp.tier >= t_val ? 'text-success-strong' : 'text-muted-foreground/50'"
                      :style="{ left: `${targetPercent(t_val)}%` }"
                    >
                      <Zap v-if="tierBenefitType(t_val) === 'xp'" class="mx-auto size-2.5" />
                      <Clock3
                        v-else-if="tierBenefitType(t_val) === 'duration'"
                        class="mx-auto size-2.5"
                      />
                      <Layers v-else class="mx-auto size-2.5" />
                    </span>
                  </div>
                </div>

                <!-- Score -->
                <div class="text-2xs">
                  <span class="text-muted-foreground">
                    <template v-if="jp.isMaxed">
                      <span class="font-semibold text-success-strong">{{
                        t('sanctuaryView.allBonusesUnlocked')
                      }}</span>
                    </template>
                    <template v-else>
                      {{ jp.score }}/{{ jp.nextThreshold }} ·
                      <span class="font-semibold text-foreground/70">{{
                        t('sanctuaryView.ptsToNext', { pts: jp.pointsToNext })
                      }}</span>
                    </template>
                  </span>
                </div>

                <!-- Target selector -->
                <div class="mt-2">
                  <span
                    class="mb-1 block text-3xs font-bold uppercase tracking-widest text-muted-foreground"
                    >{{ t('sanctuaryView.setTarget') }}</span
                  >
                  <div class="flex gap-1">
                    <button
                      v-for="t_val in [1, 2, 3, 4, 5]"
                      :key="t_val"
                      class="focus-ring inline-flex flex-1 items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-3xs font-medium transition"
                      :class="
                        (targetTiers[jp.job] ?? 0) === t_val
                          ? 'border-transparent bg-primary text-primary-foreground shadow-glow'
                          : jp.tier >= t_val
                            ? 'border-success/30 bg-success/10 text-success-strong dark:bg-success/20 dark:text-success-strong'
                            : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      "
                      :title="`${t('sanctuaryView.tierLabel', { n: t_val })}: ${jobTierLabel(t_val)}`"
                      @click="
                        setTargetTier(jp.job, (targetTiers[jp.job] ?? 0) === t_val ? 0 : t_val)
                      "
                    >
                      <template v-if="jp.tier >= t_val">✓</template>
                      <template v-else>
                        <Zap v-if="tierBenefitType(t_val) === 'xp'" class="size-2.5" />
                        <Clock3
                          v-else-if="tierBenefitType(t_val) === 'duration'"
                          class="size-2.5"
                        />
                        <Layers v-else class="size-2.5" />
                      </template>
                      <span class="hidden text-3xs sm:inline">{{
                        tierIncrementalLabel(t_val)
                      }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ Right: Creature Browser ═══ -->
      <section
        id="creature-browser"
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'creatures' ? 'hidden' : ''"
      >
        <!-- Header -->
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">{{ t('sanctuaryView.selectCreature') }}</h2>
        </div>

        <!-- Filters -->
        <div class="space-y-2 border-b border-border/70 px-4 py-3">
          <input
            v-model="creatureSearch"
            type="text"
            :placeholder="t('sanctuaryView.searchCreature')"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
          />

          <div class="flex flex-wrap items-center gap-2">
            <button
              class="pill focus-ring gap-1.5"
              :class="ownedOnly ? 'pill-active' : ''"
              @click="ownedOnly = !ownedOnly"
            >
              <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
              {{ t('sanctuaryView.summonedOnly') }}
            </button>
            <button
              class="pill focus-ring gap-1.5"
              :class="showExcludedCreatures ? 'pill-active' : ''"
              @click="showExcludedCreatures = !showExcludedCreatures"
            >
              {{ t('sanctuaryView.showExcluded') }}
            </button>
            <div
              class="ml-auto flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              aria-live="polite"
            >
              {{ t('sanctuaryView.creatures_count', { n: displayRecommended.length }) }}
            </div>
          </div>

          <button
            class="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            :aria-expanded="showMoreCreatureFilters || hasSecondaryCreatureFilters"
            @click="showMoreCreatureFilters = !showMoreCreatureFilters"
          >
            <ChevronDown
              class="size-3.5 transition-transform"
              :class="showMoreCreatureFilters || hasSecondaryCreatureFilters ? '' : '-rotate-90'"
            />
            {{ t('sanctuaryView.moreFilters') }}
          </button>

          <template v-if="showMoreCreatureFilters || hasSecondaryCreatureFilters">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                >{{ t('sanctuaryView.type') }}</span
              >
              <button
                v-for="type in creatureTypes"
                :key="type"
                class="pill focus-ring"
                :class="selectedCreatureType === type ? 'pill-active' : ''"
                @click="toggleCreatureType(type)"
              >
                <span
                  class="mr-1.5 inline-block size-2 rounded-full"
                  :class="selectedCreatureType === type ? 'ring-1 ring-white/60' : ''"
                  :style="{ backgroundColor: typeColor(type) }"
                />
                {{ type }}
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                >{{ t('sanctuaryView.tier') }}</span
              >
              <button
                v-for="tier in creatureTierOptions"
                :key="tier"
                class="pill focus-ring font-mono"
                :class="
                  !allCreatureTiersSelected && selectedCreatureTiers.includes(tier)
                    ? 'pill-active'
                    : ''
                "
                @click="toggleCreatureTier(tier)"
              >
                T{{ tier + 1 }}
              </button>
            </div>
          </template>

          <ActiveFilters
            v-if="activeCreatureFilters.length"
            :filters="activeCreatureFilters"
            @remove="removeCreatureFilter"
            @clear-all="clearCreatureFilters"
          />
        </div>

        <!-- Sort row -->
        <div class="flex items-center gap-3 border-b border-border/70 py-1.5 pl-[20px] pr-[20px]">
          <AppTooltip :text="t('sanctuaryView.recommended')" position="top">
            <button
              class="focus-ring inline-flex w-12 shrink-0 items-center justify-center rounded-md border px-1 py-1 text-3xs font-medium transition"
              :class="
                sortByJob === 'recommended'
                  ? 'border-transparent bg-primary text-primary-foreground shadow-glow'
                  : 'border-border bg-muted/40 text-muted-foreground'
              "
              @click="sortByJob = 'recommended'"
            >
              {{ t('sanctuaryView.recommendedAbbr') }}
            </button>
          </AppTooltip>
          <div class="flex min-w-0 flex-1 gap-1">
            <button
              v-for="job in SANCTUARY_JOBS"
              :key="job"
              class="focus-ring inline-flex flex-1 items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-3xs font-medium transition"
              :class="
                sortByJob === job
                  ? 'border-transparent bg-primary text-primary-foreground shadow-glow'
                  : 'border-border bg-muted/40 text-muted-foreground'
              "
              @click="sortByJob = sortByJob === job ? 'recommended' : job"
            >
              <img
                :src="jobIcons[job.toLowerCase() as keyof typeof jobIcons]"
                :alt="job"
                class="size-3"
                loading="lazy"
              />
              <span class="hidden sm:inline">{{ job }}</span>
            </button>
          </div>
        </div>

        <!-- Creature list -->
        <div class="flex-1 overflow-y-auto p-2">
          <div
            v-if="displayRecommended.length === 0"
            class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground"
          >
            {{ t('sanctuaryView.noCreaturesMatch') }}
          </div>
          <div class="space-y-1">
            <button
              v-for="{ creature, score } in displayRecommended"
              :key="creature.id"
              class="focus-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
              :class="
                hasEmptySlot
                  ? 'border-border/50 bg-card/50 hover:border-accent/45 hover:bg-muted/25'
                  : 'border-border/30 bg-card/30 opacity-50'
              "
              @click="chooseCreature(creature)"
            >
              <RightClickHint @contextmenu="toggleInspectCreature(creature)">
                <!-- Image + assignment badge -->
                <div class="relative size-12 shrink-0">
                  <img
                    :src="getCreatureImage(creature)"
                    :alt="creature.name"
                    class="size-12 rounded-md border border-border object-cover"
                    loading="lazy"
                  />
                  <!-- Tier badge -->
                  <span
                    class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1 py-px font-mono text-3xs font-bold text-muted-foreground shadow-sm"
                  >
                    T{{ creature.tier + 1 }}
                  </span>
                  <img
                    v-if="getCreatureStatus(creature.id) === 'helper'"
                    :src="helpersIcon"
                    :alt="t('sanctuaryView.statusHelper')"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCreatureStatus(creature.id) === 'machine'"
                    :src="machinesIcon"
                    :alt="t('sanctuaryView.statusMachine')"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCreatureStatus(creature.id) === 'expedition'"
                    :src="expeditionsIcon"
                    alt="Expedition"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCreatureStatus(creature.id) === 'dungeon'"
                    :src="dungeonsIcon"
                    :alt="t('sanctuaryView.statusDungeon')"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                </div>

                <!-- Name + status + Job scores -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-0.5">
                    <span
                      class="truncate text-sm font-semibold"
                      :class="
                        isAwakened(creature.id)
                          ? 'text-pink-600 dark:text-pink-400'
                          : 'text-foreground/80'
                      "
                      >{{ creature.name }}</span
                    >
                    <span
                      v-if="isOwned(creature.id)"
                      class="shrink-0 text-xs"
                      :class="
                        isAwakened(creature.id)
                          ? 'text-pink-500 dark:text-pink-400'
                          : 'text-warning-strong'
                      "
                      >★</span
                    >
                    <AppTooltip
                      v-if="isOwned(creature.id) && !isAwakened(creature.id)"
                      :text="t('sanctuaryView.mustAwakened')"
                      position="top"
                    >
                      <span
                        class="shrink-0 cursor-help rounded border border-warning/30 bg-warning/10 px-1 py-px text-3xs font-semibold text-warning-strong"
                        >{{ t('sanctuaryView.notAwakened') }}</span
                      >
                    </AppTooltip>
                    <span v-if="score > 0" class="ml-auto flex shrink-0 items-baseline gap-1">
                      <span class="font-mono text-sm font-semibold text-primary">{{ score }}</span>
                      <span class="text-3xs text-muted-foreground">{{
                        hasTargets ? t('sanctuaryView.value') : t('sanctuaryView.total')
                      }}</span>
                    </span>
                  </div>
                  <div class="mt-1 flex gap-1 divide-x divide-border">
                    <div
                      v-for="(job, ji) in SANCTUARY_JOBS"
                      :key="job"
                      class="flex flex-1 items-center gap-[2px] rounded-md px-0.5 py-0.5 transition"
                      :class="[
                        ji > 0 ? 'pl-1' : '',
                        highlightedJobs.has(job) ? 'bg-primary/10 ring-1 ring-primary/30' : '',
                        highlightedJobs.size > 0 && !highlightedJobs.has(job) ? 'opacity-25' : '',
                      ]"
                      :title="`${job}: ${creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0}`"
                    >
                      <img
                        :src="jobIcons[job.toLowerCase() as keyof typeof jobIcons]"
                        :alt="job"
                        class="size-3.5 shrink-0"
                        :class="highlightedJobs.has(job) ? 'opacity-100' : 'opacity-60'"
                        loading="lazy"
                      />
                      <span
                        class="w-3 shrink-0 font-mono text-3xs font-semibold"
                        :class="
                          highlightedJobs.has(job)
                            ? 'text-primary'
                            : (creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0) > 0
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/30'
                        "
                      >
                        {{ creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0 }}
                      </span>
                      <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/30">
                        <div
                          class="h-full rounded-full"
                          :style="{
                            width: `${((creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0) / 10) * 100}%`,
                            backgroundColor:
                              (creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0) > 0
                                ? JOB_COLORS[job.toLowerCase()]
                                : 'transparent',
                          }"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </RightClickHint>
            </button>
          </div>
        </div>
      </section>
    </div>

    <CreatureDetail
      :creature="inspectedCreature"
      :open="creatureDrawerOpen"
      @close="closeCreatureDrawer"
    />
  </div>
</template>
