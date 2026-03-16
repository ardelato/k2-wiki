<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Compass, Minus, Plus, Target, X } from 'lucide-vue-next'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditions } from '@/composables/useExpeditions'
import { getCreatureImage } from '@/utils/creatureImages'
import { statAbbreviations, statLabels, tierModifiers } from '@/utils/formulas'
import { formatDuration, toTitleCase } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
import type { Creature, ElementType, ExpeditionStatWeights } from '@/types'

const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')

const { creatures } = useCreatures()
const {
  filteredExpeditions,
  selectedExpedition,
  selectedTier,
  partySlots,
  activeSlotIndex,
  recommendedCreatures,
  difficultyRating,
  partyScore,
  estimatedDuration,
  scoreRatio,
  loopCount,
  loopBonusPercent,
  totalXp,
  xpPerMinute,
  partyXpProgress,
  assignCreatureToSlot,
  removeCreatureFromSlot,
  setActiveSlot,
  getCreatureSlotRating,
  updateCreatureLevel,
} = useExpeditions(creatures.value)

const creatureTypes: ElementType[] = ['Fire', 'Water', 'Wind', 'Earth']
const creatureSearch = ref('')
const selectedCreatureTypes = ref<ElementType[]>([...creatureTypes])
const selectedCreatureTiers = ref<number[]>([])

type MobileSection = 'list' | 'details' | 'creature'

function normalizeSection(value: unknown): MobileSection {
  if (value === 'details') return 'details'
  if (value === 'creature') return 'creature'
  return 'list'
}

const mobileSection = computed<MobileSection>({
  get() {
    return normalizeSection(route.query.section)
  },
  set(value) {
    const nextQuery = { ...route.query, section: value }
    router.replace({ query: nextQuery })
  },
})

watch(selectedExpedition, (exp) => {
  if (exp && !isDesktop.value && mobileSection.value === 'list') {
    mobileSection.value = 'details'
  }
})

const weightedStats = computed(() => {
  if (!selectedExpedition.value) return []
  return Object.entries(selectedExpedition.value.statWeights).filter(([, weight]) => weight > 0) as [keyof ExpeditionStatWeights, number][]
})

const creatureTierOptions = computed(() => {
  const tiers = new Set(recommendedCreatures.value.map(({ creature }) => creature.tier))
  return Array.from(tiers).sort((a, b) => a - b)
})

const allCreatureTypesSelected = computed(() => {
  return creatureTypes.every(type => selectedCreatureTypes.value.includes(type))
})

const allCreatureTiersSelected = computed(() => {
  return creatureTierOptions.value.length > 0 &&
    creatureTierOptions.value.every(tier => selectedCreatureTiers.value.includes(tier))
})

watch(creatureTierOptions, (tiers) => {
  const preserved = selectedCreatureTiers.value.filter(tier => tiers.includes(tier))
  selectedCreatureTiers.value = preserved.length ? preserved : [...tiers]
}, { immediate: true })

const filteredRecommended = computed(() => {
  return recommendedCreatures.value.filter(({ creature }) => {
    const query = creatureSearch.value.toLowerCase()
    const matchesSearch =
      creature.name.toLowerCase().includes(query) ||
      creature.trait.toLowerCase().includes(query)
    const matchesType = selectedCreatureTypes.value.some(type => creature.types.includes(type))
    const matchesTier = selectedCreatureTiers.value.length === 0 || selectedCreatureTiers.value.includes(creature.tier)
    return matchesSearch && matchesType && matchesTier
  })
})

const hasEmptySlot = computed(() => partySlots.value.some(s => s === null))

function selectExpedition(expedition: typeof filteredExpeditions.value[number]) {
  selectedExpedition.value = expedition
}

function chooseExpedition(expedition: typeof filteredExpeditions.value[number]) {
  selectExpedition(expedition)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}

function chooseCreature(creature: Creature) {
  if (!hasEmptySlot.value) return
  assignCreatureToSlot(creature)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}

