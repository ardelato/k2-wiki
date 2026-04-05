import biomesData from '@/data/biomes.json'
import { expeditionSourceIndex } from '@/data/indexes'
import type { Creature, Expedition, Biome } from '@/types'
import {
  calculateDuration,
  calculatePartyScore,
  getRecommendedCreatures,
  getLootAmount,
} from '@/utils/formulas'

const biomes = biomesData as Biome[]
const biomeMap = new Map(biomes.map((b) => [b.id, b]))

export interface ExpeditionPlan {
  expedition: Expedition
  tier: number
  party: { creature: Creature; rating: number; level: number }[]
  lootPerRun: number
  durationPerRun: number
  runsNeeded: number
  totalTime: number
  partyScore: number
}

export interface ExpeditionPlanResult {
  best: ExpeditionPlan | null
  all: { expedition: Expedition; plan: ExpeditionPlan }[]
}

/**
 * Find the best expedition + tier + party to farm a specific item,
 * plus plans for all available expedition sources.
 * "Best" = least total time to gather `targetAmount` of `itemId`.
 */
export function findExpeditionPlans(
  itemId: string,
  targetAmount: number,
  ownedCreatures: Creature[],
  levels: Record<string, number>,
  expeditions: Expedition[],
): ExpeditionPlanResult {
  const sources = expeditionSourceIndex.get(itemId)
  if (!sources || sources.length === 0) return { best: null, all: [] }

  const expeditionMap = new Map(expeditions.map((e) => [e.id, e]))
  let bestPlan: ExpeditionPlan | null = null
  const allPlans: { expedition: Expedition; plan: ExpeditionPlan }[] = []

  for (const source of sources) {
    const expedition = expeditionMap.get(source.expeditionId)
    if (!expedition) continue

    const biome = biomeMap.get(expedition.biome)
    const recommended = getRecommendedCreatures(ownedCreatures, expedition, levels, biome)

    let bestForExpedition: ExpeditionPlan | null = null

    // Try each tier 1-5, keep the best tier per expedition
    for (let tier = 1; tier <= 5; tier++) {
      const partySize = Math.min(expedition.maxPartySize, recommended.length)
      if (partySize === 0) continue

      const party = recommended.slice(0, partySize)
      const partyCreatures = party.map((p) => p.creature)
      const partyScore = calculatePartyScore(partyCreatures, expedition, levels, biome)
      const duration = calculateDuration(partyScore, expedition, tier)
      const lootPerRun = getLootAmount(source.amount, tier)
      const runsNeeded = Math.ceil(targetAmount / lootPerRun)
      const totalTime = runsNeeded * duration

      const plan: ExpeditionPlan = {
        expedition,
        tier,
        party,
        lootPerRun,
        durationPerRun: duration,
        runsNeeded,
        totalTime,
        partyScore,
      }

      if (!bestForExpedition || totalTime < bestForExpedition.totalTime) {
        bestForExpedition = plan
      }

      if (!bestPlan || totalTime < bestPlan.totalTime) {
        bestPlan = plan
      }
    }

    if (bestForExpedition) {
      allPlans.push({ expedition, plan: bestForExpedition })
    }
  }

  // Sort by total time ascending
  allPlans.sort((a, b) => a.plan.totalTime - b.plan.totalTime)

  return { best: bestPlan, all: allPlans }
}
