import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import type { Creature, Expedition, Biome, CreatureStats, ExpeditionStatKey } from '@/types'

// Consolidated stat labels & abbreviations (creature and expedition stats share the same keys)
export const statLabels: Record<keyof CreatureStats, string> = {
  power: 'Power',
  grit: 'Grit',
  agility: 'Agility',
  smarts: 'Smarts',
  looting: 'Looting',
  luck: 'Luck',
}

export const statAbbreviations: Record<keyof CreatureStats, string> = {
  power: 'POW',
  grit: 'GRT',
  agility: 'AGI',
  smarts: 'SMT',
  looting: 'LOT',
  luck: 'LCK',
}

export const jobLabels: Record<keyof Creature['jobs'], string> = {
  chopping: 'Chopping',
  mining: 'Mining',
  digging: 'Digging',
  exploring: 'Exploring',
  fishing: 'Fishing',
  farming: 'Farming',
}

export const jobColors: Record<keyof Creature['jobs'], string> = {
  chopping: 'var(--color-job-chopping)',
  mining: 'var(--color-job-mining)',
  digging: 'var(--color-job-digging)',
  exploring: 'var(--color-job-exploring)',
  fishing: 'var(--color-job-fishing)',
  farming: 'var(--color-job-farming)',
}

export const tierModifiers = {
  difficulty: [1, 1.5, 2, 2.5, 3],
  duration: [1, 1, 1, 1, 1],
  xp: [1.0, 1.2, 1.4, 1.6, 1.8],
  loot: [1, 2, 3, 4, 5],
}

export function biomeMultiplier(creature: Creature, biome: Biome): number {
  let hasAdvantage = false
  let hasDisadvantage = false
  for (const type of creature.types) {
    if (biome.advantage.includes(type)) hasAdvantage = true
    if (biome.disadvantage.includes(type)) hasDisadvantage = true
  }
  if (hasAdvantage) return 1.5
  if (hasDisadvantage) return 0.5
  return 1.0
}

export function calculateCreatureRating(
  creature: Creature,
  expedition: Expedition,
  level: number = 1,
  biome?: Biome,
): number {
  let weightedStatSum = 0
  for (const [stat, weight] of Object.entries(expedition.statWeights) as [
    ExpeditionStatKey,
    number,
  ][]) {
    if (weight > 0) {
      weightedStatSum += creature.stats[stat] * weight
    }
  }

  const rawScore = weightedStatSum * level
  const biomeScore = biome ? rawScore * biomeMultiplier(creature, biome) : rawScore
  const traitBonus = creature.trait === expedition.trait ? 1.5 : 1.0

  return Math.floor(biomeScore * traitBonus)
}

export function calculateDifficultyRating(expedition: Expedition, tier: number): number {
  return Math.floor(expedition.baseRating * tierModifiers.difficulty[tier - 1])
}

export function calculatePartyScore(
  creatures: (Creature | null)[],
  expedition: Expedition,
  levels: Record<string, number>,
  biome?: Biome,
): number {
  let total = 0
  for (const creature of creatures) {
    if (creature) {
      const level = levels[creature.id] || 1
      total += calculateCreatureRating(creature, expedition, level, biome)
    }
  }
  return total
}

export function calculateDuration(
  partyScore: number,
  expedition: Expedition,
  tier: number,
): number {
  const minSeconds = 300
  const maxSeconds = 3600
  const difficultyRating = calculateDifficultyRating(expedition, tier)

  if (partyScore <= 0) return maxSeconds

  // Linear interpolation: 100% score = min duration (5 min), 0% score = max duration (2 hr)
  const ratio = difficultyRating > 0 ? Math.min(partyScore / difficultyRating, 1) : 0
  const duration = maxSeconds - ratio * (maxSeconds - minSeconds)

  return Math.floor(Math.max(minSeconds, Math.min(duration, maxSeconds)))
}

export function estimateCompletionTime(
  partyScore: number,
  expedition: Expedition,
  tier: number = 1,
): number {
  const durationSeconds = calculateDuration(partyScore, expedition, tier)
  return Math.round(durationSeconds / 60)
}

