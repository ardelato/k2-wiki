<script setup lang="ts">
import { Search, SlidersHorizontal } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import ViewModeToggle from '@/components/shared/ViewModeToggle.vue'
import type { SourceCategory } from '@/composables/useItems'
import type { ItemType } from '@/types'
import { itemTypeColor, sourceLabel } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'

const props = defineProps<{
  searchQuery: string
  typeFilter: ItemType | 'all'
  sourceFilter: SourceCategory
  viewMode: 'grid' | 'table'
  resultCount: number
  sourceSubFilter: Set<string>
  availableSubFilters: string[]
  activeFilters: ActiveFilter[]
}>()


const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:typeFilter': [value: ItemType | 'all']
  'update:sourceFilter': [value: SourceCategory]
  'update:viewMode': [value: 'grid' | 'table']
  'toggle-sub-filter': [value: string]
  'clear-sub-filters': []
  'remove-filter': [key: string]
  'clear-all-filters': []
}>()


const hasActiveFilters = computed(
  () =>
    props.typeFilter !== 'all' ||
    props.sourceFilter !== 'all' ||
    props.searchQuery !== '' ||
    props.sourceSubFilter.size > 0,
)


function selectSource(value: SourceCategory) {
  if (props.sourceFilter === value) {
    emit('clear-sub-filters')
    emit('update:sourceFilter', 'all')
    return
  }
  if (props.sourceFilter !== value) emit('clear-sub-filters')
  emit('update:sourceFilter', value)
}


const typeOptions: Array<{ value: ItemType; label: string }> = [
  { value: 'Currency', label: 'Currency' },
  { value: 'Container', label: 'Container' },
  { value: 'Gathered', label: 'Gathered' },
  { value: 'Refined', label: 'Refined' },
  { value: 'Sellable', label: 'Sellable' },
  { value: 'Consumable', label: 'Consumable' },
]


const sourceOptions: Array<{ value: Exclude<SourceCategory, 'all'>; label: string }> = [
  { value: 'job', label: 'Jobs' },
  { value: 'workstation', label: 'Workstations' },
  { value: 'container', label: 'Containers' },
  { value: 'expedition', label: 'Expeditions' },
]


const { t } = useI18n()


const showFilters = ref(false)
</script>

<template>
  <div class="surface-card p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-3">
      <label class="relative min-w-[var(--sidebar-width)] flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          :value="props.searchQuery"
          type="text"
          class="focus-ring w-full rounded-xl border border-input bg-background/70 py-2.5 pl-10 pr-4 text-sm"
          :placeholder="t('items.toolbar.searchPlaceholder')"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <ViewModeToggle
        :model-value="props.viewMode"
        @update:model-value="emit('update:viewMode', $event)"
      />

      <button
        class="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground lg:hidden"
        :aria-expanded="showFilters"
        aria-controls="items-filters"
        @click="showFilters = !showFilters"
      >
        <SlidersHorizontal class="size-4" />
        {{ t('common.filters') }}
        <span
          v-if="hasActiveFilters"
          class="flex size-5 items-center justify-center rounded-full bg-primary text-3xs font-bold text-primary-foreground"
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
        :aria-label="t('items.toolbar.filterByType')"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{{
          t('items.toolbar.typeLabel')
        }}</span>
        <button
          v-for="option in typeOptions"
          :key="option.value"
          role="radio"
          :aria-checked="props.typeFilter === option.value"
          class="pill focus-ring active:scale-[0.96]"
          :class="props.typeFilter === option.value ? 'pill-active' : ''"
          @click="
            emit('update:typeFilter', props.typeFilter === option.value ? 'all' : option.value)
          "
        >
          <span
            class="mr-1.5 inline-block size-2 rounded-full"
            :class="props.typeFilter === option.value ? 'ring-1 ring-white/60' : ''"
            :style="{ backgroundColor: itemTypeColor(option.value as ItemType) }"
          />
          {{ option.label }}
        </button>
      </div>

      <div
        class="flex flex-wrap items-center gap-2.5"
        role="radiogroup"
        :aria-label="t('items.toolbar.filterBySource')"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{{
          t('items.toolbar.sourceLabel')
        }}</span>
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

        <div
          class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
          aria-live="polite"
        >
          {{ t('items.toolbar.resultCount', { count: props.resultCount }) }}
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
          <img
            v-if="sourceIcons[sub]"
            :src="sourceIcons[sub]"
            alt=""
            class="size-4"
            loading="lazy"
          />
          {{ sourceLabel(sub) }}
        </button>
      </div>
      <!-- Active filter chips -->
      <ActiveFilters
        :filters="props.activeFilters"
        @remove="emit('remove-filter', $event)"
        @clear-all="emit('clear-all-filters')"
      />
    </div>
  </div>
</template>
