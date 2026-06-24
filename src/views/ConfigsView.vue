<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { Upload, AlertCircle, Check, Info, RotateCcw } from 'lucide-vue-next'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import AssignmentZone from '@/components/configs/AssignmentZone.vue'
import ExpeditionLadderSection from '@/components/configs/ExpeditionLadderSection.vue'
import HeroStatsSection from '@/components/configs/HeroStatsSection.vue'
import InventoryGridSection from '@/components/configs/InventoryGridSection.vue'
import WorkstationQueuesSection from '@/components/configs/WorkstationQueuesSection.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditionLadder } from '@/composables/useExpeditionLadder'
import { useGameConfig } from '@/composables/useGameConfig'
import { clearSummoningPlannerSelection } from '@/composables/useSummoningPlanner'
import { items as allItems } from '@/data/indexes'
import { itemName } from '@/utils/format/format'
import {
  sourceIcons,
  sanctuaryIcon,
  helpersIcon,
  machinesIcon,
  dungeonsIcon,
  jobIcons,
} from '@/utils/format/icons'
import { levelFromXp, getPlayerLevel, SKILLING_IDS } from '@/utils/formulas'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig, type SaveConfig } from '@/utils/save/parseSave'

const { t } = useI18n()


const { creatures } = useCreatures()
const { setOwned, setLevel, setAwakened, isOwned, getLevel, isAwakened, resetCollection } =
  useCreatureCollection()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  inventoryAmounts,
  collectedItems,
  setGardenLayout,
  setGardenSaveSnapshot,
  resetGarden,
  expeditionParties,
  skillLevels,
  playerLevel,
  queuedAmounts,
  queuedTimes,
  dungeonParty,
  applySaveConfig,
  resetAllConfig,
} = useGameConfig()


const { selectedCreature, drawerOpen, toggleCreatureById, closeDrawer } = useCreatureDrawer()


const MACHINES_MAX = 9
const DUNGEON_MAX = 3


// State
const errorMessage = ref('')
const isDragging = ref(false)
const saveConfig = ref<SaveConfig | null>(null)


const {
  allExpeditions,
  expeditionFrontiers,
  expeditionLadderColumns,
  expeditionDisplay,
  expeditionPartiesList,
  expeditionPartiesAssigned,
} = useExpeditionLadder(saveConfig)


// Save metadata (persisted so it survives reloads)
const saveFileName = useLocalStorage<string>('config-save-filename', '')
const savedAtMs = useLocalStorage<number>('config-save-imported-at', 0)


// Live clock for relative-time display; refreshed every minute so the
// "imported X ago" string stays current without a page reload.
const nowMs = ref(Date.now())
let nowMsTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  nowMsTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
})
onUnmounted(() => {
  if (nowMsTimer !== null) clearInterval(nowMsTimer)
})


const importedAgo = computed(() => {
  if (!savedAtMs.value) return ''
  const seconds = Math.max(0, Math.floor((nowMs.value - savedAtMs.value) / 1000))
  if (seconds < 60) return t('configs.snapshot.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('configs.snapshot.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remMin = minutes % 60
    return remMin
      ? t('configs.snapshot.hoursMinutesAgo', { h: hours, m: remMin })
      : t('configs.snapshot.hoursAgo', { n: hours })
  }
  const days = Math.floor(hours / 24)
  return days === 1 ? t('configs.snapshot.yesterday') : t('configs.snapshot.daysAgo', { n: days })
})


// Applied state tracking
const appliedSections = ref<Record<string, boolean>>({})


// Creature map for lookups
const creatureMap = computed(() => {
  const map = new Map<string, { id: string; name: string; image: string; tier: number }>()
  for (const c of creatures.value) {
    map.set(c.id, { id: c.id, name: c.name, image: c.image, tier: c.tier })
  }
  return map
})


// --- Creature Collection Preview ---
interface PreviewCreature {
  id: string
  name: string
  image: string
  tier: number
  level: number
  awakened: boolean
  isNew: boolean
  levelChanged: boolean
  awakenedChanged: boolean
  oldLevel: number
}


