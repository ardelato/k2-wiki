<script setup lang="ts">
import { Check, Minus, Pencil, Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.webp'
import notSummonedIcon from '@/assets/icons/not_summoned.webp'
import summonedIcon from '@/assets/icons/summoned.webp'
import BeastiaryToolbar from '@/components/beastiary/BeastiaryToolbar.vue'
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import CreatureGrid from '@/components/beastiary/CreatureGrid.vue'
import CreaturesTable from '@/components/beastiary/CreaturesTable.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { toTitleCase, typeColor } from '@/utils/format'
import { jobIcons } from '@/utils/icons'

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


const {
  collection,
  isOwned,
  setOwned,
  setLevel,
  ownedCreatureIds,
  isAwakened,
  setAwakened,
  clampLevel,
} = useCreatureCollection()


const ownedFilter = ref<'all' | 'owned' | 'unowned'>('all')
const awakenedFilter = ref<'all' | 'awakened' | 'unawakened'>('all')
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
  const level = clampLevel(bulkLevel.value)
  for (const id of selectedIds.value) {
    if (isOwned(id)) setLevel(id, level)
  }
}


function bulkSetAwakened(awakened: boolean) {
  for (const id of selectedIds.value) {
    if (isOwned(id)) setAwakened(id, awakened)
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
  return filteredCreatures.value.filter((c) => {
    if (ownedFilter.value === 'owned' && !isOwned(c.id)) return false
    if (ownedFilter.value === 'unowned' && isOwned(c.id)) return false
    if (awakenedFilter.value === 'awakened' && !isAwakened(c.id)) return false
    if (awakenedFilter.value === 'unawakened' && isAwakened(c.id)) return false
    return true
  })
})


const groupedByTier = computed(() => {
  const groups: Record<number, typeof displayCreatures.value> = {}
  for (const c of displayCreatures.value) {
    if (!groups[c.tier]) groups[c.tier] = []
    groups[c.tier].push(c)
  }
  return Object.entries(groups)
    .toSorted(([a], [b]) => Number(a) - Number(b))
    .map(([tier, creatures]) => ({ tier: Number(tier), creatures }))
})


const viewMode = ref<'grid' | 'table'>('grid')


function clearFilters() {
  searchQuery.value = ''
  typeFilter.value = 'all'
  tierFilter.value = 'all'
  traitFilter.value = 'all'
  jobFilter.value = 'all'
  ownedFilter.value = 'all'
  awakenedFilter.value = 'all'
}


const activeFilters = computed<ActiveFilter[]>(() => {
  const filters: ActiveFilter[] = []
  if (searchQuery.value)
    filters.push({
      key: 'search',
      group: 'Search',
      label:
        searchQuery.value.length > 20 ? `${searchQuery.value.slice(0, 20)}…` : searchQuery.value,
    })
  if (typeFilter.value !== 'all')
    filters.push({
      key: 'type',
      group: 'Type',
      label: typeFilter.value,
      color: typeColor(typeFilter.value),
    })
  if (tierFilter.value !== 'all')
    filters.push({ key: 'tier', group: 'Tier', label: `T${(tierFilter.value as number) + 1}` })
  if (jobFilter.value !== 'all')
    filters.push({
      key: 'job',
      group: 'Job',
      label: toTitleCase(jobFilter.value),
      image: jobIcons[jobFilter.value.toLowerCase()],
    })
  if (traitFilter.value !== 'all')
    filters.push({ key: 'trait', group: 'Trait', label: toTitleCase(traitFilter.value) })
  if (ownedFilter.value !== 'all')
    filters.push({
      key: 'owned',
      group: 'Summoned',
      label: ownedFilter.value === 'owned' ? 'Summoned' : 'Not Summoned',
      image: ownedFilter.value === 'owned' ? summonedIcon : notSummonedIcon,
    })
  if (awakenedFilter.value !== 'all')
    filters.push({
      key: 'awakened',
      group: 'Awakened',
      label: awakenedFilter.value === 'awakened' ? 'Awakened' : 'Not Awakened',
      image: awakenedFilter.value === 'awakened' ? awakenedSummonedIcon : undefined,
    })
  return filters
})


function removeFilter(key: string) {
  switch (key) {
    case 'search':
      searchQuery.value = ''
      break
    case 'type':
      typeFilter.value = 'all'
      break
    case 'tier':
      tierFilter.value = 'all'
      break
    case 'job':
      jobFilter.value = 'all'
      break
    case 'trait':
      traitFilter.value = 'all'
      break
    case 'owned':
      ownedFilter.value = 'all'
      break
    case 'awakened':
      awakenedFilter.value = 'all'
      break
  }
}


const { selectedCreature, drawerOpen, openCreature, closeDrawer } = useCreatureDrawer()


