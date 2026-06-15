<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { Minus, Plus, Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { useGameConfig } from '@/composables/useGameConfig'
import { items, jobActivityIndex } from '@/data/indexes'
import { toTitleCase } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const { t } = useI18n()


const FABRICATION_INTERVAL_SECONDS = 180
const MAX_ALLOCATION_PER_ITEM = 5
const CYCLES_PER_HOUR = 3600 / FABRICATION_INTERVAL_SECONDS


const GATHER_SOURCES = ['chopping', 'mining', 'digging', 'exploring', 'fishing', 'farming'] as const


// fabricationAllocations = immutable save baseline (only changed by save import in ConfigsView)
// simulatedAllocations = user's manual adjustments on this page (separate localStorage)
const { fabricationAllocations, inventoryAmounts } = useGameConfig()
const simulatedAllocations = useLocalStorage<Record<string, number>>('fabrication-simulated', {})


const columns = computed(() =>
  GATHER_SOURCES.map((source) => {
    const jobId = toTitleCase(source)
    const sourceItems = items
      .filter((item) => {
        if (!(item.sources ?? []).includes(source)) return false
        const activities = (jobActivityIndex.get(item.id) ?? []).filter((a) => a.jobId === jobId)
        if (activities.length === 0) return false
        const lowestLevel = Math.min(...activities.map((a) => a.levelRequirement))
        const primaryActivity = activities.find((a) => a.levelRequirement === lowestLevel)
        return primaryActivity ? primaryActivity.chance >= 1 : false
      })
      .map((item) => {
        const activities = (jobActivityIndex.get(item.id) ?? []).filter((a) => a.jobId === jobId)
        const level =
          activities.length > 0 ? Math.min(...activities.map((a) => a.levelRequirement)) : 0
        return { id: item.id, name: item.name, level }
      })
      .toSorted((a, b) => a.level - b.level)
    return { source, label: toTitleCase(source), items: sourceItems }
  }),
)


// Merged view: save baseline + simulated overrides
const allocations = computed(() => ({
  ...fabricationAllocations.value,
  ...simulatedAllocations.value,
}))


function adjustPoints(itemId: string, delta: number) {
  const current = allocations.value[itemId] ?? 0
  const next = Math.max(0, Math.min(MAX_ALLOCATION_PER_ITEM, current + delta))
  const saved = fabricationAllocations.value[itemId] ?? 0
  if (next === saved) {
    // Back to save value — remove the override
    const { [itemId]: _, ...rest } = simulatedAllocations.value
    simulatedAllocations.value = rest
  } else {
    // Store override (including 0 to override a save value)
    simulatedAllocations.value = { ...simulatedAllocations.value, [itemId]: next }
  }
}


function resetToSave() {
  simulatedAllocations.value = {}
}


const hasSimulatedChanges = computed(() => addedPoints.value > 0 || removedPoints.value > 0)


function getPoints(itemId: string): number {
  return allocations.value[itemId] ?? 0
}


function getSavePoints(itemId: string): number {
  return fabricationAllocations.value[itemId] ?? 0
}


function getDotState(itemId: string, dotIndex: number): 'save' | 'simulated' | 'removed' | 'empty' {
  const current = getPoints(itemId)
  const saved = getSavePoints(itemId)
  if (dotIndex <= current && dotIndex <= saved) return 'save'
  if (dotIndex <= current && dotIndex > saved) return 'simulated'
  if (dotIndex > current && dotIndex <= saved) return 'removed'
  return 'empty'
}


function getCardState(itemId: string): 'normal' | 'simulated' | 'removed' {
  const current = getPoints(itemId)
  const saved = getSavePoints(itemId)
  if (current > saved) return 'simulated'
  if (current < saved) return 'removed'
  return 'normal'
}


const totalPoints = computed(() => Object.values(allocations.value).reduce((sum, n) => sum + n, 0))


const savePoints = computed(() =>
  Object.values(fabricationAllocations.value).reduce((sum, n) => sum + n, 0),
)


const addedPoints = computed(() => {
  let added = 0
  for (const [itemId, current] of Object.entries(allocations.value)) {
    const saved = fabricationAllocations.value[itemId] ?? 0
    if (current > saved) added += current - saved
  }
  return added
})


const removedPoints = computed(() => {
  let removed = 0
  for (const [itemId, saved] of Object.entries(fabricationAllocations.value)) {
    const current = allocations.value[itemId] ?? 0
    if (current < saved) removed += saved - current
  }
  return removed
})


const savedUnallocated = computed(() => inventoryAmounts.value['prestige-points'] ?? 0)
const unallocatedPoints = computed(
  () => savedUnallocated.value + removedPoints.value - addedPoints.value,
)


const totalPerHour = computed(() => totalPoints.value * CYCLES_PER_HOUR)
const totalPerMin = computed(
  () => +(totalPoints.value / (FABRICATION_INTERVAL_SECONDS / 60)).toFixed(1),
)


const prestigeImage = computed(() => getItemImage({ id: 'prestige-points' }))
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">{{ t('fabricationView.title') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{
          t('fabricationView.subtitle', {
            cyclesPerHour: CYCLES_PER_HOUR,
            maxPoints: MAX_ALLOCATION_PER_ITEM,
          })
        }}
      </p>
    </div>

    <!-- Summary bar -->
    <div
      class="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <img v-if="prestigeImage" :src="prestigeImage" alt="" class="size-5" loading="lazy" />
          <span class="font-semibold">{{
            t('fabricationView.points', { n: totalPoints }, totalPoints)
          }}</span>
        </div>
        <div
          v-if="savePoints > 0 || addedPoints > 0 || removedPoints > 0 || savedUnallocated > 0"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span
            v-if="savePoints > 0"
            class="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary"
          >
            {{ savePoints }} {{ t('fabricationView.fromSave') }}
          </span>
          <span
            v-if="savedUnallocated > 0"
            :class="
              unallocatedPoints < 0
                ? 'rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-600 dark:text-red-400'
                : 'rounded-full bg-muted px-2 py-0.5 font-medium text-foreground'
            "
            :title="
              unallocatedPoints < 0
                ? t('fabricationView.unallocatedExceedTitle', { n: Math.abs(unallocatedPoints) })
                : t('fabricationView.unallocatedTitle')
            "
          >
            {{ unallocatedPoints }} {{ t('fabricationView.unallocated') }}
          </span>
          <span
            v-if="addedPoints > 0"
            class="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400"
          >
            +{{ addedPoints }} {{ t('fabricationView.simulated') }}
          </span>
          <span
            v-if="removedPoints > 0"
            class="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-600 dark:text-red-400"
          >
            -{{ removedPoints }} {{ t('fabricationView.removed') }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
          :class="{ 'pointer-events-none invisible': !hasSimulatedChanges }"
          @click="resetToSave"
        >
          {{ t('fabricationView.reset') }}
        </button>
        <span class="font-semibold text-primary"
          >{{ totalPerMin }}{{ t('common.perMin') }} · {{ totalPerHour
          }}{{ t('common.perHour') }}</span
        >
      </div>
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
            loading="lazy"
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
              getCardState(item.id) === 'simulated'
                ? 'border-amber-500/40 bg-amber-500/5'
                : getCardState(item.id) === 'removed'
                  ? 'border-red-500/40 bg-red-500/5'
                  : getPoints(item.id) > 0
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-card'
            "
          >
            <!-- Allocation bar (vertical) -->
            <div class="flex flex-col-reverse gap-0.5">
              <span
                v-for="dot in MAX_ALLOCATION_PER_ITEM"
                :key="dot"
                class="h-1.5 w-3 rounded-sm transition-colors"
                :class="{
                  'bg-primary': getDotState(item.id, dot) === 'save',
                  'bg-amber-500': getDotState(item.id, dot) === 'simulated',
                  'bg-red-500/50': getDotState(item.id, dot) === 'removed',
                  'bg-muted': getDotState(item.id, dot) === 'empty',
                }"
              />
            </div>

            <!-- Item image -->
            <img
              v-if="getItemImage({ id: item.id })"
              :src="getItemImage({ id: item.id })!"
              :alt="item.name"
              class="size-7 shrink-0"
              loading="lazy"
            />

            <!-- Name & level -->
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-medium">{{ item.name }}</div>
              <div
                class="text-[10px]"
                :class="{
                  'text-amber-600 dark:text-amber-400': getCardState(item.id) === 'simulated',
                  'text-red-600 dark:text-red-400': getCardState(item.id) === 'removed',
                  'text-muted-foreground': getCardState(item.id) === 'normal',
                }"
              >
                <template v-if="getPoints(item.id) > 0">
                  {{ +(getPoints(item.id) / (FABRICATION_INTERVAL_SECONDS / 60)).toFixed(1)
                  }}{{ t('common.perMin') }} · {{ getPoints(item.id) * CYCLES_PER_HOUR
                  }}{{ t('common.perHour') }}
                </template>
                <template v-else-if="getSavePoints(item.id) > 0">
                  {{
                    t('fabricationView.perHrRemoved', {
                      n: getSavePoints(item.id) * CYCLES_PER_HOUR,
                    })
                  }}
                </template>
                <template v-else>{{ t('fabricationView.levelLabel', { n: item.level }) }}</template>
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
          {{ t('fabricationView.emptyTitle') }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground/70">
          {{ t('fabricationView.emptySubtitle') }}
          <RouterLink to="/configs" class="text-primary underline underline-offset-2">
            {{ t('fabricationView.emptyConfigs') }}
          </RouterLink>
          {{ t('fabricationView.emptySubtitleSuffix') }}
        </p>
      </div>
    </section>
  </div>
</template>