const previewCreatures = computed<PreviewCreature[]>(() => {
  if (!saveConfig.value) return []
  const bestBySpecies = new Map<
    string,
    { species: string; experience: number; awakened?: boolean }
  >()
  for (const sc of saveConfig.value.creatures) {
    const existing = bestBySpecies.get(sc.species)
    if (!existing || sc.experience > existing.experience) {
      bestBySpecies.set(sc.species, sc)
    }
  }

  const preview: PreviewCreature[] = []
  for (const [species, sc] of bestBySpecies) {
    const meta = creatureMap.value.get(species)
    if (!meta) continue
    const level = levelFromXp(sc.experience)
    const awakened = sc.awakened ?? false
    const owned = isOwned(species)
    const oldLevel = getLevel(species)
    const oldAwakened = isAwakened(species)
    preview.push({
      id: meta.id,
      name: meta.name,
      image: meta.image,
      tier: meta.tier,
      level,
      awakened,
      isNew: !owned,
      levelChanged: owned && oldLevel !== level,
      awakenedChanged: owned && oldAwakened !== awakened,
      oldLevel,
    })
  }
  return preview.toSorted((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
})


// --- Save Exclusion Preview ---
const sanctuaryPreview = computed(() => {
  if (!saveConfig.value) return []
  const currentSet = new Set(sanctuaryCreatureIds.value)
  return saveConfig.value.sanctuary
    .map((id) => {
      const c = creatureMap.value.get(id)
      return c ? { ...c, isNew: !currentSet.has(id) } : null
    })
    .filter(
      (c): c is { id: string; name: string; image: string; tier: number; isNew: boolean } =>
        c != null,
    )
})


function hasSortedDiff(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].toSorted()) !== JSON.stringify([...b].toSorted())
}


const sanctuaryHasDiff = computed(
  () => !!saveConfig.value && hasSortedDiff(sanctuaryCreatureIds.value, saveConfig.value.sanctuary),
)


const helperHasDiff = computed(
  () => !!saveConfig.value && hasSortedDiff(helperCreatureIds.value, saveConfig.value.helpers),
)


const machineHasDiff = computed(
  () => !!saveConfig.value && hasSortedDiff(machineCreatureIds.value, saveConfig.value.machines),
)


const dungeonHasDiff = computed(() => {
  if (!saveConfig.value) return false
  const saveParty = saveConfig.value.currentDungeon?.party ?? []
  return hasSortedDiff(dungeonParty.value, saveParty)
})


function displaySkillLevel(skillId: string): number {
  if (saveConfig.value?.skillLevels) {
    return saveConfig.value.skillLevels[skillId] || 1
  }
  return skillLevels.value[skillId] || 1
}


const displayPlayerLevel = computed(() => {
  if (saveConfig.value?.skillLevels) {
    return getPlayerLevel(saveConfig.value.skillLevels)
  }
  return playerLevel.value
})


const WORKSTATION_IDS = new Set(['Furnace', 'Stove', 'Workbench'])


const skillGroups = [
  {
    label: 'Gathering',
    skills: SKILLING_IDS.filter((id) => !WORKSTATION_IDS.has(id)).map((id) => ({
      id,
      icon: jobIcons[id.toLowerCase()],
    })),
  },
  {
    label: 'Workstation',
    skills: SKILLING_IDS.filter((id) => WORKSTATION_IDS.has(id)).map((id) => ({
      id,
      icon: sourceIcons[`crafting_${id.toLowerCase()}`],
    })),
  },
]


// --- Snapshot hero: creature collection summary ---
const collectionSummary = computed(() => {
  // When a save is loaded and creatures haven't been applied yet, preview
  // the save's counts so the snapshot reflects what `Apply` would set.
  // Otherwise read from the persisted collection.
  const showSavePreview = !!saveConfig.value && !appliedSections.value.creatures
  const previewOwned = new Map<string, boolean>()
  if (showSavePreview) {
    for (const c of previewCreatures.value) previewOwned.set(c.id, c.awakened)
  }

  let owned = 0
  let awakened = 0
  const byTier = new Map<number, { owned: number; total: number; awakened: number }>()
  const total = creatures.value.length

  for (const c of creatures.value) {
    const tierBucket = byTier.get(c.tier) ?? { owned: 0, total: 0, awakened: 0 }
    tierBucket.total += 1
    const ownedHere = showSavePreview ? previewOwned.has(c.id) : isOwned(c.id)
    const awakenedHere = showSavePreview ? (previewOwned.get(c.id) ?? false) : isAwakened(c.id)
    if (ownedHere) {
      tierBucket.owned += 1
      owned += 1
      if (awakenedHere) {
        tierBucket.awakened += 1
        awakened += 1
      }
    }
    byTier.set(c.tier, tierBucket)
  }
  const tiers = [...byTier.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([tier, b]) => ({ tier, ...b }))
  return { owned, total, awakened, tiers }
})