function typeColor(type: ElementType): string {
  if (type === 'Fire') return 'hsl(var(--type-fire))'
  if (type === 'Water') return 'hsl(var(--type-water))'
  if (type === 'Wind') return 'hsl(var(--type-wind))'
  return 'hsl(var(--type-earth))'
}

function statBar(creature: Creature, key: keyof ExpeditionStatWeights): number {
  return Math.min(100, creature.stats[key])
}

function rowSelected(id: string): boolean {
  return selectedExpedition.value?.id === id
}

function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
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

function stepCreatureLevel(creatureId: string, currentLevel: number, delta: number) {
  updateCreatureLevel(creatureId, clampLevel(currentLevel + delta))
}

function clampLoopCount(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(200, Math.round(value)))
}

function stepLoopCount(delta: number) {
  loopCount.value = clampLoopCount(loopCount.value + delta)
}

function normalizeLoopCountOnBlur(event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    loopCount.value = 0
    return
  }
  const parsed = Number(target.value)
  loopCount.value = clampLoopCount(parsed)
}

function selectAllCreatureTypes() {
  selectedCreatureTypes.value = [...creatureTypes]
}

function toggleCreatureType(type: ElementType) {
  if (allCreatureTypesSelected.value) {
    selectedCreatureTypes.value = [type]
    return
  }
  if (selectedCreatureTypes.value.includes(type)) {
    if (selectedCreatureTypes.value.length === 1) return
    selectedCreatureTypes.value = selectedCreatureTypes.value.filter(selected => selected !== type)
    return
  }
  selectedCreatureTypes.value = [...selectedCreatureTypes.value, type]
}

function selectAllCreatureTiers() {
  selectedCreatureTiers.value = [...creatureTierOptions.value]
}

function toggleCreatureTier(tier: number) {
  if (allCreatureTiersSelected.value) {
    selectedCreatureTiers.value = [tier]
    return
  }
  if (selectedCreatureTiers.value.includes(tier)) {
    if (selectedCreatureTiers.value.length === 1) return
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter(selected => selected !== tier)
    return
  }
  selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
}

