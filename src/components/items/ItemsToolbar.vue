<script setup lang="ts">
import { Columns3, Grid2x2, Search, SlidersHorizontal } from 'lucide-vue-next'
import { ref, computed } from 'vue'

import type { SourceCategory } from '@/composables/useItems'
import type { ItemType } from '@/types'
import { itemTypeColor, sourceLabel } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'

const props = defineProps<{
  searchQuery: string
  typeFilter: ItemType | 'all'
  sourceFilter: SourceCategory
  viewMode: 'grid' | 'table'
  resultCount: number
  sourceSubFilter: Set<string>
  availableSubFilters: string[]
}>()


const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:typeFilter': [value: ItemType | 'all']
  'update:sourceFilter': [value: SourceCategory]
  'update:viewMode': [value: 'grid' | 'table']
  'toggle-sub-filter': [value: string]
  'clear-sub-filters': []
}>()


const hasActiveFilters = computed(
  () =>
    props.typeFilter !== 'all' ||
    props.sourceFilter !== 'all' ||
    props.searchQuery !== '' ||
    props.sourceSubFilter.size > 0,
)


function selectSource(value: SourceCategory) {
  if (props.sourceFilter !== value) emit('clear-sub-filters')
  emit('update:sourceFilter', value)
}


function clearAllFilters() {
  emit('update:searchQuery', '')
  emit('update:typeFilter', 'all')
  emit('update:sourceFilter', 'all')
  emit('clear-sub-filters')
}


const typeOptions: Array<{ value: ItemType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Container', label: 'Container' },
  { value: 'Gathered', label: 'Gathered' },
  { value: 'Refined', label: 'Refined' },
  { value: 'Sellable', label: 'Sellable' },
  { value: 'Consumable', label: 'Consumable' },
]


const sourceOptions: Array<{ value: SourceCategory; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 'job', label: 'Jobs' },
  { value: 'workstation', label: 'Workstations' },
  { value: 'container', label: 'Containers' },
  { value: 'expedition', label: 'Expeditions' },
]


const showFilters = ref(false)
</script>

<template>
  <div class="surface-card p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-3">
      <label class="relative min-w-[220px] flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          :value="props.searchQuery"
          type="text"
          class="focus-ring w-full rounded-xl border border-input bg-background/70 py-2.5 pl-10 pr-4 text-sm"
          placeholder="Search items by name, type, or description"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <div
        class="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1"
        role="radiogroup"
        aria-label="View mode"
      >
        <button
          role="radio"
          :aria-checked="props.viewMode === 'grid'"
          class="focus-ring inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition"
          :class="
            props.viewMode === 'grid'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="emit('update:viewMode', 'grid')"
        >
          <Grid2x2 class="size-3.5" />
          Grid
        </button>
        <button
          role="radio"
          :aria-checked="props.viewMode === 'table'"
          class="focus-ring inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition"
          :class="
            props.viewMode === 'table'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="emit('update:viewMode', 'table')"
        >
          <Columns3 class="size-3.5" />
          Table
        </button>
      </div>

      <button
        class="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground lg:hidden"
        :aria-expanded="showFilters"
        aria-controls="items-filters"
        @click="showFilters = !showFilters"
      >
        <SlidersHorizontal class="size-4" />
        Filters
        <span
          v-if="hasActiveFilters"
          class="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
          >!</span
        >
      </button>
    </div>

    <div
      id="items-filters"
      class="mt-4 space-y-3"
      :class="showFilters ? 'block' : 'hidden lg:block'"
    >
      <div
        class="flex flex-wrap items-center gap-2.5"
        role="radiogroup"
        aria-label="Filter by type"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Type</span
        >
        <button
          v-for="option in typeOptions"
          :key="option.value"
          role="radio"
          :aria-checked="props.typeFilter === option.value"
          class="pill focus-ring active:scale-[0.96]"
          :class="props.typeFilter === option.value ? 'pill-active' : ''"
          @click="emit('update:typeFilter', option.value)"
        >
          <span
            v-if="option.value !== 'all'"
            class="mr-1.5 inline-block size-2 rounded-full"
            :style="{ backgroundColor: itemTypeColor(option.value as ItemType) }"
          />
          {{ option.label }}
        </button>
      </div>

      <div
        class="flex flex-wrap items-center gap-2.5"
        role="radiogroup"
        aria-label="Filter by source"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Source</span
        >
        <button
          v-for="option in sourceOptions"
          :key="option.value"
          role="radio"
          :aria-checked="props.sourceFilter === option.value"
          class="pill focus-ring active:scale-[0.96]"
          :class="props.sourceFilter === option.value ? 'pill-active' : ''"
          @click="selectSource(option.value)"
        >
          {{ option.label }}
        </button>

        <div class="ml-auto flex items-center gap-2">
          <button
            v-if="hasActiveFilters"
            class="focus-ring rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground active:scale-[0.96]"
            @click="clearAllFilters"
          >
            Clear all
          </button>
          <div
            class="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
            aria-live="polite"
          >
            {{ props.resultCount }} results
          </div>
        </div>
      </div>

      <!-- Source sub-filters -->
      <div v-if="props.availableSubFilters.length > 0" class="flex flex-wrap items-center gap-2.5">
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60"
          >└</span
        >
        <button
          v-for="sub in props.availableSubFilters"
          :key="sub"
          class="pill focus-ring gap-1.5 active:scale-[0.96]"
          :class="props.sourceSubFilter.has(sub) ? 'pill-active' : ''"
          @click="emit('toggle-sub-filter', sub)"
        >
          <img v-if="sourceIcons[sub]" :src="sourceIcons[sub]" alt="" class="size-4" />
          {{ sourceLabel(sub) }}
        </button>
        <button
          v-if="props.sourceSubFilter.size > 0"
          class="focus-ring rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground active:scale-[0.96]"
          @click="emit('clear-sub-filters')"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
</template>