// --- Snapshot hero: idle creatures (owned but not assigned anywhere) ---
const assignedCreatureIds = computed(() => {
  const set = new Set<string>()
  for (const id of sanctuaryCreatureIds.value) set.add(id)
  for (const id of helperCreatureIds.value) set.add(id)
  for (const id of machineCreatureIds.value) set.add(id)
  for (const id of dungeonParty.value) set.add(id)
  for (const ids of Object.values(expeditionParties.value ?? {})) {
    for (const id of ids) set.add(id)
  }
  return set
})


const idleCreatures = computed(() => {
  const assigned = assignedCreatureIds.value
  return creatures.value
    .filter((c) => isOwned(c.id) && !assigned.has(c.id))
    .toSorted((a, b) => a.tier - b.tier)
})


// --- Inventory codex grid (full items.json order, placeholders for unowned) ---
const itemPositionById = new Map(allItems.map((item, index) => [item.id, index]))


interface InventoryGridEntry {
  id: string
  name: string
  image?: string
  amount: number
  owned: boolean
}


const inventoryGridItems = computed<InventoryGridEntry[]>(() => {
  const collectedSet = new Set(collectedItems.value)
  const entries: InventoryGridEntry[] = allItems.map((item) => ({
    id: item.id,
    name: item.name,
    image: item.image,
    amount: inventoryAmounts.value[item.id] ?? 0,
    owned: collectedSet.has(item.id) || (inventoryAmounts.value[item.id] ?? 0) > 0,
  }))
  // Collected ids not in items.json (defensive — append at end)
  for (const id of collectedItems.value) {
    if (!itemPositionById.has(id)) {
      entries.push({
        id,
        name: itemName(id),
        amount: inventoryAmounts.value[id] ?? 0,
        owned: true,
      })
    }
  }
  // Inventory ids not in items.json and not in collections (defensive)
  for (const [id, amount] of Object.entries(inventoryAmounts.value)) {
    if (amount > 0 && !itemPositionById.has(id) && !collectedSet.has(id)) {
      entries.push({ id, name: itemName(id), amount, owned: true })
    }
  }
  return entries
})


const queuedStationCount = computed(() =>
  Object.values(queuedAmounts.value).reduce((sum, items) => sum + Object.keys(items).length, 0),
)


const queuedByStation = computed(() =>
  Object.entries(queuedAmounts.value)
    .filter(([, items]) => Object.keys(items).length > 0)
    .map(([station, items]) => ({
      station,
      items: Object.entries(items)
        .filter(([, amount]) => amount > 0)
        .map(([id, amount]) => ({ id, name: itemName(id), amount }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    }))
    .toSorted((a, b) => a.station.localeCompare(b.station)),
)


// --- File Processing ---
async function processFile(file: File) {
  try {
    const text = await file.text()
    let save: Record<string, unknown>


    // Try decryption first, fall back to plain JSON
    try {
      save = (await decryptSave(text)) as Record<string, unknown>
    } catch {
      save = JSON.parse(text) as Record<string, unknown>
    }


    const parsed = extractSaveConfig(save)
    saveConfig.value = parsed
    // Garden is managed on its own dedicated page (no manual Apply button
    // here), so apply the imported positional layout straight into the live
    // config. The aggregated `gardenFlowers` map updates via the layout
    // watcher in useGameConfig.
    setGardenLayout(parsed.gardenLayout)
    // Keep a snapshot so the Garden page's Reset can revert to the imported
    // save instead of wiping it.
    setGardenSaveSnapshot(parsed.gardenLayout)
    appliedSections.value = {}
    errorMessage.value = ''
    saveFileName.value = file.name
    savedAtMs.value = Date.now()
    nowMs.value = Date.now()
    applyAll()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : t('configs.saveFileImport.processError')
    saveConfig.value = null
  }
}


function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) processFile(file)
}


function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) processFile(file)
}


