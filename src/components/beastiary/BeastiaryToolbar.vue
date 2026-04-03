<script setup lang="ts">
import { ChevronDown, Columns3, Grid2x2, Search, SlidersHorizontal } from 'lucide-vue-next'
import { ref, computed } from 'vue'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.png'
import notSummonedIcon from '@/assets/icons/not_summoned.png'
import summonedIcon from '@/assets/icons/summoned.png'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import type { ElementType } from '@/types'
import { toTitleCase } from '@/utils/format'
import { jobIcons } from '@/utils/icons'

const props = defineProps<{
  searchQuery: string
  typeFilter: ElementType | 'all'
  tierFilter: number | 'all'
  traitFilter: string | 'all'
  jobFilter: string | 'all'
  viewMode: 'grid' | 'table'
  ownedFilter: 'all' | 'owned' | 'unowned'
  awakenedFilter: 'all' | 'awakened' | 'unawakened'
  ownedCount: number
  resultCount: number
  traitOptions: string[]
  jobOptions: string[]
  activeFilters: ActiveFilter[]
}>()


const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:typeFilter': [value: ElementType | 'all']
  'update:tierFilter': [value: number | 'all']
  'update:traitFilter': [value: string | 'all']
  'update:jobFilter': [value: string | 'all']
  'update:viewMode': [value: 'grid' | 'table']
  'update:ownedFilter': [value: 'all' | 'owned' | 'unowned']
  'update:awakenedFilter': [value: 'all' | 'awakened' | 'unawakened']
  'clear-all': []
  'remove-filter': [key: string]
}>()


const typeOptions: Array<ElementType | 'all'> = ['all', 'Fire', 'Water', 'Wind', 'Earth']
const tierOptions = ['all', 0, 1, 2, 3, 4, 5] as const


const showFilters = ref(false)
const showMoreFilters = ref(false)


const hasSecondaryFilters = computed(
  () => props.typeFilter !== 'all' || props.traitFilter !== 'all',
)


const hasActiveFilters = computed(
  () =>
    props.searchQuery !== '' ||
    props.typeFilter !== 'all' ||
    props.tierFilter !== 'all' ||
    props.traitFilter !== 'all' ||
    props.jobFilter !== 'all' ||
    props.ownedFilter !== 'all' ||
    props.awakenedFilter !== 'all',
)


const typeDotColor: Record<ElementType, string> = {
  Fire: 'hsl(var(--type-fire))',
  Water: 'hsl(var(--type-water))',
  Wind: 'hsl(var(--type-wind))',
  Earth: 'hsl(var(--type-earth))',
}
</script>