</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <div class="surface-card p-2 lg:hidden">
      <div class="grid grid-cols-3 gap-2">
        <button class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="mobileSection === 'list' ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-muted/45 text-muted-foreground'"
          @click="mobileSection = 'list'">
          List
        </button>
        <button class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="mobileSection === 'details' ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-muted/45 text-muted-foreground'"
          @click="mobileSection = 'details'">
          Details
        </button>
        <button class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="mobileSection === 'creature' ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-muted/45 text-muted-foreground'"
          @click="mobileSection = 'creature'">
          Creature
        </button>
      </div>
    </div>

    <div
      class="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12rem)] lg:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)_minmax(320px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <section class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'list' ? 'hidden' : ''">
        <div class="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Expeditions</h2>
        </div>

        <div class="max-h-[62vh] overflow-y-auto lg:min-h-0 lg:max-h-none lg:flex-1">
          <button v-for="expedition in filteredExpeditions" :key="expedition.id"
            class="focus-ring block w-full border-b border-border/55 px-4 py-3 text-left transition hover:bg-muted/35"
            :class="rowSelected(expedition.id) ? 'bg-primary/20 border-l-2 border-l-primary' : ''"
            @click="chooseExpedition(expedition)">
            <div class="flex items-start justify-between gap-2">
              <p class="line-clamp-1 font-semibold text-foreground">{{ expedition.name }}</p>
              <span class="font-mono text-sm text-primary">{{ expedition.baseRating }}</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{{ toTitleCase(expedition.biome) }}</span>
              <span>•</span>
              <span class="trait-chip" :class="expedition.trait ? '' : 'trait-chip-muted'">
                {{ expedition.trait ? toTitleCase(expedition.trait) : 'None' }}
              </span>
              <span>•</span>
              <span>{{ formatDuration(expedition.baseDuration) }}</span>
            </div>
          </button>

          <div v-if="filteredExpeditions.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
            No expeditions match your filters.
          </div>
        </div>
      </section>

      <section class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'details' ? 'hidden' : ''">
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Expedition Details</h2>
        </div>

        <div v-if="selectedExpedition"
          class="max-h-[62vh] space-y-4 overflow-y-auto p-4 animate-fade-in lg:min-h-0 lg:max-h-none lg:flex-1">
          <div>
            <h3 class="text-2xl font-black leading-tight">{{ selectedExpedition.name }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{{ selectedExpedition.description }}</p>
          </div>

          <!-- Tier & Loop Count -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Tier</h4>
              <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
                <button v-for="t in 5" :key="t"
                  class="focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition"
                  :class="selectedTier === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                  @click="selectedTier = t">
                  T{{ t }}
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Loop Count</h4>
              <div class="flex items-center gap-2">
                <div class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85">
                  <button
                    class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="loopCount <= 0" aria-label="Decrease loop count by 10" @click="stepLoopCount(-10)">
                    <Minus class="size-3" />
                  </button>
                  <input type="text" inputmode="numeric" pattern="[0-9]*"
                    class="focus-ring h-8 w-14 border-x border-input bg-transparent text-center text-sm font-mono"
                    :value="loopCount" aria-label="Loop count" @blur="normalizeLoopCountOnBlur($event)" />
                  <button
                    class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="loopCount >= 200" aria-label="Increase loop count by 10" @click="stepLoopCount(10)">
                    <Plus class="size-3" />
                  </button>
                </div>
                <span v-if="loopBonusPercent > 0"
                  class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                  +{{ loopBonusPercent }}%
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground">+1% XP per 10 loops, max +20%</p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Difficulty</p>
              <p class="font-mono text-lg font-semibold">{{ difficultyRating }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Biome</p>
              <p class="font-semibold">{{ toTitleCase(selectedExpedition.biome) }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Trait</p>
              <p class="font-semibold text-amber-300">{{ selectedExpedition.trait ?
                toTitleCase(selectedExpedition.trait) : 'None' }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Base XP (Pool)</p>
              <p class="font-semibold">{{ selectedExpedition.baseXP }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">XP / Creature</p>
              <p class="font-semibold">{{ totalXp ? totalXp.toLocaleString() : '—' }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Max Party</p>
              <p class="font-semibold">{{ selectedExpedition.maxPartySize }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Required Clears</p>
              <p class="font-semibold">{{ selectedExpedition.requiredExpeditionCompletions }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Stat Weights</h4>
            <div v-for="[key, weight] in weightedStats" :key="key"
              class="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-2">
              <span class="text-xs text-muted-foreground">{{ statLabels[key] }}</span>
              <div class="h-2 rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary" :style="{ width: `${weight * 100}%` }" />
              </div>
              <span class="text-right text-xs font-semibold text-foreground">{{ Math.round(weight * 100) }}%</span>
            </div>
          </div>

          <!-- Party Slots -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Party</h4>
            <div class="flex flex-wrap gap-2">
              <div v-for="(slot, index) in partySlots" :key="index"
                class="relative size-20 overflow-hidden rounded-lg border transition" :class="[
                  slot
                    ? 'border-border bg-card/50'
                    : activeSlotIndex === index
                      ? 'border-primary bg-primary/10 border-dashed'
                      : 'border-border/50 border-dashed bg-muted/20 hover:border-accent/45 cursor-pointer',
                ]" @click="!slot ? setActiveSlot(index) : undefined">
                <template v-if="slot">
                  <img :src="getCreatureImage(slot)" :alt="`${slot.name} artwork`" class="size-full object-cover" />
                  <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/75 px-1.5 py-1">
                    <p class="min-w-0 truncate text-[10px] font-semibold text-white">{{ slot.name }}</p>
                    <span class="shrink-0 font-mono text-[10px] font-semibold text-primary">{{
                      getCreatureSlotRating(slot) }}</span>
                  </div>
                  <button
                    class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                    @click.stop="removeCreatureFromSlot(index)">
                    <X class="size-3" />
                  </button>
                </template>
                <template v-else>
                  <div class="flex size-full flex-col items-center justify-center gap-1">
                    <Plus class="size-4 text-muted-foreground/50" />
                    <span v-if="activeSlotIndex === index" class="text-[9px] text-primary">Select</span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Party Summary -->
          <div v-if="partyScore > 0" class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Party Summary</h4>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Party Score</p>
                <p class="font-mono text-sm font-semibold text-primary">{{ partyScore }}</p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Difficulty</p>
                <p class="font-mono text-sm font-semibold">{{ difficultyRating }}</p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Score Ratio</p>
                <p class="font-mono text-sm font-semibold"
                  :class="scoreRatio && scoreRatio >= 1 ? 'text-emerald-400' : 'text-amber-400'">
                  {{ scoreRatio ? scoreRatio.toFixed(2) : '—' }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Duration / Run</p>
                <p class="font-mono text-sm font-semibold">{{ estimatedDuration ? formatDuration(estimatedDuration) :
                  '—' }}</p>
                <p v-if="loopCount > 0 && estimatedDuration" class="mt-0.5 text-[10px] text-muted-foreground">
                  {{ formatDuration(estimatedDuration * loopCount) }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">XP / Creature</p>
                <p class="font-mono text-sm font-semibold">
                  {{ totalXp ? totalXp.toLocaleString() : '—' }}
                  <span v-if="loopBonusPercent > 0 && totalXp"
                    class="ml-0.5 inline-block rounded bg-emerald-500/15 px-1 py-px text-[10px] font-semibold text-emerald-400">
                    +{{ loopBonusPercent }}%
                  </span>
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">XP Rate</p>
                <div class="flex items-center justify-center gap-2">
                  <p class="font-mono text-sm font-semibold">{{ xpPerMinute ? xpPerMinute.toLocaleString() : '—' }}<span
                      class="text-[10px] text-muted-foreground">/m</span></p>
                  <div class="h-4 border-l border-border/50" />
                  <p class="font-mono text-sm font-semibold">{{ xpPerMinute ? (xpPerMinute / 60).toFixed(2) : '—'
                  }}<span class="text-[10px] text-muted-foreground">/s</span></p>
                </div>
              </div>
            </div>

            <div v-if="partyXpProgress.length" class="space-y-1.5">
              <div v-for="entry in partyXpProgress" :key="entry.creature.id" class="flex items-center gap-2">
                <span class="w-16 shrink-0 truncate font-mono text-[10px] font-semibold text-muted-foreground">
                  {{ entry.creature.name }}
                </span>
                <span class="w-7 shrink-0 text-right font-mono text-[10px] font-semibold text-muted-foreground">
                  {{ entry.currentLevel }}
                </span>
                <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                    :style="{ width: `${entry.progress * 100}%` }" />
                </div>
                <span class="w-7 shrink-0 font-mono text-[10px] font-semibold text-foreground">
                  {{ entry.targetLevel }}
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Rewards</h4>
            <div class="flex flex-wrap gap-2">
              <span v-for="reward in selectedExpedition.rewards" :key="reward.itemId"
                class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/45 px-3 py-1 text-xs font-mono">
                <img v-if="getItemImage({ id: reward.itemId })" :src="getItemImage({ id: reward.itemId })"
                  :alt="toTitleCase(reward.itemId)" class="size-4 object-contain" />
                {{ reward.amount * tierModifiers.loot[selectedTier - 1] }}x {{ toTitleCase(reward.itemId) }}
              </span>
            </div>
          </div>
        </div>

        <div v-else
          class="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
          <Compass class="size-8 text-accent/65" />
          <p class="text-sm">Select an expedition from the list.</p>
        </div>
      </section>

      <section class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'creature' ? 'hidden' : ''">
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Select Creature</h2>
        </div>

        <div class="space-y-3 border-b border-border/70 px-4 py-3">
          <input v-model="creatureSearch" type="text" placeholder="Search creature"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm" />

          <div class="flex flex-wrap gap-2">
            <button class="pill focus-ring" :class="allCreatureTypesSelected ? 'pill-active' : ''"
              @click="selectAllCreatureTypes">
              All
            </button>
            <button v-for="type in creatureTypes" :key="type" class="pill focus-ring"
              :class="selectedCreatureTypes.includes(type) ? 'pill-active' : ''" @click="toggleCreatureType(type)">
              {{ type }}
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <button class="pill focus-ring font-mono" :class="allCreatureTiersSelected ? 'pill-active' : ''"
              @click="selectAllCreatureTiers">
              All Tiers
            </button>
            <button v-for="tier in creatureTierOptions" :key="tier" class="pill focus-ring font-mono"
              :class="selectedCreatureTiers.includes(tier) ? 'pill-active' : ''" @click="toggleCreatureTier(tier)">
              T{{ tier + 1 }}
            </button>
          </div>

          <div v-if="weightedStats.length" class="flex items-center gap-1.5">
            <Target class="size-4 text-accent" />
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Focus</span>
            <span v-for="[key] in weightedStats" :key="key"
              class="rounded-md border border-accent/35 bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">
              {{ statAbbreviations[key] }}
            </span>
          </div>
        </div>

        <div class="max-h-[58vh] space-y-2 overflow-y-auto p-3 lg:min-h-0 lg:max-h-none lg:flex-1">
          <button v-for="{ creature, rating, level, suggestedLevel } in filteredRecommended" :key="creature.id"
            class="focus-ring block w-full rounded-xl border px-3 py-3 text-left transition" :class="hasEmptySlot
              ? 'border-border bg-card/50 hover:border-accent/45 hover:bg-muted/25'
              : 'border-border/50 bg-card/30 opacity-60 cursor-not-allowed'" @click="chooseCreature(creature)">
            <div class="flex items-start gap-3">
              <img :src="getCreatureImage(creature)" :alt="`${creature.name} artwork`"
                class="size-10 rounded-md border border-border object-cover" />

              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-foreground">{{ creature.name }}</p>
                <div class="mt-1 flex flex-wrap gap-1 text-xs">
                  <span v-for="type in creature.types" :key="type"
                    class="rounded-full bg-muted px-2 py-0.5 font-semibold" :style="{ color: typeColor(type) }">
                    {{ type }}
                  </span>
                  <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
                </div>
              </div>

              <div class="text-right" @click.stop>
                <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Lvl
                  <span v-if="suggestedLevel != null" class="ml-1 normal-case tracking-normal"
                    :class="level >= suggestedLevel ? 'text-emerald-400' : 'text-amber-400'">
                    (Suggested: {{ suggestedLevel }})
                  </span>
                </p>
                <div class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85">
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level <= 1" aria-label="Decrease creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, -1)">
                    <Minus class="size-3" />
                  </button>
                  <input type="text" inputmode="numeric" pattern="[0-9]*"
                    class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center text-xs font-mono"
                    :value="level" aria-label="Creature level"
                    @blur="normalizeLevelOnBlur(creature.id, level, $event)" />
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level >= 120" aria-label="Increase creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, 1)">
                    <Plus class="size-3" />
                  </button>
                </div>
                <p class="mt-1 font-mono text-sm font-semibold text-primary">{{ rating }}</p>
              </div>
            </div>

            <div v-if="weightedStats.length" class="mt-3 space-y-1.5">
              <div v-for="[key, weight] in weightedStats" :key="key"
                class="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{
                  statAbbreviations[key]
                }}</span>
                <div class="h-1.5 rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary"
                    :style="{ width: `${statBar(creature, key)}%`, opacity: 0.45 + weight * 0.55 }" />
                </div>
              </div>
            </div>
          </button>

          <div v-if="filteredRecommended.length === 0"
            class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground">
            {{ selectedExpedition ? 'No creatures match your creature filters.' : 'Select an expedition first.' }}
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
