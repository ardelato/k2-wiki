<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Minus, Pencil, Plus, TrendingUp, X } from 'lucide-vue-next'
import summonedIcon from '@/assets/icons/summoned.png'
import notSummonedIcon from '@/assets/icons/not_summoned.png'
import { useCreatures } from '@/composables/useCreatures'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import type { Creature, CreatureStats, Jobs } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { jobColors, jobLabels, statLabels, getBestExpeditionsForCreature } from '@/utils/formulas'
import { toTitleCase, typeColor, typeColorVar } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
import { useItems } from '@/composables/useItems'

const { getItemById } = useItems()
import StatRadarChart from '@/components/beastiary/StatRadarChart.vue'
import ProficiencyRing from '@/components/beastiary/ProficiencyRing.vue'
import BeastiaryToolbar from '@/components/beastiary/BeastiaryToolbar.vue'

const {
  filteredCreatures,
  searchQuery,
  typeFilter,
  tierFilter,
  traitFilter,
  jobFilter,
  allTraits,
  allJobs,
} = useCreatures()

const { collection, isOwned, setOwned, getLevel, toggleOwned, setLevel, ownedCreatureIds } = useCreatureCollection()

const ownedFilter = ref<'all' | 'owned' | 'unowned'>('all')
const editing = ref(false)
const bulkLevel = ref(1)

const ownedCount = computed(() => ownedCreatureIds.value.size)

// Selection state (separate from owned)
const selectedIds = ref(new Set<string>())

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectAllVisible() {
  const next = new Set(selectedIds.value)
  for (const c of displayCreatures.value) next.add(c.id)
  selectedIds.value = next
}

function deselectAllVisible() {
  const next = new Set(selectedIds.value)
  for (const c of displayCreatures.value) next.delete(c.id)
  selectedIds.value = next
}

// Bulk actions (apply to selected creatures)
function bulkSetSummoned(owned: boolean) {
  for (const id of selectedIds.value) {
    setOwned(id, owned)
  }
}

function bulkApplyLevel() {
  const level = clampCollectionLevel(bulkLevel.value)
  for (const id of selectedIds.value) {
    if (isOwned(id)) setLevel(id, level)
  }
}

// Snapshot collection on edit enter, restore on cancel
let collectionSnapshot: Record<string, any> = {}

function startEditing() {
  collectionSnapshot = JSON.parse(JSON.stringify(collection.value))
  editing.value = true
}

function finishEditing() {
  selectedIds.value = new Set()
  editing.value = false
}

function cancelEditing() {
  collection.value = collectionSnapshot
  selectedIds.value = new Set()
  editing.value = false
}

const displayCreatures = computed(() => {
  if (ownedFilter.value === 'all') return filteredCreatures.value
  return filteredCreatures.value.filter(c =>
    ownedFilter.value === 'owned' ? isOwned(c.id) : !isOwned(c.id)
  )
})

const groupedByTier = computed(() => {
  const groups: Record<number, typeof displayCreatures.value> = {}
  for (const c of displayCreatures.value) {
    if (!groups[c.tier]) groups[c.tier] = []
    groups[c.tier].push(c)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([tier, creatures]) => ({ tier: Number(tier), creatures }))
})

function clampCollectionLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
}

function stepCollectionLevel(id: string, delta: number) {
  setLevel(id, clampCollectionLevel(getLevel(id) + delta))
}

function normalizeCollectionLevelOnBlur(id: string, event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    setLevel(id, getLevel(id))
    return
  }
  const parsed = Number(target.value)
  setLevel(id, clampCollectionLevel(parsed))
}

const viewMode = ref<'grid' | 'table'>('grid')
const selectedCreature = ref<Creature | null>(null)

type SortKey = 'name' | 'tier' | 'type' | 'trait' | 'jobTotal' | keyof Jobs
const tableSortKey = ref<SortKey>('tier')
const tableSortDirection = ref<'asc' | 'desc'>('asc')

const panelOpen = ref(false)

watch(selectedCreature, (val) => {
  if (val) panelOpen.value = true
})

const jobEntries = computed(() => Object.entries(jobLabels) as [keyof Jobs, string][])
const statEntries = computed(() => Object.entries(statLabels) as [keyof CreatureStats, string][])

