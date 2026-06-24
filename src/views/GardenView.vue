<script setup lang="ts">
import { Info, Minus, Trash2 } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import { useGameConfig } from '@/composables/useGameConfig'
import type { GardenCell } from '@/types'
import { formatNumber } from '@/utils/format/format'
import { gardenIcon } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

const {
  gardenLayout,
  gardenLayoutFromSave,
  setGardenCell,
  setGardenLayout,
  hasGardenSaveSnapshot,
  hasGardenChanges,
  revertGardenToSaveSnapshot,
} = useGameConfig()


const { t } = useI18n()


function resetGardenView() {
  if (hasGardenSaveSnapshot.value) {
    revertGardenToSaveSnapshot()
  } else {
    setGardenLayout([])
  }
  selectedIndex.value = null
}


const GRID_SIZE = 25
const MAX_LEVEL = 6
const CYCLE_SECONDS = 60
const FLOWER_BUY_VALUE = 2500
const ROCK_BASE_COST = 750
const ROCK_GROWTH = 1.191232


type FlowerKey = 'fire-flower' | 'wind-flower' | 'earth-flower' | 'water-flower' | 'gold-flower'


interface FlowerMeta {
  id: FlowerKey
  name: string
  color: string
  yieldOf: string
  yieldId: string
  unit: string
}


const FLOWERS: FlowerMeta[] = [
  {
    id: 'fire-flower',
    name: 'Fire',
    color: '8 84% 58%',
    yieldOf: 'Raw Fire Essence',
    yieldId: 'raw-fire-essence',
    unit: 'essence',
  },
  {
    id: 'wind-flower',
    name: 'Wind',
    color: '210 8% 70%',
    yieldOf: 'Raw Wind Essence',
    yieldId: 'raw-wind-essence',
    unit: 'essence',
  },
  {
    id: 'earth-flower',
    name: 'Earth',
    color: '154 72% 45%',
    yieldOf: 'Raw Earth Essence',
    yieldId: 'raw-earth-essence',
    unit: 'essence',
  },
  {
    id: 'water-flower',
    name: 'Water',
    color: '198 88% 56%',
    yieldOf: 'Raw Water Essence',
    yieldId: 'raw-water-essence',
    unit: 'essence',
  },
  {
    id: 'gold-flower',
    name: 'Gold',
    color: '45 90% 55%',
    yieldOf: 'Gold',
    yieldId: 'gold',
    unit: 'g',
  },
]


const GOLD_ITEM_ID = 'gold'
const FERTILIZER_ITEM_ID = 'fertilizer'
const ROCK_ITEM_ID = 'stone'


const FLOWER_BY_ID: Map<string, FlowerMeta> = new Map(FLOWERS.map((f) => [f.id, f]))


// --- Selection (which cell the user is inspecting) ---
const selectedIndex = ref<number | null>(null)


function selectCell(index: number) {
  selectedIndex.value = selectedIndex.value === index ? null : index
}


// --- Derived totals ---
const totalPlantedCount = computed(() =>
  gardenLayout.value.reduce((sum, c) => sum + (c ? 1 : 0), 0),
)


// --- Cost calculations ---
function rockCostAt(rocksAlreadyRemoved: number): number {
  return Math.floor(ROCK_BASE_COST * Math.pow(ROCK_GROWTH, rocksAlreadyRemoved))
}


// Total gold to clear the full 25-plot garden bed.
const fullBedClearCost = computed(() => {
  let total = 0
  for (let i = 0; i < GRID_SIZE; i++) total += rockCostAt(i)
  return total
})


const fertilizerToReachCurrent = computed(() => {
  let total = 0
  for (const cell of gardenLayout.value) {
    if (!cell) continue
    for (let l = 1; l < cell.level; l++) total += l
  }
  return total
})


const fertilizerToMaxAll = computed(() => {
  let total = 0
  for (const cell of gardenLayout.value) {
    if (!cell) continue
    for (let l = cell.level; l < MAX_LEVEL; l++) total += l
  }
  return total
})


