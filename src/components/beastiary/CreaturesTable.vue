<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import type { Creature, CreatureStats, Jobs } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase, typeColor, typeColorVar } from '@/utils/format'
import {
  jobColors,
  jobLabels,
  statAbbreviations,
  statLabels,
  traitAbbreviations,
} from '@/utils/formulas'
import { jobIcons } from '@/utils/icons'

const props = defineProps<{
  creatures: Creature[]
  editing: boolean
  selectedIds: Set<string>
  selectedCreatureId: string | null
}>()


const emit = defineEmits<{
  select: [creature: Creature]
  'toggle-selected': [id: string]
}>()


const { t } = useI18n()


const { isOwned, isAwakened, getLevel } = useCreatureCollection()


type SortKey =
  | 'name'
  | 'type'
  | 'trait'
  | 'level'
  | 'statTotal'
  | 'jobTotal'
  | keyof CreatureStats
  | keyof Jobs


const tableSortKey = ref<SortKey | null>(null)
const tableSortDirection = ref<'asc' | 'desc'>('asc')


const jobEntries = computed(() => Object.entries(jobLabels) as [keyof Jobs, string][])
const statEntries = computed(() => Object.entries(statLabels) as [keyof CreatureStats, string][])


function totalStats(creature: Creature): number {
  return Object.values(creature.stats).reduce((sum, value) => sum + value, 0)
}


function totalJobs(creature: Creature): number {
  return Object.values(creature.jobs).reduce((sum, value) => sum + value, 0)
}


function sortBy(key: SortKey) {
  if (tableSortKey.value === key) {
    if (tableSortDirection.value === 'asc') {
      tableSortDirection.value = 'desc'
    } else {
      tableSortKey.value = null
      tableSortDirection.value = 'asc'
    }
    return
  }
  tableSortKey.value = key
  tableSortDirection.value = 'asc'
}


const sortedCreatures = computed(() => {
  const key = tableSortKey.value
  if (key === null) return props.creatures

  const list = [...props.creatures]
  list.sort((a, b) => {
    let result = 0
    if (key === 'name') result = a.name.localeCompare(b.name)
    else if (key === 'type') result = (a.types[0] ?? '').localeCompare(b.types[0] ?? '')
    else if (key === 'trait') result = a.trait.localeCompare(b.trait)
    else if (key === 'level') {
      if (isOwned(a.id) !== isOwned(b.id)) return isOwned(a.id) ? -1 : 1
      result = getLevel(a.id) - getLevel(b.id)
    } else if (key === 'statTotal') result = totalStats(a) - totalStats(b)
    else if (key === 'jobTotal') result = totalJobs(a) - totalJobs(b)
    else if (key in statLabels)
      result = a.stats[key as keyof CreatureStats] - b.stats[key as keyof CreatureStats]
    else result = a.jobs[key as keyof Jobs] - b.jobs[key as keyof Jobs]

    return tableSortDirection.value === 'asc' ? result : -result
  })
  return list
})
</script>

