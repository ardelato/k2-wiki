<script setup lang="ts">
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  ChevronDown,
  RotateCcw,
  Search,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import PartyCreatureTile from '@/components/level-planner/PartyCreatureTile.vue'
import type { Creature } from '@/types'

const props = defineProps<{
  creatures: Creature[]
  globalExcludedIds: Set<string>
  plannerExcluded: Set<string>
  plannerIncluded: Set<string>
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
  hasOverrides: boolean
}>()


const emit = defineEmits<{
  toggle: [id: string]
  'toggle-tier': [ids: string[], include: boolean]
  reset: []
}>()


const expanded = ref(true)
const query = ref('')


type SortOption = 'name' | 'level-asc' | 'level-desc' | 'tier'
const sortBy = ref<SortOption>('tier')


function toggleLevelSort() {
  sortBy.value = sortBy.value === 'level-desc' ? 'level-asc' : 'level-desc'
}


function sortCreatures(list: Creature[]): Creature[] {
  return [...list].toSorted((a, b) => {
    switch (sortBy.value) {
      case 'level-desc':
        return props.getLevel(b.id) - props.getLevel(a.id) || a.name.localeCompare(b.name)
      case 'level-asc':
        return props.getLevel(a.id) - props.getLevel(b.id) || a.name.localeCompare(b.name)
      case 'tier':
        return a.tier - b.tier || a.name.localeCompare(b.name)
      default:
        return a.name.localeCompare(b.name)
    }
  })
}


const isGroupedByTier = computed(() => sortBy.value === 'tier')


function isAllIncluded(creatures: Creature[]): boolean {
  return creatures.every((c) => chipState(c.id) !== 'excluded')
}


type ChipState = 'included' | 'excluded' | 'force-included'


function chipState(id: string): ChipState {
  if (props.plannerExcluded.has(id)) return 'excluded'
  if (props.plannerIncluded.has(id)) return 'force-included'
  if (props.globalExcludedIds.has(id)) return 'excluded'
  return 'included'
}


const includedCount = computed(
  () => props.creatures.filter((c) => chipState(c.id) !== 'excluded').length,
)


const normalCreatures = computed(() =>
  props.creatures.filter((c) => !props.globalExcludedIds.has(c.id)),
)


const globalExcludedCreatures = computed(() =>
  props.creatures.filter((c) => props.globalExcludedIds.has(c.id)),
)


function filterAndSort(list: Creature[]): Creature[] {
  let result = list
  if (query.value) {
    const q = query.value.toLowerCase()
    result = result.filter((c) => c.name.toLowerCase().includes(q))
  }
  return sortCreatures(result)
}


const filteredNormal = computed(() => filterAndSort(normalCreatures.value))
const filteredExcluded = computed(() => filterAndSort(globalExcludedCreatures.value))


/** Group creatures by tier for grouped display */
function groupByTier(list: Creature[]): { tier: number; creatures: Creature[] }[] {
  const map = new Map<number, Creature[]>()
  for (const c of list) {
    const group = map.get(c.tier)
    if (group) group.push(c)
    else map.set(c.tier, [c])
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([tier, creatures]) => ({ tier, creatures }))
}
</script>

<template>
  <div class="surface-card overflow-hidden">
    <!-- Header -->
    <button
      class="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-foreground/[0.02]"
      @click="expanded = !expanded"
    >
      <label
        class="pointer-events-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
        >Creatures</label
      >
      <span class="text-xs text-muted-foreground">
        {{ includedCount }} of {{ creatures.length }} included
      </span>
      <span
        v-if="hasOverrides"
        class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"
      >
        Filtered
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition"
          :class="
            hasOverrides
              ? 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              : 'pointer-events-none invisible'
          "
          @click.stop="emit('reset')"
        >
          <RotateCcw class="size-3" />
          Reset
        </button>
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': expanded }"
        />
      </div>
    </button>

    <!-- Body -->
    <div v-if="expanded" class="border-t border-border/40 px-4 py-3">
      <!-- Search + Sort -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <div class="relative flex-1">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="query"
            type="text"
            placeholder="Search creatures..."
            class="focus-ring h-9 w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 text-sm font-medium text-foreground"
          />
        </div>
        <div
          class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
        >
          <button
            class="focus-ring h-8 px-2.5 text-[11px] font-semibold transition"
            :class="
              sortBy === 'tier'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            @click="sortBy = 'tier'"
          >
            Tier
          </button>
          <button
            class="focus-ring h-8 px-2.5 text-[11px] font-semibold transition"
            :class="
              sortBy === 'name'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            @click="sortBy = 'name'"
          >
            Name
          </button>
          <button
            class="focus-ring flex h-8 items-center gap-1 px-2.5 text-[11px] font-semibold transition"
            :class="
              sortBy === 'level-desc' || sortBy === 'level-asc'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            @click="toggleLevelSort"
          >
            Level
            <ArrowDownNarrowWide v-if="sortBy !== 'level-asc'" class="size-3" />
            <ArrowUpNarrowWide v-else class="size-3" />
          </button>
        </div>
      </div>

      <!-- Scrollable grid -->
      <div class="max-h-80 overflow-y-auto">
        <!-- Normal creatures — grouped by tier -->
        <template v-if="filteredNormal.length > 0 && isGroupedByTier">
          <div
            v-for="group in groupByTier(filteredNormal)"
            :key="group.tier"
            class="mb-3 last:mb-0"
          >
            <div class="mb-1.5 flex items-center gap-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Tier {{ group.tier + 1 }}
              </p>
              <button
                class="focus-ring inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition"
                :class="
                  isAllIncluded(group.creatures)
                    ? 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                "
                @click="
                  emit(
                    'toggle-tier',
                    group.creatures.map((c) => c.id),
                    !isAllIncluded(group.creatures),
                  )
                "
              >
                {{ isAllIncluded(group.creatures) ? 'Exclude all' : 'Include all' }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <PartyCreatureTile
                v-for="c in group.creatures"
                :key="c.id"
                :creature="c"
                :chip-state="chipState(c.id)"
                :level="getLevel(c.id)"
                :awakened="isAwakened(c.id)"
                @toggle="emit('toggle', c.id)"
              />
            </div>
          </div>
        </template>

        <!-- Normal creatures — flat list -->
        <div v-else-if="filteredNormal.length > 0" class="flex flex-wrap gap-2">
          <PartyCreatureTile
            v-for="c in filteredNormal"
            :key="c.id"
            :creature="c"
            :chip-state="chipState(c.id)"
            :level="getLevel(c.id)"
            :awakened="isAwakened(c.id)"
            @toggle="emit('toggle', c.id)"
          />
        </div>

        <!-- Global excluded separator + creatures -->
        <template v-if="filteredExcluded.length > 0">
          <div class="my-3 flex items-center gap-2">
            <div class="h-px flex-1 bg-border/40" />
            <span
              class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60"
              >Excluded by config</span
            >
            <div class="h-px flex-1 bg-border/40" />
          </div>
          <div class="flex flex-wrap gap-2">
            <PartyCreatureTile
              v-for="c in filteredExcluded"
              :key="c.id"
              :creature="c"
              :chip-state="chipState(c.id)"
              :level="getLevel(c.id)"
              :awakened="isAwakened(c.id)"
              title-suffix=" (config excluded)"
              @toggle="emit('toggle', c.id)"
            />
          </div>
        </template>

        <!-- No results -->
        <p
          v-if="filteredNormal.length === 0 && filteredExcluded.length === 0"
          class="py-4 text-center text-sm text-muted-foreground"
        >
          No matches.
        </p>
      </div>
    </div>
  </div>
</template>