function applyAll() {
  if (!saveConfig.value) return
  const save = saveConfig.value


  // Creature collection lives in its own composable (view-local concern).
  resetCollection()
  for (const c of previewCreatures.value) {
    setOwned(c.id, true)
    setLevel(c.id, c.level)
    setAwakened(c.id, c.awakened)
  }


  // Config-owned setters run in their canonical order inside useGameConfig.
  applySaveConfig(save)


  // A fresh save invalidates the old summon plan.
  clearSummoningPlannerSelection()


  appliedSections.value = {
    creatures: true,
    exclusions: true,
    inventory: true,
    queued: true,
    awaken: true,
    tools: true,
    skills: true,
    machineDetails: true,
    fabrication: true,
    expeditions: true,
  }
}


function resetAll() {
  // Config-owned state (sanctuary/helpers/machines, inventory, queues, awaken,
  // tools, machines, fabrication, expeditions, skills, dungeon) resets inside
  // useGameConfig. The remaining resets are view-local concerns.
  resetAllConfig()
  resetCollection()
  resetGarden()
  clearSummoningPlannerSelection()
  saveConfig.value = null
  saveFileName.value = ''
  savedAtMs.value = 0
  appliedSections.value = {}
}


const SANCTUARY_MAX = 8
const HELPERS_MAX = 6


type AssignmentSlot = {
  id: string
  name: string
  image: string
  tier: number
  isNew?: boolean
} | null


// Pick the right source of truth for each slot:
// - When a save is loaded and the section hasn't been applied yet, show the
//   save's creatures so the user can see what `Apply` will set. Mark slots
//   that aren't in the current state with `isNew` for a "NEW" overlay.
// - Otherwise show what's currently persisted.
function buildDisplaySlots(
  capacity: number,
  currentIds: string[],
  saveIds: string[] | null,
  showSave: boolean,
): AssignmentSlot[] {
  const slots: AssignmentSlot[] = []
  const currentSet = new Set(currentIds)
  const sourceIds = showSave && saveIds ? saveIds : currentIds
  for (let i = 0; i < capacity; i++) {
    const id = sourceIds[i]
    if (!id) {
      slots.push(null)
      continue
    }
    const meta = creatureMap.value.get(id)
    if (!meta) {
      slots.push(null)
      continue
    }
    const isNew = showSave && !currentSet.has(id)
    slots.push({ ...meta, isNew })
  }
  return slots
}


const sanctuarySlots = computed<AssignmentSlot[]>(() =>
  buildDisplaySlots(
    SANCTUARY_MAX,
    sanctuaryCreatureIds.value,
    saveConfig.value?.sanctuary ?? null,
    !!saveConfig.value && !appliedSections.value.exclusions && sanctuaryHasDiff.value,
  ),
)


const helperSlots = computed<AssignmentSlot[]>(() =>
  buildDisplaySlots(
    HELPERS_MAX,
    helperCreatureIds.value,
    saveConfig.value?.helpers ?? null,
    !!saveConfig.value && !appliedSections.value.exclusions && helperHasDiff.value,
  ),
)


const machineSlots = computed<AssignmentSlot[]>(() =>
  buildDisplaySlots(
    MACHINES_MAX,
    machineCreatureIds.value,
    saveConfig.value?.machines ?? null,
    !!saveConfig.value && !appliedSections.value.exclusions && machineHasDiff.value,
  ),
)


const dungeonSlots = computed<AssignmentSlot[]>(() =>
  buildDisplaySlots(
    DUNGEON_MAX,
    dungeonParty.value,
    saveConfig.value?.currentDungeon?.party ?? null,
    !!saveConfig.value && !appliedSections.value.exclusions && dungeonHasDiff.value,
  ),
)
</script>

