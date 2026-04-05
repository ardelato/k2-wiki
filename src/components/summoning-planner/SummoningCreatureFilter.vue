<script setup lang="ts">
import { ChevronDown, RotateCcw, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import PartyCreatureTile from '@/components/level-planner/PartyCreatureTile.vue'
import type { Creature } from '@/types'

const props = defineProps<{
  creatures: Creature[]
  selectedIds: Set<string>
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
}>()


const emit = defineEmits<{
  toggle: [id: string]
  'toggle-tier': [ids: string[], select: boolean]
  reset: []
}>()


const expanded = ref(true)
const query = ref('')


type SortOption = 'name' | 'tier'
const sortBy = ref<SortOption>('tier')


const isGroupedByTier = computed(() => sortBy.value === 'tier')


const selectedCount = computed(() => {
  return props.creatures.filter((c) => props.selectedIds.has(c.id)).length
})


type ChipState = 'included' | 'excluded'


function chipState(id: string): ChipState {
  return props.selectedIds.has(id) ? 'included' : 'excluded'
}


function isAllSelected(creatures: Creature[]): boolean {
  return creatures.every((c) => props.selectedIds.has(c.id))
}


function sortCreatures(list: Creature[]): Creature[] {
  return [...list].toSorted((a, b) => {
    if (sortBy.value === 'tier') {
      return a.tier - b.tier || a.name.localeCompare(b.name)
    }
    return a.name.localeCompare(b.name)
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
        {{ selectedCount }} of {{ creatures.length }} selected
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition"
          :class="
            selectedCount > 0
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
        </div>
      </div>

      <!-- Scrollable grid -->
      <div class="max-h-80 overflow-y-auto">
        <!-- Grouped by tier -->
        <template v-if="filtered.length > 0 && isGroupedByTier">
          <div v-for="group in groupByTier(filtered)" :key="group.tier" class="mb-3 last:mb-0">
            <div class="mb-1.5 flex items-center gap-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Tier {{ group.tier + 1 }}
              </p>
              <button
                class="focus-ring inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition"
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
                {{ isAllSelected(group.creatures) ? 'Deselect all' : 'Select all' }}
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

        <!-- Flat list -->
        <div v-else-if="filtered.length > 0" class="flex flex-wrap gap-2">
          <PartyCreatureTile
            v-for="c in filtered"
            :key="c.id"
            :creature="c"
            :chip-state="chipState(c.id)"
            :level="getLevel(c.id)"
            :awakened="isAwakened(c.id)"
            @toggle="emit('toggle', c.id)"
          />
        </div>

        <!-- No results -->
        <p v-if="filtered.length === 0" class="py-4 text-center text-sm text-muted-foreground">
          No matches.
        </p>
      </div>
    </div>
  </div>
</template>
