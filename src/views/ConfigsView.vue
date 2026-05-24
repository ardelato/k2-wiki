<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { Upload, AlertCircle, Check, Info, RotateCcw } from 'lucide-vue-next'
import { ref, computed, onMounted, onUnmounted } from 'vue'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import AssignmentZone from '@/components/configs/AssignmentZone.vue'
import HeroStatsSection from '@/components/configs/HeroStatsSection.vue'
import InventoryGridSection from '@/components/configs/InventoryGridSection.vue'
import WorkstationQueuesSection from '@/components/configs/WorkstationQueuesSection.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { clearSummoningPlannerSelection } from '@/composables/useSummoningPlanner'
import expeditionsData from '@/data/expeditions.json'
import { items as allItems } from '@/data/indexes'
import type { Expedition } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { decryptSave } from '@/utils/decrypt'
import {
  getTotalCompletedExpeditions,
  getMaxUnlockedTier,
  TIER_UNLOCK_REQUIREMENTS,
} from '@/utils/expeditionUnlocks'
import { itemName } from '@/utils/format'
import { levelFromXp, getPlayerLevel, SKILLING_IDS } from '@/utils/formulas'
import {
  sourceIcons,
  sanctuaryIcon,
  helpersIcon,
  machinesIcon,
  dungeonsIcon,
  jobIcons,
  expeditionTierIcons,
} from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { extractSaveConfig, type SaveConfig } from '@/utils/parseSave'

const allExpeditions = (expeditionsData as Expedition[]).toSorted((a, b) => {
  const diff = a.requiredExpeditionCompletions - b.requiredExpeditionCompletions
  if (diff !== 0) return diff
  return a.baseRating - b.baseRating
})


const { creatures } = useCreatures()
const { setOwned, setLevel, setAwakened, isOwned, getLevel, isAwakened, resetCollection } =
  useCreatureCollection()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  inventoryAmounts,
  collectedItems,
  setCollectedItems,
  resetCollectedItems,
  setGardenLayout,
  setGardenSaveSnapshot,
  resetGarden,
  awakenGatherUpgrades,
  awakenSpeedTiers,
  setSanctuaryCreatures,
  setHelperCreatures,
  setMachineCreatures,
  expeditionCompletions,
  expeditionParties,
  setExpeditionCompletions,
  setExpeditionToolXpBonus,
  setToolLevels,
  setToolSpeedModes,
  resetToolLevels,
  setMachineLevels,
  setMachineRecipes,
  resetMachines,
  setFabricationAllocations,
  resetFabrication,
  setAwakenGoldLevel,
  skillLevels,
  playerLevel,
  setSkillLevels,
  resetSkillLevels,
  queuedAmounts,
  queuedTimes,
  setQueuedAmounts,
  setQueuedTimes,
  resetQueuedAmounts,
  setExpeditionParties,
  setExpeditionTiers,
  setExpeditionCreatureLevels,
  setExpeditionLoopCounts,
  resetExpeditionSetup,
  dungeonParty,
  setDungeonParty,
  resetDungeonParty,
  applyDungeonStateFromSave,
  resetDungeonStorage,
  resetAwaken,
} = useGameConfig()


const { selectedCreature, drawerOpen, toggleCreatureById, closeDrawer } = useCreatureDrawer()


const MACHINES_MAX = 9
const DUNGEON_MAX = 3


