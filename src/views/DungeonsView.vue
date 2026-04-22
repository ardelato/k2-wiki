<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { ChevronDown, Info, Minus, Plus, Swords, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import summonedIcon from '@/assets/icons/summoned.webp'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useDungeons } from '@/composables/useDungeons'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, ElementType, ExpeditionStatKey, GatheringSubFocus } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase } from '@/utils/format'
import { statAbbreviations, statLabels } from '@/utils/formulas'
import { sanctuaryIcon, helpersIcon, machinesIcon, expeditionsIcon, jobIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')


const { creatures } = useCreatures()
const { sanctuaryCreatureIds, helperCreatureIds, machineCreatureIds, expeditionCreatureIds } =
  useGameConfig()
const { isOwned, isAwakened, collectionLevels } = useCreatureCollection()


const {
  config,
  selectedTier,
  selectedFocus,
  selectedSubFocus,
  partySlots,
  activeSlotIndex,
  effectiveLevels,
  activeStatWeights,
  currentTierConfig,
  partyScore,
  currentGrade,
  gradeClasses,
  scoreRatio,
  predictedXP,
  predictedRewards,
  recommendedCreatures,
  showExcludedCreatures,
  assignCreatureToSlot,
  removeCreatureFromSlot,
  setActiveSlot,
  getCreatureSlotScore,
  updateCreatureLevel,
  GRADE_COLORS,
  GATHERING_SUB_FOCUSES,
} = useDungeons(creatures.value, collectionLevels)


const TIER_LABELS = ['I', 'II', 'III', 'IV', 'V']


// ── Mobile section handling ──
type MobileSection = 'config' | 'details' | 'creature'


function normalizeSection(value: unknown): MobileSection {
  if (value === 'details') return 'details'
  if (value === 'creature') return 'creature'
  return 'config'
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
const ownedOnly = ref(true)
const showMoreCreatureFilters = ref(false)
const creatureTypes: ElementType[] = ['Fire', 'Water', 'Wind', 'Earth']


function typeColor(type: ElementType): string {
  if (type === 'Fire') return 'hsl(var(--type-fire))'
  if (type === 'Water') return 'hsl(var(--type-water))'
  if (type === 'Wind') return 'hsl(var(--type-wind))'
  return 'hsl(var(--type-earth))'
}


const weightedStats = computed<[ExpeditionStatKey, number][]>(() => {
  return (Object.entries(activeStatWeights.value) as [ExpeditionStatKey, number][]).filter(
    ([, w]) => w > 0,
  )
})


function statBar(creature: Creature, statKey: ExpeditionStatKey): number {
  return Math.min(100, creature.stats[statKey])
}


const hasEmptySlot = computed(() => partySlots.value.some((s) => s === null))


const creatureTierOptions = computed(() => {
  const tiers = new Set(creatures.value.map((c) => c.tier))
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
  if (!ownedOnly.value) return filteredRecommended.value
  return filteredRecommended.value.filter(({ creature }) => isOwned(creature.id))
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
    filters.push({ key: 'showExcluded', group: 'Excluded', label: 'Showing' })
  return filters
})


function removeCreatureFilter(key: string) {
  if (key === 'search') {
    creatureSearch.value = ''
    return
  }
  if (key === 'ownedOnly') {
    ownedOnly.value = true
    return
  }
  if (key === 'showExcluded') {
    showExcludedCreatures.value = false
    return
  }
  if (key === 'type') {
    selectedCreatureType.value = 'all'
    return
  }
  if (key.startsWith('tier:')) {
    const tier = Number(key.slice(5))
    if (selectedCreatureTiers.value.length === 1) {
      selectedCreatureTiers.value = [...creatureTierOptions.value]
    } else {
      selectedCreatureTiers.value = selectedCreatureTiers.value.filter((t) => t !== tier)
    }
  }
}


function clearCreatureFilters() {
  creatureSearch.value = ''
  selectedCreatureType.value = 'all'
  selectedCreatureTiers.value = [...creatureTierOptions.value]
  ownedOnly.value = true
  showExcludedCreatures.value = false
}


function chooseCreature(creature: Creature) {
  if (!hasEmptySlot.value) return
  assignCreatureToSlot(creature)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}


function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
}


function stepCreatureLevel(creatureId: string, currentLevel: number, delta: number) {
  updateCreatureLevel(creatureId, clampLevel(currentLevel + delta))
}


function normalizeLevelOnBlur(creatureId: string, currentLevel: number, event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }
  const parsed = Number(target.value)
  if (Number.isNaN(parsed)) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }
  updateCreatureLevel(creatureId, clampLevel(parsed))
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
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter(
      (selected) => selected !== tier,
    )
  } else {
    selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
  }
}


