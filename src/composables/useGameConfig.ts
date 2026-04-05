import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import {
  defaultAwakenGatherUpgrades,
  defaultAwakenSpeedTiers,
  defaultGardenFlowers,
} from '@/data/defaults'
import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'
import { calculateJobTiersFromSanctuary } from '@/utils/parseSave'

const sanctuaryCreatureIds = useLocalStorage<string[]>('config-sanctuary-creatures', [])
const helperCreatureIds = useLocalStorage<string[]>('config-helper-creatures', [])
const machineCreatureIds = useLocalStorage<string[]>('config-machine-creature-ids', [])
const expeditionToolXpBonus = useLocalStorage<number>('config-tool-xp-bonus', 1)

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
const machineLevels = useLocalStorage<Record<string, number>>('config-machine-levels', {})
const machineRecipes = useLocalStorage<Record<string, string | null>>('config-machine-recipes', {})
const fabricationAllocations = useLocalStorage<Record<string, number>>(
  'config-fabrication-allocations',
  {},
)
const awakenGoldLevel = useLocalStorage<number>('config-awaken-gold-level', 0)

export function useGameConfig() {
  const excludedCreatureIds = computed(() => {
    const set = new Set<string>()
    for (const id of sanctuaryCreatureIds.value) set.add(id)
    for (const id of helperCreatureIds.value) set.add(id)
    for (const id of machineCreatureIds.value) set.add(id)
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

  function resetGameConfig() {
    sanctuaryCreatureIds.value = []
    helperCreatureIds.value = []
    machineCreatureIds.value = []
    expeditionToolXpBonus.value = 1
    resetInventory()
    resetGarden()
    resetAwaken()
    expeditionCompletions.value = {}
    resetToolLevels()
    resetMachines()
    resetFabrication()
    awakenGoldLevel.value = 0
  }

  return {
    sanctuaryCreatureIds,
    helperCreatureIds,
    machineCreatureIds,
    excludedCreatureIds,
    jobTiers,
    inventoryAmounts,
    gardenFlowers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    expeditionCompletions,
    toolLevels,
    machineLevels,
    machineRecipes,
    fabricationAllocations,
    setSanctuaryCreatures,
    setHelperCreatures,
    setMachineCreatures,
    setExpeditionCompletions,
    setInventory,
    resetInventory,
    setGardenFlowerEntries,
    resetGarden,
    setAwakenGatherYieldBonus,
    setAwakenGatherDurationTier,
    setAwakenSpeedTier,
    resetAwaken,
    setToolLevels,
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
  }
}
