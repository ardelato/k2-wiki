import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'
import { calculateJobTiersFromSanctuary } from '@/utils/parseSave'

const sanctuaryCreatureIds = useLocalStorage<string[]>('config-sanctuary-creatures', [])
const helperCreatureIds = useLocalStorage<string[]>('config-helper-creatures', [])
const machineCreatureIds = useLocalStorage<string[]>('config-machine-creature-ids', [])

const inventoryAmounts = useLocalStorage<Record<string, number>>('config-inventory', {})
const gardenFlowers = useLocalStorage<Record<string, GardenFlowerEntry[]>>(
  'config-garden-flowers',
  {
    'fire-flower': [],
    'wind-flower': [],
    'earth-flower': [],
    'water-flower': [],
  },
)
const awakenGatherUpgrades = useLocalStorage<Record<string, AwakenGatherUpgrade>>(
  'config-awaken-gather',
  {
    Chopping: { yieldBonus: 0, durationTier: 0 },
    Mining: { yieldBonus: 0, durationTier: 0 },
    Digging: { yieldBonus: 0, durationTier: 0 },
    Exploring: { yieldBonus: 0, durationTier: 0 },
    Fishing: { yieldBonus: 0, durationTier: 0 },
    Farming: { yieldBonus: 0, durationTier: 0 },
  },
)
const awakenSpeedTiers = useLocalStorage<Record<string, number>>('config-awaken-speed', {
  Furnace: 0,
  Stove: 0,
  Workbench: 0,
})

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
    gardenFlowers.value = {
      'fire-flower': [],
      'wind-flower': [],
      'earth-flower': [],
      'water-flower': [],
    }
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

  function resetGameConfig() {
    sanctuaryCreatureIds.value = []
    helperCreatureIds.value = []
    machineCreatureIds.value = []
    resetInventory()
    resetGarden()
    resetAwaken()
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
    setSanctuaryCreatures,
    setHelperCreatures,
    setMachineCreatures,
    setInventory,
    resetInventory,
    setGardenFlowerEntries,
    resetGarden,
    setAwakenGatherYieldBonus,
    setAwakenGatherDurationTier,
    setAwakenSpeedTier,
    resetAwaken,
    resetGameConfig,
  }
}
