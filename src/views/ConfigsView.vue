<script setup lang="ts">
import {
  Upload,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  RotateCcw,
  Minus,
  Plus,
  X,
} from 'lucide-vue-next'
import { ref, computed, watch, nextTick, toRaw } from 'vue'

import LevelPlannerCreaturePicker from '@/components/level-planner/LevelPlannerCreaturePicker.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { decryptSave } from '@/utils/decrypt'
import { toTitleCase } from '@/utils/format'
import { levelFromXp } from '@/utils/formulas'
import { sourceIcons, sanctuaryIcon, helpersIcon, machinesIcon } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { extractSaveConfig, type SaveConfig } from '@/utils/parseSave'

const { creatures } = useCreatures()
const { setOwned, setLevel, setAwakened, isOwned, getLevel, isAwakened, resetCollection } =
  useCreatureCollection()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  jobTiers,
  inventoryAmounts,
  gardenFlowers,
  awakenGatherUpgrades,
  awakenSpeedTiers,
  setSanctuaryCreatures,
  setHelperCreatures,
  setMachineCreatures,
  resetGameConfig,
} = useGameConfig()


const MACHINES_MAX = 9


// State
const errorMessage = ref('')
const isDragging = ref(false)
const saveConfig = ref<SaveConfig | null>(null)


// Per-section edit mode
type EditableSection = 'exclusions' | 'garden' | 'awaken'
const editingSection = ref<EditableSection | null>(null)


let sectionSnapshot: unknown = null


function startEditing(section: EditableSection) {
  // Cancel any other section first
  if (editingSection.value && editingSection.value !== section) {
    cancelEditing()
  }
  switch (section) {
    case 'exclusions':
      sectionSnapshot = {
        sanctuaryCreatureIds: structuredClone(toRaw(sanctuaryCreatureIds.value)),
        helperCreatureIds: structuredClone(toRaw(helperCreatureIds.value)),
        machineCreatureIds: structuredClone(toRaw(machineCreatureIds.value)),
      }
      break
    case 'garden':
      sectionSnapshot = structuredClone(toRaw(gardenFlowers.value))
      break
    case 'awaken':
      sectionSnapshot = {
        awakenGatherUpgrades: structuredClone(toRaw(awakenGatherUpgrades.value)),
        awakenSpeedTiers: structuredClone(toRaw(awakenSpeedTiers.value)),
      }
      break
  }
  editingSection.value = section
}


function finishEditing() {
  sectionSnapshot = null
  editingSection.value = null
}


function cancelEditing() {
  if (sectionSnapshot && editingSection.value) {
    switch (editingSection.value) {
      case 'exclusions': {
        const snap = sectionSnapshot as {
          sanctuaryCreatureIds: string[]
          helperCreatureIds: string[]
          machineCreatureIds: string[]
        }
        setSanctuaryCreatures(snap.sanctuaryCreatureIds)
        setHelperCreatures(snap.helperCreatureIds)
        setMachineCreatures(snap.machineCreatureIds)
        exclusionPickerValue.value = ''
        break
      }
      case 'garden':
        gardenFlowers.value = sectionSnapshot as Record<string, GardenFlowerEntry[]>
        break
      case 'awaken': {
        const snap = sectionSnapshot as {
          awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
          awakenSpeedTiers: Record<string, number>
        }
        awakenGatherUpgrades.value = snap.awakenGatherUpgrades
        awakenSpeedTiers.value = snap.awakenSpeedTiers
        break
      }
    }
  }
  sectionSnapshot = null
  editingSection.value = null
}


// Section collapse state
const sectionsCollapsed = ref<Record<string, boolean>>({})
function toggleSection(key: string) {
  sectionsCollapsed.value[key] = !sectionsCollapsed.value[key]
}


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


const creatureStats = computed(() => {
  const total = previewCreatures.value.length
  const newCount = previewCreatures.value.filter((c) => c.isNew).length
  const changed = previewCreatures.value.filter((c) => c.levelChanged || c.awakenedChanged).length
  return { total, newCount, changed }
})


const creatureCollectionHasDiff = computed(() => {
  return creatureStats.value.newCount > 0 || creatureStats.value.changed > 0
})


