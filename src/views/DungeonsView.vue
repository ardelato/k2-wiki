<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { CheckCircle2, ChevronDown, Info, Lock, Minus, Plus, Swords, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import summonedIcon from '@/assets/icons/summoned.webp'
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useDungeons } from '@/composables/useDungeons'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, ElementType, ExpeditionStatKey, GatheringSubFocus } from '@/types'
import { formatNumber, itemName, toTitleCase, typeColor } from '@/utils/format/format'
import {
  sanctuaryIcon,
  helpersIcon,
  machinesIcon,
  expeditionsIcon,
  jobIcons,
} from '@/utils/format/icons'
import { statAbbreviations, statLabels } from '@/utils/formulas'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')


const { creatures } = useCreatures()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  expeditionCreatureIds,
  playerLevel,
  skillLevels,
} = useGameConfig()
const { isOwned, isAwakened, collectionLevels } = useCreatureCollection()
const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  toggleCreature: toggleInspectCreature,
  closeDrawer: closeCreatureDrawer,
} = useCreatureDrawer()


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


// ── Defensive: heal persisted state ──
// dungeon-focus / dungeon-tier / dungeon-creature-levels come from localStorage
// (useLocalStorage in useDungeons). If those keys hold junk — an unknown focus
// string, a numeric/out-of-range tier, or a non-object level map — config lookups
// like config.statWeights[focus] or config.tierLevelRequirements[focus] resolve to
// undefined and downstream computeds (e.g. Object.entries(activeStatWeights)) throw
// during render, leaving a blank <main>. Reset any invalid value to a safe default.
const VALID_FOCUSES = Object.keys(config.statWeights) as (keyof typeof config.statWeights)[]
const VALID_TIERS = config.tiers.map((tier) => tier.tier)
const VALID_SUB_FOCUSES = new Set<string>(GATHERING_SUB_FOCUSES)


watch(
  [selectedFocus, selectedTier, selectedSubFocus],
  () => {
    if (!VALID_FOCUSES.includes(selectedFocus.value)) {
      selectedFocus.value = VALID_FOCUSES[0]
    }
    if (!VALID_TIERS.includes(Number(selectedTier.value))) {
      selectedTier.value = VALID_TIERS[0]
    } else if (typeof selectedTier.value !== 'number') {
      // Coerce a persisted numeric-string tier into a real number.
      selectedTier.value = Number(selectedTier.value)
    }
    if (!VALID_SUB_FOCUSES.has(selectedSubFocus.value)) {
      selectedSubFocus.value = GATHERING_SUB_FOCUSES[0]
    }
  },
  { immediate: true },
)


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
    filters.push({
      key: 'ownedOnly',
      group: 'Summoned',
      label: t('common.showingAll'),
      image: summonedIcon,
    })
  if (showExcludedCreatures.value)
    filters.push({ key: 'showExcluded', group: 'Excluded', label: t('common.showing') })
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


// Level the tier requirement is checked against: the average player level for
// combat dungeons, the specific gathering skill level for gathering dungeons.
const relevantLevel = computed(() =>
  selectedFocus.value === 'combat'
    ? playerLevel.value
    : (skillLevels.value[selectedSubFocus.value] ?? 1),
)


function tierRequirement(tier: number): number {
  const reqs = config.tierLevelRequirements[selectedFocus.value]
  return reqs?.[String(tier)] ?? 0
}


function meetsTierRequirement(tier: number): boolean {
  return relevantLevel.value >= tierRequirement(tier)
}