<template>
  <div class="surface-card p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search input with icon -->
      <label class="relative min-w-[220px] flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          :value="props.searchQuery"
          type="text"
          class="focus-ring w-full rounded-xl border border-input bg-background/70 py-2.5 pl-10 pr-4 text-sm"
          placeholder="Search creatures by name, type, trait, or job"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <!-- View mode toggle -->
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

      <!-- Mobile filter toggle -->
      <button
        class="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground lg:hidden"
        :aria-expanded="showFilters"
        aria-controls="beastiary-filters"
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

    <!-- Filter pills -->
    <div
      id="beastiary-filters"
      class="mt-4 space-y-3"
      :class="showFilters ? 'block' : 'hidden lg:block'"
    >
      <!-- Tier filter -->
      <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Filter by tier">
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Tier</span
        >
        <button
          v-for="option in tierOptions.filter((o) => o !== 'all')"
          :key="option"
          role="radio"
          :aria-checked="props.tierFilter === option"
          class="pill focus-ring font-mono"
          :class="props.tierFilter === option ? 'pill-active' : ''"
          @click="emit('update:tierFilter', props.tierFilter === option ? 'all' : option)"
        >
          T{{ (option as number) + 1 }}
        </button>
      </div>

      <!-- Job filter -->
      <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Filter by job">
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Job</span
        >
        <button
          v-for="job in props.jobOptions"
          :key="job"
          role="radio"
          :aria-checked="props.jobFilter === job"
          class="pill focus-ring gap-1.5"
          :class="props.jobFilter === job ? 'pill-active' : ''"
          @click="emit('update:jobFilter', props.jobFilter === job ? 'all' : job)"
        >
          <img
            v-if="jobIcons[job.toLowerCase()]"
            :src="jobIcons[job.toLowerCase()]"
            alt=""
            class="size-4"
          />
          {{ toTitleCase(job) }}
        </button>
      </div>

      <!-- Summoned filter -->
      <div
        class="flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label="Filter by summoned"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Summoned</span
        >
        <button
          v-for="option in ['owned', 'unowned'] as const"
          :key="option"
          role="radio"
          :aria-checked="props.ownedFilter === option"
          class="pill focus-ring gap-1.5"
          :class="props.ownedFilter === option ? 'pill-active' : ''"
          @click="emit('update:ownedFilter', props.ownedFilter === option ? 'all' : option)"
        >
          <img v-if="option === 'owned'" :src="summonedIcon" alt="" class="size-4" />
          <img v-if="option === 'unowned'" :src="notSummonedIcon" alt="" class="size-4" />
          {{ option === 'owned' ? 'Summoned' : 'Not Summoned' }}
        </button>
      </div>

      <!-- Awakened filter -->
      <div
        class="flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label="Filter by awakened"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
          >Awakened</span
        >
        <button
          v-for="option in ['awakened', 'unawakened'] as const"
          :key="option"
          role="radio"
          :aria-checked="props.awakenedFilter === option"
          class="pill focus-ring gap-1.5"
          :class="props.awakenedFilter === option ? 'pill-active' : ''"
          @click="emit('update:awakenedFilter', props.awakenedFilter === option ? 'all' : option)"
        >
          <img v-if="option === 'awakened'" :src="awakenedSummonedIcon" alt="" class="size-4" />
          {{ option === 'awakened' ? 'Awakened' : 'Not Awakened' }}
        </button>

        <div
          class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
          aria-live="polite"
        >
          {{ props.ownedCount }} summoned · {{ props.resultCount }} results
        </div>
      </div>
      <!-- More filters toggle -->
      <div>
        <button
          class="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          :aria-expanded="showMoreFilters || hasSecondaryFilters"
          aria-controls="beastiary-more-filters"
          @click="showMoreFilters = !showMoreFilters"
        >
          <ChevronDown
            class="size-3.5 transition-transform"
            :class="showMoreFilters || hasSecondaryFilters ? '' : '-rotate-90'"
          />
          More filters
        </button>

        <div
          id="beastiary-more-filters"
          class="mt-3 space-y-3"
          :class="showMoreFilters || hasSecondaryFilters ? 'block' : 'hidden'"
        >
          <!-- Type filter -->
          <div
            class="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Filter by type"
          >
            <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
              >Type</span
            >
            <button
              v-for="option in typeOptions.filter((o) => o !== 'all')"
              :key="option"
              role="radio"
              :aria-checked="props.typeFilter === option"
              class="pill focus-ring"
              :class="props.typeFilter === option ? 'pill-active' : ''"
              @click="emit('update:typeFilter', props.typeFilter === option ? 'all' : option)"
            >
              <span
                class="mr-1.5 inline-block size-2 rounded-full"
                :class="props.typeFilter === option ? 'ring-1 ring-white/60' : ''"
                :style="{ backgroundColor: typeDotColor[option as ElementType] }"
              />
              {{ option }}
            </button>
          </div>

          <!-- Trait filter -->
          <div
            class="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Filter by trait"
          >
            <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
              >Trait</span
            >
            <button
              v-for="trait in props.traitOptions"
              :key="trait"
              role="radio"
              :aria-checked="props.traitFilter === trait"
              class="pill focus-ring"
              :class="props.traitFilter === trait ? 'pill-active' : ''"
              @click="emit('update:traitFilter', props.traitFilter === trait ? 'all' : trait)"
            >
              {{ toTitleCase(trait) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Active filter chips -->
      <ActiveFilters
        :filters="props.activeFilters"
        @remove="emit('remove-filter', $event)"
        @clear-all="emit('clear-all')"
      />
    </div>
  </div>
</template>
