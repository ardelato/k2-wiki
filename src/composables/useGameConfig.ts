import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import {
  defaultAwakenGatherUpgrades,
  defaultAwakenSpeedTiers,
  defaultGardenFlowers,
} from '@/data/defaults'
import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'
import { getPlayerLevel } from '@/utils/formulas'
import { calculateJobTiersFromSanctuary } from '@/utils/parseSave'

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

const inventoryAmounts = useLocalStorage<Record<string, number>>('config-inventory', {})
const gardenFlowers = useLocalStorage<Record<string, GardenFlowerEntry[]>>(
  'config-garden-flowers',
  defaultGardenFlowers(),
)
const awakenGatherUpgrades = useLocalStorage<Record<string, AwakenGatherUpgrade>>(
  'config-awaken-gather',
  defaultAwakenGatherUpgrades(),
)
const awakenSpeedTiers = useLocalStorage<Record<string, number>>(
  'config-awaken-speed',
  defaultAwakenSpeedTiers(),
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
    return set
  })

  const jobTiers = computed(() => calculateJobTiersFromSanctuary(sanctuaryCreatureIds.value))

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

  function setGardenFlowerEntries(flowerId: string, entries: GardenFlowerEntry[]) {
    gardenFlowers.value = {
      ...gardenFlowers.value,
      [flowerId]: entries.filter((e) => e.count > 0),
    }
  }

  function resetGarden() {
    gardenFlowers.value = defaultGardenFlowers()
  }

  function setAwakenGatherYieldBonus(jobId: string, yieldBonus: number) {
    const current = awakenGatherUpgrades.value[jobId] ?? { yieldBonus: 0, durationTier: 0 }
    awakenGatherUpgrades.value = {
      ...awakenGatherUpgrades.value,
      [jobId]: { ...current, yieldBonus: Math.max(0, Math.min(2, yieldBonus)) },
    }
  }

  function setAwakenGatherDurationTier(jobId: string, tier: number) {
    const current = awakenGatherUpgrades.value[jobId] ?? { yieldBonus: 0, durationTier: 0 }
    awakenGatherUpgrades.value = {
      ...awakenGatherUpgrades.value,
      [jobId]: { ...current, durationTier: Math.max(0, Math.min(4, tier)) },
    }
  }

  function setAwakenSpeedTier(workstation: string, tier: number) {
    awakenSpeedTiers.value = {
      ...awakenSpeedTiers.value,
      [workstation]: Math.max(0, Math.min(4, tier)),
    }
  }

  function resetAwaken() {
    awakenGatherUpgrades.value = defaultAwakenGatherUpgrades()
    awakenSpeedTiers.value = defaultAwakenSpeedTiers()
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
    awakenGoldLevel.value = Math.max(0, Math.min(5, level))
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

  function resetGameConfig() {
    sanctuaryCreatureIds.value = []
    helperCreatureIds.value = []
    machineCreatureIds.value = []
    expeditionToolXpBonus.value = 1
    resetInventory()
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
  }

  return {
    sanctuaryCreatureIds,
    helperCreatureIds,
    machineCreatureIds,
    expeditionParties,
    expeditionTiers,
    expeditionCreatureLevels,
    expeditionLoopCounts,
    expeditionCreatureIds,
    excludedCreatureIds,
    jobTiers,
    inventoryAmounts,
    gardenFlowers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    expeditionCompletions,
    toolLevels,
    toolSpeedModes,
    machineLevels,
    machineRecipes,
    fabricationAllocations,
    setSanctuaryCreatures,
    setHelperCreatures,
    setMachineCreatures,
    setExpeditionCompletions,
    setExpeditionParties,
    setExpeditionTiers,
    setExpeditionCreatureLevels,
    setExpeditionLoopCounts,
    resetExpeditionSetup,
    setInventory,
    resetInventory,
    setGardenFlowerEntries,
    resetGarden,
    setAwakenGatherYieldBonus,
    setAwakenGatherDurationTier,
    setAwakenSpeedTier,
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
    expeditionToolXpBonus,
    awakenGoldLevel,
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
  }
}