// --- Simulation diff vs. imported-save snapshot ---
function isValidCell(cell: unknown): cell is GardenCell {
  return (
    !!cell &&
    typeof (cell as GardenCell).flowerId === 'string' &&
    FLOWER_BY_ID.has((cell as GardenCell).flowerId) &&
    typeof (cell as GardenCell).level === 'number'
  )
}


const diffCounts = computed(() => {
  const snap = gardenLayoutFromSave.value
  if (!snap) return { planted: 0, added: totalPlantedCount.value, removed: 0 }
  let planted = 0
  let added = 0
  let removed = 0
  for (let i = 0; i < GRID_SIZE; i++) {
    const curValid = isValidCell(gardenLayout.value[i] ?? null)
    const prevValid = isValidCell(snap[i] ?? null)
    if (prevValid) planted++
    if (curValid && !prevValid) added++
    if (!curValid && prevValid) removed++
  }
  return { planted, added, removed }
})


// --- Cell interactions ---
function fertilizerForLevelUp(currentLevel: number): number {
  return currentLevel
}


function levelUpCell(index: number) {
  const cell = gardenLayout.value[index]
  if (!cell || cell.level >= MAX_LEVEL) return
  setGardenCell(index, { ...cell, level: cell.level + 1 })
}


function levelDownCell(index: number) {
  const cell = gardenLayout.value[index]
  if (!cell || cell.level <= 1) return
  setGardenCell(index, { ...cell, level: cell.level - 1 })
}


function changeCellFlower(index: number, flowerId: FlowerKey) {
  const cell = gardenLayout.value[index]
  setGardenCell(index, { flowerId, level: cell?.level ?? 1 })
}


function removeCell(index: number) {
  setGardenCell(index, null)
}


function plantInSelected(flowerId: FlowerKey) {
  if (selectedIndex.value === null) return
  setGardenCell(selectedIndex.value, { flowerId, level: 1 })
}


// --- Per-flower summary (for the right-hand list) ---
const flowerSummary = computed(() => {
  const totals = new Map<string, { count: number; yieldPerMin: number }>()
  for (const f of FLOWERS) totals.set(f.id, { count: 0, yieldPerMin: 0 })
  for (const c of gardenLayout.value) {
    if (!c) continue
    const t = totals.get(c.flowerId)
    if (!t) continue
    t.count++
    t.yieldPerMin += c.level
  }
  return FLOWERS.map((f) => ({ ...f, ...totals.get(f.id)! }))
})


// --- Visual cell state ---
type VisualCell =
  | { kind: 'flower'; layoutIndex: number; cell: GardenCell }
  | { kind: 'empty'; layoutIndex: number }


const visualCells = computed<VisualCell[]>(() => {
  const cells: VisualCell[] = []
  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = gardenLayout.value[i] ?? null
    if (isValidCell(cell)) cells.push({ kind: 'flower', layoutIndex: i, cell })
    else cells.push({ kind: 'empty', layoutIndex: i })
  }
  return cells
})


const selectedVisualCell = computed<VisualCell | null>(() => {
  if (selectedIndex.value === null) return null
  return visualCells.value[selectedIndex.value] ?? null
})


const selectedFlowerMeta = computed(() => {
  const v = selectedVisualCell.value
  if (!v || v.kind !== 'flower') return null
  return FLOWER_BY_ID.get(v.cell.flowerId as FlowerKey) ?? null
})


// --- Right-column flash highlights ---
const recentlyChangedFlowers = ref<Set<string>>(new Set())
const flashTimers = new Map<string, number>()
const FLASH_DURATION_MS = 2200


function flashFlower(id: string) {
  const existing = flashTimers.get(id)
  if (existing) window.clearTimeout(existing)
  const next = new Set(recentlyChangedFlowers.value)
  next.add(id)
  recentlyChangedFlowers.value = next
  const t = window.setTimeout(() => {
    const cleared = new Set(recentlyChangedFlowers.value)
    cleared.delete(id)
    recentlyChangedFlowers.value = cleared
    flashTimers.delete(id)
  }, FLASH_DURATION_MS)
  flashTimers.set(id, t)
}


