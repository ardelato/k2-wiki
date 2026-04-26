<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { AlertCircle, ChevronDown, Clock3, Layers, Plus, Trash2, X, Zap } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import summonedIcon from '@/assets/icons/summoned.webp'
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useSanctuary } from '@/composables/useSanctuary'
import type { Creature, ElementType, Jobs } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { typeColor } from '@/utils/format'
import { helpersIcon, machinesIcon, expeditionsIcon, jobIcons } from '@/utils/icons'
import {
  MAX_SANCTUARY_SLOTS,
  SANCTUARY_JOBS,
  JOB_COLORS,
  JOB_TIER_BENEFITS,
  TIER_THRESHOLDS_RAW,
  jobTierLabel,
} from '@/utils/sanctuaryConstants'

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
  isOwned,
  isAwakened,
  getCreatureStatus,
  jobScores,
  jobTiers,
} = useSanctuary()
const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  openCreature: inspectCreature,
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
  (tiers) => {
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
  if (ownedOnly.value)
    return filteredRecommended.value.filter(({ creature }) => isOwned(creature.id))
  return filteredRecommended.value
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
    filters.push({ key: 'ownedOnly', group: 'Summoned', label: 'Showing All', image: summonedIcon })
  if (showExcludedCreatures.value)
    filters.push({ key: 'showExcluded', group: 'Filter', label: 'Showing Excluded' })
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
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter((t) => t !== tier)
  } else {
    selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
  }
}


// ── Helpers ──
const maxScore = TIER_THRESHOLDS_RAW[TIER_THRESHOLDS_RAW.length - 1] // 54


type BenefitType = 'xp' | 'duration' | 'yield'


function tierBenefitType(tier: number): BenefitType {
  if (tier < 1 || tier > 5) return 'xp'
  const curr = JOB_TIER_BENEFITS[tier]
  const prev = JOB_TIER_BENEFITS[tier - 1]
  if (curr.xpBonus > prev.xpBonus) return 'xp'
  if (curr.durationReduction > prev.durationReduction) return 'duration'
  return 'yield'
}


function tierIncrementalLabel(tier: number): string {
  if (tier < 1 || tier > 5) return ''
  const curr = JOB_TIER_BENEFITS[tier]
  const prev = JOB_TIER_BENEFITS[tier - 1]
  if (curr.xpBonus > prev.xpBonus) return `+${curr.xpBonus - prev.xpBonus}% XP`
  if (curr.durationReduction > prev.durationReduction)
    return `-${curr.durationReduction - prev.durationReduction}% Dur`
  if (curr.yieldBonus > prev.yieldBonus) return `+${curr.yieldBonus - prev.yieldBonus} Yield`
  return ''
}


function progressPercent(score: number): number {
  return Math.min(100, (score / maxScore) * 100)
}


