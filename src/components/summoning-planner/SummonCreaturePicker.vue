<script setup lang="ts">
/**
 * Modal creature picker for the Summon tab (mockup AddPicker), app-skinned. Replaces
 * the prior always-expanding filter: opened from the queue row's "+ Add", it offers a
 * search box, a Tier/Name sort, and a scrollable tier-grouped grid of PartyCreatureTile
 * chips. Selection logic is owned by the parent (emits toggle / toggle-tier / reset).
 */
import { Ban, ChevronDown, ChevronUp, Info, RotateCcw, Search, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PartyCreatureTile from '@/components/level-planner/PartyCreatureTile.vue'
import ModalDialog from '@/components/shared/ModalDialog.vue'
import { useCreatureStatus } from '@/composables/useCreatureStatus'
import type { Creature } from '@/types'

const { t } = useI18n()


const props = withDefaults(
  defineProps<{
    open: boolean
    creatures: Creature[]
    selectedIds: Set<string>
    getLevel: (id: string) => number
    isAwakened: (id: string) => boolean
    /** Modal heading — override for non-summon contexts (e.g. the Awaken queue). */
    title?: string
    /** Offer a "Level" sort (highest first) — handy when picking boosters by strength. */
    levelSort?: boolean
    /** Show each tile's current in-game assignment as a corner badge. */
    showActivity?: boolean
    /** Optional callout under the title (e.g. explaining the default selection). */
    hint?: string
    /** Initial sort field (defaults to tier). */
    initialSort?: 'name' | 'tier' | 'level'
    /** Initial sort direction (defaults to ascending). */
    initialSortDir?: 'asc' | 'desc'
  }>(),
  {
    levelSort: false,
    showActivity: false,
    initialSort: 'tier',
    initialSortDir: 'asc',
  },
)


const emit = defineEmits<{
  toggle: [id: string]
  'toggle-tier': [ids: string[], select: boolean]
  reset: []
  close: []
}>()


const query = ref('')
type SortField = 'name' | 'tier' | 'level'
type SortDir = 'asc' | 'desc'
// Each sort chip is a three-state toggle: neutral (null) → ascending → descending →
// back to neutral. Neutral falls back to the default tier-grouped order.
const sortBy = ref<SortField | null>(props.initialSort)
const sortDir = ref<SortDir>(props.initialSortDir)
const effectiveField = computed<SortField>(() => sortBy.value ?? 'tier')
const isGroupedByTier = computed(() => effectiveField.value === 'tier')


function cycleSort(field: SortField) {
  if (sortBy.value !== field) {
    sortBy.value = field
    sortDir.value = 'asc'
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc'
  } else {
    // Third click clears the explicit sort back to the default view.
    sortBy.value = null
    sortDir.value = 'asc'
  }
}


const displayTitle = computed(() => props.title ?? t('summoningPlanner.picker.defaultTitle'))


const selectedCount = computed(
  () => props.creatures.filter((c) => props.selectedIds.has(c.id)).length,
)


// "Busy" = currently assigned to an in-game activity (the same signal the corner badge
// shows). Only meaningful when activities are surfaced, so it follows `showActivity`.
const { statusOf } = useCreatureStatus()
const busyCreatures = computed(() =>
  props.showActivity ? props.creatures.filter((c) => statusOf(c.id).role !== null) : [],
)
const anyBusyIncluded = computed(() => busyCreatures.value.some((c) => props.selectedIds.has(c.id)))


// One bulk toggle: if any busy creature is still in, pull them all out; otherwise put
// them back. Reuses the parent's existing `toggle-tier` include/exclude handler.
function toggleBusy() {
  const ids = busyCreatures.value.map((c) => c.id)
  if (ids.length > 0) emit('toggle-tier', ids, !anyBusyIncluded.value)
}


function chipState(id: string): 'included' | 'excluded' {
  return props.selectedIds.has(id) ? 'included' : 'excluded'
}


function isAllSelected(creatures: Creature[]): boolean {
  return creatures.every((c) => props.selectedIds.has(c.id))
}


function sortCreatures(list: Creature[]): Creature[] {
  const field = effectiveField.value
  const flip = sortDir.value === 'desc' ? -1 : 1
  return [...list].toSorted((a, b) => {
    let r: number
    if (field === 'tier') r = a.tier - b.tier || a.name.localeCompare(b.name)
    else if (field === 'level')
      r = props.getLevel(a.id) - props.getLevel(b.id) || a.name.localeCompare(b.name)
    else r = a.name.localeCompare(b.name)
    return r * flip
  })
}


const filtered = computed(() => {
  let result = props.creatures
  if (query.value) {
    const q = query.value.toLowerCase()
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.types.some((t) => t.toLowerCase().includes(q)) ||
        c.trait.toLowerCase().includes(q),
    )
  }
  return sortCreatures(result)
})


