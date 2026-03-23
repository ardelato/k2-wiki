<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  Check,
  ClipboardPaste,
  Compass,
  Copy,
  Download,
  FileDown,
  FileUp,
  FolderOpen,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Target,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import summonedIcon from '@/assets/icons/summoned.png'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditions } from '@/composables/useExpeditions'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, ElementType, ExpeditionStatWeights } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, toTitleCase } from '@/utils/format'
import { statAbbreviations, statLabels, tierModifiers } from '@/utils/formulas'
import { sanctuaryIcon, helpersIcon, machinesIcon } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')


const { creatures } = useCreatures()
const { sanctuaryCreatureIds, helperCreatureIds, machineCreatureIds } = useGameConfig()
const {
  filteredExpeditions,
  selectedExpedition,
  selectedTier,
  partySlots,
  activeSlotIndex,
  creatureLevels,
  recommendedCreatures,
  difficultyRating,
  partyScore,
  estimatedDuration,
  scoreRatio,
  loopCount,
  loopBonusPercent,
  totalXp,
  xpPerMinute,
  partyXpProgress,
  assignCreatureToSlot,
  removeCreatureFromSlot,
  setActiveSlot,
  getCreatureSlotRating,
  updateCreatureLevel,
  expeditionEvaluations,
  totalXpPerSecond,
  resetAllExpeditions,
  exportSetup,
  importSetup,
  expeditionTiers,
  showExcludedCreatures,
} = useExpeditions(creatures.value)


const { collectionLevels, isOwned, isAwakened } = useCreatureCollection()


const creatureTypes: ElementType[] = ['Fire', 'Water', 'Wind', 'Earth']
const creatureSearch = ref('')
const selectedCreatureTypes = ref<ElementType[]>([...creatureTypes])
const selectedCreatureTiers = ref<number[]>([])
const ownedOnly = ref(false)
const modalMode = ref<'import' | 'export' | null>(null)
const modalText = ref('')
const importError = ref('')
const copied = ref(false)
const importTextarea = ref<HTMLTextAreaElement | null>(null)
const exportTextarea = ref<HTMLTextAreaElement | null>(null)


function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}


watch(modalText, () => {
  nextTick(() => {
    if (modalMode.value === 'import') autoResizeTextarea(importTextarea.value)
    if (modalMode.value === 'export') autoResizeTextarea(exportTextarea.value)
  })
})


watch(modalMode, () => {
  nextTick(() => {
    autoResizeTextarea(importTextarea.value)
    autoResizeTextarea(exportTextarea.value)
  })
})


function openExportModal() {
  const raw = exportSetup()
  try {
    modalText.value = JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    modalText.value = raw
  }
  importError.value = ''
  copied.value = false
  modalMode.value = 'export'
}


function openImportModal() {
  modalText.value = ''
  importError.value = ''
  modalMode.value = 'import'
}


function handleImport() {
  const success = importSetup(modalText.value)
  if (success) {
    modalMode.value = null
  } else {
    importError.value = 'Invalid JSON format'
  }
}


