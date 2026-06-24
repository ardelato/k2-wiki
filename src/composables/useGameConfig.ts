import { StorageSerializers, useLocalStorage } from '@vueuse/core'
import { computed, watch } from 'vue'

import {
  defaultAwakenGatherUpgrades,
  defaultAwakenSpeedTiers,
  defaultAwakenWorkstationXpTiers,
  defaultGardenFlowers,
} from '@/data/defaults'
import type { GardenCell, GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'
import { getPlayerLevel } from '@/utils/formulas'
import { calculateJobTiersFromSanctuary, type SaveConfig } from '@/utils/save/parseSave'

const sanctuaryCreatureIds = useLocalStorage<string[]>('config-sanctuary-creatures', [])
const helperCreatureIds = useLocalStorage<string[]>('config-helper-creatures', [])
const machineCreatureIds = useLocalStorage<string[]>('config-machine-creature-ids', [])
const expeditionToolXpBonus = useLocalStorage<number>('config-tool-xp-bonus', 1)
const expeditionParties = useLocalStorage<Record<string, string[]>>('expedition-parties', {})
const expeditionTiers = useLocalStorage<Record<string, number>>('expedition-tiers', {})
const expeditionCreatureLevels = useLocalStorage<Record<string, number>>(
  'expedition-creature-levels',
  {},
)
const expeditionLoopCounts = useLocalStorage<Record<string, number>>('expedition-loop-counts', {})
const dungeonParty = useLocalStorage<string[]>('dungeon-party', [])

const inventoryAmounts = useLocalStorage<Record<string, number>>('config-inventory', {})
const collectedItems = useLocalStorage<string[]>('config-collected-items', [])
const gardenFlowers = useLocalStorage<Record<string, GardenFlowerEntry[]>>(
  'config-garden-flowers',
  defaultGardenFlowers(),
)
const GARDEN_GRID_SIZE = 25
const gardenLayout = useLocalStorage<(GardenCell | null)[]>('config-garden-layout', () =>
  Array(GARDEN_GRID_SIZE).fill(null),
)
// Snapshot of garden state from the most-recent imported save. Used so the
// Garden page's "Reset" can revert to the save state instead of wiping it.
const gardenLayoutFromSave = useLocalStorage<(GardenCell | null)[] | null>(
  'config-garden-layout-from-save',
  null,
  { serializer: StorageSerializers.object },
)

// One-time migration: if the new positional layout is empty but the legacy
// aggregated count-by-level data has entries, seed the layout from the
// aggregated state (highest levels first) so existing users don't lose data.
;(() => {
  const layout = gardenLayout.value
  if (layout.some((c) => c !== null)) return
  const flat: GardenCell[] = []
  for (const [flowerId, entries] of Object.entries(gardenFlowers.value)) {
    for (const e of entries) {
      for (let i = 0; i < e.count; i++) flat.push({ flowerId, level: e.level })
    }
  }
  if (flat.length === 0) return
  flat.sort((a, b) => b.level - a.level)
  const next: (GardenCell | null)[] = Array(GARDEN_GRID_SIZE).fill(null)
  for (let i = 0; i < Math.min(flat.length, GARDEN_GRID_SIZE); i++) next[i] = flat[i]
  gardenLayout.value = next
})()

// Layout is the source of truth — keep the aggregated `gardenFlowers` map in
// sync so downstream consumers (useGoldIncome, craft planner) keep working.
function aggregateLayout(layout: (GardenCell | null)[]): Record<string, GardenFlowerEntry[]> {
  const buckets = new Map<string, Map<number, number>>()
  for (const cell of layout) {
    if (!cell || typeof cell.flowerId !== 'string' || !cell.flowerId) continue
    if (typeof cell.level !== 'number') continue
    const perLevel = buckets.get(cell.flowerId) ?? new Map<number, number>()
    perLevel.set(cell.level, (perLevel.get(cell.level) ?? 0) + 1)
    buckets.set(cell.flowerId, perLevel)
  }
  const result = defaultGardenFlowers()
  for (const [flowerId, perLevel] of buckets) {
    result[flowerId] = [...perLevel.entries()]
      .map(([level, count]) => ({ level, count }))
      .toSorted((a, b) => a.level - b.level)
  }
  return result
}

watch(
  gardenLayout,
  (layout) => {
    gardenFlowers.value = aggregateLayout(layout)
  },
  { deep: true },
)
const awakenGatherUpgrades = useLocalStorage<Record<string, AwakenGatherUpgrade>>(
  'config-awaken-gather',
  defaultAwakenGatherUpgrades(),
)
const awakenSpeedTiers = useLocalStorage<Record<string, number>>(
  'config-awaken-speed',
  defaultAwakenSpeedTiers(),
)
const awakenWorkstationXpTiers = useLocalStorage<Record<string, number>>(
  'config-awaken-workstation-xp',
  defaultAwakenWorkstationXpTiers(),
)
const expeditionCompletions = useLocalStorage<Record<string, Record<number, number>>>(
  'config-expedition-completions',
  {},
)
const toolLevels = useLocalStorage<Record<string, number>>('config-tool-levels', {})
const toolSpeedModes = useLocalStorage<Record<string, boolean>>('config-tool-speed-modes', {})
const machineLevels = useLocalStorage<Record<string, number>>('config-machine-levels', {})
const machineRecipes = useLocalStorage<Record<string, string | null>>('config-machine-recipes', {})
const fabricationAllocations = useLocalStorage<Record<string, number>>(
  'config-fabrication-allocations',
  {},
)
const queuedAmounts = useLocalStorage<Record<string, Record<string, number>>>(
  'config-queued-recipes',
  {},
)
/** Estimated total queue time in seconds per workstation (e.g. { Furnace: 50650 }) */
const queuedTimes = useLocalStorage<Record<string, number>>('config-queued-times', {})
const awakenGoldLevel = useLocalStorage<number>('config-awaken-gold-level', 0)
const skillLevels = useLocalStorage<Record<string, number>>('config-skill-levels', {})

// Dungeon state lives across multiple localStorage keys read by useDungeons.
// Writes go through this helper so the `storage` event fires in the same
// tab — useLocalStorage refs in useDungeons listen for it and stay in sync.
function writeDungeonKey(key: string, value: string | null) {
  const oldValue = localStorage.getItem(key)
  if (value === null) localStorage.removeItem(key)
  else localStorage.setItem(key, value)
  window.dispatchEvent(
    new StorageEvent('storage', { key, oldValue, newValue: value, storageArea: localStorage }),
  )
}

export function useGameConfig() {
  const playerLevel = computed(() => getPlayerLevel(skillLevels.value))
  const expeditionCreatureIds = computed(() => {
    const set = new Set<string>()
    for (const ids of Object.values(expeditionParties.value)) {
      for (const id of ids) set.add(id)
    }
    return set
  })

  const excludedCreatureIds = computed(() => {
    const set = new Set<string>()
    for (const id of sanctuaryCreatureIds.value) set.add(id)
    for (const id of helperCreatureIds.value) set.add(id)
    for (const id of machineCreatureIds.value) set.add(id)
    for (const id of expeditionCreatureIds.value) set.add(id)
    for (const id of dungeonParty.value) set.add(id)
    return set
  })

  const jobTiers = computed(() => calculateJobTiersFromSanctuary(sanctuaryCreatureIds.value))

  // Awaken upgrade clamp bounds.
  const AWAKEN_GATHER_YIELD_MAX = 2
  const AWAKEN_GATHER_DURATION_MAX = 4
  const AWAKEN_GATHER_XP_MAX = 6
  const AWAKEN_SPEED_MAX = 4
  const AWAKEN_WORKSTATION_XP_MAX = 5
  const AWAKEN_GOLD_MAX = 5

  /** Clamp a value to [0, max]. */
  function clamp(value: number, max: number): number {
    return Math.max(0, Math.min(max, value))
  }

  /** Zero-value default for a single AwakenGatherUpgrade entry. */
  function defaultAwakenGatherUpgrade(): AwakenGatherUpgrade {
    return { yieldBonus: 0, durationTier: 0, xpTier: 0 }
  }

  function setSanctuaryCreatures(ids: string[]) {
    sanctuaryCreatureIds.value = ids
  }

  function setHelperCreatures(ids: string[]) {
    helperCreatureIds.value = ids
  }

  function setMachineCreatures(ids: string[]) {
    machineCreatureIds.value = ids
  }

  function setExpeditionToolXpBonus(bonus: number) {
    expeditionToolXpBonus.value = bonus
  }

  function setInventory(itemId: string, amount: number) {
    if (amount <= 0) {
      const { [itemId]: _, ...rest } = inventoryAmounts.value
      inventoryAmounts.value = rest
    } else {
      inventoryAmounts.value = { ...inventoryAmounts.value, [itemId]: amount }
    }
  }

  function resetInventory() {
    inventoryAmounts.value = {}
  }

  function setCollectedItems(ids: string[]) {
    collectedItems.value = ids
  }

  function resetCollectedItems() {
    collectedItems.value = []
  }

  function setGardenFlowerEntries(flowerId: string, entries: GardenFlowerEntry[]) {
    const others = gardenLayout.value.filter((c) => c?.flowerId !== flowerId)
    const additions: GardenCell[] = []
    for (const e of entries) {
      if (e.count <= 0) continue
      for (let i = 0; i < e.count; i++) additions.push({ flowerId, level: e.level })
    }
    const next = [...others.filter((c): c is GardenCell => c != null), ...additions]
    next.sort((a, b) => b.level - a.level)
    const layout: (GardenCell | null)[] = Array(GARDEN_GRID_SIZE).fill(null)
    for (let i = 0; i < Math.min(next.length, GARDEN_GRID_SIZE); i++) layout[i] = next[i]
    gardenLayout.value = layout
  }

  function setGardenCell(index: number, cell: GardenCell | null) {
    if (index < 0 || index >= GARDEN_GRID_SIZE) return
    const next = [...gardenLayout.value]
    next[index] = cell
    gardenLayout.value = next
  }

  function setGardenLayout(layout: (GardenCell | null)[]) {
    const next: (GardenCell | null)[] = Array(GARDEN_GRID_SIZE).fill(null)
    for (let i = 0; i < Math.min(layout.length, GARDEN_GRID_SIZE); i++) {
      next[i] = layout[i] ?? null
    }
    gardenLayout.value = next
  }

  function setGardenSaveSnapshot(layout: (GardenCell | null)[]) {
    const snapshot: (GardenCell | null)[] = Array(GARDEN_GRID_SIZE).fill(null)
    for (let i = 0; i < Math.min(layout.length, GARDEN_GRID_SIZE); i++) {
      snapshot[i] = layout[i] ? { ...(layout[i] as GardenCell) } : null
    }
    gardenLayoutFromSave.value = snapshot
  }

  const hasGardenSaveSnapshot = computed(() => gardenLayoutFromSave.value !== null)

  // Compare current garden layout to the imported save snapshot (if any). If
  // no snapshot exists, "changes" means anything other than the empty default.
  const hasGardenChanges = computed(() => {
    if (hasGardenSaveSnapshot.value) {
      const snapLayout = gardenLayoutFromSave.value ?? []
      for (let i = 0; i < GARDEN_GRID_SIZE; i++) {
        const cur = gardenLayout.value[i] ?? null
        const snap = snapLayout[i] ?? null
        if (cur === null && snap === null) continue
        if (cur === null || snap === null) return true
        if (cur.flowerId !== snap.flowerId || cur.level !== snap.level) return true
      }
      return false
    }
    return gardenLayout.value.some((c) => c !== null)
  })

  function revertGardenToSaveSnapshot() {
    if (!hasGardenSaveSnapshot.value) return
    setGardenLayout(gardenLayoutFromSave.value as (GardenCell | null)[])
  }

  function resetGarden() {
    gardenLayout.value = Array(GARDEN_GRID_SIZE).fill(null)
    gardenFlowers.value = defaultGardenFlowers()
    gardenLayoutFromSave.value = null
  }

  function setAwakenGatherYieldBonus(jobId: string, yieldBonus: number) {
    const current = awakenGatherUpgrades.value[jobId] ?? defaultAwakenGatherUpgrade()
    awakenGatherUpgrades.value = {
      ...awakenGatherUpgrades.value,
      [jobId]: { ...current, yieldBonus: clamp(yieldBonus, AWAKEN_GATHER_YIELD_MAX) },
    }
  }

  function setAwakenGatherDurationTier(jobId: string, tier: number) {
    const current = awakenGatherUpgrades.value[jobId] ?? defaultAwakenGatherUpgrade()
    awakenGatherUpgrades.value = {
      ...awakenGatherUpgrades.value,
      [jobId]: { ...current, durationTier: clamp(tier, AWAKEN_GATHER_DURATION_MAX) },
    }
  }

  function setAwakenGatherXpTier(jobId: string, tier: number) {
    const current = awakenGatherUpgrades.value[jobId] ?? defaultAwakenGatherUpgrade()
    awakenGatherUpgrades.value = {
      ...awakenGatherUpgrades.value,
      [jobId]: { ...current, xpTier: clamp(tier, AWAKEN_GATHER_XP_MAX) },
    }
  }

  function setAwakenSpeedTier(workstation: string, tier: number) {
    awakenSpeedTiers.value = {
      ...awakenSpeedTiers.value,
      [workstation]: clamp(tier, AWAKEN_SPEED_MAX),
    }
  }

  function setAwakenWorkstationXpTier(workstation: string, tier: number) {
    awakenWorkstationXpTiers.value = {
      ...awakenWorkstationXpTiers.value,
      [workstation]: clamp(tier, AWAKEN_WORKSTATION_XP_MAX),
    }
  }

  function resetAwaken() {
    awakenGatherUpgrades.value = defaultAwakenGatherUpgrades()
    awakenSpeedTiers.value = defaultAwakenSpeedTiers()
    awakenWorkstationXpTiers.value = defaultAwakenWorkstationXpTiers()
  }

  function setExpeditionCompletions(completions: Record<string, Record<number, number>>) {
    expeditionCompletions.value = completions
  }

  function setToolLevels(levels: Record<string, number>) {
    toolLevels.value = levels
  }

  function resetToolLevels() {
    toolLevels.value = {}
    toolSpeedModes.value = {}
  }

  function setToolSpeedModes(modes: Record<string, boolean>) {
    toolSpeedModes.value = modes
  }

  function setMachineLevels(levels: Record<string, number>) {
    machineLevels.value = levels
  }

  function setMachineRecipes(recipes: Record<string, string | null>) {
    machineRecipes.value = recipes
  }

  function resetMachines() {
    machineLevels.value = {}
    machineRecipes.value = {}
  }

  function setFabricationAllocations(allocations: Record<string, number>) {
    fabricationAllocations.value = allocations
  }

  function resetFabrication() {
    fabricationAllocations.value = {}
  }

  function setAwakenGoldLevel(level: number) {
    awakenGoldLevel.value = clamp(level, AWAKEN_GOLD_MAX)
  }

  function setSkillLevels(levels: Record<string, number>) {
    skillLevels.value = levels
  }

  function resetSkillLevels() {
    skillLevels.value = {}
  }

  function setQueuedAmounts(amounts: Record<string, Record<string, number>>) {
    queuedAmounts.value = amounts
  }

  function setQueuedTimes(times: Record<string, number>) {
    queuedTimes.value = times
  }

  function resetQueuedAmounts() {
    queuedAmounts.value = {}
    queuedTimes.value = {}
  }

  function setExpeditionParties(parties: Record<string, string[]>) {
    expeditionParties.value = parties
  }

  function setExpeditionTiers(tiers: Record<string, number>) {
    expeditionTiers.value = tiers
  }

  function setExpeditionCreatureLevels(levels: Record<string, number>) {
    expeditionCreatureLevels.value = levels
  }

  function setExpeditionLoopCounts(counts: Record<string, number>) {
    expeditionLoopCounts.value = counts
  }

  function resetExpeditionSetup() {
    expeditionParties.value = {}
    expeditionTiers.value = {}
    expeditionCreatureLevels.value = {}
    expeditionLoopCounts.value = {}
  }

  function setDungeonParty(party: string[]) {
    dungeonParty.value = party
  }

  function resetDungeonParty() {
    dungeonParty.value = []
  }

  function resetGameConfig() {
    sanctuaryCreatureIds.value = []
    helperCreatureIds.value = []
    machineCreatureIds.value = []
    expeditionToolXpBonus.value = 1
    resetInventory()
    resetCollectedItems()
    resetGarden()
    resetAwaken()
    awakenGoldLevel.value = 0
    expeditionCompletions.value = {}
    resetExpeditionSetup()
    resetToolLevels()
    resetMachines()
    resetFabrication()
    resetQueuedAmounts()
    resetSkillLevels()
    resetDungeonParty()
  }

  function applyDungeonStateFromSave(d: {
    party: string[]
    levels: Record<string, number>
    tier: number
    focus: string
    gatheringSkill?: string | null
  }) {
    setDungeonParty(d.party)
    writeDungeonKey('dungeon-creature-levels', JSON.stringify(d.levels))
    writeDungeonKey('dungeon-tier', String(d.tier))
    writeDungeonKey('dungeon-focus', d.focus)
    if (d.gatheringSkill) {
      writeDungeonKey('dungeon-sub-focus', d.gatheringSkill)
    }
  }

  function resetDungeonStorage() {
    writeDungeonKey('dungeon-creature-levels', null)
  }

  // Apply the config-owned portion of an imported save. Preserves the exact
  // order and effect of the original ConfigsView.applyAll setter sequence.
  // View-local concerns (creature collection, summon planner, applied-section
  // tracking) stay in the view and are not touched here.
  function applySaveConfig(save: SaveConfig) {
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
    awakenWorkstationXpTiers.value = { ...save.awakenWorkstationXpTiers }
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
  }

  // Reset the config-owned portion of state. Preserves the exact order and
  // effect of the original ConfigsView.resetAll config resets. View-local
  // concerns (creature collection, garden, summon planner, saveConfig and
  // metadata, applied-section tracking) stay in the view.
  function resetAllConfig() {
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
    resetDungeonParty()
    resetDungeonStorage()
  }

  return {
    sanctuaryCreatureIds: sanctuaryCreatureIds,
    helperCreatureIds: helperCreatureIds,
    machineCreatureIds: machineCreatureIds,
    expeditionParties: expeditionParties,
    expeditionTiers: expeditionTiers,
    expeditionCreatureLevels: expeditionCreatureLevels,
    expeditionLoopCounts: expeditionLoopCounts,
    expeditionCreatureIds,
    excludedCreatureIds,
    jobTiers,
    inventoryAmounts: inventoryAmounts,
    collectedItems: collectedItems,
    setCollectedItems,
    resetCollectedItems,
    gardenFlowers: gardenFlowers,
    gardenLayout: gardenLayout,
    gardenLayoutFromSave: gardenLayoutFromSave,
    awakenGatherUpgrades: awakenGatherUpgrades,
    awakenSpeedTiers: awakenSpeedTiers,
    awakenWorkstationXpTiers: awakenWorkstationXpTiers,
    expeditionCompletions: expeditionCompletions,
    toolLevels: toolLevels,
    toolSpeedModes: toolSpeedModes,
    machineLevels: machineLevels,
    machineRecipes: machineRecipes,
    fabricationAllocations: fabricationAllocations,
    setSanctuaryCreatures,
    setHelperCreatures,
    setMachineCreatures,
    setExpeditionCompletions,
    setExpeditionParties,
    setExpeditionTiers,
    setExpeditionCreatureLevels,
    setExpeditionLoopCounts,
    resetExpeditionSetup,
    dungeonParty: dungeonParty,
    setDungeonParty,
    resetDungeonParty,
    applyDungeonStateFromSave,
    resetDungeonStorage,
    applySaveConfig,
    resetAllConfig,
    setInventory,
    resetInventory,
    setGardenFlowerEntries,
    setGardenCell,
    setGardenLayout,
    setGardenSaveSnapshot,
    hasGardenSaveSnapshot,
    hasGardenChanges,
    revertGardenToSaveSnapshot,
    resetGarden,
    setAwakenGatherYieldBonus,
    setAwakenGatherDurationTier,
    setAwakenGatherXpTier,
    setAwakenSpeedTier,
    setAwakenWorkstationXpTier,
    resetAwaken,
    setToolLevels,
    setToolSpeedModes,
    resetToolLevels,
    setMachineLevels,
    setMachineRecipes,
    resetMachines,
    setFabricationAllocations,
    resetFabrication,
    resetGameConfig,
    setExpeditionToolXpBonus,
    expeditionToolXpBonus: expeditionToolXpBonus,
    awakenGoldLevel: awakenGoldLevel,
    setAwakenGoldLevel,
    skillLevels: skillLevels,
    playerLevel,
    setSkillLevels,
    resetSkillLevels,
    queuedAmounts: queuedAmounts,
    queuedTimes: queuedTimes,
    setQueuedAmounts,
    setQueuedTimes,
    resetQueuedAmounts,
  }
}