<template>
  <div class="surface-card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm" role="grid">
        <thead class="bg-muted/50">
          <tr>
            <th
              class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'name'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('name')"
              >
                {{ t('beastiary.table.name') }}
                <span :class="tableSortKey === 'name' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'type'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('type')"
              >
                {{ t('beastiary.table.type') }}
                <span :class="tableSortKey === 'type' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'trait'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('trait')"
              >
                {{ t('beastiary.table.trait') }}
                <span :class="tableSortKey === 'trait' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              class="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'level'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('level')"
              >
                {{ t('beastiary.table.lvl') }}
                <span :class="tableSortKey === 'level' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              v-for="([statKey], index) in statEntries"
              :key="statKey"
              class="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :class="{ 'border-l border-border/40': index === 0 }"
              :aria-sort="
                tableSortKey === statKey
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy(statKey)"
              >
                {{ statAbbreviations[statKey] }}
                <span :class="tableSortKey === statKey ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              class="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'statTotal'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('statTotal')"
              >
                {{ t('beastiary.table.total') }}
                <span :class="tableSortKey === 'statTotal' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              v-for="([jobKey, jobName], index) in jobEntries"
              :key="jobKey"
              class="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :class="{ 'border-l border-border/40': index === 0 }"
              :aria-sort="
                tableSortKey === jobKey
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy(jobKey)"
              >
                <img
                  v-if="jobIcons[jobKey]"
                  :src="jobIcons[jobKey]"
                  alt=""
                  class="size-3.5"
                  loading="lazy"
                />
                <span
                  v-else
                  class="inline-block size-1.5 rounded-full"
                  :style="{ backgroundColor: jobColors[jobKey] }"
                ></span>
                {{ jobName.slice(0, 3) }}
                <span :class="tableSortKey === jobKey ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
            <th
              class="px-2 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
              :aria-sort="
                tableSortKey === 'jobTotal'
                  ? tableSortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
                @click="sortBy('jobTotal')"
              >
                {{ t('beastiary.table.total') }}
                <span :class="tableSortKey === 'jobTotal' ? 'text-primary' : 'opacity-0'">{{
                  tableSortDirection === 'asc' ? '▲' : '▼'
                }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/60">
          <tr
            v-for="creature in sortedCreatures"
            :key="creature.id"
            class="cursor-pointer transition-colors duration-150"
            :class="
              selectedCreatureId === creature.id ? 'bg-muted/40' : 'bg-card/50 hover:bg-muted/30'
            "
            @click="editing ? emit('toggle-selected', creature.id) : emit('select', creature)"
          >
            <td
              class="border-l-2 py-2.5 pl-2 pr-0"
              :style="{
                borderColor:
                  selectedCreatureId === creature.id ? typeColor(creature.types[0]) : 'transparent',
              }"
            >
              <div class="flex items-center gap-3">
                <!-- Selection checkbox in edit mode -->
                <input
                  v-if="editing"
                  type="checkbox"
                  :checked="selectedIds.has(creature.id)"
                  class="size-4 shrink-0 rounded border-border accent-primary"
                  @click.stop="emit('toggle-selected', creature.id)"
                />
                <div
                  class="relative inline-flex size-10 shrink-0 items-center justify-center overflow-visible rounded-lg border border-border text-xs font-bold text-muted-foreground"
                  :style="{
                    backgroundColor: 'hsl(' + typeColorVar(creature.types[0]) + ' / 0.1)',
                  }"
                >
                  <img
                    v-if="getCreatureImage(creature)"
                    :src="getCreatureImage(creature)"
                    :alt="`${creature.name} artwork`"
                    class="size-10 rounded-lg border border-border object-cover"
                    loading="lazy"
                  />
                  <span v-else>{{ creature.name.charAt(0) }}</span>
                  <span
                    class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1 py-px font-mono text-[9px] font-bold text-muted-foreground shadow-sm"
                  >
                    T{{ creature.tier + 1 }}
                  </span>
                </div>
                <div class="flex items-center gap-0.5">
                  <span
                    class="font-semibold"
                    :class="
                      isAwakened(creature.id)
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-foreground/80'
                    "
                    >{{ creature.name }}</span
                  >
                  <span
                    v-if="isOwned(creature.id)"
                    class="text-xs"
                    :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-amber-400'"
                    >★</span
                  >
                </div>
              </div>
            </td>
            <td class="px-2 py-2.5">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="type in creature.types"
                  :key="type"
                  class="rounded-full px-2 py-0.5 text-xs font-semibold"
                  :style="{
                    color: typeColor(type),
                    backgroundColor: 'hsl(' + typeColorVar(type) + ' / 0.12)',
                  }"
                >
                  {{ type }}
                </span>
              </div>
            </td>
            <td class="whitespace-nowrap px-2 py-2.5">
              <span class="trait-chip">{{
                traitAbbreviations[creature.trait] ?? toTitleCase(creature.trait)
              }}</span>
            </td>
            <td
              class="px-2 py-2.5 text-center font-mono text-xs text-muted-foreground [font-variant-numeric:tabular-nums]"
            >
              <template v-if="isOwned(creature.id)">
                {{ getLevel(creature.id) }}
              </template>
              <template v-else>
                <span class="text-muted-foreground/40">—</span>
              </template>
            </td>
            <td
              v-for="([statKey], index) in statEntries"
              :key="statKey"
              class="px-2 py-2.5 text-center font-mono text-xs text-muted-foreground [font-variant-numeric:tabular-nums]"
              :class="{ 'border-l border-border/40': index === 0 }"
            >
              <template v-if="getLevel(creature.id) > 1">
                <p>{{ creature.stats[statKey] * getLevel(creature.id) }}</p>
                <p class="text-[10px] text-muted-foreground/60">
                  {{ creature.stats[statKey] }}
                </p>
              </template>
              <template v-else>
                {{ creature.stats[statKey] }}
              </template>
            </td>
            <td
              class="px-2 py-2.5 text-center font-mono text-xs font-semibold text-foreground [font-variant-numeric:tabular-nums]"
            >
              <template v-if="getLevel(creature.id) > 1">
                <p>{{ totalStats(creature) * getLevel(creature.id) }}</p>
                <p class="text-[10px] font-normal text-muted-foreground/60">
                  {{ totalStats(creature) }}
                </p>
              </template>
              <template v-else>
                {{ totalStats(creature) }}
              </template>
            </td>
            <td
              v-for="([jobKey], index) in jobEntries"
              :key="jobKey"
              class="px-2 py-2.5 text-center font-mono text-xs text-muted-foreground [font-variant-numeric:tabular-nums]"
              :class="{ 'border-l border-border/40': index === 0 }"
            >
              {{ creature.jobs[jobKey] }}
            </td>
            <td
              class="px-2 py-2.5 text-center font-mono text-xs font-semibold text-foreground [font-variant-numeric:tabular-nums]"
            >
              {{ totalJobs(creature) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