<template>
  <div class="space-y-6">
    <!-- Snapshot header: title + save metadata strip + actions -->
    <header class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <SectionEyebrow class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <template v-if="saveFileName">
              <Check class="size-3.5 text-success-strong" />
              <span class="text-success-strong">{{ t('configs.snapshot.saveSynced') }}</span>
              <span class="text-muted-foreground/60">·</span>
              <span class="font-mono normal-case tracking-normal text-muted-foreground/80">
                {{ saveFileName }}
              </span>
              <span v-if="importedAgo" class="text-muted-foreground/60">·</span>
              <span v-if="importedAgo" class="normal-case tracking-normal">
                {{ t('configs.snapshot.imported', { ago: importedAgo }) }}
              </span>
            </template>
            <template v-else>
              <Upload class="size-3.5" />
              <span>{{ t('configs.snapshot.noSaveLoaded') }}</span>
            </template>
          </SectionEyebrow>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight">
            {{ t('configs.snapshot.title') }}
          </h1>
          <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
            {{ t('configs.snapshot.description') }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger-strong transition hover:bg-danger/20"
            @click="resetAll"
          >
            <RotateCcw class="size-3.5" />
            {{ t('configs.resetAll') }}
          </button>
        </div>
      </div>

      <!-- Drop-zone shown only until a save has been imported (cleared by Reset all). -->
      <label
        v-if="!saveConfig && !saveFileName"
        class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition"
        :class="
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-accent/50 hover:bg-muted/30'
        "
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <Upload class="size-8 text-muted-foreground" />
        <span class="text-sm font-medium text-muted-foreground">
          {{ t('configs.saveFileImport.dropHint') }}
        </span>
        <input type="file" accept=".json" class="hidden" @change="onFileSelect" />
      </label>

      <div
        v-if="errorMessage"
        class="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2"
      >
        <AlertCircle class="size-4 shrink-0 text-danger-strong" />
        <p class="text-sm text-danger-strong">{{ errorMessage }}</p>
      </div>
    </header>

    <!-- Hero stats: Creatures Collected + Player Level -->
    <HeroStatsSection
      :collection-summary="collectionSummary"
      :display-player-level="displayPlayerLevel"
      :skill-groups="skillGroups"
      :display-skill-level="displaySkillLevel"
    />

    <!-- Section: Creature Assignments (renamed from Exclusions) -->
    <section class="rounded-xl border border-border bg-card/50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="text-left">
            <div class="flex items-center gap-1.5">
              <h2 class="text-base font-bold">{{ t('configs.assignments.title') }}</h2>
              <AppTooltip :text="t('configs.assignments.tooltip')">
                <Info class="size-3.5 text-muted-foreground/70 hover:text-foreground" />
              </AppTooltip>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
            {{ t('configs.assignments.assigned', { n: assignedCreatureIds.size }) }}
          </span>
          <span
            v-if="idleCreatures.length"
            class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {{ t('configs.assignments.idle', { n: idleCreatures.length }) }}
          </span>
        </div>
      </div>

      <div class="mt-3 space-y-3">
        <!-- 4 zones in a row -->
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <AssignmentZone
            :icon="sanctuaryIcon"
            :label="t('configs.zones.sanctuary')"
            :slots="sanctuarySlots"
            :current-count="sanctuaryCreatureIds.length"
            :max="SANCTUARY_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && sanctuaryHasDiff"
            :target-count="sanctuaryPreview.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="helpersIcon"
            :label="t('configs.zones.helpers')"
            :slots="helperSlots"
            :current-count="helperCreatureIds.length"
            :max="HELPERS_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && helperHasDiff"
            :target-count="saveConfig?.helpers.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="machinesIcon"
            :label="t('configs.zones.machines')"
            :slots="machineSlots"
            :current-count="machineCreatureIds.length"
            :max="MACHINES_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && machineHasDiff"
            :target-count="saveConfig?.machines.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="dungeonsIcon"
            :label="t('configs.zones.dungeons')"
            :slots="dungeonSlots"
            :current-count="dungeonParty.length"
            :max="DUNGEON_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && dungeonHasDiff"
            :target-count="saveConfig?.currentDungeon?.party.length ?? 0"
            @context-menu="toggleCreatureById"
          />
        </div>
        <!-- /4-zone grid -->

        <!-- Expeditions assignment row: 20 expeditions × up to 3 slots -->
        <div class="bg-bg/40 rounded-xl border border-border/60 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <SectionEyebrow as="h3" class="flex items-center gap-1.5">
              <img :src="sourceIcons.Expeditions" alt="" class="size-3.5" loading="lazy" />
              {{ t('configs.zones.expeditions') }}
            </SectionEyebrow>
            <span class="font-mono text-3xs text-muted-foreground">
              {{
                t('configs.assignments.slotsFilled', {
                  filled: expeditionPartiesAssigned,
                  total: expeditionPartiesList.length * 3,
                })
              }}
            </span>
          </div>
          <div
            v-if="expeditionPartiesAssigned === 0"
            class="rounded-md border border-dashed border-border/50 px-3 py-2 text-2xs text-muted-foreground"
          >
            <i18n-t keypath="configs.assignments.noExpeditionAssignments" tag="span">
              <template #link>
                <RouterLink
                  to="/expeditions"
                  class="font-mono text-primary underline underline-offset-2"
                >
                  /expeditions
                </RouterLink>
              </template>
            </i18n-t>
          </div>
          <div v-else class="grid grid-cols-2 gap-x-3 gap-y-1.5 md:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="exp in expeditionPartiesList.filter((e) => !e.slots.every((s) => !s))"
              :key="exp.id"
              class="flex flex-col gap-1.5 rounded-md bg-muted/20 px-2 py-2"
            >
              <div class="flex items-center gap-1.5">
                <img
                  v-if="exp.rewardItemId && getItemImage({ id: exp.rewardItemId })"
                  :src="getItemImage({ id: exp.rewardItemId })"
                  :alt="itemName(exp.rewardItemId)"
                  class="size-4 shrink-0 object-contain"
                  loading="lazy"
                />
                <span class="flex-1 truncate text-2xs font-semibold">
                  {{ exp.name }}
                </span>
              </div>
              <div class="flex gap-1">
                <template v-for="(slot, i) in exp.slots" :key="i">
                  <div
                    v-if="slot"
                    class="relative size-14 overflow-hidden rounded-md border border-border bg-card"
                    :title="slot.name"
                  >
                    <RightClickHint @contextmenu="toggleCreatureById(slot.id)">
                      <img
                        v-if="getCreatureImage(slot)"
                        :src="getCreatureImage(slot)"
                        :alt="slot.name"
                        class="size-full object-cover"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="flex size-full items-center justify-center bg-muted text-3xs font-bold uppercase"
                      >
                        {{ slot.name.charAt(0) }}
                      </div>
                      <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1 py-px">
                        <p class="truncate text-center text-3xs font-bold leading-tight text-white">
                          {{ slot.name }}
                        </p>
                      </div>
                    </RightClickHint>
                  </div>
                  <div
                    v-else
                    class="size-14 rounded-md border border-dashed border-border/50 bg-muted/20"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Idle creatures container -->
        <div v-if="idleCreatures.length" class="bg-bg/40 rounded-xl border border-border/60 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <SectionEyebrow as="h3" class="flex items-center gap-1.5">
              {{ t('configs.assignments.idleLabel') }}
            </SectionEyebrow>
            <span class="font-mono text-3xs text-muted-foreground">
              {{ t('configs.assignments.unassigned', { n: idleCreatures.length }) }}
            </span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="c in idleCreatures"
              :key="c.id"
              class="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-card/50"
              :title="c.name"
            >
              <RightClickHint @contextmenu="toggleCreatureById(c.id)">
                <img
                  v-if="getCreatureImage(c)"
                  :src="getCreatureImage(c)"
                  :alt="c.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
                <div
                  v-else
                  class="flex size-full items-center justify-center bg-muted text-xs font-bold"
                >
                  {{ c.name.charAt(0) }}
                </div>
                <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1 py-px">
                  <p class="truncate text-center text-3xs font-bold leading-tight text-white">
                    {{ c.name }}
                  </p>
                </div>
              </RightClickHint>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section: Inventory codex -->
    <InventoryGridSection :items="inventoryGridItems" />

    <!-- Section: Planner snapshot cards -->
    <section class="space-y-4">
      <!-- Expeditions ladder (mockup order) -->
      <ExpeditionLadderSection
        :all-expeditions="allExpeditions"
        :expedition-display="expeditionDisplay"
        :expedition-frontiers="expeditionFrontiers"
        :expedition-ladder-columns="expeditionLadderColumns"
      />

      <!-- Workstation Queues: pipeline visualization -->
      <WorkstationQueuesSection
        :queued-station-count="queuedStationCount"
        :queued-by-station="queuedByStation"
        :queued-times="queuedTimes"
        :save-file-name="saveFileName"
      />
    </section>

    <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
  </div>
</template>