onBeforeUnmount(() => {
  for (const t of flashTimers.values()) window.clearTimeout(t)
  flashTimers.clear()
})


let lastFlowerSnapshot: Record<string, string> = {}
let didInitFlowerSnapshot = false


watch(
  () =>
    flowerSummary.value.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = `${s.count}:${s.yieldPerMin}`
      return acc
    }, {}),
  (snapshot) => {
    if (!didInitFlowerSnapshot) {
      lastFlowerSnapshot = snapshot
      didInitFlowerSnapshot = true
      return
    }
    for (const f of FLOWERS) {
      if (snapshot[f.id] !== lastFlowerSnapshot[f.id]) flashFlower(f.id)
    }
    lastFlowerSnapshot = snapshot
  },
  { deep: true },
)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">Garden</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t('gardenView.intro', { seconds: CYCLE_SECONDS }) }}
      </p>
    </div>

    <!-- Summary bar -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
    >
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <img :src="gardenIcon" alt="Garden" class="size-5 object-contain" loading="lazy" />
          <span class="font-semibold">
            {{ t('gardenView.planted', { count: totalPlantedCount, total: GRID_SIZE }) }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span
            v-if="hasGardenSaveSnapshot && diffCounts.planted > 0"
            class="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary"
          >
            {{ t('gardenView.fromSave', { n: diffCounts.planted }) }}
          </span>
          <span
            v-if="diffCounts.added > 0"
            class="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-strong"
          >
            {{ t('gardenView.simulated', { n: diffCounts.added }) }}
          </span>
          <span
            v-if="diffCounts.removed > 0"
            class="rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger-strong"
          >
            {{ t('gardenView.removed', { n: diffCounts.removed }) }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
          :class="{ 'pointer-events-none invisible': !hasGardenChanges }"
          :title="
            hasGardenSaveSnapshot ? t('gardenView.revertTitle') : t('gardenView.clearBedTitle')
          "
          @click="resetGardenView"
        >
          {{ t('common.reset') }}
        </button>
        <span
          v-if="totalPlantedCount > 0 || fertilizerToReachCurrent > 0"
          class="inline-flex items-center gap-2 font-mono text-2xs text-primary"
        >
          {{ t('gardenView.total') }}
          <AppTooltip
            v-if="totalPlantedCount > 0"
            :text="
              t('gardenView.totalGoldTooltip', {
                flowers:
                  totalPlantedCount === 1
                    ? t('gardenView.flowerCount', { n: totalPlantedCount })
                    : t('gardenView.flowersCount', { n: totalPlantedCount }),
                cost: formatNumber(FLOWER_BUY_VALUE),
              })
            "
          >
            <span
              class="inline-flex items-center gap-1 font-semibold"
              :style="{ color: `hsl(${FLOWERS[4].color})` }"
            >
              <img
                :src="getItemImage({ id: GOLD_ITEM_ID })"
                alt="Gold"
                class="size-3.5 object-contain"
                loading="lazy"
              />
              {{ formatNumber(totalPlantedCount * FLOWER_BUY_VALUE) }}
            </span>
          </AppTooltip>
          <AppTooltip
            v-if="fertilizerToReachCurrent > 0"
            :text="
              fertilizerToMaxAll > 0
                ? t('gardenView.fertilizerToMax', { n: fertilizerToMaxAll })
                : t('gardenView.fertilizerUsed')
            "
            :disabled="fertilizerToMaxAll === 0"
          >
            <span
              class="inline-flex items-center gap-1 font-semibold text-fuchsia-700 dark:text-fuchsia-300"
            >
              <img
                :src="getItemImage({ id: FERTILIZER_ITEM_ID })"
                alt="Fertilizer"
                class="size-3.5 object-contain"
                loading="lazy"
              />
              {{ fertilizerToReachCurrent }}
            </span>
          </AppTooltip>
        </span>
      </div>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      <!-- Left column: grid + selection panel -->
      <div class="space-y-4">
        <div class="rounded-xl border border-border bg-card/50 p-4">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <img :src="gardenIcon" alt="Garden" class="size-4 object-contain" loading="lazy" />
              <h2 class="text-sm font-extrabold">{{ t('gardenView.gardenBed') }}</h2>
            </div>
            <span
              class="inline-flex items-center gap-1 font-mono text-3xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              <img
                :src="getItemImage({ id: ROCK_ITEM_ID })"
                :alt="t('gardenView.rockAlt')"
                class="size-3 object-contain"
                loading="lazy"
              />
              {{ t('gardenView.clearBed') }}
              <AppTooltip>
                <Info class="size-3 text-muted-foreground/70 hover:text-foreground" />
                <template #content>
                  <span class="normal-case tracking-normal">
                    {{ t('gardenView.clearBedCostLead') }}
                    <span class="inline-flex items-center gap-1 align-middle">
                      <img
                        :src="getItemImage({ id: GOLD_ITEM_ID })"
                        alt="Gold"
                        class="size-3.5 object-contain"
                        loading="lazy"
                      />
                      <span
                        class="font-mono font-semibold"
                        :style="{ color: `hsl(${FLOWERS[4].color})` }"
                      >
                        {{ formatNumber(fullBedClearCost) }}
                      </span>
                    </span>
                    {{ t('gardenView.clearBedCostFirstRock') }}
                    <span class="inline-flex items-center gap-1 align-middle">
                      <img
                        :src="getItemImage({ id: GOLD_ITEM_ID })"
                        alt="Gold"
                        class="size-3.5 object-contain"
                        loading="lazy"
                      />
                      <span
                        class="font-mono font-semibold"
                        :style="{ color: `hsl(${FLOWERS[4].color})` }"
                      >
                        {{ formatNumber(rockCostAt(0)) }}
                      </span> </span
                    >{{ t('gardenView.clearBedCostLastRock') }}
                    <span class="inline-flex items-center gap-1 align-middle">
                      <img
                        :src="getItemImage({ id: GOLD_ITEM_ID })"
                        alt="Gold"
                        class="size-3.5 object-contain"
                        loading="lazy"
                      />
                      <span
                        class="font-mono font-semibold"
                        :style="{ color: `hsl(${FLOWERS[4].color})` }"
                      >
                        {{ formatNumber(rockCostAt(GRID_SIZE - 1)) }}
                      </span> </span
                    >{{ t('gardenView.clearBedCostEnd') }}
                  </span>
                </template>
              </AppTooltip>
            </span>
          </div>

          <div class="garden-bed grid grid-cols-5 gap-1.5 rounded-xl border border-border/70 p-3">
            <template v-for="(v, i) in visualCells" :key="i">
              <!-- Flower cell -->
              <button
                v-if="v.kind === 'flower'"
                type="button"
                class="garden-cell focus-ring relative aspect-square overflow-hidden rounded-md border transition"
                :class="
                  selectedIndex === i
                    ? 'garden-cell-selected ring-2 ring-warning dark:ring-warning'
                    : ''
                "
                :style="{
                  borderColor: `hsl(${FLOWER_BY_ID.get(v.cell.flowerId)?.color} / 0.55)`,
                }"
                :aria-label="
                  t('gardenView.cellAria', {
                    name: FLOWER_BY_ID.get(v.cell.flowerId)?.name,
                    level: v.cell.level,
                  })
                "
                @click="selectCell(i)"
              >
                <img
                  :src="getItemImage({ id: v.cell.flowerId })"
                  :alt="v.cell.flowerId"
                  class="absolute inset-0 size-full object-contain p-1"
                  loading="lazy"
                />
                <span
                  class="garden-cell-level absolute bottom-0 right-0 py-0.5 pl-1.5 pr-1 font-mono text-3xs font-bold tabular-nums leading-none"
                  style="clip-path: polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)"
                >
                  {{ t('gardenView.levelBadge', { n: v.cell.level }) }}
                </span>
              </button>

              <!-- Empty cell -->
              <button
                v-else
                type="button"
                class="garden-cell-empty focus-ring aspect-square rounded-md border border-dashed transition"
                :class="selectedIndex === i ? 'garden-cell-empty-selected ring-2' : ''"
                :aria-label="t('gardenView.emptyPlot')"
                @click="selectCell(i)"
              />
            </template>
          </div>
        </div>

        <!-- Selection panel -->
        <div class="min-h-[15rem] rounded-xl border border-border bg-card/50 p-4">
          <div
            v-if="!selectedVisualCell"
            class="flex h-full min-h-[13rem] items-center justify-center text-center text-sm text-muted-foreground"
          >
            {{ t('gardenView.selectPrompt') }}
          </div>

          <!-- Empty plot selected -->
          <div v-else-if="selectedVisualCell.kind === 'empty'" class="space-y-3">
            <div class="flex items-center gap-3">
              <div
                class="garden-thumb-empty flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed"
              >
                <span class="font-mono text-3xs uppercase tracking-wider text-muted-foreground">
                  {{ t('gardenView.empty') }}
                </span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-extrabold leading-tight">
                  {{ t('gardenView.plantAFlower') }}
                </div>
                <div class="font-mono text-3xs text-muted-foreground">
                  {{ t('gardenView.pickFlowerBelow') }}
                </div>
              </div>
            </div>
            <div
              class="flex h-9 items-center justify-center gap-1 rounded-lg border border-border bg-muted/60 px-3 font-mono text-3xs text-muted-foreground dark:border-border/60 dark:bg-muted/20"
            >
              <span>{{ t('gardenView.merchantCostLead') }}</span>
              <span class="inline-flex items-center gap-1 align-middle">
                <img
                  :src="getItemImage({ id: GOLD_ITEM_ID })"
                  alt="Gold"
                  class="size-3.5 object-contain"
                  loading="lazy"
                />
                <span
                  class="font-mono font-semibold"
                  :style="{ color: `hsl(${FLOWERS[4].color})` }"
                >
                  {{ formatNumber(FLOWER_BUY_VALUE) }}
                </span>
              </span>
              <span>{{ t('gardenView.perFlower') }}</span>
            </div>
            <div class="grid grid-cols-5 gap-1">
              <button
                v-for="flower in FLOWERS"
                :key="flower.id"
                class="focus-ring group relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded border bg-card/70 transition hover:bg-card"
                :style="{ borderColor: `hsl(${flower.color} / 0.5)` }"
                :aria-label="t('gardenView.plantAria', { name: flower.name })"
                @click="plantInSelected(flower.id)"
              >
                <img
                  :src="getItemImage({ id: flower.id })"
                  :alt="flower.name"
                  class="size-6 object-contain"
                  loading="lazy"
                />
              </button>
            </div>
          </div>

          <!-- Occupied plot selected -->
          <div v-else class="space-y-3">
            <div class="flex items-center gap-3">
              <div
                class="garden-thumb size-10 shrink-0 overflow-hidden rounded-md border"
                :style="{
                  borderColor: `hsl(${selectedFlowerMeta?.color} / 0.55)`,
                }"
              >
                <img
                  :src="getItemImage({ id: selectedVisualCell.cell.flowerId })"
                  :alt="selectedFlowerMeta?.name"
                  class="size-full object-contain p-1"
                  loading="lazy"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-extrabold leading-tight">
                  {{ t('gardenView.flowerName', { name: selectedFlowerMeta?.name }) }}
                </div>
                <div class="flex items-center gap-1 font-mono text-3xs text-muted-foreground">
                  <span>
                    {{
                      t('gardenView.levelOf', {
                        level: selectedVisualCell.cell.level,
                        max: MAX_LEVEL,
                      })
                    }}
                  </span>
                  <span>·</span>
                  <span class="tabular-nums">{{ selectedVisualCell.cell.level }}</span>
                  <img
                    v-if="selectedFlowerMeta"
                    :src="getItemImage({ id: selectedFlowerMeta.yieldId })"
                    :alt="selectedFlowerMeta.yieldOf"
                    class="size-3 object-contain"
                    loading="lazy"
                  />
                  <span>{{ selectedFlowerMeta?.unit }}{{ t('common.perMin') }}</span>
                </div>
              </div>
              <AppTooltip position="left">
                <button
                  class="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                  :aria-label="t('gardenView.removeAria')"
                  @click="removeCell(selectedVisualCell.layoutIndex)"
                >
                  <Trash2 class="size-4" />
                </button>
                <template #content>
                  <span class="block max-w-[16rem] text-2xs font-medium leading-snug">
                    {{ t('gardenView.removeTooltip') }}
                  </span>
                </template>
              </AppTooltip>
            </div>

            <div class="flex items-center gap-2">
              <button
                class="focus-ring h-9 flex-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                :disabled="selectedVisualCell.cell.level <= 1"
                @click="levelDownCell(selectedVisualCell.layoutIndex)"
              >
                <Minus class="mx-auto size-3.5" />
              </button>
              <div
                class="flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-muted/70 font-mono text-sm font-extrabold tabular-nums dark:border-border/60 dark:bg-muted/30"
              >
                {{ t('gardenView.levelInline', { n: selectedVisualCell.cell.level }) }}
              </div>
              <button
                class="focus-ring h-9 flex-1 rounded-lg bg-primary text-xs font-extrabold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="selectedVisualCell.cell.level >= MAX_LEVEL"
                @click="levelUpCell(selectedVisualCell.layoutIndex)"
              >
                <span class="inline-flex items-center justify-center gap-1.5">
                  <span
                    v-if="selectedVisualCell.cell.level < MAX_LEVEL"
                    class="inline-flex items-center gap-1.5"
                  >
                    <span>+1</span>
                    <span aria-hidden="true">·</span>
                    <img
                      :src="getItemImage({ id: FERTILIZER_ITEM_ID })"
                      alt="Fertilizer"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                    <span class="font-mono tabular-nums">
                      {{ fertilizerForLevelUp(selectedVisualCell.cell.level) }}
                    </span>
                  </span>
                  <span v-else>{{ t('gardenView.max') }}</span>
                </span>
              </button>
            </div>

            <div class="grid grid-cols-5 gap-1">
              <button
                v-for="flower in FLOWERS"
                :key="flower.id"
                class="focus-ring flex aspect-square items-center justify-center rounded border transition hover:bg-card"
                :class="selectedVisualCell.cell.flowerId === flower.id ? 'ring-1 ring-accent' : ''"
                :style="{
                  borderColor:
                    selectedVisualCell.cell.flowerId === flower.id
                      ? `hsl(${flower.color})`
                      : `hsl(${flower.color} / 0.35)`,
                  background:
                    selectedVisualCell.cell.flowerId === flower.id
                      ? `hsl(${flower.color} / 0.1)`
                      : 'transparent',
                }"
                :aria-label="t('gardenView.changeAria', { name: flower.name })"
                @click="changeCellFlower(selectedVisualCell.layoutIndex, flower.id)"
              >
                <img
                  :src="getItemImage({ id: flower.id })"
                  :alt="flower.name"
                  class="size-6 object-contain"
                  loading="lazy"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right column: flower summary -->
      <div class="space-y-4">
        <div class="rounded-xl border border-border bg-card/50 p-4">
          <div class="mb-3 flex items-center">
            <h2 class="text-sm font-extrabold">{{ t('gardenView.flowersHeading') }}</h2>
          </div>
          <div class="space-y-2">
            <div
              v-for="flower in flowerSummary"
              :key="flower.id"
              class="rounded-xl border bg-card/50 p-3 transition-all duration-500"
              :class="
                recentlyChangedFlowers.has(flower.id)
                  ? 'border-warning/70 bg-warning/10 shadow-[0_0_0_3px_oklch(var(--warning)_/_0.18)]'
                  : 'border-border'
              "
            >
              <div class="flex items-center gap-3">
                <div
                  class="garden-thumb relative size-10 shrink-0 overflow-hidden rounded-md border"
                  :style="{
                    borderColor: `hsl(${flower.color} / 0.55)`,
                  }"
                >
                  <img
                    :src="getItemImage({ id: flower.id })"
                    :alt="flower.name"
                    class="size-full object-contain p-1"
                    loading="lazy"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-extrabold leading-tight">
                    {{ t('gardenView.flowerName', { name: flower.name }) }}
                  </div>
                  <div
                    class="mt-0.5 flex items-center gap-1 font-mono text-3xs text-muted-foreground"
                  >
                    <span class="tabular-nums text-foreground/80">{{ flower.count }}</span>
                    <span>{{ t('gardenView.plantedLabel') }}</span>
                    <img
                      :src="getItemImage({ id: flower.yieldId })"
                      :alt="flower.yieldOf"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                    <span>{{ flower.yieldOf }}</span>
                  </div>
                </div>
                <div class="min-w-[112px] shrink-0 text-right">
                  <div class="font-mono text-3xs uppercase tracking-[0.18em] text-muted-foreground">
                    {{ flower.unit }}{{ t('common.perMin') }}
                  </div>
                  <div
                    class="flex items-center justify-end gap-1.5 font-mono text-2xl font-extrabold tabular-nums leading-none"
                    :style="{ color: `hsl(${flower.color})` }"
                  >
                    <span>{{ flower.yieldPerMin }}</span>
                    <img
                      :src="getItemImage({ id: flower.yieldId })"
                      :alt="flower.yieldOf"
                      class="size-5 object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.garden-bed {
  background-color: hsl(28 35% 78%);
  background-image:
    radial-gradient(circle at 20% 30%, hsl(28 40% 70% / 0.7), transparent 40%),
    radial-gradient(circle at 80% 70%, hsl(28 45% 72% / 0.7), transparent 40%),
    repeating-linear-gradient(0deg, hsl(28 20% 30% / 0.06) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, hsl(28 20% 30% / 0.06) 0 1px, transparent 1px 4px);
}