const { t } = useI18n()
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <BeastiaryToolbar
      v-model:search-query="searchQuery"
      v-model:type-filter="typeFilter"
      v-model:tier-filter="tierFilter"
      v-model:trait-filter="traitFilter"
      v-model:job-filter="jobFilter"
      v-model:view-mode="viewMode"
      v-model:owned-filter="ownedFilter"
      v-model:awakened-filter="awakenedFilter"
      :owned-count="ownedCount"
      :result-count="displayCreatures.length"
      :trait-options="allTraits"
      :job-options="allJobs"
      :active-filters="activeFilters"
      @clear-all="clearFilters"
      @remove-filter="removeFilter"
    />

    <!-- Collection edit bar -->
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="!editing">
        <div class="ml-auto">
          <button
            class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
            @click="startEditing"
          >
            <Pencil class="size-4" />
            {{ t('beastiary.collection.editMyCollection') }}
          </button>
        </div>
      </template>

      <template v-else>
        <!-- Row 1: Selection + Done/Cancel -->
        <span
          class="inline-flex h-9 items-center rounded-full border border-primary/40 bg-primary/10 px-3 text-sm font-bold text-primary"
        >
          {{
            t('beastiary.collection.selected', {
              count: selectedIds.size,
              total: displayCreatures.length,
            })
          }}
        </span>

        <button
          class="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
          @click="selectAllVisible"
        >
          <Check class="size-4" />
          {{ t('beastiary.collection.selectAll') }}
        </button>
        <button
          class="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
          @click="deselectAllVisible"
        >
          {{ t('beastiary.collection.clear') }}
        </button>

        <div class="ml-auto flex items-center gap-2">
          <button
            class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition"
            @click="finishEditing"
          >
            <Pencil class="size-4" />
            {{ t('beastiary.collection.done') }}
          </button>
          <button
            class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
            @click="cancelEditing"
          >
            <X class="size-4" />
            {{ t('beastiary.collection.cancel') }}
          </button>
        </div>

        <!-- Row 2: Bulk actions -->
        <div class="flex w-full flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <!-- Summoning -->
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedIds.size"
            @click="bulkSetSummoned(true)"
          >
            <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
            {{ t('beastiary.collection.summoned') }}
          </button>
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedIds.size"
            @click="bulkSetSummoned(false)"
          >
            <img :src="notSummonedIcon" alt="" class="size-4" loading="lazy" />
            {{ t('beastiary.collection.notSummoned') }}
          </button>

          <div class="h-8 w-0.5 rounded-full bg-muted-foreground/30" />

          <!-- Awakening -->
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-pink-500/50 hover:text-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedIds.size"
            @click="bulkSetAwakened(true)"
          >
            <img :src="awakenedSummonedIcon" alt="" class="size-4" loading="lazy" />
            {{ t('beastiary.collection.awaken') }}
          </button>
          <button
            class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedIds.size"
            @click="bulkSetAwakened(false)"
          >
            {{ t('beastiary.collection.unawaken') }}
          </button>

          <div class="h-8 w-0.5 rounded-full bg-muted-foreground/30" />

          <!-- Level -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-muted-foreground">{{
              t('beastiary.collection.lvl')
            }}</span>
            <button
              class="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="bulkLevel <= 1"
              :aria-label="t('beastiary.collection.decreaseBulkLevel')"
              @click="bulkLevel = Math.max(1, bulkLevel - 1)"
            >
              <Minus class="size-3.5" />
            </button>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              class="focus-ring h-8 w-11 rounded-md border border-input bg-background/85 text-center font-mono text-sm font-semibold"
              :value="bulkLevel"
              :aria-label="t('beastiary.collection.bulkLevel')"
              @blur="
                bulkLevel = Math.max(
                  1,
                  Math.min(120, Math.round(Number(($event.target as HTMLInputElement).value) || 1)),
                )
              "
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
            <button
              class="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="bulkLevel >= 120"
              :aria-label="t('beastiary.collection.increaseBulkLevel')"
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
              :aria-label="t('beastiary.collection.bulkLevelSlider')"
              @input="bulkLevel = +($event.target as HTMLInputElement).value"
            />
            <button
              class="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!selectedIds.size"
              @click="bulkApplyLevel"
            >
              {{ t('beastiary.collection.setLevel') }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <div>
      <!-- Grid or Table -->
      <CreatureGrid
        v-if="viewMode === 'grid'"
        :groups="groupedByTier"
        :editing="editing"
        :selected-ids="selectedIds"
        :selected-creature-id="selectedCreature?.id ?? null"
        @select="openCreature"
        @toggle-selected="toggleSelected"
      />
      <CreaturesTable
        v-else
        :creatures="displayCreatures"
        :editing="editing"
        :selected-ids="selectedIds"
        :selected-creature-id="selectedCreature?.id ?? null"
        @select="openCreature"
        @toggle-selected="toggleSelected"
      />
    </div>

    <!-- Detail Panel -->
    <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
  </section>
</template>

<style scoped>
/* Level slider styling (for bulk level slider in edit bar) */
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
