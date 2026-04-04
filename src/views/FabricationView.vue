<script setup lang="ts">
import { Minus, Plus, Sparkles } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import { items, jobActivityIndex } from '@/data/indexes'
import { toTitleCase } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const FABRICATION_INTERVAL_SECONDS = 180
const MAX_ALLOCATION_PER_ITEM = 5
const CYCLES_PER_HOUR = 3600 / FABRICATION_INTERVAL_SECONDS


const GATHER_SOURCES = ['chopping', 'mining', 'digging', 'exploring', 'fishing', 'farming'] as const


const { fabricationAllocations } = useGameConfig()


const columns = computed(() =>
  GATHER_SOURCES.map((source) => {
    const sourceItems = items
      .filter((item) => {
        if (!(item.sources ?? []).includes(source)) return false
        const activities = jobActivityIndex.get(item.id) ?? []
        if (activities.length === 0) return false
        const lowestLevel = Math.min(...activities.map((a) => a.levelRequirement))
        const primaryActivity = activities.find((a) => a.levelRequirement === lowestLevel)
        return primaryActivity ? primaryActivity.chance >= 1 : false
      })
      .map((item) => {
        const activities = jobActivityIndex.get(item.id) ?? []
        const level =
          activities.length > 0 ? Math.min(...activities.map((a) => a.levelRequirement)) : 0
        return { id: item.id, name: item.name, level }
      })
      .toSorted((a, b) => a.level - b.level)
    return { source, label: toTitleCase(source), items: sourceItems }
  }),
)


const allocations = ref<Record<string, number>>({})


// Sync from save data when it changes
watch(
  fabricationAllocations,
  (saveData) => {
    const merged = { ...allocations.value }
    for (const [itemId, amount] of Object.entries(saveData)) {
      if (amount > 0) merged[itemId] = amount
    }
    allocations.value = merged
  },
  { immediate: true },
)


function adjustPoints(itemId: string, delta: number) {
  const current = allocations.value[itemId] ?? 0
  const next = Math.max(0, Math.min(MAX_ALLOCATION_PER_ITEM, current + delta))
  if (next === 0) {
    const { [itemId]: _, ...rest } = allocations.value
    allocations.value = rest
  } else {
    allocations.value = { ...allocations.value, [itemId]: next }
  }
}


function getPoints(itemId: string): number {
  return allocations.value[itemId] ?? 0
}


const totalPoints = computed(() => Object.values(allocations.value).reduce((sum, n) => sum + n, 0))


const savePoints = computed(() =>
  Object.values(fabricationAllocations.value).reduce((sum, n) => sum + n, 0),
)


const simulatedPoints = computed(() => totalPoints.value - savePoints.value)


const totalPerHour = computed(() => totalPoints.value * CYCLES_PER_HOUR)


const prestigeImage = computed(() => getItemImage({ id: 'prestige-points' }))
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">Fabrication</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Allocate prestige points to passively generate gathering items. Each point produces 1 item
        every 3 minutes ({{ CYCLES_PER_HOUR }}/hr), up to {{ MAX_ALLOCATION_PER_ITEM }} points per
        item.
      </p>
    </div>

    <!-- Summary bar -->
    <div
      v-if="totalPoints > 0"
      class="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <img v-if="prestigeImage" :src="prestigeImage" alt="" class="size-5" />
          <span class="font-semibold">{{ totalPoints }} points</span>
        </div>
        <div
          v-if="savePoints > 0 || simulatedPoints !== 0"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span
            v-if="savePoints > 0"
            class="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary"
          >
            {{ savePoints }} from save
          </span>
          <span
            v-if="simulatedPoints > 0"
            class="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400"
          >
            +{{ simulatedPoints }} simulated
          </span>
          <span
            v-else-if="simulatedPoints < 0"
            class="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-600 dark:text-red-400"
          >
            {{ simulatedPoints }} removed
          </span>
        </div>
      </div>
      <span class="font-semibold text-primary">{{ totalPerHour }} items/hr</span>
    </div>

    <!-- Item grid by source -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div v-for="col in columns" :key="col.source">
        <!-- Column header -->
        <div class="mb-3 flex items-center gap-2">
          <img
            v-if="sourceIcons[toTitleCase(col.source)]"
            :src="sourceIcons[toTitleCase(col.source)]"
            alt=""
            class="size-5"
          />
          <h2 class="text-sm font-semibold">{{ col.label }}</h2>
        </div>

        <!-- Items -->
        <div class="space-y-1.5">
          <div
            v-for="item in col.items"
            :key="item.id"
            class="flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors"
            :class="
              getPoints(item.id) > 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
            "
          >
            <!-- Allocation bar (vertical) -->
            <div class="flex flex-col-reverse gap-0.5">
              <span
                v-for="dot in MAX_ALLOCATION_PER_ITEM"
                :key="dot"
                class="h-1.5 w-3 rounded-sm transition-colors"
                :class="dot <= getPoints(item.id) ? 'bg-primary' : 'bg-muted'"
              />
            </div>

            <!-- Item image -->
            <img
              v-if="getItemImage({ id: item.id })"
              :src="getItemImage({ id: item.id })!"
              :alt="item.name"
              class="size-7 shrink-0"
            />

            <!-- Name & level -->
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-medium">{{ item.name }}</div>
              <div class="text-[10px] text-muted-foreground">
                <template v-if="getPoints(item.id) > 0">
                  {{ getPoints(item.id) * CYCLES_PER_HOUR }}/hr
                </template>
                <template v-else>Lv {{ item.level }}</template>
              </div>
            </div>

            <!-- Controls -->
            <div class="flex flex-col gap-0.5">
              <button
                class="flex size-5 items-center justify-center rounded border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                :disabled="getPoints(item.id) >= MAX_ALLOCATION_PER_ITEM"
                @click="adjustPoints(item.id, 1)"
              >
                <Plus class="size-3" />
              </button>
              <button
                class="flex size-5 items-center justify-center rounded border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                :disabled="getPoints(item.id) <= 0"
                @click="adjustPoints(item.id, -1)"
              >
                <Minus class="size-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <section
      v-if="totalPoints === 0"
      class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center"
    >
      <Sparkles class="size-8 text-muted-foreground/50" />
      <div>
        <p class="font-medium text-muted-foreground">
          Use the +/- buttons above to simulate fabrication allocations
        </p>
        <p class="mt-1 text-sm text-muted-foreground/70">
          Upload your save file in
          <RouterLink to="/configs" class="text-primary underline underline-offset-2">
            Configs
          </RouterLink>
          to auto-fill your current allocations.
        </p>
      </div>
    </section>
  </div>
</template>