const sortedCreatures = computed(() => {
  const list = [...displayCreatures.value]
  list.sort((a, b) => {
    let result = 0

    const key = tableSortKey.value
    if (key === 'name') result = a.name.localeCompare(b.name)
    else if (key === 'tier') result = a.tier - b.tier
    else if (key === 'type') result = (a.types[0] ?? '').localeCompare(b.types[0] ?? '')
    else if (key === 'trait') result = a.trait.localeCompare(b.trait)
    else if (key === 'jobTotal') result = totalJobs(a) - totalJobs(b)
    else result = a.jobs[key] - b.jobs[key]

    return tableSortDirection.value === 'asc' ? result : -result
  })
  return list
})

function totalJobs(creature: Creature): number {
  return Object.values(creature.jobs).reduce((sum, value) => sum + value, 0)
}

function sortBy(key: SortKey) {
  if (tableSortKey.value === key) {
    tableSortDirection.value = tableSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  tableSortKey.value = key
  tableSortDirection.value = 'asc'
}

function selectCreature(creature: Creature) {
  selectedCreature.value = creature
}

function closeDetail() {
  panelOpen.value = false
  selectedCreature.value = null
}

function statHighlight(creature: Creature, statKey: keyof CreatureStats): string {
  const values = Object.values(creature.stats)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const val = creature.stats[statKey]
  if (val === max) return 'text-primary border-primary/40 bg-primary/10'
  if (val === min) return 'text-destructive border-destructive/40 bg-destructive/10'
  return 'text-foreground border-border bg-muted/35'
}

const selectedCreatureStats = computed<CreatureStats | undefined>(() => {
  if (!selectedCreature.value) return undefined
  const level = getLevel(selectedCreature.value.id)
  if (level <= 1) return undefined
  const base = selectedCreature.value.stats
  return {
    power: base.power * level,
    grit: base.grit * level,
    agility: base.agility * level,
    smarts: base.smarts * level,
    looting: base.looting * level,
    luck: base.luck * level,
  }
})

const bestExpeditions = computed(() => {
  if (!selectedCreature.value) return []
  return getBestExpeditionsForCreature(selectedCreature.value)
})

const maxJobLevel = 10
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <BeastiaryToolbar v-model:search-query="searchQuery" v-model:type-filter="typeFilter"
      v-model:tier-filter="tierFilter" v-model:trait-filter="traitFilter" v-model:job-filter="jobFilter"
      v-model:view-mode="viewMode" v-model:owned-filter="ownedFilter"
      :owned-count="ownedCount" :result-count="displayCreatures.length"
      :trait-options="allTraits" :job-options="allJobs" />

    <!-- Collection edit bar -->
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="!editing">
        <div class="ml-auto">
          <button
            class="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
            @click="startEditing"
          >
            <Pencil class="size-4" />
            Edit Collection
          </button>
        </div>
      </template>

      <template v-else>
        <!-- Selected count -->
        <span class="rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-bold text-primary">
          {{ selectedIds.size }} of {{ displayCreatures.length }} selected
        </span>

        <!-- Selection -->
        <button
          class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
          @click="selectAllVisible"
        >
          <Check class="size-3.5" />
          Select All
        </button>
        <button
          class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
          @click="deselectAllVisible"
        >
          Clear
        </button>

        <!-- Divider -->
        <div class="h-8 w-0.5 rounded-full bg-muted-foreground/30" />

        <!-- Summoning actions -->
        <button
          class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!selectedIds.size"
          @click="bulkSetSummoned(true)"
        >
          <img :src="summonedIcon" alt="" class="size-4" />
          Summoned
        </button>
        <button
          class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!selectedIds.size"
          @click="bulkSetSummoned(false)"
        >
          <img :src="notSummonedIcon" alt="" class="size-4" />
          Not Summoned
        </button>

        <!-- Divider -->
        <div class="h-8 w-0.5 rounded-full bg-muted-foreground/30" />

        <!-- Level -->
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-semibold text-muted-foreground">LVL</span>
          <button
            class="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="bulkLevel <= 1"
            aria-label="Decrease bulk level"
            @click="bulkLevel = Math.max(1, bulkLevel - 1)"
          >
            <Minus class="size-3.5" />
          </button>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="focus-ring h-8 w-11 rounded-md border border-input bg-background/85 text-center text-sm font-mono font-semibold"
            :value="bulkLevel"
            aria-label="Bulk level"
            @blur="bulkLevel = Math.max(1, Math.min(120, Math.round(Number(($event.target as HTMLInputElement).value) || 1)))"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <button
            class="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="bulkLevel >= 120"
            aria-label="Increase bulk level"
            @click="bulkLevel = Math.min(120, bulkLevel + 1)"
          >
            <Plus class="size-3.5" />
          </button>
          <input
            type="range"
            min="1"
            max="120"
            :value="bulkLevel"
            class="level-slider h-1.5 w-32 min-w-0 cursor-pointer"
            aria-label="Bulk level slider"
            @input="bulkLevel = +($event.target as HTMLInputElement).value"
          />
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedIds.size"
            @click="bulkApplyLevel"
          >
            Set Level
          </button>
        </div>

        <!-- Done/Cancel (right side) -->
        <div class="ml-auto flex items-center gap-2">
          <button
            class="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition"
            @click="finishEditing"
          >
            <Pencil class="size-4" />
            Done
          </button>
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
            @click="cancelEditing"
          >
            <X class="size-3.5" />
            Cancel
          </button>
        </div>
      </template>
    </div>

    <div>
        <div v-if="viewMode === 'grid'" class="space-y-6" :style="{ '--card-w': '220px' }">
          <div v-for="group in groupedByTier" :key="group.tier" class="space-y-3">
            <div class="flex items-center gap-3">
              <h2 class="shrink-0 text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Tier {{ group.tier + 1 }}
                <span class="ml-1 text-xs font-normal">
                  ({{ group.creatures.filter(c => isOwned(c.id)).length }}/{{ group.creatures.length }})
                </span>
              </h2>
              <div class="h-px flex-1 bg-border/60" />
            </div>
            <div class="flex flex-wrap justify-evenly gap-8">
          <div v-for="creature in group.creatures" :key="creature.id"
            class="group relative w-[var(--card-w)] cursor-pointer rounded-xl border transition" :class="[
              editing && selectedIds.has(creature.id)
                ? 'ring-2 ring-accent border-accent opacity-100'
                : isOwned(creature.id)
                  ? 'border-primary/40 ring-1 ring-primary/20'
                  : 'border-border/60 opacity-55',
              selectedCreature?.id === creature.id ? 'ring-2 ring-primary/60 border-primary/40 opacity-100' : '',
              editing ? '' : 'hover:-translate-y-0.5 hover:opacity-100 hover:shadow-glow'
            ]" @click="editing ? toggleSelected(creature.id) : selectCreature(creature)">
            <!-- Type gradient bar -->
            <div class="h-1 rounded-t-xl" :style="{
              background: creature.types.length > 1
                ? `linear-gradient(to right, ${typeColor(creature.types[0])}, ${typeColor(creature.types[1])})`
                : typeColor(creature.types[0])
            }" />

            <!-- Selection indicator (edit mode) -->
            <div v-if="editing"
              class="absolute -left-2.5 -top-2.5 z-20 flex size-6 items-center justify-center rounded-md border shadow-sm"
              :class="selectedIds.has(creature.id)
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'">
              <Check v-if="selectedIds.has(creature.id)" class="size-3.5" />
              <Plus v-else class="size-3.5" />
            </div>

            <!-- Summoned status icon -->
            <img
              :src="isOwned(creature.id) ? summonedIcon : notSummonedIcon"
              :alt="isOwned(creature.id) ? 'Summoned' : 'Not summoned'"
              class="absolute left-2.5 top-3.5 z-10 size-5 drop-shadow-md"
            />

            <!-- Tier badge -->
            <span
              class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground shadow-sm">
              T{{ creature.tier + 1 }}
            </span>

            <!-- Type chips -->
            <div class="absolute right-1.5 top-5 z-10 flex flex-col items-end gap-0.5">
              <span v-for="type in creature.types" :key="type"
                class="rounded-full px-1.5 py-px text-[10px] font-semibold leading-tight shadow-sm" :style="{
                  color: typeColor(type),
                  backgroundColor: `hsl(${typeColorVar(type)} / 0.2)`
                }">
                {{ type }}
              </span>
            </div>

            <!-- Hero image -->
            <div class="flex items-center justify-center px-4 pb-5 pt-6"
              :style="{ background: `linear-gradient(180deg, hsl(${typeColorVar(creature.types[0])} / 0.12) 0%, hsl(var(--card)) 100%)` }">
              <img :src="getCreatureImage(creature)" :alt="`${creature.name} artwork`"
                class="size-24 rounded-xl object-cover" loading="lazy" />
            </div>

            <!-- Divider -->
            <div class="h-px bg-border/60" />

            <!-- Footer info -->
            <div class="space-y-2 rounded-b-xl bg-card/80 px-3 pb-3 pt-2.5">
              <div class="text-center">
                <p class="truncate text-lg font-extrabold text-foreground">{{ creature.name }}</p>
                <p v-if="!editing && isOwned(creature.id)" class="font-mono text-[10px] text-muted-foreground">
                  LVL {{ getLevel(creature.id) }}
                </p>
              </div>

              <!-- Level hybrid slider-stepper (edit mode + owned) -->
              <div v-if="isOwned(creature.id) && editing" class="space-y-1.5" @click.stop>
                <!-- Stepper: [−] input [+] -->
                <div class="flex w-full items-center justify-center gap-1">
                  <button
                    class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="getLevel(creature.id) <= 1"
                    aria-label="Decrease level"
                    @click="stepCollectionLevel(creature.id, -1)"
                  >
                    <Minus class="size-3.5" />
                  </button>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="focus-ring h-7 w-12 rounded-md border border-input bg-background/85 text-center text-xs font-mono font-semibold"
                    :value="getLevel(creature.id)"
                    aria-label="Creature level"
                    @blur="normalizeCollectionLevelOnBlur(creature.id, $event)"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <button
                    class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="getLevel(creature.id) >= 120"
                    aria-label="Increase level"
                    @click="stepCollectionLevel(creature.id, 1)"
                  >
                    <Plus class="size-3.5" />
                  </button>
                </div>
                <!-- Range slider -->
                <input
                  type="range"
                  min="1"
                  max="120"
                  :value="getLevel(creature.id)"
                  class="level-slider h-1.5 w-full cursor-pointer"
                  aria-label="Level slider"
                  @input="setLevel(creature.id, +($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>

        <div v-else class="surface-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm" role="grid">
              <thead class="bg-muted/50">
                <tr>
                  <th class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'name' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy('name')">
                      Name
                      <span :class="tableSortKey === 'name' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection ===
                        'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'tier' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy('tier')">
                      Tier
                      <span :class="tableSortKey === 'tier' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection ===
                        'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'type' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy('type')">
                      Type
                      <span :class="tableSortKey === 'type' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection ===
                        'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'trait' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy('trait')">
                      Trait
                      <span :class="tableSortKey === 'trait' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection ===
                        'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th v-for="[jobKey, jobName] in jobEntries" :key="jobKey"
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === jobKey ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy(jobKey)">
                      <span class="inline-block size-1.5 rounded-full"
                        :style="{ backgroundColor: jobColors[jobKey] }"></span>
                      {{ jobName.slice(0, 3) }}
                      <span :class="tableSortKey === jobKey ? 'text-primary' : 'opacity-0'">{{ tableSortDirection ===
                        'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'jobTotal' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                      @click="sortBy('jobTotal')">
                      Total
                      <span :class="tableSortKey === 'jobTotal' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection
                        === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60">
                <tr v-for="creature in sortedCreatures" :key="creature.id"
                  class="cursor-pointer transition-colors duration-150"
                  :class="selectedCreature?.id === creature.id ? 'bg-muted/40' : 'bg-card/50 hover:bg-muted/30'"
                  @click="selectCreature(creature)">
                  <td class="border-l-2 px-2 py-2.5"
                    :style="{ borderColor: selectedCreature?.id === creature.id ? typeColor(creature.types[0]) : 'transparent' }">
                    <div class="flex items-center gap-3">
                      <div
                        class="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border text-xs font-bold text-muted-foreground"
                        :style="{ backgroundColor: 'hsl(' + typeColorVar(creature.types[0]) + ' / 0.1)' }">
                        <img v-if="getCreatureImage(creature)" :src="getCreatureImage(creature)"
                          :alt="`${creature.name} artwork`" class="size-10 rounded-lg border border-border object-cover"
                          loading="lazy" />
                        <span v-else>{{ creature.name.charAt(0) }}</span>
                      </div>
                      <span class="font-semibold text-foreground">{{ creature.name }}</span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5 font-mono text-xs text-muted-foreground">T{{ creature.tier + 1 }}</td>
                  <td class="px-2 py-2.5">
                    <div class="flex flex-wrap gap-1">
                      <span v-for="type in creature.types" :key="type"
                        class="rounded-full px-2 py-0.5 text-xs font-semibold"
                        :style="{ color: typeColor(type), backgroundColor: 'hsl(' + typeColorVar(type) + ' / 0.12)' }">
                        {{ type }}
                      </span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5">
                    <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
                  </td>
                  <td v-for="[jobKey] in jobEntries" :key="jobKey" class="px-2 py-2.5">
                    <div class="flex items-center gap-2">
                      <div class="relative h-2 w-10 overflow-hidden rounded-full bg-muted/60">
                        <div class="absolute inset-y-0 left-0 rounded-full"
                          :style="{ width: (creature.jobs[jobKey] / maxJobLevel) * 100 + '%', backgroundColor: jobColors[jobKey] }" />
                      </div>
                      <span class="w-4 text-right font-mono text-xs font-semibold text-muted-foreground">{{
                        creature.jobs[jobKey] }}</span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5 font-mono text-xs font-semibold text-foreground">{{ totalJobs(creature) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
    </div>

    <!-- Slide-in Detail Panel -->
    <Teleport to="body">
      <!-- Backdrop -->
      <Transition name="fade">
        <div
          v-if="panelOpen && selectedCreature"
          class="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
          @click="closeDetail"
        />
      </Transition>

      <!-- Panel -->
      <Transition name="slide">
        <div
          v-if="panelOpen && selectedCreature"
          class="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] overflow-y-auto border-l border-border bg-card shadow-2xl"
        >
          <!-- Gradient header with centered hero -->
          <div class="relative flex flex-col items-center px-5 pb-4 pt-6" :style="{
            background: `linear-gradient(180deg, hsl(${typeColorVar(selectedCreature.types[0])} / 0.15) 0%, transparent 100%)`
          }">
            <button
              class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground"
              @click="closeDetail"
            >
              <X class="size-4" />
            </button>

            <img :src="getCreatureImage(selectedCreature)" :alt="`${selectedCreature.name} artwork`"
              class="size-24 rounded-2xl border-2 border-border object-cover shadow-lg"
              :style="{ backgroundColor: `hsl(${typeColorVar(selectedCreature.types[0])} / 0.1)` }" />
            <h2 class="mt-3 text-center text-2xl font-black leading-tight">{{ selectedCreature.name }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              T{{ selectedCreature.tier + 1 }} · {{ toTitleCase(selectedCreature.mainJob) }}
            </p>
            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <span v-for="type in selectedCreature.types" :key="type"
                class="rounded-full px-3 py-1 text-xs font-semibold" :style="{
                  color: typeColor(type),
                  backgroundColor: `hsl(${typeColorVar(type)} / 0.12)`
                }">
                {{ type }}
              </span>
              <span class="trait-chip">
                {{ toTitleCase(selectedCreature.trait) }}
              </span>
            </div>
          </div>

          <div class="space-y-5 px-5 pb-5">
            <!-- Description -->
            <div class="border-t border-border/60 pt-4">
              <p class="text-sm leading-relaxed text-muted-foreground">
                {{ selectedCreature.description }}
              </p>
            </div>

            <!-- Collection -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Collection</h3>
              <div class="space-y-3">
                <label
                  class="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <span class="text-sm font-medium text-foreground">Summoned</span>
                  <button role="switch" :aria-checked="isOwned(selectedCreature.id)"
                    class="focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                    :class="isOwned(selectedCreature.id) ? 'bg-primary' : 'bg-muted'"
                    @click="toggleOwned(selectedCreature.id)">
                    <span class="inline-block size-4 rounded-full bg-white shadow-sm transition-transform"
                      :class="isOwned(selectedCreature.id) ? 'translate-x-6' : 'translate-x-1'" />
                  </button>
                </label>
                <div v-if="isOwned(selectedCreature.id)"
                  class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <span class="text-sm font-medium text-foreground">Level</span>
                  <div
                    class="ml-auto inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85">
                    <button
                      class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="getLevel(selectedCreature.id) <= 1" aria-label="Decrease creature level"
                      @click="stepCollectionLevel(selectedCreature.id, -1)">
                      <Minus class="size-3" />
                    </button>
                    <input type="text" inputmode="numeric" pattern="[0-9]*"
                      class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center text-xs font-mono"
                      :value="getLevel(selectedCreature.id)" aria-label="Creature level"
                      @blur="normalizeCollectionLevelOnBlur(selectedCreature.id, $event)" />
                    <button
                      class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="getLevel(selectedCreature.id) >= 120" aria-label="Increase creature level"
                      @click="stepCollectionLevel(selectedCreature.id, 1)">
                      <Plus class="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Plan Leveling Link -->
            <section class="border-t border-border/60 pt-4">
              <router-link
                :to="{ path: '/planner', query: { tab: 'levelup', creature: selectedCreature.id } }"
                class="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/12 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/18"
              >
                <TrendingUp class="size-4" />
                Plan Leveling
              </router-link>
            </section>

            <!-- Stats with Radar Chart -->
            <section class="border-t border-border/60 pt-4">
              <div class="mb-3 flex items-baseline justify-between">
                <h3 class="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Stats</h3>
                <span v-if="selectedCreatureStats" class="font-mono text-[10px] text-muted-foreground">
                  LVL {{ getLevel(selectedCreature.id) }}
                </span>
              </div>
              <div class="flex justify-center">
                <StatRadarChart :creature="selectedCreature" :stats-override="selectedCreatureStats" :size="180" />
              </div>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div v-for="[statKey, statLabel] in statEntries" :key="statKey"
                  class="rounded-lg border px-2 py-2 text-center transition-colors"
                  :class="statHighlight(selectedCreature, statKey)">
                  <p class="font-mono text-xs">{{ (selectedCreatureStats ?? selectedCreature.stats)[statKey] }}</p>
                  <p v-if="selectedCreatureStats" class="font-mono text-[10px] text-muted-foreground/60">(BASE {{
                    selectedCreature.stats[statKey] }})</p>
                  <p class="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{{ statLabel }}</p>
                </div>
              </div>
            </section>

            <!-- Job Levels with Proficiency Rings -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Job Levels</h3>
              <div class="flex flex-wrap justify-center gap-3">
                <ProficiencyRing v-for="[jobKey, jobName] in jobEntries" :key="jobKey" :label="jobName.slice(0, 3)"
                  :value="selectedCreature.jobs[jobKey]" :max-value="maxJobLevel" :color="jobColors[jobKey]"
                  size="sm" />
              </div>
            </section>

            <!-- Best Expeditions -->
            <section v-if="bestExpeditions.length" class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Best Expeditions</h3>
              <div class="space-y-2">
                <router-link v-for="(entry, index) in bestExpeditions" :key="entry.expedition.id" :to="{ path: '/expeditions', query: { expedition: entry.expedition.id } }"
                  class="block rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:border-accent/45 hover:bg-muted/30">
                  <div class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                      <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ index + 1 }}.</span>
                      <img
                        v-if="entry.expedition.rewards.length && getItemImage({ id: entry.expedition.rewards[0].itemId })"
                        :src="getItemImage({ id: entry.expedition.rewards[0].itemId })"
                        :alt="toTitleCase(entry.expedition.rewards[0].itemId)"
                        class="size-5 shrink-0 object-contain" />
                      <span class="truncate">{{ entry.expedition.name }}</span>
                    </span>
                    <span class="shrink-0 font-mono text-xs font-semibold text-primary">{{ entry.score }}%</span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{{ entry.biomeName }}</span>
                    <span v-if="entry.traitMatch" class="text-primary">· Trait ✓</span>
                    <span v-if="entry.biomeStatus === 'advantage'" class="text-green-500">· ▲ Advantage</span>
                    <span v-if="entry.biomeStatus === 'disadvantage'" class="text-destructive">· ▼ Disadvantage</span>
                  </div>
                </router-link>
              </div>
            </section>

            <!-- Summoning Cost -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Summoning Cost</h3>
              <div class="space-y-2">
                <router-link v-for="cost in selectedCreature.summoningCost" :key="cost.id"
                  :to="{ path: '/items', query: { item: cost.id } }"
                  class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:border-accent/45 hover:bg-muted/30">
                  <img v-if="getItemImage({ id: cost.id })" :src="getItemImage({ id: cost.id })"
                    :alt="getItemById(cost.id)?.name ?? toTitleCase(cost.id)" class="size-5 shrink-0 object-contain" />
                  <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <span class="flex-1 text-sm text-foreground">{{ getItemById(cost.id)?.name ?? toTitleCase(cost.id) }}</span>
                  <span class="font-mono text-sm font-semibold text-muted-foreground">x{{ cost.amount }}</span>
                </router-link>
              </div>
            </section>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* Level slider styling */
.level-slider {
  -webkit-appearance: none;
  appearance: none;
  border-radius: 3px;
  background: hsl(var(--muted));
}
.level-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: hsl(var(--primary));
  cursor: pointer;
  margin-top: -4px;
}
.level-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: hsl(var(--primary));
  cursor: pointer;
}
.level-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: hsl(var(--muted));
}
.level-slider::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: hsl(var(--muted));
}
</style>