function targetPercent(targetTier: number): number {
  if (targetTier <= 0 || targetTier > 5) return 0
  return (TIER_THRESHOLDS_RAW[targetTier - 1] / maxScore) * 100
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
        <h1 class="text-2xl font-extrabold">Sanctuary</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Place awakened creatures to boost gathering skill tiers.
        </p>
      </div>
      <button
        v-if="sanctuaryCreatureIds.length > 0"
        class="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
        @click="clearAll"
      >
        <Trash2 class="size-3.5" />
        Clear All
      </button>
    </div>

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
          Sanctuary
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
          Creatures
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
                Party
                <span class="ml-1 normal-case tracking-normal text-muted-foreground/70">
                  {{ sanctuaryCreatureIds.length }}/{{ MAX_SANCTUARY_SLOTS }}
                </span>
              </h3>
              <button
                class="focus-ring inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/20"
                :class="sanctuaryCreatureIds.length === 0 ? 'invisible' : ''"
                @click="clearSanctuary"
              >
                <X class="size-3" />
                Clear Party
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
                    <img
                      :src="getCreatureImage(slot)"
                      :alt="slot.name"
                      class="size-full cursor-pointer object-cover"
                      loading="lazy"
                      @click="inspectCreature(slot)"
                    />
                    <div
                      class="absolute inset-x-0 bottom-0 cursor-pointer select-none bg-black/75 px-0.5 py-0.5"
                      @click="inspectCreature(slot)"
                    >
                      <p class="truncate text-center text-[8px] font-semibold text-white">
                        {{ slot.name }}
                      </p>
                    </div>
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
                      <span v-if="activeSlotIndex === index" class="text-[8px] text-primary">
                        Select
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
                Skill Benefits
              </h3>
              <div
                v-if="unreachableTargets.length > 0"
                class="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              >
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
                <span>unreachable</span>
              </div>
            </div>
            <div class="space-y-2">
              <div
                v-for="jp in jobProgress"
                :key="jp.job"
                class="rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5"
              >
                <!-- Header: icon + name + active benefit pills -->
                <div class="mb-1.5 flex items-center gap-1.5">
                  <img
                    :src="jobIcons[jp.job.toLowerCase() as keyof typeof jobIcons]"
                    :alt="jp.job"
                    class="size-4"
                    loading="lazy"
                  />
                  <span class="text-sm font-semibold">{{ jp.job }}</span>
                  <div v-if="jp.tier > 0" class="ml-auto flex gap-1">
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].xpBonus > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/25 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    >
                      <Zap class="size-2.5" />
                      +{{ JOB_TIER_BENEFITS[jp.tier].xpBonus }}% XP
                    </span>
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].durationReduction > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-amber-500/25 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    >
                      <Clock3 class="size-2.5" />
                      -{{ JOB_TIER_BENEFITS[jp.tier].durationReduction }}%
                    </span>
                    <span
                      v-if="JOB_TIER_BENEFITS[jp.tier].yieldBonus > 0"
                      class="inline-flex items-center gap-0.5 rounded-full border border-violet-500/25 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                    >
                      <Layers class="size-2.5" />
                      +{{ JOB_TIER_BENEFITS[jp.tier].yieldBonus }}
                    </span>
                  </div>
                  <span v-else class="ml-auto text-[10px] text-muted-foreground/50">
                    No bonuses
                  </span>
                </div>

                <!-- Progress bar with tier markers -->
                <div class="space-y-0.5">
                  <div
                    class="relative h-3 overflow-hidden rounded-full border border-border/40 bg-muted/30 dark:border-transparent"
                  >
                    <div
                      class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      :style="{
                        width: `${progressPercent(jp.score)}%`,
                        backgroundColor: JOB_COLORS[jp.job.toLowerCase()],
                      }"
                    />
                    <!-- Tier threshold markers -->
                    <div
                      v-for="t in [1, 2, 3, 4, 5]"
                      :key="t"
                      class="absolute inset-y-0 w-px bg-foreground/30"
                      :style="{ left: `${targetPercent(t)}%` }"
                    />
                    <!-- Target marker -->
                    <div
                      v-if="(targetTiers[jp.job] ?? 0) > jp.tier"
                      class="absolute inset-y-0 w-0.5 bg-primary shadow-sm shadow-primary/50"
                      :style="{ left: `${targetPercent(targetTiers[jp.job])}%` }"
                    />
                  </div>
                  <!-- Tier benefit labels below bar -->
                  <div class="relative h-3.5">
                    <span
                      v-for="t in [1, 2, 3, 4, 5]"
                      :key="t"
                      class="absolute -translate-x-1/2 text-[8px] font-semibold"
                      :class="
                        jp.tier >= t
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground/50'
                      "
                      :style="{ left: `${targetPercent(t)}%` }"
                    >
                      <Zap v-if="tierBenefitType(t) === 'xp'" class="mx-auto size-2.5" />
                      <Clock3
                        v-else-if="tierBenefitType(t) === 'duration'"
                        class="mx-auto size-2.5"
                      />
                      <Layers v-else class="mx-auto size-2.5" />
                    </span>
                  </div>
                </div>

                <!-- Score -->
                <div class="text-[11px]">
                  <span class="text-muted-foreground">
                    <template v-if="jp.isMaxed">
                      <span class="font-semibold text-emerald-600 dark:text-emerald-400"
                        >All bonuses unlocked!</span
                      >
                    </template>
                    <template v-else>
                      {{ jp.score }}/{{ jp.nextThreshold }} ·
                      <span class="font-semibold text-foreground/70"
                        >{{ jp.pointsToNext }} pts</span
                      >
                      to next
                    </template>
                  </span>
                </div>

                <!-- Target selector -->
                <div class="mt-1.5 flex gap-[3px]">
                  <button
                    v-for="t in [1, 2, 3, 4, 5]"
                    :key="t"
                    class="focus-ring inline-flex flex-1 items-center justify-center gap-0.5 rounded px-0.5 py-1 text-[10px] font-semibold transition"
                    :class="
                      (targetTiers[jp.job] ?? 0) === t
                        ? 'bg-primary text-primary-foreground'
                        : jp.tier >= t
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                          : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    "
                    :title="`Tier ${t}: ${jobTierLabel(t)}`"
                    @click="setTargetTier(jp.job, (targetTiers[jp.job] ?? 0) === t ? 0 : t)"
                  >
                    <template v-if="jp.tier >= t">✓</template>
                    <template v-else>
                      <Zap v-if="tierBenefitType(t) === 'xp'" class="size-2.5" />
                      <Clock3 v-else-if="tierBenefitType(t) === 'duration'" class="size-2.5" />
                      <Layers v-else class="size-2.5" />
                      <span class="hidden sm:inline">{{ tierIncrementalLabel(t) }}</span>
                    </template>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ Right: Creature Browser ═══ -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'creatures' ? 'hidden' : ''"
      >
        <!-- Header -->
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Select Creature</h2>
        </div>

        <!-- Filters -->
        <div class="space-y-2 border-b border-border/70 px-4 py-3">
          <input
            v-model="creatureSearch"
            type="text"
            placeholder="Search creature"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
          />

          <div class="flex flex-wrap items-center gap-2">
            <button
              class="pill focus-ring gap-1.5"
              :class="ownedOnly ? 'pill-active' : ''"
              @click="ownedOnly = !ownedOnly"
            >
              <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
              Summoned Only
            </button>
            <button
              class="pill focus-ring gap-1.5"
              :class="showExcludedCreatures ? 'pill-active' : ''"
              @click="showExcludedCreatures = !showExcludedCreatures"
            >
              Show Excluded
            </button>
            <div
              class="ml-auto flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              aria-live="polite"
            >
              {{ displayRecommended.length }} creatures
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
            More filters
          </button>

          <template v-if="showMoreCreatureFilters || hasSecondaryCreatureFilters">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                >Type</span
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
              <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                >Tier</span
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

        <!-- Creature list -->
        <div class="flex-1 overflow-y-auto p-2">
          <div
            v-if="displayRecommended.length === 0"
            class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground"
          >
            No creatures match your filters.
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
              <RightClickHint @contextmenu="inspectCreature(creature)">
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
                    class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1 py-px font-mono text-[9px] font-bold text-muted-foreground shadow-sm"
                  >
                    T{{ creature.tier + 1 }}
                  </span>
                  <img
                    v-if="getCreatureStatus(creature.id) === 'helper'"
                    :src="helpersIcon"
                    alt="Helper"
                    class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCreatureStatus(creature.id) === 'machine'"
                    :src="machinesIcon"
                    alt="Machine"
                    class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCreatureStatus(creature.id) === 'expedition'"
                    :src="expeditionsIcon"
                    alt="Expedition"
                    class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
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
                          : 'text-amber-500 dark:text-amber-400'
                      "
                      >★</span
                    >
                    <AppTooltip
                      v-if="isOwned(creature.id) && !isAwakened(creature.id)"
                      text="Must be awakened to place in Sanctuary in-game"
                      position="top"
                    >
                      <span
                        class="shrink-0 cursor-help rounded border border-amber-500/30 bg-amber-500/10 px-1 py-px text-[9px] font-semibold text-amber-500 dark:text-amber-400"
                        >Not Awakened</span
                      >
                    </AppTooltip>
                    <span
                      v-if="score > 0"
                      class="ml-auto shrink-0 font-mono text-sm font-semibold text-primary"
                      >{{ score }}</span
                    >
                  </div>
                  <div class="mt-1 flex gap-1">
                    <div
                      v-for="job in SANCTUARY_JOBS"
                      :key="job"
                      class="flex flex-1 items-center gap-[2px]"
                      :title="`${job}: ${creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0}`"
                    >
                      <img
                        :src="jobIcons[job.toLowerCase() as keyof typeof jobIcons]"
                        :alt="job"
                        class="size-3.5 shrink-0 opacity-60"
                        loading="lazy"
                      />
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
                      <span
                        class="w-3 shrink-0 text-right font-mono text-[10px] font-semibold"
                        :class="
                          (creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0) > 0
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground/30'
                        "
                      >
                        {{ creature.jobs[job.toLowerCase() as keyof Jobs] ?? 0 }}
                      </span>
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
