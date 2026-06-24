import type { AwakenGatherUpgrade, GardenFlowerEntry } from '@/types'

export function defaultAwakenGatherUpgrades(): Record<string, AwakenGatherUpgrade> {
  return {
    Chopping: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
    Mining: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
    Digging: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
    Exploring: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
    Fishing: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
    Farming: { yieldBonus: 0, durationTier: 0, xpTier: 0 },
  }
}

export function defaultAwakenSpeedTiers(): Record<string, number> {
  return { Furnace: 0, Stove: 0, Workbench: 0 }
}

export function defaultAwakenWorkstationXpTiers(): Record<string, number> {
  return { Furnace: 0, Stove: 0, Workbench: 0 }
}

export function defaultGardenFlowers(): Record<string, GardenFlowerEntry[]> {
  return {
    'fire-flower': [],
    'wind-flower': [],
    'earth-flower': [],
    'water-flower': [],
    'gold-flower': [],
  }
}