const groupedByTier = computed(() => {
  const groups = new Map<number, PreviewCreature[]>()
  for (const c of previewCreatures.value) {
    const list = groups.get(c.tier) ?? []
    list.push(c)
    groups.set(c.tier, list)
  }
  return [...groups.entries()].toSorted(([a], [b]) => a - b)
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


const helperPreview = computed(() => {
  if (!saveConfig.value) return []
  const currentSet = new Set(helperCreatureIds.value)
  return saveConfig.value.helpers
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


const machinePreview = computed(() => {
  if (!saveConfig.value) return []
  const currentSet = new Set(machineCreatureIds.value)
  return saveConfig.value.machines
    .map((id) => {
      const c = creatureMap.value.get(id)
      return c ? { ...c, isNew: !currentSet.has(id) } : null
    })
    .filter(
      (c): c is { id: string; name: string; image: string; tier: number; isNew: boolean } =>
        c != null,
    )
})


const machineHasDiff = computed(
  () => !!saveConfig.value && hasSortedDiff(machineCreatureIds.value, saveConfig.value.machines),
)


const exclusionsHaveDiff = computed(
  () => sanctuaryHasDiff.value || helperHasDiff.value || machineHasDiff.value,
)


const inventoryHasDiff = computed(() => {
  if (!saveConfig.value) return false
  return JSON.stringify(inventoryAmounts.value) !== JSON.stringify(saveConfig.value.inventory)
})


const gardenHasDiff = computed(() => {
  if (!saveConfig.value) return false
  return JSON.stringify(gardenFlowers.value) !== JSON.stringify(saveConfig.value.gardenFlowers)
})


const awakenHasDiff = computed(() => {
  if (!saveConfig.value) return false
  return (
    JSON.stringify(awakenGatherUpgrades.value) !==
      JSON.stringify(saveConfig.value.awakenGatherUpgrades) ||
    JSON.stringify(awakenSpeedTiers.value) !== JSON.stringify(saveConfig.value.awakenSpeedTiers)
  )
})


const jobTiersHasDiff = computed(() => {
  if (!saveConfig.value) return false
  return JSON.stringify(jobTiers.value) !== JSON.stringify(saveConfig.value.jobTiers)
})


// jobTiers is derived from sanctuaryCreatureIds — no apply needed


// Unified display computeds: always same shape with optional save
const awakenGatherDisplay = computed(() => {
  const saveGather = saveConfig.value?.awakenGatherUpgrades
  return Object.entries(awakenGatherUpgrades.value).map(([job, upgrade]) => ({
    job,
    current: upgrade,
    save: saveGather?.[job] ?? null,
    changed: saveGather
      ? upgrade.yieldBonus !== saveGather[job]?.yieldBonus ||
        upgrade.durationTier !== saveGather[job]?.durationTier
      : false,
  }))
})


const awakenSpeedDisplay = computed(() => {
  const saveSpeed = saveConfig.value?.awakenSpeedTiers
  return Object.entries(awakenSpeedTiers.value).map(([ws, current]) => ({
    workstation: ws,
    current,
    save: saveSpeed?.[ws] ?? null,
    changed: saveSpeed ? current !== saveSpeed[ws] : false,
  }))
})


const jobTiersDisplay = computed(() => {
  const saveTiers = saveConfig.value?.jobTiers
  return Object.entries(jobTiers.value).map(([job, current]) => ({
    job,
    current,
    save: saveTiers?.[job] ?? null,
    changed: saveTiers ? current !== saveTiers[job] : false,
  }))
})


// --- Planner Diffs (only when save loaded) ---
const inventoryDiff = computed(() => {
  if (!saveConfig.value) return []
  const saveInv = saveConfig.value.inventory
  const allKeys = new Set([...Object.keys(saveInv), ...Object.keys(inventoryAmounts.value)])
  return [...allKeys]
    .map((id) => ({
      id,
      name: toTitleCase(id),
      current: inventoryAmounts.value[id] ?? 0,
      save: saveInv[id] ?? 0,
    }))
    .filter((d) => d.current !== d.save)
    .toSorted((a, b) => a.name.localeCompare(b.name))
})


interface GardenTierDiff {
  level: number
  current: number
  save: number
  changed: boolean
}


interface GardenFlowerDiff {
  id: string
  name: string
  current: GardenFlowerEntry[]
  save: GardenFlowerEntry[]
  tiers: GardenTierDiff[]
}


const gardenDiff = computed<GardenFlowerDiff[]>(() => {
  if (!saveConfig.value) return []
  const saveGarden = saveConfig.value.gardenFlowers
  const flowerIds = ['fire-flower', 'wind-flower', 'earth-flower', 'water-flower']
  return flowerIds.map((id) => {
    const current = gardenFlowers.value[id] ?? []
    const save = saveGarden[id] ?? []
    // Merge all levels from both current and save
    const levelSet = new Set<number>()
    for (const e of current) levelSet.add(e.level)
    for (const e of save) levelSet.add(e.level)
    const tiers = [...levelSet]
      .toSorted((a, b) => a - b)
      .map((level) => {
        const cur = current.find((e) => e.level === level)?.count ?? 0
        const sav = save.find((e) => e.level === level)?.count ?? 0
        return { level, current: cur, save: sav, changed: cur !== sav }
      })
    return { id, name: toTitleCase(id), current, save, tiers }
  })
})


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


    saveConfig.value = extractSaveConfig(save)
    appliedSections.value = {}
    errorMessage.value = ''
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to process save file'
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


// --- Auto-collapse sections that match save ---
watch(saveConfig, () => {
  if (!saveConfig.value) return
  nextTick(() => {
    if (!creatureCollectionHasDiff.value) sectionsCollapsed.value.creatures = true
    if (!exclusionsHaveDiff.value) sectionsCollapsed.value.exclusions = true
    if (!inventoryHasDiff.value) sectionsCollapsed.value.inventory = true
    if (!gardenHasDiff.value) sectionsCollapsed.value.garden = true
    if (!awakenHasDiff.value) sectionsCollapsed.value.awaken = true
    if (!jobTiersHasDiff.value) sectionsCollapsed.value.jobTiers = true
  })
})


// --- Apply Functions ---
function applyCreatureCollection() {
  for (const c of previewCreatures.value) {
    setOwned(c.id, true)
    setLevel(c.id, c.level)
    setAwakened(c.id, c.awakened)
  }
  appliedSections.value = { ...appliedSections.value, creatures: true }
  sectionsCollapsed.value = { ...sectionsCollapsed.value, creatures: true }
}


function applyExclusions() {
  if (!saveConfig.value) return
  setSanctuaryCreatures(saveConfig.value.sanctuary)
  setHelperCreatures(saveConfig.value.helpers)
  setMachineCreatures(saveConfig.value.machines)
  appliedSections.value = { ...appliedSections.value, exclusions: true }
  sectionsCollapsed.value = { ...sectionsCollapsed.value, exclusions: true }
}


function applyInventory() {
  if (!saveConfig.value) return
  inventoryAmounts.value = { ...saveConfig.value.inventory }
  appliedSections.value = { ...appliedSections.value, inventory: true }
  sectionsCollapsed.value = { ...sectionsCollapsed.value, inventory: true }
}


function applyGarden() {
  if (!saveConfig.value) return
  gardenFlowers.value = { ...saveConfig.value.gardenFlowers }
  appliedSections.value = { ...appliedSections.value, garden: true }
  sectionsCollapsed.value = { ...sectionsCollapsed.value, garden: true }
}


function applyAwaken() {
  if (!saveConfig.value) return
  awakenGatherUpgrades.value = { ...saveConfig.value.awakenGatherUpgrades }
  awakenSpeedTiers.value = { ...saveConfig.value.awakenSpeedTiers }
  appliedSections.value = { ...appliedSections.value, awaken: true }
  sectionsCollapsed.value = { ...sectionsCollapsed.value, awaken: true }
}


function applyAll() {
  applyCreatureCollection()
  applyExclusions()
  applyInventory()
  applyGarden()
  applyAwaken()
}


// --- Reset Functions ---
function resetExclusions() {
  resetGameConfig()
}


function resetInventory() {
  inventoryAmounts.value = {}
}


function resetGarden() {
  gardenFlowers.value = {
    'fire-flower': [],
    'wind-flower': [],
    'earth-flower': [],
    'water-flower': [],
  }
}


function resetAwaken() {
  awakenGatherUpgrades.value = {
    Chopping: { yieldBonus: 0, durationTier: 0 },
    Mining: { yieldBonus: 0, durationTier: 0 },
    Digging: { yieldBonus: 0, durationTier: 0 },
    Exploring: { yieldBonus: 0, durationTier: 0 },
    Fishing: { yieldBonus: 0, durationTier: 0 },
    Farming: { yieldBonus: 0, durationTier: 0 },
  }
  awakenSpeedTiers.value = { Furnace: 0, Stove: 0, Workbench: 0 }
}


function resetAll() {
  resetExclusions()
  resetInventory()
  resetGarden()
  resetAwaken()
  resetCollection()
}


function totalFlowerCount(entries: GardenFlowerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count, 0)
}


function totalYieldPerCycle(entries: GardenFlowerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count * e.level, 0)
}


// Exclusion editing
const exclusionPickerValue = ref('')
const activeExclusionSlot = ref<{
  type: 'sanctuary' | 'helpers' | 'machines'
  index: number
} | null>(null)


const SANCTUARY_MAX = 8
const HELPERS_MAX = 6


const excludedCreatureIdSet = computed(
  () =>
    new Set([
      ...sanctuaryCreatureIds.value,
      ...helperCreatureIds.value,
      ...machineCreatureIds.value,
    ]),
)


const sanctuarySlots = computed(() => {
  const slots: ({ id: string; name: string; image: string; tier: number } | null)[] = []
  for (let i = 0; i < SANCTUARY_MAX; i++) {
    const id = sanctuaryCreatureIds.value[i]
    slots.push(id ? (creatureMap.value.get(id) ?? null) : null)
  }
  return slots
})


const helperSlots = computed(() => {
  const slots: ({ id: string; name: string; image: string; tier: number } | null)[] = []
  for (let i = 0; i < HELPERS_MAX; i++) {
    const id = helperCreatureIds.value[i]
    slots.push(id ? (creatureMap.value.get(id) ?? null) : null)
  }
  return slots
})


const machineSlots = computed(() => {
  const slots: ({ id: string; name: string; image: string; tier: number } | null)[] = []
  for (let i = 0; i < MACHINES_MAX; i++) {
    const id = machineCreatureIds.value[i]
    slots.push(id ? (creatureMap.value.get(id) ?? null) : null)
  }
  return slots
})


function setActiveExclusionSlot(type: 'sanctuary' | 'helpers' | 'machines', index: number) {
  if (activeExclusionSlot.value?.type === type && activeExclusionSlot.value?.index === index) {
    activeExclusionSlot.value = null
  } else {
    activeExclusionSlot.value = { type, index }
  }
}


function removeFromSanctuary(index: number) {
  const ids = [...sanctuaryCreatureIds.value]
  ids.splice(index, 1)
  setSanctuaryCreatures(ids)
}


function removeFromHelpers(index: number) {
  const ids = [...helperCreatureIds.value]
  ids.splice(index, 1)
  setHelperCreatures(ids)
}


function removeFromMachine(index: number) {
  const ids = [...machineCreatureIds.value]
  ids.splice(index, 1)
  setMachineCreatures(ids)
}


function assignExclusionCreature(creatureId: string) {
  if (!activeExclusionSlot.value) return
  const { type, index } = activeExclusionSlot.value
  if (type === 'sanctuary') {
    const ids = [...sanctuaryCreatureIds.value]
    // Pad with empty strings if needed, then set at index
    while (ids.length < index) ids.push('')
    if (index < ids.length) {
      ids[index] = creatureId
    } else {
      ids.push(creatureId)
    }
    setSanctuaryCreatures(ids.filter(Boolean))
  } else if (type === 'helpers') {
    const ids = [...helperCreatureIds.value]
    while (ids.length < index) ids.push('')
    if (index < ids.length) {
      ids[index] = creatureId
    } else {
      ids.push(creatureId)
    }
    setHelperCreatures(ids.filter(Boolean))
  } else if (type === 'machines') {
    const ids = [...machineCreatureIds.value]
    while (ids.length < index) ids.push('')
    if (index < ids.length) {
      ids[index] = creatureId
    } else {
      ids.push(creatureId)
    }
    setMachineCreatures(ids.filter(Boolean))
  }
  activeExclusionSlot.value = null
  exclusionPickerValue.value = ''
}


// Garden helpers (matching PlannerSettings pattern)
const gardenFlowerTypes = [
  { id: 'fire-flower', name: 'Fire Flower' },
  { id: 'wind-flower', name: 'Wind Flower' },
  { id: 'earth-flower', name: 'Earth Flower' },
  { id: 'water-flower', name: 'Water Flower' },
]
const gardenLevels = [1, 2, 3, 4, 5, 6]


const gardenTotalFlowerCount = computed(() =>
  Object.values(gardenFlowers.value).reduce(
    (sum, entries) => sum + entries.reduce((s, e) => s + e.count, 0),
    0,
  ),
)
const gardenRemainingSlots = computed(() => 25 - gardenTotalFlowerCount.value)


function gardenFlowerYield(flowerId: string): number {
  return (gardenFlowers.value[flowerId] ?? []).reduce((sum, e) => sum + e.count * e.level, 0)
}


function gardenFlowerCount(flowerId: string): number {
  return (gardenFlowers.value[flowerId] ?? []).reduce((sum, e) => sum + e.count, 0)
}


function gardenCountAtLevel(flowerId: string, level: number): number {
  return (gardenFlowers.value[flowerId] ?? []).find((e) => e.level === level)?.count ?? 0
}


function gardenSetCountAtLevel(flowerId: string, level: number, event: Event) {
  const parsed = Number((event.target as HTMLInputElement).value)
  const entries = (gardenFlowers.value[flowerId] ?? []).filter((e) => e.level !== level)
  const currentCount = gardenCountAtLevel(flowerId, level)
  const maxAllowed = currentCount + gardenRemainingSlots.value
  const clamped = Math.max(
    0,
    Math.min(maxAllowed, Number.isFinite(parsed) ? Math.round(parsed) : 0),
  )
  if (clamped > 0) entries.push({ count: clamped, level })
  entries.sort((a, b) => a.level - b.level)
  gardenFlowers.value = { ...gardenFlowers.value, [flowerId]: entries }
}


function gardenStepCountAtLevel(flowerId: string, level: number, delta: number) {
  const current = gardenCountAtLevel(flowerId, level)
  const maxAllowed = current + gardenRemainingSlots.value
  const next = Math.max(0, Math.min(maxAllowed, current + delta))
  const entries = (gardenFlowers.value[flowerId] ?? []).filter((e) => e.level !== level)
  if (next > 0) entries.push({ count: next, level })
  entries.sort((a, b) => a.level - b.level)
  gardenFlowers.value = { ...gardenFlowers.value, [flowerId]: entries }
}


const activeGardenFlowers = computed(() =>
  Object.entries(gardenFlowers.value)
    .filter(([, entries]) => entries.some((e) => e.count > 0))
    .map(([flowerId, entries]) => {
      const activeEntries = entries.filter((e) => e.count > 0).toSorted((a, b) => a.level - b.level)
      const totalCount = activeEntries.reduce((s, e) => s + e.count, 0)
      const yieldPerMin = activeEntries.reduce((s, e) => s + e.count * e.level, 0)
      return {
        flowerId,
        flowerName: toTitleCase(flowerId),
        totalCount,
        yieldPerMin,
        entries: activeEntries,
      }
    }),
)


// Awaken editing
function updateAwakenGatherYield(job: string, delta: number) {
  const current = awakenGatherUpgrades.value[job] ?? { yieldBonus: 0, durationTier: 0 }
  awakenGatherUpgrades.value = {
    ...awakenGatherUpgrades.value,
    [job]: { ...current, yieldBonus: Math.max(0, Math.min(2, current.yieldBonus + delta)) },
  }
}


function updateAwakenGatherDuration(job: string, delta: number) {
  const current = awakenGatherUpgrades.value[job] ?? { yieldBonus: 0, durationTier: 0 }
  awakenGatherUpgrades.value = {
    ...awakenGatherUpgrades.value,
    [job]: { ...current, durationTier: Math.max(0, Math.min(4, current.durationTier + delta)) },
  }
}


function updateAwakenSpeed(ws: string, delta: number) {
  awakenSpeedTiers.value = {
    ...awakenSpeedTiers.value,
    [ws]: Math.max(0, Math.min(4, (awakenSpeedTiers.value[ws] ?? 0) + delta)),
  }
}


const JOB_TIER_BENEFITS = [
  { xpBonus: 0, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 1 },
]


function jobTierLabel(tier: number): string {
  const b = JOB_TIER_BENEFITS[tier] ?? JOB_TIER_BENEFITS[0]
  if (tier === 0) return 'No bonuses'
  const parts: string[] = []
  if (b.xpBonus > 0) parts.push(`+${b.xpBonus}% XP`)
  if (b.durationReduction > 0) parts.push(`-${b.durationReduction}% Duration`)
  if (b.yieldBonus > 0) parts.push(`+${b.yieldBonus} Yield`)
  return parts.join(', ')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-extrabold">Configs</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Manage creature exclusions, inventory, and planner settings. Upload a save file to import
          from your game.
        </p>
      </div>
      <button
        class="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
        @click="resetAll"
      >
        <RotateCcw class="size-3.5" />
        Reset All
      </button>
    </div>

    <!-- Save File Upload -->
    <section class="rounded-xl border border-border bg-card/50 p-4">
      <h2 class="mb-3 text-base font-bold">Save File Import</h2>

      <!-- Error -->
      <div
        v-if="errorMessage"
        class="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2"
      >
        <AlertCircle class="size-4 shrink-0 text-red-400" />
        <p class="text-sm text-red-300">{{ errorMessage }}</p>
      </div>

      <label
        class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition"
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
          {{
            saveConfig ? 'Upload a different save file' : 'Drop save file here or click to browse'
          }}
        </span>
        <input type="file" accept=".json" class="hidden" @change="onFileSelect" />
      </label>

      <!-- Apply All (only when save loaded) -->
      <div v-if="saveConfig" class="mt-3 flex items-center gap-3">
        <button
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          @click="applyAll"
        >
          Apply All From Save
        </button>
        <span class="text-xs text-muted-foreground">
          {{ creatureStats.total }} creatures, {{ Object.keys(saveConfig.inventory).length }} items
        </span>
      </div>
    </section>

    <!-- Section: Creature Collection (only when save loaded) -->
    <section v-if="saveConfig" class="rounded-xl border border-border bg-card/50 p-4">
      <div class="flex items-center justify-between">
        <button class="flex items-center gap-2" @click="toggleSection('creatures')">
          <component
            :is="sectionsCollapsed.creatures ? ChevronDown : ChevronUp"
            class="size-4 text-muted-foreground"
          />
          <h2 class="text-base font-bold">Creature Collection</h2>
        </button>
        <div class="flex items-center gap-2">
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
              {{ creatureStats.total }} creatures
            </span>
            <span
              v-if="creatureStats.newCount"
              class="rounded-md bg-emerald-500/15 px-2 py-1 font-medium text-emerald-400"
            >
              +{{ creatureStats.newCount }} new
            </span>
            <span
              v-if="creatureStats.changed"
              class="rounded-md bg-amber-500/15 px-2 py-1 font-medium text-amber-400"
            >
              {{ creatureStats.changed }} updated
            </span>
          </div>
          <button
            v-if="!appliedSections.creatures && creatureCollectionHasDiff"
            class="focus-ring rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            @click="applyCreatureCollection"
          >
            Apply
          </button>
          <span
            v-else-if="!appliedSections.creatures && !creatureCollectionHasDiff"
            class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
          >
            <Check class="size-3.5" /> Matches Save
          </span>
          <span
            v-else-if="appliedSections.creatures"
            class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
          >
            <Check class="size-3.5" /> Applied
          </span>
        </div>
      </div>

      <div
        v-if="!sectionsCollapsed.creatures && creatureCollectionHasDiff"
        class="mt-3 max-h-[40vh] space-y-3 overflow-y-auto pr-1"
      >
        <div v-for="[tier, group] in groupedByTier" :key="tier">
          <h3
            class="sticky top-0 z-10 mb-1.5 border-b border-border/50 bg-card py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Tier {{ tier + 1 }}
          </h3>
          <div class="space-y-0.5">
            <div
              v-for="c in group"
              :key="c.id"
              class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
              :class="{
                'bg-emerald-500/10': c.isNew,
                'bg-amber-500/10': (c.levelChanged || c.awakenedChanged) && !c.isNew,
              }"
            >
              <img
                v-if="getCreatureImage(c)"
                :src="getCreatureImage(c)"
                :alt="c.name"
                class="size-7 rounded object-cover"
              />
              <div v-else class="size-7 rounded bg-muted" />
              <span class="flex-1 font-medium" :class="c.awakened ? 'text-pink-400' : ''">
                {{ c.name }}
              </span>
              <span
                v-if="c.awakened"
                class="text-xs"
                :class="c.awakenedChanged ? 'font-semibold text-pink-300' : 'text-pink-400/70'"
              >
                ★ Awakened
              </span>
              <span class="tabular-nums text-muted-foreground">
                <template v-if="c.levelChanged">
                  <span class="text-muted-foreground/60">{{ c.oldLevel }}</span>
                  <span class="mx-0.5">&rarr;</span>
                </template>
                Lv.{{ c.level }}
              </span>
              <span v-if="c.isNew" class="text-xs font-semibold text-emerald-400">NEW</span>
              <Check
                v-else-if="!c.levelChanged && !c.awakenedChanged"
                class="size-3.5 text-muted-foreground/50"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section: Creature Exclusions -->
    <section class="rounded-xl border border-border bg-card/50 p-4">
      <div class="flex items-center justify-between">
        <button class="flex items-center gap-2" @click="toggleSection('exclusions')">
          <component
            :is="sectionsCollapsed.exclusions ? ChevronDown : ChevronUp"
            class="size-4 text-muted-foreground"
          />
          <h2 class="text-base font-bold">Creature Exclusions</h2>
        </button>
        <div class="flex items-center gap-2">
          <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
            {{ sanctuaryCreatureIds.length + helperCreatureIds.length + machineCreatureIds.length }}
            excluded
          </span>
          <button
            v-if="saveConfig && !appliedSections.exclusions && exclusionsHaveDiff"
            class="focus-ring rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            @click="applyExclusions"
          >
            Apply from Save
          </button>
          <span
            v-else-if="saveConfig && !appliedSections.exclusions && !exclusionsHaveDiff"
            class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
          >
            <Check class="size-3.5" /> Matches Save
          </span>
          <span
            v-else-if="appliedSections.exclusions"
            class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
          >
            <Check class="size-3.5" /> Applied
          </span>
          <button
            v-if="
              editingSection === 'exclusions' &&
              sanctuaryCreatureIds.length + helperCreatureIds.length + machineCreatureIds.length > 0
            "
            class="focus-ring rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
            @click="resetExclusions"
          >
            <RotateCcw class="size-3" />
          </button>
          <template v-if="editingSection !== 'exclusions'">
            <button
              class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
              @click="startEditing('exclusions')"
            >
              <Pencil class="size-3.5" />
              Edit
            </button>
          </template>
          <template v-else>
            <button
              class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition"
              @click="finishEditing"
            >
              Done
            </button>
            <button
              class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
              @click="cancelEditing"
            >
              Cancel
            </button>
          </template>
        </div>
      </div>

      <div v-if="!sectionsCollapsed.exclusions" class="mt-3 space-y-4">
        <!-- Sanctuary Slots -->
        <div class="space-y-2">
          <h3
            class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
          >
            <img :src="sanctuaryIcon" alt="" class="size-4" />
            <template v-if="saveConfig && !appliedSections.exclusions && sanctuaryHasDiff">
              Sanctuary ({{ sanctuaryCreatureIds.length }} &rarr; {{ sanctuaryPreview.length }})
            </template>
            <template v-else>
              Sanctuary ({{ sanctuaryCreatureIds.length }}/{{ SANCTUARY_MAX }})
            </template>
          </h3>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="(slot, index) in sanctuarySlots"
              :key="index"
              class="relative size-16 overflow-hidden rounded-lg border transition"
              :class="[
                slot
                  ? 'border-border bg-card/50'
                  : editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'sanctuary' &&
                      activeExclusionSlot?.index === index
                    ? 'border-dashed border-primary bg-primary/10'
                    : editingSection === 'exclusions'
                      ? 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45'
                      : 'border-dashed border-border/50 bg-muted/20',
              ]"
              @click="
                editingSection === 'exclusions' && !slot
                  ? setActiveExclusionSlot('sanctuary', index)
                  : undefined
              "
            >
              <template v-if="slot">
                <img
                  v-if="getCreatureImage(slot)"
                  :src="getCreatureImage(slot)"
                  :alt="slot.name"
                  class="size-full object-cover"
                />
                <div
                  v-else
                  class="flex size-full items-center justify-center bg-muted text-xs font-bold"
                >
                  {{ slot.name.charAt(0) }}
                </div>
                <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                  <p class="truncate text-center text-[9px] font-semibold text-white">
                    {{ slot.name }}
                  </p>
                </div>
                <button
                  v-if="editingSection === 'exclusions'"
                  class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                  @click.stop="removeFromSanctuary(index)"
                >
                  <X class="size-3" />
                </button>
              </template>
              <template v-else>
                <div class="flex size-full flex-col items-center justify-center gap-1">
                  <Plus
                    v-if="editingSection === 'exclusions'"
                    class="size-4 text-muted-foreground/50"
                  />
                  <span
                    v-if="
                      editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'sanctuary' &&
                      activeExclusionSlot?.index === index
                    "
                    class="text-[9px] text-primary"
                    >Select</span
                  >
                </div>
              </template>
            </div>
          </div>
          <div
            v-if="saveConfig && !appliedSections.exclusions"
            class="mt-1.5 flex items-center gap-2"
          >
            <span class="text-[10px] font-semibold text-accent">&rarr;</span>
            <template v-if="sanctuaryHasDiff">
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="c in sanctuaryPreview"
                  :key="c.id"
                  class="relative size-[60px] overflow-hidden rounded-lg border"
                  :class="
                    c.isNew
                      ? 'border-emerald-400/50 ring-1 ring-emerald-400/20'
                      : 'border-accent/30'
                  "
                >
                  <img
                    v-if="getCreatureImage(c)"
                    :src="getCreatureImage(c)"
                    :alt="c.name"
                    class="size-full object-cover"
                  />
                  <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                    <p class="truncate text-center text-[8px] font-semibold text-white">
                      {{ c.name }}
                    </p>
                  </div>
                  <span
                    v-if="c.isNew"
                    class="absolute left-0.5 top-0.5 rounded bg-emerald-500/80 px-0.5 text-[7px] font-bold uppercase text-white"
                    >new</span
                  >
                </div>
                <span v-if="sanctuaryPreview.length === 0" class="text-[10px] text-muted-foreground"
                  >None</span
                >
              </div>
            </template>
            <span v-else class="text-[10px] text-emerald-400">No changes</span>
          </div>
        </div>

        <!-- Helper Slots -->
        <div class="space-y-2">
          <h3
            class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
          >
            <img :src="helpersIcon" alt="" class="size-4" />
            Helpers ({{ helperCreatureIds.length }}/{{ HELPERS_MAX }})
          </h3>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="(slot, index) in helperSlots"
              :key="index"
              class="relative size-16 overflow-hidden rounded-lg border transition"
              :class="[
                slot
                  ? 'border-border bg-card/50'
                  : editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'helpers' &&
                      activeExclusionSlot?.index === index
                    ? 'border-dashed border-primary bg-primary/10'
                    : editingSection === 'exclusions'
                      ? 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45'
                      : 'border-dashed border-border/50 bg-muted/20',
              ]"
              @click="
                editingSection === 'exclusions' && !slot
                  ? setActiveExclusionSlot('helpers', index)
                  : undefined
              "
            >
              <template v-if="slot">
                <img
                  v-if="getCreatureImage(slot)"
                  :src="getCreatureImage(slot)"
                  :alt="slot.name"
                  class="size-full object-cover"
                />
                <div
                  v-else
                  class="flex size-full items-center justify-center bg-muted text-xs font-bold"
                >
                  {{ slot.name.charAt(0) }}
                </div>
                <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                  <p class="truncate text-center text-[9px] font-semibold text-white">
                    {{ slot.name }}
                  </p>
                </div>
                <button
                  v-if="editingSection === 'exclusions'"
                  class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                  @click.stop="removeFromHelpers(index)"
                >
                  <X class="size-3" />
                </button>
              </template>
              <template v-else>
                <div class="flex size-full flex-col items-center justify-center gap-1">
                  <Plus
                    v-if="editingSection === 'exclusions'"
                    class="size-4 text-muted-foreground/50"
                  />
                  <span
                    v-if="
                      editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'helpers' &&
                      activeExclusionSlot?.index === index
                    "
                    class="text-[9px] text-primary"
                    >Select</span
                  >
                </div>
              </template>
            </div>
          </div>
          <div
            v-if="saveConfig && !appliedSections.exclusions"
            class="mt-1.5 flex items-center gap-2"
          >
            <span class="text-[10px] font-semibold text-accent">&rarr;</span>
            <template v-if="helperHasDiff">
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="c in helperPreview"
                  :key="c.id"
                  class="relative size-[60px] overflow-hidden rounded-lg border"
                  :class="
                    c.isNew
                      ? 'border-emerald-400/50 ring-1 ring-emerald-400/20'
                      : 'border-accent/30'
                  "
                >
                  <img
                    v-if="getCreatureImage(c)"
                    :src="getCreatureImage(c)"
                    :alt="c.name"
                    class="size-full object-cover"
                  />
                  <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                    <p class="truncate text-center text-[8px] font-semibold text-white">
                      {{ c.name }}
                    </p>
                  </div>
                  <span
                    v-if="c.isNew"
                    class="absolute left-0.5 top-0.5 rounded bg-emerald-500/80 px-0.5 text-[7px] font-bold uppercase text-white"
                    >new</span
                  >
                </div>
                <span v-if="helperPreview.length === 0" class="text-[10px] text-muted-foreground"
                  >None</span
                >
              </div>
            </template>
            <span v-else class="text-[10px] text-emerald-400">No changes</span>
          </div>
        </div>

        <!-- Machine Slots -->
        <div class="space-y-2">
          <h3
            class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
          >
            <img :src="machinesIcon" alt="" class="size-4" />
            <template v-if="saveConfig && !appliedSections.exclusions && machineHasDiff">
              Machines ({{ machineCreatureIds.length }} &rarr; {{ saveConfig.machines.length }})
            </template>
            <template v-else>
              Machines ({{ machineCreatureIds.length }}/{{ MACHINES_MAX }})
            </template>
          </h3>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="(slot, index) in machineSlots"
              :key="index"
              class="relative size-16 overflow-hidden rounded-lg border transition"
              :class="[
                slot
                  ? 'border-border bg-card/50'
                  : editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'machines' &&
                      activeExclusionSlot?.index === index
                    ? 'border-dashed border-primary bg-primary/10'
                    : editingSection === 'exclusions'
                      ? 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45'
                      : 'border-dashed border-border/50 bg-muted/20',
              ]"
              @click="
                editingSection === 'exclusions' && !slot
                  ? setActiveExclusionSlot('machines', index)
                  : undefined
              "
            >
              <template v-if="slot">
                <img
                  v-if="getCreatureImage(slot)"
                  :src="getCreatureImage(slot)"
                  :alt="slot.name"
                  class="size-full object-cover"
                />
                <div
                  v-else
                  class="flex size-full items-center justify-center bg-muted text-xs font-bold"
                >
                  {{ slot.name.charAt(0) }}
                </div>
                <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                  <p class="truncate text-center text-[9px] font-semibold text-white">
                    {{ slot.name }}
                  </p>
                </div>
                <button
                  v-if="editingSection === 'exclusions'"
                  class="focus-ring absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white"
                  @click.stop="removeFromMachine(index)"
                >
                  <X class="size-3" />
                </button>
              </template>
              <template v-else>
                <div class="flex size-full flex-col items-center justify-center gap-1">
                  <Plus
                    v-if="editingSection === 'exclusions'"
                    class="size-4 text-muted-foreground/50"
                  />
                  <span
                    v-if="
                      editingSection === 'exclusions' &&
                      activeExclusionSlot?.type === 'machines' &&
                      activeExclusionSlot?.index === index
                    "
                    class="text-[9px] text-primary"
                    >Select</span
                  >
                </div>
              </template>
            </div>
          </div>
          <div
            v-if="saveConfig && !appliedSections.exclusions"
            class="mt-1.5 flex items-center gap-2"
          >
            <span class="text-[10px] font-semibold text-accent">&rarr;</span>
            <template v-if="machineHasDiff">
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="c in machinePreview"
                  :key="c.id"
                  class="relative size-[60px] overflow-hidden rounded-lg border"
                  :class="
                    c.isNew
                      ? 'border-emerald-400/50 ring-1 ring-emerald-400/20'
                      : 'border-accent/30'
                  "
                >
                  <img
                    v-if="getCreatureImage(c)"
                    :src="getCreatureImage(c)"
                    :alt="c.name"
                    class="size-full object-cover"
                  />
                  <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5">
                    <p class="truncate text-center text-[8px] font-semibold text-white">
                      {{ c.name }}
                    </p>
                  </div>
                  <span
                    v-if="c.isNew"
                    class="absolute left-0.5 top-0.5 rounded bg-emerald-500/80 px-0.5 text-[7px] font-bold uppercase text-white"
                    >new</span
                  >
                </div>
                <span v-if="machinePreview.length === 0" class="text-[10px] text-muted-foreground"
                  >None</span
                >
              </div>
            </template>
            <span v-else class="text-[10px] text-emerald-400">No changes</span>
          </div>
        </div>

        <!-- Creature Picker (editing only, when a slot is active) -->
        <div v-if="editingSection === 'exclusions' && activeExclusionSlot">
          <LevelPlannerCreaturePicker
            :model-value="exclusionPickerValue"
            :owned-only="true"
            :exclude-ids="excludedCreatureIdSet"
            @update:model-value="assignExclusionCreature($event)"
          />
        </div>

        <p class="text-xs text-muted-foreground">
          Excluded creatures won't appear in expedition recommendations. Use the "Show Excluded"
          filter on the Expeditions page to temporarily include them.
        </p>
      </div>
    </section>

    <!-- Section: Planner Settings -->
    <section class="space-y-4">
      <h2 class="text-base font-bold">Planner Settings</h2>

      <!-- Inventory -->
      <div class="rounded-xl border border-border bg-card/50 p-4">
        <div class="flex items-center justify-between">
          <button class="flex items-center gap-2" @click="toggleSection('inventory')">
            <component
              :is="sectionsCollapsed.inventory ? ChevronDown : ChevronUp"
              class="size-4 text-muted-foreground"
            />
            <h3 class="text-sm font-bold">Inventory</h3>
          </button>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
              {{ Object.keys(inventoryAmounts).length }} items
            </span>
            <template v-if="saveConfig">
              <button
                v-if="!appliedSections.inventory && inventoryHasDiff"
                class="focus-ring rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                @click="applyInventory"
              >
                Apply
              </button>
              <span
                v-else-if="!appliedSections.inventory && !inventoryHasDiff"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Matches Save
              </span>
              <span
                v-else-if="appliedSections.inventory"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Applied
              </span>
            </template>
            <button
              v-if="Object.keys(inventoryAmounts).length > 0"
              class="focus-ring rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
              @click="resetInventory"
            >
              <RotateCcw class="size-3" />
            </button>
          </div>
        </div>

        <div v-if="!sectionsCollapsed.inventory" class="mt-3">
          <!-- Save Diff -->
          <div
            v-if="saveConfig && inventoryDiff.length > 0"
            class="max-h-60 space-y-0.5 overflow-y-auto pr-1"
          >
            <div
              v-for="d in inventoryDiff"
              :key="d.id"
              class="flex items-center justify-between rounded-lg bg-amber-500/10 px-2 py-1.5 text-sm"
            >
              <div class="flex items-center gap-2">
                <img
                  v-if="getItemImage({ id: d.id })"
                  :src="getItemImage({ id: d.id })"
                  :alt="d.name"
                  class="size-5 object-contain"
                />
                <span class="font-medium">{{ d.name }}</span>
              </div>
              <span class="tabular-nums text-muted-foreground">
                <span class="text-muted-foreground/60">{{ d.current.toLocaleString() }}</span>
                <span class="mx-1">&rarr;</span>
                <span class="text-foreground">{{ d.save.toLocaleString() }}</span>
              </span>
            </div>
          </div>
          <p
            v-else-if="saveConfig && Object.keys(saveConfig.inventory).length === 0"
            class="text-sm text-muted-foreground"
          >
            No inventory found in save file.
          </p>
          <p v-else-if="saveConfig" class="text-sm text-muted-foreground">
            Inventory matches save file ({{ Object.keys(saveConfig.inventory).length }} items).
          </p>
          <p
            v-else-if="Object.keys(inventoryAmounts).length === 0"
            class="text-sm text-muted-foreground"
          >
            No inventory configured. Upload a save or set amounts in the Planner.
          </p>
          <p v-else class="text-sm text-muted-foreground">
            {{ Object.keys(inventoryAmounts).length }} items tracked. Upload a save file to compare.
          </p>
        </div>
      </div>

      <!-- Garden -->
      <div class="rounded-xl border border-border bg-card/50 p-4">
        <div class="flex items-center justify-between">
          <button class="flex items-center gap-2" @click="toggleSection('garden')">
            <component
              :is="sectionsCollapsed.garden ? ChevronDown : ChevronUp"
              class="size-4 text-muted-foreground"
            />
            <h3 class="text-sm font-bold">Garden</h3>
          </button>
          <div class="flex items-center gap-2">
            <template v-if="saveConfig">
              <button
                v-if="!appliedSections.garden && gardenHasDiff"
                class="focus-ring rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                @click="applyGarden"
              >
                Apply
              </button>
              <span
                v-else-if="!appliedSections.garden && !gardenHasDiff"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Matches Save
              </span>
              <span
                v-else-if="appliedSections.garden"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Applied
              </span>
            </template>
            <button
              v-if="editingSection === 'garden'"
              class="focus-ring rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
              @click="resetGarden"
            >
              <RotateCcw class="size-3" />
            </button>
            <template v-if="editingSection !== 'garden'">
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                @click="startEditing('garden')"
              >
                <Pencil class="size-3.5" />
                Edit
              </button>
            </template>
            <template v-else>
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                @click="cancelEditing"
              >
                Cancel
              </button>
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition"
                @click="finishEditing"
              >
                Done
              </button>
            </template>
          </div>
        </div>

        <div v-if="!sectionsCollapsed.garden" class="mt-3 space-y-3">
          <!-- Edit mode: PlannerSettings grid pattern -->
          <template v-if="editingSection === 'garden'">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground"
                >{{ gardenTotalFlowerCount }} / 25 flowers placed</span
              >
              <span
                class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
              >
                {{ gardenRemainingSlots }} slots left
              </span>
            </div>
            <div
              v-for="flower in gardenFlowerTypes"
              :key="flower.id"
              class="rounded-xl border border-border/40 bg-background/30 px-3 py-2.5"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70"
                >
                  <img
                    v-if="getItemImage({ id: flower.id })"
                    :src="getItemImage({ id: flower.id })"
                    :alt="flower.name"
                    class="size-5 object-contain"
                  />
                </div>
                <span class="min-w-0 flex-1 text-sm font-semibold text-foreground">{{
                  flower.name
                }}</span>
                <span class="text-[10px] font-semibold text-muted-foreground">
                  {{ gardenFlowerCount(flower.id) }} flower{{
                    gardenFlowerCount(flower.id) === 1 ? '' : 's'
                  }}
                </span>
                <span
                  class="w-14 text-right text-xs font-semibold"
                  :style="{ color: gardenFlowerYield(flower.id) > 0 ? 'var(--color-green)' : '' }"
                >
                  {{ gardenFlowerYield(flower.id) }}/min
                </span>
              </div>
              <div class="mt-2 grid grid-cols-6 gap-1.5">
                <div v-for="lv in gardenLevels" :key="lv" class="flex flex-col items-center gap-1">
                  <span class="text-[10px] font-bold text-muted-foreground">Lv{{ lv }}</span>
                  <div
                    class="inline-flex items-center overflow-hidden rounded-lg border"
                    :class="
                      gardenCountAtLevel(flower.id, lv) > 0
                        ? 'border-primary/40'
                        : 'border-border/70'
                    "
                  >
                    <button
                      class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                      :disabled="gardenCountAtLevel(flower.id, lv) <= 0"
                      @click="gardenStepCountAtLevel(flower.id, lv, -1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      inputmode="numeric"
                      :value="gardenCountAtLevel(flower.id, lv)"
                      class="focus-ring h-7 w-8 border-x bg-background/80 px-0.5 text-center text-xs font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      :class="
                        gardenCountAtLevel(flower.id, lv) > 0
                          ? 'border-primary/30'
                          : 'border-border/50'
                      "
                      @change="gardenSetCountAtLevel(flower.id, lv, $event)"
                      @blur="gardenSetCountAtLevel(flower.id, lv, $event)"
                    />
                    <button
                      class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                      :disabled="
                        gardenRemainingSlots <= 0 && gardenCountAtLevel(flower.id, lv) === 0
                      "
                      @click="gardenStepCountAtLevel(flower.id, lv, 1)"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Read-only mode: Active Modifiers pattern -->
          <template v-else>
            <!-- When save loaded and not applied: show all flowers with inline diff -->
            <template v-if="saveConfig && !appliedSections.garden">
              <template v-for="f in gardenDiff" :key="f.id">
                <div
                  v-if="totalFlowerCount(f.save) > 0 || totalFlowerCount(f.current) > 0"
                  class="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
                  :class="
                    JSON.stringify(f.current) !== JSON.stringify(f.save)
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : ''
                  "
                >
                  <div class="flex items-center gap-2">
                    <img
                      v-if="getItemImage({ id: f.id })"
                      :src="getItemImage({ id: f.id })"
                      :alt="f.name"
                      class="size-5 object-contain"
                    />
                    <span class="min-w-0 text-sm font-semibold text-foreground">{{ f.name }}</span>
                    <span class="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {{ totalFlowerCount(f.current) }}
                      <template v-if="totalFlowerCount(f.current) !== totalFlowerCount(f.save)">
                        <span class="mx-0.5">&rarr;</span>
                        <span class="text-accent">{{ totalFlowerCount(f.save) }}</span>
                      </template>
                      flower{{ totalFlowerCount(f.current) === 1 ? '' : 's' }}
                    </span>
                    <span
                      class="shrink-0 font-mono text-sm font-semibold tabular-nums"
                      style="color: rgb(163, 230, 53)"
                    >
                      {{ totalYieldPerCycle(f.current) }}
                      <template v-if="totalYieldPerCycle(f.current) !== totalYieldPerCycle(f.save)">
                        <span class="mx-0.5 text-muted-foreground">&rarr;</span>
                        <span class="text-accent">{{ totalYieldPerCycle(f.save) }}</span>
                      </template>
                      /min
                    </span>
                  </div>
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <template v-if="f.tiers.length > 0">
                      <span
                        v-for="tier in f.tiers"
                        :key="tier.level"
                        class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
                        :class="
                          tier.changed
                            ? 'border-amber-500/40 bg-amber-500/10'
                            : tier.level >= 4
                              ? 'border-lime-400/40 bg-lime-400/10 text-lime-300'
                              : tier.level >= 2
                                ? 'border-lime-400/25 bg-lime-400/5 text-lime-300/80'
                                : 'border-border/50 bg-background/50 text-muted-foreground'
                        "
                      >
                        <template v-if="tier.changed">
                          <span class="text-muted-foreground">{{ tier.current }}×</span>
                          <span class="text-muted-foreground">&rarr;</span>
                          <span class="font-bold text-accent">{{ tier.save }}×</span>
                        </template>
                        <span v-else class="font-bold">{{ tier.current }}×</span>
                        <span>Lv{{ tier.level }}</span>
                      </span>
                    </template>
                    <span v-else class="text-[11px] text-muted-foreground">None</span>
                  </div>
                </div>
              </template>
            </template>
            <!-- No save (or applied): show active flowers only -->
            <template v-else>
              <template v-if="activeGardenFlowers.length > 0">
                <div
                  v-for="flower in activeGardenFlowers"
                  :key="flower.flowerId"
                  class="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
                >
                  <div class="flex items-center gap-2">
                    <img
                      v-if="getItemImage({ id: flower.flowerId })"
                      :src="getItemImage({ id: flower.flowerId })"
                      :alt="flower.flowerName"
                      class="size-5 object-contain"
                    />
                    <span class="min-w-0 text-sm font-semibold text-foreground">{{
                      flower.flowerName
                    }}</span>
                    <span class="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {{ flower.totalCount }} flower{{ flower.totalCount === 1 ? '' : 's' }}
                    </span>
                    <span
                      class="shrink-0 font-mono text-sm font-semibold"
                      style="color: rgb(163, 230, 53)"
                    >
                      {{ flower.yieldPerMin }}/min
                    </span>
                  </div>
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <span
                      v-for="entry in flower.entries"
                      :key="entry.level"
                      class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
                      :class="
                        entry.level >= 4
                          ? 'border-lime-400/40 bg-lime-400/10 text-lime-300'
                          : entry.level >= 2
                            ? 'border-lime-400/25 bg-lime-400/5 text-lime-300/80'
                            : 'border-border/50 bg-background/50 text-muted-foreground'
                      "
                    >
                      <span class="font-bold">{{ entry.count }}×</span>
                      <span>Lv{{ entry.level }}</span>
                    </span>
                  </div>
                </div>
              </template>
              <p v-else class="text-sm text-muted-foreground">No garden flowers configured.</p>
            </template>
          </template>
        </div>
      </div>

      <!-- Awaken Tree -->
      <div class="rounded-xl border border-border bg-card/50 p-4">
        <div class="flex items-center justify-between">
          <button class="flex items-center gap-2" @click="toggleSection('awaken')">
            <component
              :is="sectionsCollapsed.awaken ? ChevronDown : ChevronUp"
              class="size-4 text-muted-foreground"
            />
            <h3 class="text-sm font-bold">Awaken Tree</h3>
          </button>
          <div class="flex items-center gap-2">
            <template v-if="saveConfig">
              <button
                v-if="!appliedSections.awaken && awakenHasDiff"
                class="focus-ring rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                @click="applyAwaken"
              >
                Apply
              </button>
              <span
                v-else-if="!appliedSections.awaken && !awakenHasDiff"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Matches Save
              </span>
              <span
                v-else-if="appliedSections.awaken"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Applied
              </span>
            </template>
            <button
              v-if="editingSection === 'awaken'"
              class="focus-ring rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
              @click="resetAwaken"
            >
              <RotateCcw class="size-3" />
            </button>
            <template v-if="editingSection !== 'awaken'">
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                @click="startEditing('awaken')"
              >
                <Pencil class="size-3.5" />
                Edit
              </button>
            </template>
            <template v-else>
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                @click="cancelEditing"
              >
                Cancel
              </button>
              <button
                class="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition"
                @click="finishEditing"
              >
                Done
              </button>
            </template>
          </div>
        </div>

        <div v-if="!sectionsCollapsed.awaken" class="mt-3 space-y-4">
          <!-- Gather Upgrades -->
          <div>
            <h4 class="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Gather Upgrades
            </h4>
            <div class="space-y-1">
              <div
                v-for="g in awakenGatherDisplay"
                :key="g.job"
                class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
                :class="g.changed ? 'bg-amber-500/10' : ''"
              >
                <div class="flex items-center gap-2">
                  <img
                    v-if="sourceIcons[g.job]"
                    :src="sourceIcons[g.job]"
                    alt=""
                    class="size-5 object-contain"
                  />
                  <span class="font-medium">{{ g.job }}</span>
                </div>
                <div class="flex items-center gap-4 text-xs tabular-nums">
                  <template v-if="editingSection === 'awaken'">
                    <!-- Yield -->
                    <div class="flex items-center gap-1">
                      <span class="text-muted-foreground">Yield</span>
                      <button
                        class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="g.current.yieldBonus <= 0"
                        @click="updateAwakenGatherYield(g.job, -1)"
                      >
                        <Minus class="size-3" />
                      </button>
                      <span class="w-6 text-center font-semibold">+{{ g.current.yieldBonus }}</span>
                      <button
                        class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="g.current.yieldBonus >= 2"
                        @click="updateAwakenGatherYield(g.job, 1)"
                      >
                        <Plus class="size-3" />
                      </button>
                    </div>
                    <!-- Duration -->
                    <div class="flex items-center gap-1">
                      <span class="text-muted-foreground">Duration</span>
                      <button
                        class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="g.current.durationTier <= 0"
                        @click="updateAwakenGatherDuration(g.job, -1)"
                      >
                        <Minus class="size-3" />
                      </button>
                      <span class="w-10 text-center font-semibold"
                        >-{{ g.current.durationTier * 5 }}%</span
                      >
                      <button
                        class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="g.current.durationTier >= 4"
                        @click="updateAwakenGatherDuration(g.job, 1)"
                      >
                        <Plus class="size-3" />
                      </button>
                    </div>
                  </template>
                  <span v-else class="font-medium">
                    Yield +{{ g.current.yieldBonus }}, Duration -{{ g.current.durationTier * 5 }}%
                  </span>
                  <!-- Save diff arrow if save loaded -->
                  <template v-if="g.save && g.changed && !appliedSections.awaken">
                    <span class="text-muted-foreground">&rarr;</span>
                    <span class="text-[11px] text-accent">
                      +{{ g.save.yieldBonus }}, -{{ g.save.durationTier * 5 }}%
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Speed Upgrades -->
          <div>
            <h4 class="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Speed Upgrades
            </h4>
            <div class="space-y-1">
              <div
                v-for="s in awakenSpeedDisplay"
                :key="s.workstation"
                class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
                :class="s.changed ? 'bg-amber-500/10' : ''"
              >
                <div class="flex items-center gap-2">
                  <img
                    v-if="sourceIcons[s.workstation]"
                    :src="sourceIcons[s.workstation]"
                    alt=""
                    class="size-5 object-contain"
                  />
                  <span class="font-medium">{{ s.workstation }}</span>
                </div>
                <div class="flex items-center gap-4 text-xs tabular-nums">
                  <div v-if="editingSection === 'awaken'" class="flex items-center gap-1">
                    <span class="text-muted-foreground">Speed</span>
                    <button
                      class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="s.current <= 0"
                      @click="updateAwakenSpeed(s.workstation, -1)"
                    >
                      <Minus class="size-3" />
                    </button>
                    <span class="w-10 text-center font-semibold">+{{ s.current * 10 }}%</span>
                    <button
                      class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="s.current >= 4"
                      @click="updateAwakenSpeed(s.workstation, 1)"
                    >
                      <Plus class="size-3" />
                    </button>
                  </div>
                  <span v-else class="font-medium">Speed +{{ s.current * 10 }}%</span>
                  <template v-if="s.save !== null && s.changed && !appliedSections.awaken">
                    <span class="text-muted-foreground">&rarr;</span>
                    <span class="text-[11px] text-accent">+{{ s.save * 10 }}%</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Job Tiers -->
      <div class="rounded-xl border border-border bg-card/50 p-4">
        <div class="flex items-center justify-between">
          <button class="flex items-center gap-2" @click="toggleSection('jobTiers')">
            <component
              :is="sectionsCollapsed.jobTiers ? ChevronDown : ChevronUp"
              class="size-4 text-muted-foreground"
            />
            <h3 class="text-sm font-bold">Job Tiers</h3>
          </button>
          <div class="flex items-center gap-2">
            <template v-if="saveConfig">
              <span
                v-if="!jobTiersHasDiff"
                class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400"
              >
                <Check class="size-3.5" /> Matches Save
              </span>
            </template>
          </div>
        </div>

        <div v-if="!sectionsCollapsed.jobTiers" class="mt-3 space-y-1">
          <p class="mb-2 text-[11px] text-muted-foreground">
            Automatically calculated from sanctuary creatures.
          </p>
          <div
            v-for="j in jobTiersDisplay"
            :key="j.job"
            class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
            :class="j.changed ? 'bg-amber-500/10' : ''"
          >
            <div class="flex items-center gap-2">
              <img
                v-if="sourceIcons[j.job]"
                :src="sourceIcons[j.job]"
                alt=""
                class="size-5 object-contain"
              />
              <span class="font-medium">{{ j.job }}</span>
            </div>
            <div class="flex items-center gap-4 text-xs tabular-nums">
              <span class="font-medium">Tier {{ j.current }} · {{ jobTierLabel(j.current) }}</span>
              <template v-if="j.save !== null && j.changed">
                <span class="text-muted-foreground">&rarr;</span>
                <span class="text-[11px] text-accent"
                  >Tier {{ j.save }} · {{ jobTierLabel(j.save!) }}</span
                >
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
