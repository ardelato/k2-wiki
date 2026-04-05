import { computed } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useGameConfig } from '@/composables/useGameConfig'
import { computeGoldPerMinute } from '@/utils/goldIncome'

export interface GoldIncomeBreakdown {
  awakenedCount: number
  awakenGoldLevel: number
  creatureGoldPerMin: number
  flowerGoldPerMin: number
  totalGoldPerMin: number
}

export function useGoldIncome() {
  const { ownedCreatureIds, isAwakened } = useCreatureCollection()
  const { awakenGoldLevel, gardenFlowers } = useGameConfig()

  const awakenedCount = computed(() => {
    let count = 0
    for (const id of ownedCreatureIds.value) {
      if (isAwakened(id)) count++
    }
    return count
  })

  const goldFlowerEntries = computed(() => gardenFlowers.value['gold-flower'] ?? [])

  const goldPerMinute = computed(() =>
    computeGoldPerMinute(awakenedCount.value, awakenGoldLevel.value, goldFlowerEntries.value),
  )

  const breakdown = computed<GoldIncomeBreakdown>(() => {
    const flowerGold = goldFlowerEntries.value.reduce((sum, e) => sum + e.level * e.count, 0)
    const creatureGold = goldPerMinute.value - flowerGold
    return {
      awakenedCount: awakenedCount.value,
      awakenGoldLevel: awakenGoldLevel.value,
      creatureGoldPerMin: creatureGold,
      flowerGoldPerMin: flowerGold,
      totalGoldPerMin: goldPerMinute.value,
    }
  })

  return {
    goldPerMinute,
    awakenedCount,
    breakdown,
  }
}