export function calculateExpeditionXp(
  expedition: Expedition,
  tier: number = 1,
  loopCount: number = 0,
  partySize: number = 1,
): number {
  const baseXP = expedition.baseXP
  const xpMod = tierModifiers.xp[tier - 1]
  const loopBonus = 1 + getLoopXpBonus(loopCount)
  return Math.floor((baseXP * xpMod * loopBonus) / Math.max(1, partySize))
}

export function getLoopXpBonus(loopCount: number): number {
  const rate = 0.01
  const loopsPerBonus = 10
  const maxBonus = 0.2
  return Math.min(Math.floor(loopCount / loopsPerBonus) * rate, maxBonus)
}

export function getLootAmount(baseAmount: number, tier: number): number {
  return baseAmount * tierModifiers.loot[tier - 1]
}

export const PRE_AWAKEN_MAX = 70
export const POST_AWAKEN_MAX = 120

export function maxLevelForState(awakened: boolean): number {
  return awakened ? POST_AWAKEN_MAX : PRE_AWAKEN_MAX
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return 50 * level * level
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  let level = Math.floor(Math.sqrt(xp / 50))
  // Verify the level is correct
  while (level > 1 && xp < xpForLevel(level)) {
    level -= 1
  }
  return Math.max(1, level)
}

export interface BestExpeditionEntry {
  expedition: Expedition
  score: number
  biomeName: string
  traitMatch: boolean
  biomeStatus: 'advantage' | 'disadvantage' | 'neutral'
  statAlignment: number
}

export function getBestExpeditionsForCreature(
  creature: Creature,
  limit: number = 5,
): BestExpeditionEntry[] {
  const expeditions = expeditionsData as Expedition[]
  const biomes = biomesData as Biome[]
  const biomeMap = new Map(biomes.map((b) => [b.id, b]))

  // Normalize creature stats to proportions (sum to 1)
  const statKeys: (keyof CreatureStats)[] = [
    'power',
    'grit',
    'agility',
    'smarts',
    'looting',
    'luck',
  ]
  const statTotal = statKeys.reduce((sum, k) => sum + creature.stats[k], 0)
  const creatureProportions = statKeys.map((k) =>
    statTotal > 0 ? creature.stats[k] / statTotal : 0,
  )

  return expeditions
    .map((expedition) => {
      const biome = biomeMap.get(expedition.biome)
      const traitMatch = creature.trait === expedition.trait

      // Stat alignment: dot product of creature stat proportions and expedition weights
      const weights = statKeys.map((k) => expedition.statWeights[k])
      const weightTotal = weights.reduce((sum, w) => sum + w, 0)
      const normalizedWeights = weights.map((w) => (weightTotal > 0 ? w / weightTotal : 0))
      const statAlignment = creatureProportions.reduce(
        (sum, p, i) => sum + p * normalizedWeights[i],
        0,
      )

      // Biome status
      let biomeStatus: 'advantage' | 'disadvantage' | 'neutral' = 'neutral'
      let biomeScore = 1.0
      if (biome) {
        const mult = biomeMultiplier(creature, biome)
        biomeScore = mult
        if (mult > 1) biomeStatus = 'advantage'
        else if (mult < 1) biomeStatus = 'disadvantage'
      }

      // Combined score: stat alignment * biome * trait
      const score = statAlignment * biomeScore * (traitMatch ? 1.5 : 1.0)

      return {
        expedition,
        score: Math.round(score * 100),
        biomeName: biome?.name ?? expedition.biome,
        traitMatch,
        biomeStatus,
        statAlignment: Math.round(statAlignment * 100),
      }
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getRecommendedCreatures(
  creatures: Creature[],
  expedition: Expedition,
  levels: Record<string, number> = {},
  biome?: Biome,
): { creature: Creature; rating: number; level: number }[] {
  return creatures
    .map((creature) => {
      const level = levels[creature.id] || 1
      return {
        creature,
        rating: calculateCreatureRating(creature, expedition, level, biome),
        level,
      }
    })
    .toSorted((a, b) => b.rating - a.rating)
}
