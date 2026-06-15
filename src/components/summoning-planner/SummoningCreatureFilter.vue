<script setup lang="ts">
import { ChevronDown, Clock3, RotateCcw, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import PartyCreatureTile from '@/components/level-planner/PartyCreatureTile.vue'
import type { Creature } from '@/types'
import { formatDuration } from '@/utils/format'

const { t } = useI18n()


const props = defineProps<{
  creatures: Creature[]
  selectedIds: Set<string>
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
  readinessPercent?: number
  objectivesFulfilled?: number
  objectivesTotal?: number
  totalTime?: number
  parallelEstimate?: number | null
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
    <div
      class="flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left transition hover:bg-foreground/[0.02]"
      role="button"
      tabindex="0"
      @click="expanded = !expanded"
      @keydown.enter="expanded = !expanded"
      @keydown.space.prevent="expanded = !expanded"
    >
      <!-- Row 1: Label + controls -->
      <div class="flex w-full items-center gap-3">
        <label
          class="pointer-events-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
          >{{ t('summoningPlannerComponents.creatureFilter.label') }}</label
        >
        <span class="text-xs text-muted-foreground">
          {{ t('summoningPlannerComponents.creatureFilter.selected', { n: selectedCount }) }}
        </span>
        <div class="ml-auto flex items-center">
          <ChevronDown
            class="size-4 text-muted-foreground transition-transform"
            :class="{ 'rotate-180': expanded }"
          />
        </div>
      </div>
      <!-- Row 2: Readiness + Time (always rendered to prevent layout shift) -->
      <div
        class="flex w-full items-center gap-4 transition-opacity"
        :class="
          selectedCount > 0 && readinessPercent != null
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        "
      >
        <div class="min-w-0 flex-1">
          <div class="h-1 overflow-hidden rounded-full bg-border/30">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="
                (readinessPercent ?? 0) >= 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500'
              "
              :style="{ width: `${readinessPercent ?? 0}%` }"
            />
          </div>
        </div>
        <span class="shrink-0 font-mono text-[11px] font-semibold text-foreground">
          {{ readinessPercent }}%
          <span class="text-muted-foreground/60">
            &middot;
            {{
              t('summoningPlannerComponents.creatureFilter.materials', {
                n: objectivesFulfilled,
                total: objectivesTotal,
              })
            }}
          </span>
        </span>
        <span
          v-if="totalTime != null && totalTime > 0"
          class="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold text-foreground"
        >
          <Clock3 class="size-3 text-emerald-500" />
          <template v-if="parallelEstimate != null && parallelEstimate < totalTime">
            ~{{ formatDuration(parallelEstimate) }}
            <span class="text-muted-foreground/50"
              >&middot; {{ formatDuration(totalTime) }}
              {{ t('summoningPlannerComponents.creatureFilter.totalSuffix') }}</span
            >
          </template>
          <template v-else>
            {{ formatDuration(totalTime) }}
          </template>
        </span>
      </div>
    </div>

    <!-- Body -->
    <div v-if="expanded" class="border-t border-border/40 px-4 py-3">
      <!-- Search + Sort + Reset -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
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
            class="focus-ring h-8 px-2.5 text-[11px] font-semibold transition"
            :class="
              sortBy === 'tier'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            "
            @click="sortBy = 'tier'"
          >
            {{ t('summoningPlannerComponents.creatureFilter.sortTier') }}
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
            {{ t('summoningPlannerComponents.creatureFilter.sortName') }}
          </button>
        </div>
        <button
          v-if="selectedCount > 0"
          class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          @click="emit('reset')"
        >
          <RotateCcw class="size-3" />
          {{ t('summoningPlannerComponents.creatureFilter.reset') }}
        </button>
      </div>

      <!-- Scrollable grid -->
      <div class="max-h-80 overflow-y-auto">
        <!-- Grouped by tier -->
        <template v-if="filtered.length > 0 && isGroupedByTier">
          <div v-for="group in groupByTier(filtered)" :key="group.tier" class="mb-3 last:mb-0">
            <div class="mb-1.5 flex items-center gap-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {{
                  t('summoningPlannerComponents.creatureFilter.tierGroup', { n: group.tier + 1 })
                }}
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
          {{ t('summoningPlannerComponents.creatureFilter.noMatches') }}
        </p>
      </div>
    </div>
  </div>
</template>
