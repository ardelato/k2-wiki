import type { GardenFlowerEntry } from '@/types'

/**
 * Compute the player's passive gold income per minute.
 *
 * Sources:
 * - Awakened creatures: each generates (1 + awakenGoldLevel) gold/min
 * - Gold flowers: each produces `level` gold per garden cycle (60s)
 */
export function computeGoldPerMinute(
  awakenedCount: number,
  awakenGoldLevel: number,
  goldFlowerEntries: GardenFlowerEntry[],
): number {
  const creatureGold = awakenedCount * (1 + awakenGoldLevel)
  const flowerGold = goldFlowerEntries.reduce((sum, e) => sum + e.level * e.count, 0)
  return creatureGold + flowerGold
}

/**
 * Convert a gold cost to equivalent time in seconds,
 * based on the player's passive gold income rate.
 */
export function goldToSeconds(goldAmount: number, goldPerMinute: number): number {
  if (goldPerMinute <= 0) return Number.POSITIVE_INFINITY
  return (goldAmount / goldPerMinute) * 60
}