.dark .garden-bed {
  background-color: hsl(28 30% 8%);
  background-image:
    radial-gradient(circle at 20% 30%, hsl(28 40% 14% / 0.9), transparent 40%),
    radial-gradient(circle at 80% 70%, hsl(28 40% 12% / 0.9), transparent 40%),
    repeating-linear-gradient(0deg, hsl(0 0% 100% / 0.015) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, hsl(0 0% 100% / 0.015) 0 1px, transparent 1px 4px);
}

.garden-cell,
.garden-thumb {
  background-color: hsl(28 30% 88%);
}

.dark .garden-cell,
.dark .garden-thumb {
  background-color: hsl(28 35% 12%);
}

.garden-cell-selected {
  --tw-ring-offset-color: hsl(28 35% 78%);
}

.dark .garden-cell-selected {
  --tw-ring-offset-color: hsl(28 30% 8%);
}

.garden-cell-level {
  background-color: hsl(28 25% 22% / 0.88);
  color: hsl(0 0% 100%);
}

.dark .garden-cell-level {
  background-color: hsl(0 0% 0% / 0.85);
}

.garden-cell-empty,
.garden-thumb-empty {
  border-color: hsl(28 20% 55%);
  background-color: hsl(28 25% 72%);
}

.garden-cell-empty:hover {
  border-color: hsl(var(--accent) / 0.7);
  background-color: hsl(28 25% 68%);
}

.dark .garden-cell-empty,
.dark .garden-thumb-empty {
  border-color: hsl(var(--border) / 0.4);
  background-color: hsl(0 0% 0% / 0.3);
}

.dark .garden-cell-empty:hover {
  border-color: hsl(var(--accent) / 0.6);
  background-color: hsl(0 0% 0% / 0.4);
}

.garden-cell-empty-selected {
  border-color: hsl(38 92% 50%);
  background-color: hsl(38 92% 50% / 0.18);
  --tw-ring-color: hsl(38 92% 50% / 0.5);
}

.dark .garden-cell-empty-selected {
  border-color: hsl(45 95% 70%);
  background-color: hsl(45 95% 70% / 0.1);
  --tw-ring-color: hsl(45 95% 70% / 0.4);
}
</style>
