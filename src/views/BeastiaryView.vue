<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { useCreatures } from '@/composables/useCreatures'
import type { Creature, CreatureStats, Jobs } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { jobColors, jobLabels, statLabels } from '@/utils/formulas'
import { toTitleCase, typeColor, typeColorVar } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
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

const viewMode = ref<'grid' | 'table'>('grid')
const selectedCreature = ref<Creature | null>(null)

type SortKey = 'name' | 'tier' | 'type' | 'trait' | 'jobTotal' | keyof Jobs
const tableSortKey = ref<SortKey>('tier')
const tableSortDirection = ref<'asc' | 'desc'>('asc')

const isMobile = useMediaQuery('(max-width: 1279px)')

const jobEntries = computed(() => Object.entries(jobLabels) as [keyof Jobs, string][])
const statEntries = computed(() => Object.entries(statLabels) as [keyof CreatureStats, string][])

const sortedCreatures = computed(() => {
  const list = [...filteredCreatures.value]
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

const maxJobLevel = 10
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
      :result-count="filteredCreatures.length"
      :trait-options="allTraits"
      :job-options="allJobs"
    />

    <div class="flex gap-5">
      <div class="min-w-0 flex-1">
        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          <!-- Creature Card -->
          <article
            v-for="creature in filteredCreatures"
            :key="creature.id"
            class="surface-card group relative cursor-pointer overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-glow"
            :class="selectedCreature?.id === creature.id ? 'ring-2 ring-primary/60 border-primary/40' : ''"
            @click="selectCreature(creature)"
          >
            <!-- Type gradient bar -->
            <div
              class="h-1"
              :style="{
                background: creature.types.length > 1
                  ? `linear-gradient(to right, ${typeColor(creature.types[0])}, ${typeColor(creature.types[1])})`
                  : typeColor(creature.types[0])
              }"
            />

            <div class="p-4">
              <!-- Hero row: image + info -->
              <div class="mb-3 flex items-start gap-3">
                <div class="relative shrink-0">
                  <img
                    :src="getCreatureImage(creature)"
                    :alt="`${creature.name} artwork`"
                    class="size-[72px] rounded-xl border border-border object-cover"
                    :style="{ backgroundColor: `hsl(${typeColorVar(creature.types[0])} / 0.1)` }"
                    loading="lazy"
                  />
                  <!-- Tier badge overlay -->
                  <span class="absolute -right-1 -top-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground shadow-sm">
                    T{{ creature.tier + 1 }}
                  </span>
                </div>

                <div class="min-w-0 flex-1">
                  <h3 class="truncate text-lg font-bold text-foreground">{{ creature.name }}</h3>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="type in creature.types"
                      :key="type"
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      :style="{
                        color: typeColor(type),
                        backgroundColor: `hsl(${typeColorVar(type)} / 0.12)`
                      }"
                    >
                      {{ type }}
                    </span>
                    <span class="trait-chip max-w-full">
                      {{ toTitleCase(creature.trait) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Job mini progress bars -->
              <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div
                  v-for="[jobKey, jobName] in jobEntries"
                  :key="jobKey"
                  class="flex items-center gap-2"
                >
                  <span class="w-7 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {{ jobName.slice(0, 3) }}
                  </span>
                  <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                    <div
                      class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      :style="{
                        width: `${(creature.jobs[jobKey] / maxJobLevel) * 100}%`,
                        backgroundColor: jobColors[jobKey]
                      }"
                    />
                  </div>
                  <span class="w-4 shrink-0 text-right font-mono text-[10px] font-semibold text-muted-foreground">
                    {{ creature.jobs[jobKey] }}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="surface-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm" role="grid">
              <thead class="bg-muted/50">
                <tr>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'name' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('name')">
                      Name
                      <span :class="tableSortKey === 'name' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'tier' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('tier')">
                      Tier
                      <span :class="tableSortKey === 'tier' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'type' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('type')">
                      Type
                      <span :class="tableSortKey === 'type' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'trait' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('trait')">
                      Trait
                      <span :class="tableSortKey === 'trait' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    v-for="[jobKey, jobName] in jobEntries"
                    :key="jobKey"
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === jobKey ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy(jobKey)">
                      <span class="inline-block size-1.5 rounded-full" :style="{ backgroundColor: jobColors[jobKey] }"></span>
                      {{ jobName.slice(0, 3) }}
                      <span :class="tableSortKey === jobKey ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'jobTotal' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('jobTotal')">
                      Total
                      <span :class="tableSortKey === 'jobTotal' ? 'text-primary' : 'opacity-0'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60">
                <tr
                  v-for="creature in sortedCreatures"
                  :key="creature.id"
                  class="cursor-pointer transition-colors duration-150"
                  :class="selectedCreature?.id === creature.id ? 'bg-muted/40' : 'bg-card/50 hover:bg-muted/30'"
                  @click="selectCreature(creature)"
                >
                  <td
                    class="border-l-2 px-2 py-2.5"
                    :style="{ borderColor: selectedCreature?.id === creature.id ? typeColor(creature.types[0]) : 'transparent' }"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border text-xs font-bold text-muted-foreground"
                        :style="{ backgroundColor: 'hsl(' + typeColorVar(creature.types[0]) + ' / 0.1)' }"
                      >
                        <img
                          v-if="getCreatureImage(creature)"
                          :src="getCreatureImage(creature)"
                          :alt="`${creature.name} artwork`"
                          class="size-10 rounded-lg border border-border object-cover"
                          loading="lazy"
                        />
                        <span v-else>{{ creature.name.charAt(0) }}</span>
                      </div>
                      <span class="font-semibold text-foreground">{{ creature.name }}</span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5 font-mono text-xs text-muted-foreground">T{{ creature.tier + 1 }}</td>
                  <td class="px-2 py-2.5">
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="type in creature.types"
                        :key="type"
                        class="rounded-full px-2 py-0.5 text-xs font-semibold"
                        :style="{ color: typeColor(type), backgroundColor: 'hsl(' + typeColorVar(type) + ' / 0.12)' }"
                      >
                        {{ type }}
                      </span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5">
                    <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
                  </td>
                  <td
                    v-for="[jobKey] in jobEntries"
                    :key="jobKey"
                    class="px-2 py-2.5"
                  >
                    <div class="flex items-center gap-2">
                      <div class="relative h-2 w-10 overflow-hidden rounded-full bg-muted/60">
                        <div
                          class="absolute inset-y-0 left-0 rounded-full"
                          :style="{ width: (creature.jobs[jobKey] / maxJobLevel) * 100 + '%', backgroundColor: jobColors[jobKey] }"
                        />
                      </div>
                      <span class="w-4 text-right font-mono text-xs font-semibold text-muted-foreground">{{ creature.jobs[jobKey] }}</span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5 font-mono text-xs font-semibold text-foreground">{{ totalJobs(creature) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Detail Sidebar -->
      <aside v-if="selectedCreature" class="hidden w-[380px] shrink-0 xl:block">
        <div class="surface-card sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <!-- Gradient header with centered hero -->
          <div
            class="relative flex flex-col items-center px-5 pb-4 pt-6"
            :style="{
              background: `linear-gradient(180deg, hsl(${typeColorVar(selectedCreature.types[0])} / 0.15) 0%, transparent 100%)`
            }"
          >
            <button
              class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground"
              @click="closeDetail"
            >
              <X class="size-4" />
            </button>

            <img
              :src="getCreatureImage(selectedCreature)"
              :alt="`${selectedCreature.name} artwork`"
              class="size-24 rounded-2xl border-2 border-border object-cover shadow-lg"
              :style="{ backgroundColor: `hsl(${typeColorVar(selectedCreature.types[0])} / 0.1)` }"
            />
            <h2 class="mt-3 text-center text-2xl font-black leading-tight">{{ selectedCreature.name }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              T{{ selectedCreature.tier + 1 }} · {{ toTitleCase(selectedCreature.mainJob) }}
            </p>
            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <span
                v-for="type in selectedCreature.types"
                :key="type"
                class="rounded-full px-3 py-1 text-xs font-semibold"
                :style="{
                  color: typeColor(type),
                  backgroundColor: `hsl(${typeColorVar(type)} / 0.12)`
                }"
              >
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

            <!-- Stats with Radar Chart -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Stats</h3>
              <div class="flex justify-center">
                <StatRadarChart :creature="selectedCreature" :size="180" />
              </div>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div
                  v-for="[statKey, statLabel] in statEntries"
                  :key="statKey"
                  class="rounded-lg border px-2 py-2 text-center transition-colors"
                  :class="statHighlight(selectedCreature, statKey)"
                >
                  <p class="font-mono text-xs">{{ selectedCreature.stats[statKey] }}</p>
                  <p class="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{{ statLabel }}</p>
                </div>
              </div>
            </section>

            <!-- Job Levels with Proficiency Rings -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Job Levels</h3>
              <div class="flex flex-wrap justify-center gap-3">
                <ProficiencyRing
                  v-for="[jobKey, jobName] in jobEntries"
                  :key="jobKey"
                  :label="jobName.slice(0, 3)"
                  :value="selectedCreature.jobs[jobKey]"
                  :max-value="maxJobLevel"
                  :color="jobColors[jobKey]"
                  size="sm"
                />
              </div>
            </section>

            <!-- Summoning Cost -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Summoning Cost</h3>
              <div class="space-y-2">
                <div
                  v-for="cost in selectedCreature.summoningCost"
                  :key="cost.id"
                  class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <img v-if="getItemImage({ id: cost.id })" :src="getItemImage({ id: cost.id })" :alt="toTitleCase(cost.id)" class="size-5 shrink-0 object-contain" />
                  <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <span class="flex-1 text-sm text-foreground">{{ toTitleCase(cost.id) }}</span>
                  <span class="font-mono text-sm font-semibold text-muted-foreground">x{{ cost.amount }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>

    <!-- Mobile Modal -->
    <Teleport to="body">
      <div
        v-if="selectedCreature && isMobile"
        class="fixed inset-0 z-50 bg-background/92 p-4 backdrop-blur-sm xl:hidden"
        @click.self="closeDetail"
      >
        <div class="mx-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-card">
          <!-- Gradient header -->
          <div
            class="relative flex flex-col items-center px-5 pb-4 pt-6"
            :style="{
              background: `linear-gradient(180deg, hsl(${typeColorVar(selectedCreature.types[0])} / 0.15) 0%, transparent 100%)`
            }"
          >
            <button
              class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 backdrop-blur"
              @click="closeDetail"
            >
              <X class="size-4" />
            </button>

            <img
              :src="getCreatureImage(selectedCreature)"
              :alt="`${selectedCreature.name} artwork`"
              class="size-20 rounded-2xl border-2 border-border object-cover shadow-lg"
              :style="{ backgroundColor: `hsl(${typeColorVar(selectedCreature.types[0])} / 0.1)` }"
            />
            <h2 class="mt-3 text-center text-xl font-black">{{ selectedCreature.name }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              T{{ selectedCreature.tier + 1 }} · {{ toTitleCase(selectedCreature.mainJob) }}
            </p>
            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <span
                v-for="type in selectedCreature.types"
                :key="type"
                class="rounded-full px-3 py-1 text-xs font-semibold"
                :style="{
                  color: typeColor(type),
                  backgroundColor: `hsl(${typeColorVar(type)} / 0.12)`
                }"
              >
                {{ type }}
              </span>
              <span class="trait-chip">{{ toTitleCase(selectedCreature.trait) }}</span>
            </div>
          </div>

          <div class="space-y-5 px-5 pb-5">
            <!-- Description -->
            <div class="border-t border-border/60 pt-4">
              <p class="text-sm text-muted-foreground">{{ selectedCreature.description }}</p>
            </div>

            <!-- Stats with Radar Chart -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Stats</h3>
              <div class="flex justify-center">
                <StatRadarChart :creature="selectedCreature" :size="160" />
              </div>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div
                  v-for="[statKey, statLabel] in statEntries"
                  :key="statKey"
                  class="rounded-lg border px-2 py-2 text-center transition-colors"
                  :class="statHighlight(selectedCreature, statKey)"
                >
                  <p class="font-mono text-xs">{{ selectedCreature.stats[statKey] }}</p>
                  <p class="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{{ statLabel }}</p>
                </div>
              </div>
            </section>

            <!-- Job Levels with Proficiency Rings -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Job Levels</h3>
              <div class="flex flex-wrap justify-center gap-3">
                <ProficiencyRing
                  v-for="[jobKey, jobName] in jobEntries"
                  :key="jobKey"
                  :label="jobName.slice(0, 3)"
                  :value="selectedCreature.jobs[jobKey]"
                  :max-value="maxJobLevel"
                  :color="jobColors[jobKey]"
                  size="sm"
                />
              </div>
            </section>

            <!-- Summoning Cost -->
            <section class="border-t border-border/60 pt-4">
              <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Summoning Cost</h3>
              <div class="space-y-2">
                <div
                  v-for="cost in selectedCreature.summoningCost"
                  :key="cost.id"
                  class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <img v-if="getItemImage({ id: cost.id })" :src="getItemImage({ id: cost.id })" :alt="toTitleCase(cost.id)" class="size-5 shrink-0 object-contain" />
                  <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <span class="flex-1 text-sm text-foreground">{{ toTitleCase(cost.id) }}</span>
                  <span class="font-mono text-sm font-semibold text-muted-foreground">x{{ cost.amount }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