const tierLevelReq = computed(() => {
  const reqs = config.tierLevelRequirements[selectedFocus.value]
  return reqs?.[String(selectedTier.value)] ?? 0
})
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <!-- Mobile tabs -->
    <div class="surface-card p-2 lg:hidden">
      <div class="grid grid-cols-3 gap-2">
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'config'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'config'"
        >
          Config
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'details'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'details'"
        >
          Details
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'creature'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'creature'"
        >
          Creature
        </button>
      </div>
    </div>

    <!-- 3-column grid -->
    <div
      class="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12rem)] lg:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)_minmax(320px,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <!-- LEFT: Dungeon Config -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'config' ? 'hidden' : ''"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Dungeon Config</h2>
        </div>

        <div
          class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          <!-- Focus Mode -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Focus Mode
            </h4>
            <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
              <button
                class="focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  selectedFocus === 'combat'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                @click="selectedFocus = 'combat'"
              >
                Combat
              </button>
              <button
                class="focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  selectedFocus === 'gathering'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                @click="selectedFocus = 'gathering'"
              >
                Gathering
              </button>
            </div>
          </div>

          <!-- Sub-Focus (gathering only) -->
          <div v-if="selectedFocus === 'gathering'" class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Gathering Skill
            </h4>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="sub in GATHERING_SUB_FOCUSES"
                :key="sub"
                class="focus-ring inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition"
                :class="
                  selectedSubFocus === sub
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-muted/35 text-muted-foreground hover:text-foreground'
                "
                @click="selectedSubFocus = sub as GatheringSubFocus"
              >
                <img
                  v-if="jobIcons[sub.toLowerCase()]"
                  :src="jobIcons[sub.toLowerCase()]"
                  :alt="sub"
                  class="size-4 object-contain"
                  loading="lazy"
                />
                {{ sub }}
              </button>
            </div>
          </div>

          <!-- Tier -->
          <div class="space-y-2">
            <h4
              class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Tier
              <span
                v-if="tierLevelReq > 0"
                class="text-[11px] font-semibold normal-case tracking-normal text-muted-foreground/70"
              >
                (Requires Player LVL {{ tierLevelReq }})
              </span>
            </h4>
            <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
              <button
                v-for="t in 5"
                :key="t"
                class="focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  selectedTier === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                @click="selectedTier = t"
              >
                {{ TIER_LABELS[t - 1] }}
              </button>
            </div>
          </div>

          <!-- Stat Weights -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Stat Weights
            </h4>
            <div
              v-for="[key, weight] in weightedStats"
              :key="key"
              class="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-2"
            >
              <span class="text-xs text-muted-foreground">{{ statLabels[key] }}</span>
              <div class="h-2 rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${weight * 100}%` }"
                />
              </div>
              <span class="text-right text-xs font-semibold text-foreground"
                >{{ Math.round(weight * 100) }}%</span
              >
            </div>
          </div>

          <!-- Tier Table -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Tier Overview
            </h4>
            <div class="overflow-hidden rounded-lg border border-border">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-muted/45">
                    <th class="px-3 py-1.5 text-left font-semibold text-muted-foreground">Tier</th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      Base Rating
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      XP Reward
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="tier in config.tiers"
                    :key="tier.tier"
                    class="border-t border-border/50"
                    :class="tier.tier === selectedTier ? 'bg-primary/10' : ''"
                  >
                    <td class="px-3 py-1.5 font-semibold">{{ TIER_LABELS[tier.tier - 1] }}</td>
                    <td class="px-3 py-1.5 text-right font-mono">
                      {{ tier.baseRating.toLocaleString() }}
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono">
                      {{ tier.xpReward.toLocaleString() }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Grade Table -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Grade Thresholds
            </h4>
            <div class="overflow-hidden rounded-lg border border-border">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-muted/45">
                    <th class="px-3 py-1.5 text-left font-semibold text-muted-foreground">Grade</th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      Min Score
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      Reward Mult.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="grade in config.grades"
                    :key="grade.grade"
                    class="border-t border-border/50"
                    :class="currentGrade?.grade === grade.grade ? 'bg-primary/10' : ''"
                  >
                    <td class="px-3 py-1.5">
                      <span
                        class="inline-block w-6 rounded-md py-0.5 text-center text-xs font-bold"
                        :class="[GRADE_COLORS[grade.grade].text, GRADE_COLORS[grade.grade].bg]"
                      >
                        {{ grade.grade }}
                      </span>
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono">
                      {{
                        Math.floor(grade.minRatio * currentTierConfig.baseRating).toLocaleString()
                      }}
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono">{{ grade.multiplier }}x</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Requirements -->
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <p class="text-[11px] text-muted-foreground">
              Requires
              <span class="font-semibold text-foreground">{{
                toTitleCase(config.requiresItem)
              }}</span>
              to enter (1 per creature). Duration:
              <span class="font-semibold text-foreground">{{ config.duration / 60 }} minutes</span>.
            </p>
          </div>
        </div>
      </section>

      <!-- MIDDLE: Dungeon Details -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'details' ? 'hidden' : ''"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Dungeon Details</h2>
        </div>

        <div
          class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          <!-- Current Config Summary -->
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Focus</p>
              <p class="font-semibold">
                {{ toTitleCase(selectedFocus) }}
                <span v-if="selectedFocus === 'gathering'" class="text-xs text-muted-foreground">
                  ({{ selectedSubFocus }})
                </span>
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Tier</p>
              <p class="font-semibold">
                {{ TIER_LABELS[selectedTier - 1] }}
                <span class="text-xs text-muted-foreground">
                  ({{ currentTierConfig.baseRating.toLocaleString() }} rating)
                </span>
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">XP / Creature</p>
              <p class="font-mono font-semibold">
                {{ predictedXP ? predictedXP.toLocaleString() : '—' }}
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Entry Cost</p>
              <p class="flex items-center gap-1.5 font-semibold">
                <img
                  v-if="getItemImage({ id: config.requiresItem })"
                  :src="getItemImage({ id: config.requiresItem })"
                  :alt="toTitleCase(config.requiresItem)"
                  class="size-4 object-contain"
                  loading="lazy"
                />
                {{ partySlots.filter((s) => s !== null).length || 0 }}x
                {{ toTitleCase(config.requiresItem) }}
              </p>
            </div>
          </div>

          <!-- Rewards -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Rewards
              <span v-if="currentGrade" class="normal-case tracking-normal text-foreground">
                ({{ currentGrade.multiplier }}x)
              </span>
            </h4>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="reward in predictedRewards.length
                  ? predictedRewards
                  : ((selectedFocus === 'combat'
                      ? config.combatRewards[String(selectedTier)]
                      : config.gatheringRewards[selectedSubFocus]?.[String(selectedTier)]) ?? [])"
                :key="reward.itemId"
                class="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/45 px-3 py-1 font-mono text-xs"
              >
                <img
                  v-if="getItemImage({ id: reward.itemId })"
                  :src="getItemImage({ id: reward.itemId })"
                  :alt="toTitleCase(reward.itemId)"
                  class="size-4 object-contain"
                  loading="lazy"
                />
                {{ reward.amount }}x
                {{ toTitleCase(reward.itemId) }}
              </span>
            </div>
          </div>

          <!-- Party Slots -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Party
            </h4>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="(slot, index) in partySlots"
                :key="index"
                class="flex flex-col items-center gap-1"
              >
                <div
                  class="relative size-20 overflow-hidden rounded-lg border transition"
                  :class="[
                    slot
                      ? 'border-border bg-card/50'
                      : activeSlotIndex === index
                        ? 'border-dashed border-primary bg-primary/10'
                        : 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45',
                  ]"
                  @click="!slot ? setActiveSlot(index) : undefined"
                >
                  <template v-if="slot">
                    <img
                      :src="getCreatureImage(slot)"
                      :alt="`${slot.name} artwork`"
                      class="size-full object-cover"
                      loading="lazy"
                    />
                    <span
                      class="absolute left-0.5 top-0.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300"
                    >
                      {{ getCreatureSlotScore(slot) }}
                    </span>
                    <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1">
                      <p class="truncate text-center text-[10px] font-semibold text-white">
                        {{ slot.name }}
                      </p>
                    </div>
                    <button
                      class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                      @click.stop="removeCreatureFromSlot(index)"
                    >
                      <X class="size-3" />
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex size-full flex-col items-center justify-center gap-1">
                      <Plus class="size-4 text-muted-foreground/50" />
                      <span v-if="activeSlotIndex === index" class="text-[9px] text-primary"
                        >Select</span
                      >
                    </div>
                  </template>
                </div>
                <span
                  v-if="slot"
                  class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                >
                  LVL {{ effectiveLevels[slot.id] || 1 }}
                </span>
              </div>
            </div>
          </div>

          <!-- Party Summary -->
          <div
            v-if="partyScore > 0"
            class="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
          >
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Party Summary
            </h4>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Party Score</p>
                <p class="font-mono text-sm font-semibold text-primary">
                  {{ partyScore.toLocaleString() }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Base Rating</p>
                <p class="font-mono text-sm font-semibold">
                  {{ currentTierConfig.baseRating.toLocaleString() }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Score Ratio</p>
                <p
                  class="font-mono text-sm font-semibold"
                  :class="
                    scoreRatio && scoreRatio >= 1
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  "
                >
                  {{ scoreRatio ? scoreRatio.toFixed(2) : '—' }}
                </p>
              </div>
            </div>

            <!-- Grade Badge -->
            <div v-if="currentGrade" class="flex flex-col items-center gap-1 py-2">
              <span
                class="rounded-lg border px-4 py-2 text-2xl font-black"
                :class="[gradeClasses?.text, gradeClasses?.bg, gradeClasses?.border]"
              >
                {{ currentGrade.grade }}
              </span>
              <span class="text-xs font-semibold text-muted-foreground">
                {{ currentGrade.multiplier }}x rewards
              </span>
            </div>

            <!-- Score Progress Bar -->
            <div class="space-y-1">
              <div class="relative h-3 overflow-hidden rounded-full bg-muted/60">
                <div
                  class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  :class="gradeClasses?.bg ?? 'bg-primary'"
                  :style="{
                    width: `${Math.min(100, (partyScore / (currentTierConfig.baseRating * 2)) * 100)}%`,
                  }"
                />
                <!-- Grade threshold markers -->
                <div
                  v-for="grade in config.grades.filter((g) => g.minRatio > 0)"
                  :key="grade.grade"
                  class="absolute inset-y-0 w-px bg-foreground/30"
                  :style="{ left: `${(grade.minRatio / 2) * 100}%` }"
                />
              </div>
              <div class="relative h-4">
                <span
                  v-for="grade in config.grades.filter((g) => g.minRatio > 0)"
                  :key="grade.grade"
                  class="absolute -translate-x-1/2 text-[9px] font-bold"
                  :class="GRADE_COLORS[grade.grade].text"
                  :style="{ left: `${(grade.minRatio / 2) * 100}%` }"
                >
                  {{ grade.grade }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- RIGHT: Creature Selector -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'creature' ? 'hidden' : ''"
      >
        <!-- Header with Focus stats -->
        <div class="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Select Creature</h2>
          <div v-if="weightedStats.length" class="flex items-center gap-1.5">
            <Swords class="size-3.5 text-accent" />
            <span
              v-for="[key] in weightedStats"
              :key="key"
              class="bg-accent/12 rounded-md border border-accent/35 px-2 py-0.5 text-xs font-semibold text-accent"
            >
              {{ statAbbreviations[key] }}
            </span>
          </div>
        </div>

        <!-- Filters -->
        <div class="space-y-3 border-b border-border/70 px-4 py-3">
          <input
            v-model="creatureSearch"
            type="text"
            placeholder="Search creature"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
          />

          <div class="flex flex-wrap gap-2">
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
              class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
              aria-live="polite"
            >
              {{ displayRecommended.length }} creatures
            </div>
          </div>

          <!-- More filters toggle -->
          <div>
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

            <div
              class="mt-3 space-y-3"
              :class="showMoreCreatureFilters || hasSecondaryCreatureFilters ? 'block' : 'hidden'"
            >
              <!-- Type filter -->
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
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

              <!-- Tier filter -->
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
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
            </div>
          </div>

          <ActiveFilters
            :filters="activeCreatureFilters"
            @remove="removeCreatureFilter"
            @clear-all="clearCreatureFilters"
          />

          <div class="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
            <Info class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p class="text-[11px] text-muted-foreground">
              Level changes here are per-dungeon only and do not update your collection.
            </p>
          </div>
        </div>

        <!-- Creature List -->
        <div class="max-h-[58vh] space-y-2 overflow-y-auto p-3 lg:max-h-none lg:min-h-0 lg:flex-1">
          <button
            v-for="{ creature, score, level, suggestedLevel } in displayRecommended"
            :key="creature.id"
            class="focus-ring block w-full rounded-xl border px-3 py-3 text-left transition"
            :class="
              hasEmptySlot
                ? 'border-border bg-card/50 hover:border-accent/45 hover:bg-muted/25'
                : 'cursor-not-allowed border-border/50 bg-card/30 opacity-60'
            "
            @click="chooseCreature(creature)"
          >
            <div class="flex items-start gap-3">
              <div class="relative shrink-0">
                <img
                  :src="getCreatureImage(creature)"
                  :alt="`${creature.name} artwork`"
                  class="size-10 rounded-md border border-border object-cover"
                  loading="lazy"
                />
                <img
                  v-if="sanctuaryCreatureIds.includes(creature.id)"
                  :src="sanctuaryIcon"
                  alt="Sanctuary"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                  loading="lazy"
                />
                <img
                  v-else-if="helperCreatureIds.includes(creature.id)"
                  :src="helpersIcon"
                  alt="Helper"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                  loading="lazy"
                />
                <img
                  v-else-if="machineCreatureIds.includes(creature.id)"
                  :src="machinesIcon"
                  alt="Machine"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                  loading="lazy"
                />
                <img
                  v-else-if="expeditionCreatureIds.has(creature.id)"
                  :src="expeditionsIcon"
                  alt="Expedition"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                  loading="lazy"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <p
                    class="truncate font-semibold"
                    :class="
                      isAwakened(creature.id)
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-foreground'
                    "
                  >
                    {{ creature.name }}
                  </p>
                  <span
                    v-if="isOwned(creature.id)"
                    class="text-xs"
                    :class="
                      isAwakened(creature.id)
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-amber-700 dark:text-amber-400'
                    "
                    >★</span
                  >
                </div>
                <div class="mt-1 flex flex-wrap gap-1 text-xs">
                  <span
                    v-for="type in creature.types"
                    :key="type"
                    class="rounded-full bg-muted px-2 py-0.5 font-semibold"
                    :style="{ color: typeColor(type) }"
                  >
                    {{ type }}
                  </span>
                  <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
                </div>
              </div>

              <div class="text-right" @click.stop>
                <p
                  class="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Lvl
                  <span
                    v-if="suggestedLevel != null"
                    class="ml-1 normal-case tracking-normal"
                    :class="
                      level >= suggestedLevel
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    "
                  >
                    (Suggested: {{ suggestedLevel }})
                  </span>
                </p>
                <div
                  class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
                >
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level <= 1"
                    aria-label="Decrease creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, -1)"
                  >
                    <Minus class="size-3" />
                  </button>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center font-mono text-xs"
                    :value="level"
                    aria-label="Creature level"
                    @blur="normalizeLevelOnBlur(creature.id, level, $event)"
                  />
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level >= 120"
                    aria-label="Increase creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, 1)"
                  >
                    <Plus class="size-3" />
                  </button>
                </div>
                <p class="mt-1 font-mono text-sm font-semibold text-primary">{{ score }}</p>
              </div>
            </div>

            <div v-if="weightedStats.length" class="mt-3 space-y-1.5">
              <div
                v-for="[key, weight] in weightedStats"
                :key="key"
                class="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2"
              >
                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{
                  statAbbreviations[key]
                }}</span>
                <div class="h-1.5 rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary"
                    :style="{ width: `${statBar(creature, key)}%`, opacity: 0.45 + weight * 0.55 }"
                  />
                </div>
              </div>
            </div>
          </button>

          <div
            v-if="displayRecommended.length === 0"
            class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground"
          >
            No creatures match your filters.
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