// State
const errorMessage = ref('')
const isDragging = ref(false)
const saveConfig = ref<SaveConfig | null>(null)


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
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remMin = minutes % 60
    return remMin ? `${hours}h ${remMin}m ago` : `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
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


// --- Expedition frontiers: what to unlock next ---
const expeditionFrontiers = computed(() => {
  const items = expeditionDisplay.value.items

  // Next expedition to unlock (first locked one in the sorted list)
  const nextExpItem = items.find((it) => !it.unlocked)
  const totalRunsCompleted = (() => {
    const completions = saveConfig.value
      ? saveConfig.value.expeditionCompletions
      : expeditionCompletions.value
    return getTotalCompletedExpeditions(completions)
  })()
  const nextExp = nextExpItem
    ? {
        name: nextExpItem.expedition.name,
        rewardItemId: nextExpItem.expedition.rewards[0]?.itemId,
        have: totalRunsCompleted,
        need: nextExpItem.expedition.requiredExpeditionCompletions,
        remaining: Math.max(
          0,
          nextExpItem.expedition.requiredExpeditionCompletions - totalRunsCompleted,
        ),
        pct: Math.min(
          100,
          Math.round(
            (totalRunsCompleted / nextExpItem.expedition.requiredExpeditionCompletions) * 100,
          ),
        ),
      }
    : null

  // Tier-up frontiers: unlocked expeditions with a locked next tier, closest to ready
  const completions = saveConfig.value
    ? saveConfig.value.expeditionCompletions
    : expeditionCompletions.value
  const tierUps = items
    .filter((it) => it.unlocked)
    .map((it) => {
      const lockedTier = it.tiers.find((t) => !t.unlocked)
      if (!lockedTier) return null
      const required = TIER_UNLOCK_REQUIREMENTS[lockedTier.tier] ?? 0
      const prevTierCompletions = completions[it.expedition.id]?.[lockedTier.tier - 1] ?? 0
      const have = prevTierCompletions
      const need = required
      const remaining = lockedTier.remaining
      const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0
      return {
        name: it.expedition.name,
        rewardItemId: it.expedition.rewards[0]?.itemId,
        fromTier: lockedTier.tier - 1,
        toTier: lockedTier.tier,
        have,
        need,
        remaining,
        pct,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .toSorted((a, b) => b.pct - a.pct)
    .slice(0, 2)

  return { nextExp, tierUps }
})


// --- Expedition ladder: compact per-row data for the mockup-faithful list ---
interface ExpeditionLadderRow {
  id: string
  name: string
  rewardItemId: string | undefined
  requiredExpeditionCompletions: number
  tiers: { tier: number; cleared: boolean; unlocked: boolean; completions: number }[]
  maxTier: number
  nextTier: number
  pct: number
  have: number
  need: number
  remaining: number
  runs: number
  locked: boolean
  maxed: boolean
}


const expeditionLadder = computed<ExpeditionLadderRow[]>(() => {
  const completions = saveConfig.value
    ? saveConfig.value.expeditionCompletions
    : expeditionCompletions.value
  const totalRuns = getTotalCompletedExpeditions(completions)
  return allExpeditions.map((e) => {
    const unlocked = totalRuns >= e.requiredExpeditionCompletions
    const expCompletions = completions[e.id] ?? {}
    const tierEntries = [1, 2, 3, 4, 5].map((t) => {
      const cleared = (expCompletions[t] ?? 0) > 0
      const prevCompletions = expCompletions[t - 1] ?? 0
      const tierUnlocked =
        unlocked && (t === 1 || prevCompletions >= (TIER_UNLOCK_REQUIREMENTS[t] ?? 0))
      return {
        tier: t,
        completions: expCompletions[t] ?? 0,
        cleared,
        unlocked: tierUnlocked,
      }
    })
    // maxTier is the highest *unlocked* tier (not necessarily run yet) — once
    // the threshold for the next tier is met, we conceptually move to it even
    // before the player has done a single run there.
    const maxTier = unlocked
      ? Math.max(0, ...tierEntries.filter((t) => t.unlocked).map((t) => t.tier))
      : 0
    const nextTier = Math.min(5, maxTier + 1)
    const need = maxTier > 0 && maxTier < 5 ? (TIER_UNLOCK_REQUIREMENTS[nextTier] ?? 0) : 0
    const have = maxTier > 0 ? (expCompletions[maxTier] ?? 0) : 0
    const remaining = Math.max(0, need - have)
    const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0
    const runs = tierEntries.reduce((s, t) => s + t.completions, 0)
    const locked = !unlocked
    const maxed = maxTier === 5
    return {
      id: e.id,
      name: e.name,
      rewardItemId: e.rewards[0]?.itemId,
      requiredExpeditionCompletions: e.requiredExpeditionCompletions,
      tiers: tierEntries,
      maxTier,
      nextTier,
      pct,
      have,
      need,
      remaining,
      runs,
      locked,
      maxed,
    }
  })
})


const expeditionLadderColumns = computed(() => {
  const rows = expeditionLadder.value
  const mid = Math.ceil(rows.length / 2)
  return [rows.slice(0, mid), rows.slice(mid)]
})


const expeditionPartiesAssigned = computed(() => {
  // Match the source used by expeditionPartiesList so the slot counter stays
  // in sync with the preview-vs-persisted behaviour.
  let count = 0
  for (const exp of expeditionPartiesList.value) {
    for (const slot of exp.slots) {
      if (slot) count += 1
    }
  }
  return count
})


// Expeditions × creatures-on-party — for the Assignments card row.
// Mirrors /expeditions' resolution pattern (creatures.find by id) so the same
// localStorage state renders identically here.
interface AssignmentExpeditionSlot {
  id: string
  name: string
  image: string
  tier: number
}
const expeditionPartiesList = computed(() => {
  // Mirror the Sanctuary/Helpers/Machines swap: when a save is loaded and the
  // expedition setup hasn't been applied yet, preview the save's party data so
  // the user can see what `Apply` would set. Otherwise show the persisted ids.
  const saveParties = saveConfig.value?.currentExpedition?.parties
  const showSavePreview = !!saveConfig.value && !!saveParties && Object.keys(saveParties).length > 0
  const parties = showSavePreview ? saveParties : (expeditionParties.value ?? {})
  return allExpeditions.map((e) => {
    const partyIds = (parties[e.id] ?? []) as string[]
    const maxSlots = Math.max(3, e.maxPartySize ?? 3)
    const slots: (AssignmentExpeditionSlot | null)[] = []
    for (let i = 0; i < maxSlots; i++) {
      const id = partyIds[i]
      if (!id) {
        slots.push(null)
        continue
      }
      const meta = creatures.value.find((c) => c.id === id)
      slots.push(
        meta
          ? { id: meta.id, name: meta.name, image: meta.image, tier: meta.tier }
          : { id, name: id, image: '', tier: 0 },
      )
    }
    return {
      id: e.id,
      name: e.name,
      rewardItemId: e.rewards[0]?.itemId,
      slots,
    }
  })
})


const expeditionDisplay = computed(() => {
  const completions = saveConfig.value
    ? saveConfig.value.expeditionCompletions
    : expeditionCompletions.value
  const totalCompletions = getTotalCompletedExpeditions(completions)
  const unlockedCount = allExpeditions.filter(
    (e) => totalCompletions >= e.requiredExpeditionCompletions,
  ).length

  const items = allExpeditions.map((expedition) => {
    const unlocked = totalCompletions >= expedition.requiredExpeditionCompletions
    const maxTier = unlocked ? getMaxUnlockedTier(expedition.id, completions) : 0
    const expCompletions = completions[expedition.id]
    const tiers = [1, 2, 3, 4, 5].map((t) => {
      const isUnlocked = t <= maxTier
      const prevTierCount = expCompletions?.[t - 1] ?? 0
      const required = TIER_UNLOCK_REQUIREMENTS[t] ?? 0
      const remaining = isUnlocked || t === 1 ? 0 : Math.max(0, required - prevTierCount)
      return { tier: t, unlocked: isUnlocked || t === 1, remaining }
    })
    return { expedition, unlocked, tiers }
  })

  const totalTiersUnlocked = items.reduce(
    (sum, item) => sum + (item.unlocked ? item.tiers.filter((t) => t.unlocked).length : 0),
    0,
  )

  return { items, unlockedCount, totalTiersUnlocked }
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


function applyAll() {
  if (!saveConfig.value) return
  const save = saveConfig.value


  resetCollection()
  for (const c of previewCreatures.value) {
    setOwned(c.id, true)
    setLevel(c.id, c.level)
    setAwakened(c.id, c.awakened)
  }


  setSanctuaryCreatures(save.sanctuary)
  setHelperCreatures(save.helpers)
  setMachineCreatures(save.machines)
  setDungeonParty(save.currentDungeon?.party ?? [])


  inventoryAmounts.value = { ...save.inventory }
  setCollectedItems([...save.collectedItems])


  setQueuedAmounts({ ...save.queuedAmounts })
  setQueuedTimes({ ...save.queuedTimes })


  awakenGatherUpgrades.value = { ...save.awakenGatherUpgrades }
  awakenSpeedTiers.value = { ...save.awakenSpeedTiers }
  setAwakenGoldLevel(save.awakenGoldLevel)


  setExpeditionToolXpBonus(((save.tools?.sword || 0) * 5) / 100 + 1)
  setToolLevels({ ...save.toolLevels })
  setToolSpeedModes({ ...save.toolSpeedModes })


  setSkillLevels({ ...save.skillLevels })


  setMachineLevels({ ...save.machineLevels })
  setMachineRecipes({ ...save.machineRecipes })


  setFabricationAllocations({ ...save.fabricationAllocations })


  setExpeditionCompletions({ ...save.expeditionCompletions })


  setExpeditionParties({ ...save.currentExpedition.parties })
  setExpeditionCreatureLevels({ ...save.currentExpedition.levels })
  setExpeditionTiers({ ...save.currentExpedition.tiers })
  setExpeditionLoopCounts({ ...save.currentExpedition.loopCounts })


  if (save.currentDungeon) applyDungeonStateFromSave(save.currentDungeon)


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
  setSanctuaryCreatures([])
  setHelperCreatures([])
  setMachineCreatures([])
  inventoryAmounts.value = {}
  resetCollectedItems()
  resetQueuedAmounts()
  resetAwaken()
  setAwakenGoldLevel(0)
  resetToolLevels()
  setExpeditionToolXpBonus(1)
  resetMachines()
  resetFabrication()
  expeditionCompletions.value = {}
  resetExpeditionSetup()
  resetSkillLevels()
  resetCollection()
  resetDungeonParty()
  resetGarden()
  resetDungeonStorage()
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
              <Check class="size-3.5 text-emerald-400" />
              <span class="text-emerald-400">Save synced</span>
              <span class="text-muted-foreground/60">·</span>
              <span class="font-mono normal-case tracking-normal text-muted-foreground/80">
                {{ saveFileName }}
              </span>
              <span v-if="importedAgo" class="text-muted-foreground/60">·</span>
              <span v-if="importedAgo" class="normal-case tracking-normal">
                imported {{ importedAgo }}
              </span>
            </template>
            <template v-else>
              <Upload class="size-3.5" />
              <span>No save loaded</span>
            </template>
          </SectionEyebrow>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Game Snapshot</h1>
          <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
            The data the wiki's planners and calculators use for your account. Import a save to
            populate it, reset to clear.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
            @click="resetAll"
          >
            <RotateCcw class="size-3.5" />
            Reset all
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
          Drop save file here or click to browse
        </span>
        <input type="file" accept=".json" class="hidden" @change="onFileSelect" />
      </label>

      <div
        v-if="errorMessage"
        class="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2"
      >
        <AlertCircle class="size-4 shrink-0 text-red-400" />
        <p class="text-sm text-red-300">{{ errorMessage }}</p>
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
              <h2 class="text-base font-bold">Creature Assignments</h2>
              <AppTooltip
                text='Assigned creatures are reserved by the planner across all pages. Toggle "Show Excluded" where available to temporarily include them.'
              >
                <Info class="size-3.5 text-muted-foreground/70 hover:text-foreground" />
              </AppTooltip>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
            {{ assignedCreatureIds.size }} assigned
          </span>
          <span
            v-if="idleCreatures.length"
            class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {{ idleCreatures.length }} idle
          </span>
        </div>
      </div>

      <div class="mt-3 space-y-3">
        <!-- 4 zones in a row -->
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <AssignmentZone
            :icon="sanctuaryIcon"
            label="Sanctuary"
            :slots="sanctuarySlots"
            :current-count="sanctuaryCreatureIds.length"
            :max="SANCTUARY_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && sanctuaryHasDiff"
            :target-count="sanctuaryPreview.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="helpersIcon"
            label="Helpers"
            :slots="helperSlots"
            :current-count="helperCreatureIds.length"
            :max="HELPERS_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && helperHasDiff"
            :target-count="saveConfig?.helpers.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="machinesIcon"
            label="Machines"
            :slots="machineSlots"
            :current-count="machineCreatureIds.length"
            :max="MACHINES_MAX"
            :show-diff="!!saveConfig && !appliedSections.exclusions && machineHasDiff"
            :target-count="saveConfig?.machines.length"
            @context-menu="toggleCreatureById"
          />
          <AssignmentZone
            :icon="dungeonsIcon"
            label="Dungeons"
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
              Expeditions
            </SectionEyebrow>
            <span class="font-mono text-[10px] text-muted-foreground">
              {{ expeditionPartiesAssigned }}/{{ expeditionPartiesList.length * 3 }} slots filled
            </span>
          </div>
          <div
            v-if="expeditionPartiesAssigned === 0"
            class="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground"
          >
            No creatures currently assigned to any expedition. Head to
            <RouterLink
              to="/expeditions"
              class="font-mono text-primary underline underline-offset-2"
            >
              /expeditions
            </RouterLink>
            to set up parties.
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
                <span class="flex-1 truncate text-[11px] font-semibold">
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
                        class="flex size-full items-center justify-center bg-muted text-[10px] font-bold uppercase"
                      >
                        {{ slot.name.charAt(0) }}
                      </div>
                      <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1 py-px">
                        <p
                          class="truncate text-center text-[9px] font-bold leading-tight text-white"
                        >
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
            <SectionEyebrow as="h3" class="flex items-center gap-1.5"> Idle </SectionEyebrow>
            <span class="font-mono text-[10px] text-muted-foreground">
              {{ idleCreatures.length }} unassigned
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
                  <p class="truncate text-center text-[9px] font-bold leading-tight text-white">
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
      <!-- Expeditions -->
      <div class="rounded-xl border border-border bg-card/50 p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5">
              <h3 class="text-sm font-bold">Expeditions</h3>
              <AppTooltip text="Any expedition run counts toward unlocking the next expedition.">
                <Info class="size-3.5 text-muted-foreground/70 hover:text-foreground" />
              </AppTooltip>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
                {{ expeditionDisplay.unlockedCount }}/{{ allExpeditions.length }} unlocked
              </span>
              <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
                {{ expeditionDisplay.totalTiersUnlocked }}/{{ allExpeditions.length * 5 }} tiers
              </span>
            </div>
          </div>
        </div>

        <div class="mt-3 space-y-3">
          <!-- Up Next frontier cards -->
          <div
            v-if="expeditionFrontiers.nextExp || expeditionFrontiers.tierUps.length"
            class="space-y-2"
          >
            <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
              Up next
            </div>
            <div class="grid gap-2 md:grid-cols-3">
              <div
                v-if="expeditionFrontiers.nextExp"
                class="overflow-hidden rounded-xl border border-accent/35 bg-card/60 p-3.5"
              >
                <div class="flex items-stretch gap-3">
                  <div
                    class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-amber-400/10"
                  >
                    <img
                      v-if="
                        expeditionFrontiers.nextExp.rewardItemId &&
                        getItemImage({ id: expeditionFrontiers.nextExp.rewardItemId })
                      "
                      :src="getItemImage({ id: expeditionFrontiers.nextExp.rewardItemId })"
                      :alt="expeditionFrontiers.nextExp.rewardItemId"
                      class="size-9 object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                        {{ expeditionFrontiers.nextExp.name }}
                      </span>
                      <span
                        class="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300"
                      >
                        Next
                      </span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
                      <div
                        class="h-full rounded-full bg-amber-400 transition-all"
                        :style="{ width: `${expeditionFrontiers.nextExp.pct}%` }"
                      />
                    </div>
                    <div class="mt-1.5 flex items-baseline justify-between gap-2">
                      <span class="font-mono text-xs font-semibold">
                        <span class="text-[10px] font-normal text-muted-foreground/50">Have </span>
                        <span class="text-foreground">{{ expeditionFrontiers.nextExp.have }}</span>
                        <span class="text-muted-foreground/50">
                          / {{ expeditionFrontiers.nextExp.need }}
                        </span>
                        <span class="text-[10px] font-normal text-muted-foreground/50">
                          Total
                        </span>
                      </span>
                      <span
                        class="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400"
                      >
                        <span
                          class="text-[10px] font-normal text-amber-700/70 dark:text-amber-400/60"
                          >Need
                        </span>
                        {{ expeditionFrontiers.nextExp.remaining }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-for="f in expeditionFrontiers.tierUps"
                :key="f.name"
                class="overflow-hidden rounded-xl border border-border bg-card/60 p-3.5"
              >
                <div class="flex items-stretch gap-3">
                  <div
                    class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-amber-400/10"
                  >
                    <img
                      v-if="f.rewardItemId && getItemImage({ id: f.rewardItemId })"
                      :src="getItemImage({ id: f.rewardItemId })"
                      :alt="f.rewardItemId"
                      class="size-9 object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                        {{ f.name }}
                      </span>
                      <span
                        class="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300"
                      >
                        <img
                          :src="expeditionTierIcons[f.fromTier]"
                          :alt="`Tier ${f.fromTier}`"
                          class="size-3.5 object-contain"
                          loading="lazy"
                        />
                        <span>→</span>
                        <img
                          :src="expeditionTierIcons[f.toTier]"
                          :alt="`Tier ${f.toTier}`"
                          class="size-3.5 object-contain"
                          loading="lazy"
                        />
                      </span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
                      <div
                        class="h-full rounded-full bg-amber-400 transition-all"
                        :style="{ width: `${f.pct}%` }"
                      />
                    </div>
                    <div class="mt-1.5 flex items-baseline justify-between gap-2">
                      <span class="font-mono text-xs font-semibold">
                        <span class="text-[10px] font-normal text-muted-foreground/50">Have </span>
                        <span class="text-foreground">{{ f.have }}</span>
                        <span class="text-muted-foreground/50"> / {{ f.need }} </span>
                        <span class="text-[10px] font-normal text-muted-foreground/50"> Loops</span>
                      </span>
                      <span
                        class="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400"
                      >
                        <span
                          class="text-[10px] font-normal text-amber-700/70 dark:text-amber-400/60"
                          >Need
                        </span>
                        {{ f.remaining }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Compact 2-col ladder -->
          <div class="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2">
            <div v-for="(col, ci) in expeditionLadderColumns" :key="ci" class="space-y-0.5">
              <div class="grid grid-cols-[1fr_auto_auto_auto] items-end gap-3 px-2 pb-0.5">
                <span />
                <div class="flex gap-0.5">
                  <span class="w-4 text-center font-mono text-[9px] text-muted-foreground/60" />
                  <span
                    v-for="t in [2, 3, 4, 5]"
                    :key="t"
                    class="w-4 text-center font-mono text-[9px] text-muted-foreground/60"
                  >
                    {{ TIER_UNLOCK_REQUIREMENTS[t] }}
                  </span>
                </div>
                <span class="w-[92px]" />
                <span class="w-16" />
              </div>
              <div
                v-for="row in col"
                :key="row.id"
                class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md px-2 py-1.5"
                :class="row.locked ? 'opacity-40' : ''"
              >
                <div class="flex min-w-0 items-center gap-1.5">
                  <img
                    v-if="row.rewardItemId && getItemImage({ id: row.rewardItemId })"
                    :src="getItemImage({ id: row.rewardItemId })"
                    :alt="itemName(row.rewardItemId)"
                    class="size-4 shrink-0 object-contain"
                    loading="lazy"
                  />
                  <span
                    class="truncate text-[12px] font-semibold"
                    :class="row.locked ? 'italic text-muted-foreground' : ''"
                  >
                    {{ row.name }}
                    <span
                      v-if="row.requiredExpeditionCompletions > 0"
                      class="ml-0.5 font-mono text-[10px] font-normal text-muted-foreground/70"
                    >
                      ({{ row.requiredExpeditionCompletions }})
                    </span>
                  </span>
                </div>
                <div class="flex gap-0.5">
                  <img
                    v-for="t in row.tiers"
                    :key="t.tier"
                    :src="expeditionTierIcons[t.tier]"
                    :alt="`Tier ${t.tier}`"
                    class="size-4 object-contain"
                    :class="t.cleared ? '' : t.unlocked ? 'opacity-70' : 'opacity-30 grayscale'"
                    loading="lazy"
                  />
                </div>
                <span
                  class="flex w-[92px] items-center justify-end gap-1 font-mono text-[10px] font-bold"
                  :class="
                    row.maxed
                      ? 'text-pink-400'
                      : row.locked
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground'
                  "
                >
                  <template v-if="row.locked">locked</template>
                  <template v-else-if="row.maxed">
                    <img
                      :src="expeditionTierIcons[5]"
                      alt="Tier 5"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                    <span>MAXED</span>
                  </template>
                  <template v-else>
                    <img
                      :src="expeditionTierIcons[row.maxTier]"
                      :alt="`Tier ${row.maxTier}`"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                    <span>{{ row.have }}/{{ row.need }}</span>
                    <span>→</span>
                    <img
                      :src="expeditionTierIcons[row.nextTier]"
                      :alt="`Tier ${row.nextTier}`"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                  </template>
                </span>
                <span
                  class="w-16 text-right font-mono text-[10px] tabular-nums text-muted-foreground/70"
                >
                  <template v-if="row.runs > 0">{{ row.runs }} runs</template>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