function copyExport() {
  navigator.clipboard.writeText(modalText.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}


function downloadExport() {
  const blob = new Blob([modalText.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = `expedition-setup-${timestamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}


async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    try {
      modalText.value = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      modalText.value = text
    }
    importError.value = ''
  } catch {
    importError.value = 'Unable to read clipboard'
  }
}


function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    const text = reader.result as string
    try {
      modalText.value = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      modalText.value = text
    }
    importError.value = ''
  })
  reader.readAsText(file)
  input.value = ''
}


function handleReset() {
  if (window.confirm('Reset all expedition parties and creature levels?')) {
    resetAllExpeditions()
    autoFilledCreatures.clear()
    for (const [id, level] of Object.entries(collectionLevels.value)) {
      updateCreatureLevel(id, level)
    }
  }
}


type MobileSection = 'list' | 'details' | 'creature'


function normalizeSection(value: unknown): MobileSection {
  if (value === 'details') return 'details'
  if (value === 'creature') return 'creature'
  return 'list'
}


const mobileSection = computed<MobileSection>({
  get() {
    return normalizeSection(route.query.section)
  },
  set(value) {
    const nextQuery = { ...route.query, section: value }
    router.replace({ query: nextQuery })
  },
})


onMounted(() => {
  const expeditionId = route.query.expedition
  if (typeof expeditionId === 'string') {
    const match = filteredExpeditions.value.find((e) => e.id === expeditionId)
    if (match) selectExpedition(match)
  }
})


watch(selectedExpedition, (exp) => {
  if (exp && !isDesktop.value && mobileSection.value === 'list') {
    mobileSection.value = 'details'
  }
})


const weightedStats = computed(() => {
  if (!selectedExpedition.value) return []
  return Object.entries(selectedExpedition.value.statWeights).filter(
    ([, weight]) => weight > 0,
  ) as [keyof ExpeditionStatWeights, number][]
})


const creatureTierOptions = computed(() => {
  const tiers = new Set(recommendedCreatures.value.map(({ creature }) => creature.tier))
  return Array.from(tiers).toSorted((a, b) => a - b)
})


const allCreatureTypesSelected = computed(() => {
  return creatureTypes.every((type) => selectedCreatureTypes.value.includes(type))
})


const allCreatureTiersSelected = computed(() => {
  return (
    creatureTierOptions.value.length > 0 &&
    creatureTierOptions.value.every((tier) => selectedCreatureTiers.value.includes(tier))
  )
})


watch(
  creatureTierOptions,
  (tiers) => {
    const preserved = selectedCreatureTiers.value.filter((tier) => tiers.includes(tier))
    selectedCreatureTiers.value = preserved.length ? preserved : [...tiers]
  },
  { immediate: true },
)


const filteredRecommended = computed(() => {
  return recommendedCreatures.value.filter(({ creature }) => {
    const query = creatureSearch.value.toLowerCase()
    const matchesSearch =
      creature.name.toLowerCase().includes(query) || creature.trait.toLowerCase().includes(query)
    const matchesType = selectedCreatureTypes.value.some((type) => creature.types.includes(type))
    const matchesTier =
      selectedCreatureTiers.value.length === 0 ||
      selectedCreatureTiers.value.includes(creature.tier)
    return matchesSearch && matchesType && matchesTier
  })
})


// Auto-fill creature levels from collection (once per creature, so manual edits aren't overwritten)
const autoFilledCreatures = new Set<string>()
watchEffect(() => {
  const levels = collectionLevels.value
  for (const [id, level] of Object.entries(levels)) {
    if (autoFilledCreatures.has(id)) continue
    const rec = recommendedCreatures.value.find((r) => r.creature.id === id)
    if (rec && rec.level === 1) {
      autoFilledCreatures.add(id)
      updateCreatureLevel(id, level)
    }
  }
})


const displayRecommended = computed(() => {
  if (!ownedOnly.value) return filteredRecommended.value
  return filteredRecommended.value.filter(({ creature }) => isOwned(creature.id))
})


const hasEmptySlot = computed(() => partySlots.value.some((s) => s === null))


function selectExpedition(expedition: (typeof filteredExpeditions.value)[number]) {
  selectedExpedition.value = expedition
}


function chooseExpedition(expedition: (typeof filteredExpeditions.value)[number]) {
  selectExpedition(expedition)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}


function chooseCreature(creature: Creature) {
  if (!hasEmptySlot.value) return
  assignCreatureToSlot(creature)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}


function typeColor(type: ElementType): string {
  if (type === 'Fire') return 'hsl(var(--type-fire))'
  if (type === 'Water') return 'hsl(var(--type-water))'
  if (type === 'Wind') return 'hsl(var(--type-wind))'
  return 'hsl(var(--type-earth))'
}


function statBar(creature: Creature, key: keyof ExpeditionStatWeights): number {
  return Math.min(100, creature.stats[key])
}


function rowSelected(id: string): boolean {
  return selectedExpedition.value?.id === id
}


function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
}


function normalizeLevelOnBlur(creatureId: string, currentLevel: number, event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }


  const parsed = Number(target.value)
  if (Number.isNaN(parsed)) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }


  updateCreatureLevel(creatureId, clampLevel(parsed))
}


function stepCreatureLevel(creatureId: string, currentLevel: number, delta: number) {
  updateCreatureLevel(creatureId, clampLevel(currentLevel + delta))
}


function clampLoopCount(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(200, Math.round(value)))
}


function stepLoopCount(delta: number) {
  loopCount.value = clampLoopCount(loopCount.value + delta)
}


function normalizeLoopCountOnBlur(event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    loopCount.value = 0
    return
  }
  const parsed = Number(target.value)
  loopCount.value = clampLoopCount(parsed)
}


function selectAllCreatureTypes() {
  selectedCreatureTypes.value = [...creatureTypes]
}


function toggleCreatureType(type: ElementType) {
  if (allCreatureTypesSelected.value) {
    selectedCreatureTypes.value = [type]
    return
  }
  if (selectedCreatureTypes.value.includes(type)) {
    if (selectedCreatureTypes.value.length === 1) return
    selectedCreatureTypes.value = selectedCreatureTypes.value.filter(
      (selected) => selected !== type,
    )
    return
  }
  selectedCreatureTypes.value = [...selectedCreatureTypes.value, type]
}


function selectAllCreatureTiers() {
  selectedCreatureTiers.value = [...creatureTierOptions.value]
}


function toggleCreatureTier(tier: number) {
  if (allCreatureTiersSelected.value) {
    selectedCreatureTiers.value = [tier]
    return
  }
  if (selectedCreatureTiers.value.includes(tier)) {
    if (selectedCreatureTiers.value.length === 1) return
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter(
      (selected) => selected !== tier,
    )
    return
  }
  selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
}
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <div class="surface-card p-2 lg:hidden">
      <div class="grid grid-cols-3 gap-2">
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'list'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'list'"
        >
          List
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'details'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'details'"
        >
          Details
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'creature'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'creature'"
        >
          Creature
        </button>
      </div>
    </div>

    <div
      class="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12rem)] lg:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)_minmax(320px,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'list' ? 'hidden' : ''"
      >
        <div class="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold">Expeditions</h2>
            <span
              v-if="totalXpPerSecond > 0"
              class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400"
            >
              {{ totalXpPerSecond.toFixed(2) }} XP/s
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="focus-ring rounded-lg p-1.5 text-muted-foreground transition hover:text-foreground"
              title="Import"
              @click="openImportModal"
            >
              <FileUp class="size-5" />
            </button>
            <button
              class="focus-ring rounded-lg p-1.5 text-muted-foreground transition hover:text-foreground"
              title="Export"
              @click="openExportModal"
            >
              <FileDown class="size-5" />
            </button>
            <button
              class="focus-ring rounded-lg p-1.5 text-muted-foreground transition hover:text-destructive"
              title="Reset All"
              @click="handleReset"
            >
              <RotateCcw class="size-5" />
            </button>
          </div>
        </div>

        <div class="max-h-[62vh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
          <button
            v-for="expedition in filteredExpeditions"
            :key="expedition.id"
            class="focus-ring block w-full border-b border-border/55 px-4 py-3 text-left transition hover:bg-muted/35"
            :class="rowSelected(expedition.id) ? 'border-l-2 border-l-primary bg-primary/20' : ''"
            @click="chooseExpedition(expedition)"
          >
            <div class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <img
                  v-if="
                    expedition.rewards.length > 0 &&
                    getItemImage({ id: expedition.rewards[0].itemId })
                  "
                  :src="getItemImage({ id: expedition.rewards[0].itemId })"
                  :alt="expedition.rewards[0].itemId"
                  class="size-5 shrink-0 object-contain"
                />
                <p class="truncate text-sm font-semibold text-foreground">{{ expedition.name }}</p>
                <span
                  class="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                >
                  T{{ expeditionTiers[expedition.id] || 1 }}
                </span>
              </div>
              <span class="shrink-0 font-mono text-sm text-primary">{{
                Math.floor(
                  expedition.baseRating *
                    tierModifiers.difficulty[(expeditionTiers[expedition.id] || 1) - 1],
                )
              }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span>{{ toTitleCase(expedition.biome) }}</span>
                <span v-if="expedition.trait">•</span>
                <span v-if="expedition.trait" class="font-semibold">{{
                  toTitleCase(expedition.trait)
                }}</span>
                <template v-if="expeditionEvaluations[expedition.id]">
                  <span>•</span>
                  <span
                    :class="
                      expeditionEvaluations[expedition.id]!.scoreRatio >= 1
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    "
                  >
                    {{ formatDuration(expeditionEvaluations[expedition.id]!.duration) }}
                  </span>
                </template>
              </div>
              <span
                v-if="expeditionEvaluations[expedition.id]"
                class="shrink-0 font-mono text-xs font-semibold"
                :class="
                  expeditionEvaluations[expedition.id]!.scoreRatio >= 1
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                "
              >
                {{ expeditionEvaluations[expedition.id]!.xpPerSecond.toFixed(2) }} XP/s
              </span>
            </div>
          </button>

          <div
            v-if="filteredExpeditions.length === 0"
            class="px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No expeditions match your filters.
          </div>
        </div>
      </section>

      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'details' ? 'hidden' : ''"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Expedition Details</h2>
        </div>

        <div
          v-if="selectedExpedition"
          class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          <div>
            <h3 class="text-2xl font-black leading-tight">{{ selectedExpedition.name }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{{ selectedExpedition.description }}</p>
          </div>

          <!-- Tier & Loop Count -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Tier
              </h4>
              <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
                <button
                  v-for="t in 5"
                  :key="t"
                  class="focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    selectedTier === t
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                  @click="selectedTier = t"
                >
                  T{{ t }}
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Loop Count
              </h4>
              <div class="flex items-center gap-2">
                <div
                  class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
                >
                  <button
                    class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="loopCount <= 0"
                    aria-label="Decrease loop count by 10"
                    @click="stepLoopCount(-10)"
                  >
                    <Minus class="size-3" />
                  </button>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="focus-ring h-8 w-14 border-x border-input bg-transparent text-center font-mono text-sm"
                    :value="loopCount"
                    aria-label="Loop count"
                    @blur="normalizeLoopCountOnBlur($event)"
                  />
                  <button
                    class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="loopCount >= 200"
                    aria-label="Increase loop count by 10"
                    @click="stepLoopCount(10)"
                  >
                    <Plus class="size-3" />
                  </button>
                </div>
                <span
                  v-if="loopBonusPercent > 0"
                  class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400"
                >
                  +{{ loopBonusPercent }}%
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground">+1% XP per 10 loops, max +20%</p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Difficulty</p>
              <p class="font-mono text-lg font-semibold">{{ difficultyRating }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Biome</p>
              <p class="font-semibold">{{ toTitleCase(selectedExpedition.biome) }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Trait</p>
              <p class="font-semibold text-amber-300">
                {{ selectedExpedition.trait ? toTitleCase(selectedExpedition.trait) : 'None' }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                Base XP (Pool)
              </p>
              <p class="font-semibold">{{ selectedExpedition.baseXP }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">XP / Creature</p>
              <p class="font-semibold">{{ totalXp ? totalXp.toLocaleString() : '—' }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Max Party</p>
              <p class="font-semibold">{{ selectedExpedition.maxPartySize }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                Required Clears
              </p>
              <p class="font-semibold">{{ selectedExpedition.requiredExpeditionCompletions }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Stat Weights
            </h4>
            <div
              v-for="[key, weight] in weightedStats"
              :key="key"
              class="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-2"
            >
              <span class="text-xs text-muted-foreground">{{ statLabels[key] }}</span>
              <div class="h-2 rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${weight * 100}%` }"
                />
              </div>
              <span class="text-right text-xs font-semibold text-foreground"
                >{{ Math.round(weight * 100) }}%</span
              >
            </div>
          </div>

          <!-- Party Slots -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Party
            </h4>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="(slot, index) in partySlots"
                :key="index"
                class="flex flex-col items-center gap-1"
              >
                <div
                  class="relative size-20 overflow-hidden rounded-lg border transition"
                  :class="[
                    slot
                      ? 'border-border bg-card/50'
                      : activeSlotIndex === index
                        ? 'border-dashed border-primary bg-primary/10'
                        : 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45',
                  ]"
                  @click="!slot ? setActiveSlot(index) : undefined"
                >
                  <template v-if="slot">
                    <img
                      :src="getCreatureImage(slot)"
                      :alt="`${slot.name} artwork`"
                      class="size-full object-cover"
                    />
                    <span
                      class="absolute left-0.5 top-0.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary"
                    >
                      {{ getCreatureSlotRating(slot) }}
                    </span>
                    <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1">
                      <p class="truncate text-center text-[10px] font-semibold text-white">
                        {{ slot.name }}
                      </p>
                    </div>
                    <button
                      class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                      @click.stop="removeCreatureFromSlot(index)"
                    >
                      <X class="size-3" />
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex size-full flex-col items-center justify-center gap-1">
                      <Plus class="size-4 text-muted-foreground/50" />
                      <span v-if="activeSlotIndex === index" class="text-[9px] text-primary"
                        >Select</span
                      >
                    </div>
                  </template>
                </div>
                <span
                  v-if="slot"
                  class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                >
                  LVL {{ creatureLevels[slot.id] || 1 }}
                </span>
              </div>
            </div>
          </div>

          <!-- Party Summary -->
          <div
            v-if="partyScore > 0"
            class="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
          >
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Party Summary
            </h4>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Party Score</p>
                <p class="font-mono text-sm font-semibold text-primary">{{ partyScore }}</p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Difficulty</p>
                <p class="font-mono text-sm font-semibold">{{ difficultyRating }}</p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Score Ratio</p>
                <p
                  class="font-mono text-sm font-semibold"
                  :class="scoreRatio && scoreRatio >= 1 ? 'text-emerald-400' : 'text-amber-400'"
                >
                  {{ scoreRatio ? scoreRatio.toFixed(2) : '—' }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">Duration / Run</p>
                <p class="font-mono text-sm font-semibold">
                  {{ estimatedDuration ? formatDuration(estimatedDuration) : '—' }}
                </p>
                <p
                  v-if="loopCount > 0 && estimatedDuration"
                  class="mt-0.5 text-[10px] text-muted-foreground"
                >
                  {{ formatDuration(estimatedDuration * loopCount) }}
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">XP / Creature</p>
                <p class="font-mono text-sm font-semibold">
                  {{ totalXp ? totalXp.toLocaleString() : '—' }}
                  <span
                    v-if="loopBonusPercent > 0 && totalXp"
                    class="ml-0.5 inline-block rounded bg-emerald-500/15 px-1 py-px text-[10px] font-semibold text-emerald-400"
                  >
                    +{{ loopBonusPercent }}%
                  </span>
                </p>
              </div>
              <div class="rounded-md bg-card px-2 py-2">
                <p class="text-muted-foreground">XP Rate</p>
                <div class="flex items-center justify-center gap-2">
                  <p class="font-mono text-sm font-semibold">
                    {{ xpPerMinute ? Math.round(xpPerMinute).toLocaleString() : '—'
                    }}<span class="text-[10px] text-muted-foreground">/m</span>
                  </p>
                  <div class="h-4 border-l border-border/50" />
                  <p class="font-mono text-sm font-semibold">
                    {{ xpPerMinute ? (xpPerMinute / 60).toFixed(2) : '—'
                    }}<span class="text-[10px] text-muted-foreground">/s</span>
                  </p>
                </div>
              </div>
            </div>

            <div v-if="partyXpProgress.length" class="space-y-1.5">
              <div
                v-for="entry in partyXpProgress"
                :key="entry.creature.id"
                class="flex items-center gap-2"
              >
                <span
                  class="w-16 shrink-0 truncate font-mono text-[10px] font-semibold text-muted-foreground"
                >
                  {{ entry.creature.name }}
                </span>
                <span
                  class="w-7 shrink-0 text-right font-mono text-[10px] font-semibold text-muted-foreground"
                >
                  {{ entry.currentLevel }}
                </span>
                <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                    :style="{ width: `${entry.progress * 100}%` }"
                  />
                </div>
                <span class="w-7 shrink-0 font-mono text-[10px] font-semibold text-foreground">
                  {{ entry.targetLevel }}
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Rewards
            </h4>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="reward in selectedExpedition.rewards"
                :key="reward.itemId"
                class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/45 px-3 py-1 font-mono text-xs"
              >
                <img
                  v-if="getItemImage({ id: reward.itemId })"
                  :src="getItemImage({ id: reward.itemId })"
                  :alt="toTitleCase(reward.itemId)"
                  class="size-4 object-contain"
                />
                {{ reward.amount * tierModifiers.loot[selectedTier - 1] }}x
                {{ toTitleCase(reward.itemId) }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground"
        >
          <Compass class="size-8 text-accent/65" />
          <p class="text-sm">Select an expedition from the list.</p>
        </div>
      </section>

      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'creature' ? 'hidden' : ''"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-base font-bold">Select Creature</h2>
        </div>

        <div class="space-y-3 border-b border-border/70 px-4 py-3">
          <input
            v-model="creatureSearch"
            type="text"
            placeholder="Search creature"
            class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
          />

          <div class="flex flex-wrap gap-2">
            <button
              class="pill focus-ring"
              :class="allCreatureTypesSelected ? 'pill-active' : ''"
              @click="selectAllCreatureTypes"
            >
              All
            </button>
            <button
              v-for="type in creatureTypes"
              :key="type"
              class="pill focus-ring"
              :class="selectedCreatureTypes.includes(type) ? 'pill-active' : ''"
              @click="toggleCreatureType(type)"
            >
              {{ type }}
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="pill focus-ring font-mono"
              :class="allCreatureTiersSelected ? 'pill-active' : ''"
              @click="selectAllCreatureTiers"
            >
              All Tiers
            </button>
            <button
              v-for="tier in creatureTierOptions"
              :key="tier"
              class="pill focus-ring font-mono"
              :class="selectedCreatureTiers.includes(tier) ? 'pill-active' : ''"
              @click="toggleCreatureTier(tier)"
            >
              T{{ tier + 1 }}
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="pill focus-ring gap-1.5"
              :class="ownedOnly ? 'pill-active' : ''"
              @click="ownedOnly = !ownedOnly"
            >
              <img :src="summonedIcon" alt="" class="size-4" />
              Summoned Only
            </button>
            <button
              class="pill focus-ring gap-1.5"
              :class="showExcludedCreatures ? 'pill-active' : ''"
              @click="showExcludedCreatures = !showExcludedCreatures"
            >
              Show Excluded
            </button>
          </div>

          <div v-if="weightedStats.length" class="flex items-center gap-1.5">
            <Target class="size-4 text-accent" />
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >Focus</span
            >
            <span
              v-for="[key] in weightedStats"
              :key="key"
              class="bg-accent/12 rounded-md border border-accent/35 px-2 py-0.5 text-xs font-semibold text-accent"
            >
              {{ statAbbreviations[key] }}
            </span>
          </div>

          <div class="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
            <Info class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p class="text-[11px] text-muted-foreground">
              Level changes here are per-expedition only and do not update your collection.
            </p>
          </div>
        </div>

        <div class="max-h-[58vh] space-y-2 overflow-y-auto p-3 lg:max-h-none lg:min-h-0 lg:flex-1">
          <button
            v-for="{ creature, rating, level, suggestedLevel } in displayRecommended"
            :key="creature.id"
            class="focus-ring block w-full rounded-xl border px-3 py-3 text-left transition"
            :class="
              hasEmptySlot
                ? 'border-border bg-card/50 hover:border-accent/45 hover:bg-muted/25'
                : 'cursor-not-allowed border-border/50 bg-card/30 opacity-60'
            "
            @click="chooseCreature(creature)"
          >
            <div class="flex items-start gap-3">
              <div class="relative shrink-0">
                <img
                  :src="getCreatureImage(creature)"
                  :alt="`${creature.name} artwork`"
                  class="size-10 rounded-md border border-border object-cover"
                />
                <img
                  v-if="sanctuaryCreatureIds.includes(creature.id)"
                  :src="sanctuaryIcon"
                  alt="Sanctuary"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                />
                <img
                  v-else-if="helperCreatureIds.includes(creature.id)"
                  :src="helpersIcon"
                  alt="Helper"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                />
                <img
                  v-else-if="machineCreatureIds.includes(creature.id)"
                  :src="machinesIcon"
                  alt="Machine"
                  class="absolute -bottom-1 -right-1 size-5 rounded-full border border-background bg-background"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <p
                    class="truncate font-semibold"
                    :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-foreground'"
                  >
                    {{ creature.name }}
                  </p>
                  <span
                    v-if="isOwned(creature.id)"
                    class="text-xs"
                    :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-amber-400'"
                    >★</span
                  >
                </div>
                <div class="mt-1 flex flex-wrap gap-1 text-xs">
                  <span
                    v-for="type in creature.types"
                    :key="type"
                    class="rounded-full bg-muted px-2 py-0.5 font-semibold"
                    :style="{ color: typeColor(type) }"
                  >
                    {{ type }}
                  </span>
                  <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
                </div>
              </div>

              <div class="text-right" @click.stop>
                <p
                  class="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Lvl
                  <span
                    v-if="suggestedLevel != null"
                    class="ml-1 normal-case tracking-normal"
                    :class="level >= suggestedLevel ? 'text-emerald-400' : 'text-amber-400'"
                  >
                    (Suggested: {{ suggestedLevel }})
                  </span>
                </p>
                <div
                  class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
                >
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level <= 1"
                    aria-label="Decrease creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, -1)"
                  >
                    <Minus class="size-3" />
                  </button>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center font-mono text-xs"
                    :value="level"
                    aria-label="Creature level"
                    @blur="normalizeLevelOnBlur(creature.id, level, $event)"
                  />
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="level >= 120"
                    aria-label="Increase creature level"
                    @click.stop="stepCreatureLevel(creature.id, level, 1)"
                  >
                    <Plus class="size-3" />
                  </button>
                </div>
                <p class="mt-1 font-mono text-sm font-semibold text-primary">{{ rating }}</p>
              </div>
            </div>

            <div v-if="weightedStats.length" class="mt-3 space-y-1.5">
              <div
                v-for="[key, weight] in weightedStats"
                :key="key"
                class="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2"
              >
                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{
                  statAbbreviations[key]
                }}</span>
                <div class="h-1.5 rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary"
                    :style="{ width: `${statBar(creature, key)}%`, opacity: 0.45 + weight * 0.55 }"
                  />
                </div>
              </div>
            </div>
          </button>

          <div
            v-if="displayRecommended.length === 0"
            class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground"
          >
            {{
              selectedExpedition
                ? 'No creatures match your creature filters.'
                : 'Select an expedition first.'
            }}
          </div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="modalMode"
          class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
          @click.self="modalMode = null"
        >
          <div class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-bold">
                {{ modalMode === 'export' ? 'Export Setup' : 'Import Setup' }}
              </h3>
              <button
                class="focus-ring rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                @click="modalMode = null"
              >
                <X class="size-4" />
              </button>
            </div>

            <!-- Export modal -->
            <template v-if="modalMode === 'export'">
              <textarea
                :value="modalText"
                readonly
                ref="exportTextarea"
                class="focus-ring max-h-[70vh] min-h-[20rem] w-full resize-none overflow-y-auto rounded-lg border border-input bg-background/70 p-3 font-mono text-xs"
              />
              <div class="mt-3 flex justify-end gap-2">
                <button
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                  @click="copyExport"
                >
                  <Check v-if="copied" class="size-3 text-emerald-400" />
                  <Copy v-else class="size-3" />
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>
                <button
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  @click="downloadExport"
                >
                  <Download class="size-3" />
                  Download
                </button>
              </div>
            </template>

            <!-- Import modal -->
            <template v-else>
              <textarea
                v-model="modalText"
                ref="importTextarea"
                class="focus-ring max-h-[70vh] min-h-[20rem] w-full resize-none overflow-y-auto rounded-lg border border-input bg-background/70 p-3 font-mono text-xs"
                placeholder="Paste exported JSON here..."
              />
              <p v-if="importError" class="mt-1 text-xs text-destructive">{{ importError }}</p>
              <div class="mt-3 flex justify-end gap-2">
                <button
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                  @click="pasteFromClipboard"
                >
                  <ClipboardPaste class="size-4" />
                  Paste
                </button>
                <label
                  class="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                >
                  <FolderOpen class="size-4" />
                  Open File
                  <input
                    type="file"
                    accept=".json,application/json"
                    class="hidden"
                    @change="handleFileUpload"
                  />
                </label>
                <button
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  @click="handleImport"
                >
                  <Check class="size-4" />
                  Import
                </button>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