const tierLevelReq = computed(() => tierRequirement(selectedTier.value))
const meetsSelectedTier = computed(() => meetsTierRequirement(selectedTier.value))
const requirementLabel = computed(() =>
  selectedFocus.value === 'combat' ? t('dungeons.player') : selectedSubFocus.value,
)
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
          {{ t('dungeons.config') }}
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
          {{ t('dungeons.details') }}
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
          {{ t('dungeons.creature') }}
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
          <h2 class="text-base font-bold">{{ t('dungeons.dungeonConfig') }}</h2>
        </div>

        <div
          class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          <!-- Focus Mode -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.focusMode') }}
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
                {{ t('dungeons.combat') }}
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
                {{ t('dungeons.gathering') }}
              </button>
            </div>
          </div>

          <!-- Sub-Focus (gathering only) -->
          <div v-if="selectedFocus === 'gathering'" class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.gatheringSkill') }}
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
              {{ t('dungeons.tier') }}
              <span
                v-if="tierLevelReq > 0"
                class="inline-flex items-center gap-1 text-2xs font-semibold normal-case tracking-normal"
                :class="meetsSelectedTier ? 'text-success-strong' : 'text-danger-strong'"
              >
                <CheckCircle2 v-if="meetsSelectedTier" class="size-3" />
                <Lock v-else class="size-3" />
                {{ t('dungeons.tierRequiresLevel', { label: requirementLabel, n: tierLevelReq }) }}
              </span>
            </h4>
            <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
              <button
                v-for="t in 5"
                :key="t"
                class="focus-ring inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="[
                  selectedTier === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                  !meetsTierRequirement(t) && selectedTier !== t ? 'opacity-50' : '',
                ]"
                :title="
                  meetsTierRequirement(t)
                    ? undefined
                    : `Requires ${requirementLabel} LVL ${tierRequirement(t)}`
                "
                @click="selectedTier = t"
              >
                {{ TIER_LABELS[t - 1] }}
                <Lock v-if="!meetsTierRequirement(t)" class="size-2.5 shrink-0" />
              </button>
            </div>
          </div>

          <!-- Stat Weights -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.statWeights') }}
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
              {{ t('dungeons.tierOverview') }}
            </h4>
            <div class="overflow-hidden rounded-lg border border-border">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-muted/45">
                    <th class="px-3 py-1.5 text-left font-semibold text-muted-foreground">
                      {{ t('dungeons.tierCol') }}
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      {{ t('dungeons.baseRating') }}
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      {{ t('dungeons.xpReward') }}
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
                      {{ formatNumber(tier.baseRating) }}
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono">
                      {{ formatNumber(tier.xpReward) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Grade Table -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.gradeThresholds') }}
            </h4>
            <div class="overflow-hidden rounded-lg border border-border">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-muted/45">
                    <th class="px-3 py-1.5 text-left font-semibold text-muted-foreground">
                      {{ t('dungeons.grade') }}
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      {{ t('dungeons.minScore') }}
                    </th>
                    <th class="px-3 py-1.5 text-right font-semibold text-muted-foreground">
                      {{ t('dungeons.rewardMult') }}
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
                      {{ formatNumber(Math.floor(grade.minRatio * currentTierConfig.baseRating)) }}
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono">{{ grade.multiplier }}x</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Requirements -->
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <p class="text-2xs text-muted-foreground">
              {{
                t('dungeons.requiresNote', {
                  item: itemName(config.requiresItem),
                  duration: config.duration / 60,
                })
              }}
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
          <h2 class="text-base font-bold">{{ t('dungeons.dungeonDetails') }}</h2>
        </div>

        <div
          class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          <!-- Current Config Summary -->
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-2xs uppercase tracking-wide text-muted-foreground">
                {{ t('dungeons.focus') }}
              </p>
              <p class="font-semibold">
                {{ t('dungeons.' + selectedFocus) }}
                <span v-if="selectedFocus === 'gathering'" class="text-xs text-muted-foreground">
                  ({{ selectedSubFocus }})
                </span>
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-2xs uppercase tracking-wide text-muted-foreground">
                {{ t('dungeons.tier') }}
              </p>
              <p class="font-semibold">
                {{ TIER_LABELS[selectedTier - 1] }}
                <span class="text-xs text-muted-foreground">
                  ({{ formatNumber(currentTierConfig.baseRating) }} {{ t('dungeons.rating') }})
                </span>
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-2xs uppercase tracking-wide text-muted-foreground">
                {{ t('dungeons.xpPerCreature') }}
              </p>
              <p class="font-mono font-semibold">
                {{ predictedXP ? formatNumber(predictedXP) : '—' }}
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-2xs uppercase tracking-wide text-muted-foreground">
                {{ t('dungeons.entryCost') }}
              </p>
              <p class="flex items-center gap-1.5 font-semibold">
                <img
                  v-if="getItemImage({ id: config.requiresItem })"
                  :src="getItemImage({ id: config.requiresItem })"
                  :alt="itemName(config.requiresItem)"
                  class="size-4 object-contain"
                  loading="lazy"
                />
                {{ partySlots.filter((s) => s !== null).length || 0 }}x
                {{ itemName(config.requiresItem) }}
              </p>
            </div>
          </div>

          <!-- Rewards -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.rewards') }}
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
                  :alt="itemName(reward.itemId)"
                  class="size-4 object-contain"
                  loading="lazy"
                />
                {{ reward.amount }}x
                {{ itemName(reward.itemId) }}
              </span>
            </div>
          </div>

          <!-- Party Slots -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('dungeons.party') }}
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
                        :alt="`${slot.name} artwork`"
                        class="size-full object-cover"
                        loading="lazy"
                      />
                      <span
                        class="absolute left-0.5 top-0.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-3xs font-semibold text-info-strong"
                      >
                        {{ getCreatureSlotScore(slot) }}
                      </span>
                      <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1.5 py-1">
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
                    <div class="flex size-full flex-col items-center justify-center gap-1">
                      <Plus class="size-4 text-muted-foreground/50" />
                      <span v-if="activeSlotIndex === index" class="text-3xs text-primary">{{
                        t('common.select')
                      }}</span>
                    </div>
                  </template>
                </div>
                <span
                  v-if="slot"
                  class="rounded-full bg-muted/40 px-2 py-0.5 text-3xs font-semibold text-foreground"
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
              {{ t('dungeons.partySummary') }}
            </h4>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">{{ t('dungeons.partyScore') }}</p>
                <p class="font-mono text-sm font-semibold text-primary">
                  {{ formatNumber(partyScore) }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">{{ t('dungeons.baseRating') }}</p>
                <p class="font-mono text-sm font-semibold">
                  {{ formatNumber(currentTierConfig.baseRating) }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">{{ t('dungeons.scoreRatio') }}</p>
                <p
                  class="font-mono text-sm font-semibold"
                  :class="
                    scoreRatio && scoreRatio >= 1 ? 'text-success-strong' : 'text-warning-strong'
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
                {{ t('dungeons.rewardsMultiplier', { n: currentGrade.multiplier }) }}
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
                  class="absolute -translate-x-1/2 text-3xs font-bold"
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
          <h2 class="text-base font-bold">{{ t('dungeons.selectCreature') }}</h2>
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
            :placeholder="t('dungeons.searchCreature')"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
          />

          <div class="flex flex-wrap gap-2">
            <button
              class="pill focus-ring gap-1.5"
              :class="ownedOnly ? 'pill-active' : ''"
              @click="ownedOnly = !ownedOnly"
            >
              <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
              {{ t('dungeons.summonedOnly') }}
            </button>
            <button
              class="pill focus-ring gap-1.5"
              :class="showExcludedCreatures ? 'pill-active' : ''"
              @click="showExcludedCreatures = !showExcludedCreatures"
            >
              {{ t('dungeons.showExcluded') }}
            </button>

            <div
              class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
              aria-live="polite"
            >
              {{ t('dungeons.creatures', { n: displayRecommended.length }) }}
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
              {{ t('dungeons.moreFilters') }}
            </button>

            <div
              class="mt-3 space-y-3"
              :class="showMoreCreatureFilters || hasSecondaryCreatureFilters ? 'block' : 'hidden'"
            >
              <!-- Type filter -->
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                  >{{ t('dungeons.type') }}</span
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
                  >{{ t('dungeons.tierFilter') }}</span
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
            <p class="text-2xs text-muted-foreground">
              {{ t('dungeons.levelHint') }}
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
                : 'border-border/50 bg-card/30 opacity-60'
            "
            @click="chooseCreature(creature)"
          >
            <div class="flex items-start gap-3">
              <RightClickHint @contextmenu="toggleInspectCreature(creature)">
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
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="helperCreatureIds.includes(creature.id)"
                    :src="helpersIcon"
                    alt="Helper"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="machineCreatureIds.includes(creature.id)"
                    :src="machinesIcon"
                    alt="Machine"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                  <img
                    v-else-if="expeditionCreatureIds.has(creature.id)"
                    :src="expeditionsIcon"
                    alt="Expedition"
                    class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
                    loading="lazy"
                  />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1">
                    <p
                      class="truncate font-semibold"
                      :class="isAwakened(creature.id) ? 'text-awakened-strong' : 'text-foreground'"
                    >
                      {{ creature.name }}
                    </p>
                    <span
                      v-if="isOwned(creature.id)"
                      class="text-xs"
                      :class="
                        isAwakened(creature.id) ? 'text-awakened-strong' : 'text-warning-strong'
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
              </RightClickHint>

              <div class="text-right" @click.stop>
                <p
                  class="mb-1 text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {{ t('common.lvl') }}
                  <span
                    v-if="suggestedLevel != null"
                    class="ml-1 normal-case tracking-normal"
                    :class="level >= suggestedLevel ? 'text-success-strong' : 'text-warning-strong'"
                  >
                    {{ t('common.suggested', { n: suggestedLevel }) }}
                  </span>
                </p>
                <div
                  class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
                >
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level <= 1"
                    :aria-label="t('dungeons.decreaseLevel')"
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
                    :aria-label="t('dungeons.creatureLevel')"
                    @blur="normalizeLevelOnBlur(creature.id, level, $event)"
                  />
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level >= 120"
                    :aria-label="t('dungeons.increaseLevel')"
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
                <span class="text-3xs font-bold uppercase tracking-wide text-muted-foreground">{{
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
            {{ t('dungeons.noCreaturesMatch') }}
          </div>
        </div>
      </section>
    </div>

    <CreatureDetail
      :creature="inspectedCreature"
      :open="creatureDrawerOpen"
      @close="closeCreatureDrawer"
    />
  </section>
</template>
