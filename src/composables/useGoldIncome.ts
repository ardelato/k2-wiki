import { computed } from 'vue'

import { useAwakenSimulation } from '@/composables/useAwakenSimulation'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useGameConfig } from '@/composables/useGameConfig'
import { computeGoldPerMinute } from '@/utils/planner/goldIncome'

interface GoldIncomeBreakdown {
  awakenedCount: number
  awakenGoldLevel: number
  creatureGoldPerMin: number
  flowerGoldPerMin: number
  totalGoldPerMin: number
}

export function useGoldIncome() {
  const { ownedCreatureIds, isAwakened } = useCreatureCollection()
  const { gardenFlowers } = useGameConfig()
  const { effectiveAwakenGoldLevel } = useAwakenSimulation()

  const awakenedCount = computed(() => {
    let count = 0
    for (const id of ownedCreatureIds.value) {
      if (isAwakened(id)) count++
    }
    return count
  })

  const goldFlowerEntries = computed(() => gardenFlowers.value['gold-flower'] ?? [])

  const goldPerMinute = computed(() =>
    computeGoldPerMinute(
      awakenedCount.value,
      effectiveAwakenGoldLevel.value,
      goldFlowerEntries.value,
    ),
  )

  const breakdown = computed<GoldIncomeBreakdown>(() => {
    const flowerGold = goldFlowerEntries.value.reduce((sum, e) => sum + e.level * e.count, 0)
    const creatureGold = goldPerMinute.value - flowerGold
    return {
      awakenedCount: awakenedCount.value,
      awakenGoldLevel: effectiveAwakenGoldLevel.value,
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