function groupByTier(list: Creature[]): { tier: number; creatures: Creature[] }[] {
  const map = new Map<number, Creature[]>()
  for (const c of list) {
    const group = map.get(c.tier)
    if (group) group.push(c)
    else map.set(c.tier, [c])
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => (sortDir.value === 'desc' ? b - a : a - b))
    .map(([tier, creatures]) => ({ tier, creatures }))
}


// Reset the search each time the modal opens for a clean start.
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)
</script>

<template>
  <ModalDialog
    :open="open"
    :aria-label="displayTitle"
    class="surface-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
    @close="emit('close')"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-border/60 px-4 py-3">
      <div class="flex items-baseline gap-2">
        <h3 class="text-base font-bold text-foreground">{{ displayTitle }}</h3>
        <span class="text-xs text-muted-foreground">{{
          t('summoningPlannerComponents.creatureFilter.selected', { n: selectedCount })
        }}</span>
      </div>
      <button
        class="focus-ring ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        @click="emit('close')"
      >
        <X class="size-3.5" />
        {{ t('summoningPlanner.picker.close') }}
      </button>
    </div>

    <!-- Optional callout (e.g. how the default selection is chosen) -->
    <p
      v-if="hint"
      class="flex items-start gap-1.5 border-b border-border/40 bg-foreground/[0.02] px-4 py-2 text-2xs leading-relaxed text-muted-foreground/80"
    >
      <Info class="mt-px size-3.5 shrink-0 text-muted-foreground/60" />
      <span>{{ hint }}</span>
    </p>

    <!-- Search + sort + reset -->
    <div class="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
      <div class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="query"
          type="text"
          :placeholder="t('summoningPlannerComponents.creatureFilter.placeholder')"
          class="focus-ring h-9 w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 text-sm font-medium text-foreground"
        />
      </div>
      <div
        class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
      >
        <button
          class="focus-ring flex h-8 items-center gap-1 px-2.5 text-2xs font-semibold transition"
          :class="
            sortBy === 'tier'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          :title="
            sortBy === 'tier'
              ? sortDir === 'asc'
                ? t('summoningPlanner.picker.sortTitle.tierAsc')
                : t('summoningPlanner.picker.sortTitle.tierDesc')
              : t('summoningPlanner.picker.sortTitle.tier')
          "
          @click="cycleSort('tier')"
        >
          {{ t('summoningPlannerComponents.creatureFilter.sortTier') }}
          <ChevronUp v-if="sortBy === 'tier' && sortDir === 'asc'" class="size-3" />
          <ChevronDown v-else-if="sortBy === 'tier'" class="size-3" />
        </button>
        <button
          class="focus-ring flex h-8 items-center gap-1 px-2.5 text-2xs font-semibold transition"
          :class="
            sortBy === 'name'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          :title="
            sortBy === 'name'
              ? sortDir === 'asc'
                ? t('summoningPlanner.picker.sortTitle.nameAsc')
                : t('summoningPlanner.picker.sortTitle.nameDesc')
              : t('summoningPlanner.picker.sortTitle.name')
          "
          @click="cycleSort('name')"
        >
          {{ t('summoningPlannerComponents.creatureFilter.sortName') }}
          <ChevronUp v-if="sortBy === 'name' && sortDir === 'asc'" class="size-3" />
          <ChevronDown v-else-if="sortBy === 'name'" class="size-3" />
        </button>
        <button
          v-if="levelSort"
          class="focus-ring flex h-8 items-center gap-1 px-2.5 text-2xs font-semibold transition"
          :class="
            sortBy === 'level'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          :title="
            sortBy === 'level'
              ? sortDir === 'asc'
                ? t('summoningPlanner.picker.sortTitle.levelAsc')
                : t('summoningPlanner.picker.sortTitle.levelDesc')
              : t('summoningPlanner.picker.sortTitle.level')
          "
          @click="cycleSort('level')"
        >
          {{ t('summoningPlanner.picker.sortLevel') }}
          <ChevronUp v-if="sortBy === 'level' && sortDir === 'asc'" class="size-3" />
          <ChevronDown v-else-if="sortBy === 'level'" class="size-3" />
        </button>
      </div>
      <button
        v-if="busyCreatures.length > 0"
        class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-semibold transition"
        :class="
          anyBusyIncluded
            ? 'border-border/70 bg-background/70 text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            : 'border-primary/40 bg-primary/15 text-primary'
        "
        :title="
          anyBusyIncluded
            ? t('summoningPlanner.picker.excludeBusyHint')
            : t('summoningPlanner.picker.includeBusyHint')
        "
        @click="toggleBusy"
      >
        <Ban class="size-3.5" />
        {{
          anyBusyIncluded
            ? t('summoningPlanner.picker.excludeBusy')
            : t('summoningPlanner.picker.includeBusy')
        }}
      </button>
      <button
        v-if="selectedCount > 0"
        class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        @click="emit('reset')"
      >
        <RotateCcw class="size-3" />
        {{ t('summoningPlannerComponents.creatureFilter.reset') }}
      </button>
    </div>

    <!-- Scrollable grid -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <template v-if="filtered.length > 0 && isGroupedByTier">
        <div v-for="group in groupByTier(filtered)" :key="group.tier" class="mb-3 last:mb-0">
          <div class="mb-1.5 flex items-center gap-2">
            <p class="text-3xs font-bold uppercase tracking-wider text-muted-foreground/60">
              {{
                t('summoningPlannerComponents.creatureFilter.tierGroup', {
                  n: group.tier + 1,
                })
              }}
            </p>
            <button
              class="focus-ring inline-flex items-center rounded-md border px-2 py-0.5 text-3xs font-semibold transition"
              :class="
                isAllSelected(group.creatures)
                  ? 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
              "
              @click="
                emit(
                  'toggle-tier',
                  group.creatures.map((c) => c.id),
                  !isAllSelected(group.creatures),
                )
              "
            >
              {{
                isAllSelected(group.creatures)
                  ? t('summoningPlannerComponents.creatureFilter.deselectAll')
                  : t('summoningPlannerComponents.creatureFilter.selectAll')
              }}
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
              :show-activity="showActivity"
              @toggle="emit('toggle', c.id)"
            />
          </div>
        </div>
      </template>

      <div v-else-if="filtered.length > 0" class="flex flex-wrap gap-2">
        <PartyCreatureTile
          v-for="c in filtered"
          :key="c.id"
          :creature="c"
          :chip-state="chipState(c.id)"
          :level="getLevel(c.id)"
          :awakened="isAwakened(c.id)"
          :show-activity="showActivity"
          @toggle="emit('toggle', c.id)"
        />
      </div>

      <p v-if="filtered.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('summoningPlannerComponents.creatureFilter.noMatches') }}
      </p>
    </div>
  </ModalDialog>
</template>
