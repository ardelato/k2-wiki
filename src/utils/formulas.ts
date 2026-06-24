import { biomeMap, expeditions } from '@/data/entityMaps'
import { i18nRecord } from '@/i18n'
import type {
  Creature,
  Expedition,
  Biome,
  CreatureStats,
  ExpeditionStatKey,
  ExpeditionStatWeights,
  DungeonGrade,
  DungeonReward,
} from '@/types'

const STAT_KEYS: readonly (keyof CreatureStats)[] = [
  'power',
  'grit',
  'agility',
  'smarts',
  'looting',
  'luck',
]

const TRAIT_KEYS = [
  'cold-resistance',
  'heat-resistance',
  'poison-resistance',
  'water-breathing',
  'hard-shell',
  'night-vision',
  'camouflage',
  'gatherer',
  'learner',
  'lucky',
  'regeneration',
  'scouting',
  'tracking',
] as const

const JOB_KEYS: readonly (keyof Creature['jobs'])[] = [
  'chopping',
  'mining',
  'digging',
  'exploring',
  'fishing',
  'farming',
]

export const statLabels: Record<keyof CreatureStats, string> = i18nRecord(STAT_KEYS, 'stats')

export const statAbbreviations: Record<keyof CreatureStats, string> = i18nRecord(
  STAT_KEYS,
  'stats',
  (key) => `${key}Abbr`,
)

export const traitAbbreviations: Record<string, string> = i18nRecord(TRAIT_KEYS, 'traits')

export const jobLabels: Record<keyof Creature['jobs'], string> = i18nRecord(JOB_KEYS, 'jobs')

export const jobColors: Record<keyof Creature['jobs'], string> = {
  chopping: 'var(--color-job-chopping)',
  mining: 'var(--color-job-mining)',
  digging: 'var(--color-job-digging)',
  exploring: 'var(--color-job-exploring)',
  fishing: 'var(--color-job-fishing)',
  farming: 'var(--color-job-farming)',
}

/** Cumulative duration reduction fraction per sanctuary job tier (index = tier 0–5). */
export const JOB_TIER_DURATION_REDUCTION: readonly number[] = [0, 0, 0.1, 0.1, 0.2, 0.2]

/** Cumulative yield bonus per sanctuary job tier (index = tier 0–5). */
export const JOB_TIER_YIELD_BONUS: readonly number[] = [0, 0, 0, 0, 0, 1]

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
const POST_AWAKEN_MAX = 120

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

interface BestExpeditionEntry {
  expedition: Expedition
  score: number
  biomeName: string
  traitMatch: boolean
  biomeStatus: 'advantage' | 'disadvantage' | 'neutral'
  statAlignment: number
  /** Recommended run-tier (1–5): the tier that maximizes XP/sec for this creature at `level`. */
  tier: number
}

/**
 * The run-tier (1–5) a creature should farm an expedition at: the one maximizing XP/sec.
 * Higher tiers grant more XP but raise the difficulty rating (longer duration), so the best
 * tier is the highest the creature's rating can still clear quickly. Mirrors the best-rate
 * loop in scripts/generate-tables.ts (which builds the precomputed tables) and the leveling
 * scorer below.
 */
function bestTierByRate(
  creature: Creature,
  expedition: Expedition,
  level: number,
  biome: Biome | undefined,
): number {
  const rating = calculateCreatureRating(creature, expedition, level, biome)
  let bestTier = 1
  let bestXpPerSec = -1
  for (let tier = 1; tier <= 5; tier++) {
    const duration = calculateDuration(rating, expedition, tier)
    const xpPerRun = calculateExpeditionXp(expedition, tier, 0, 1)
    if (duration > 0 && xpPerRun > 0) {
      const xpPerSec = xpPerRun / duration
      if (xpPerSec > bestXpPerSec) {
        bestXpPerSec = xpPerSec
        bestTier = tier
      }
    }
  }
  return bestTier
}

/**
 * Stat alignment (0–1): dot product of the creature's stat proportions (its stats
 * normalized to sum to 1) with the expedition's normalized stat weights. Used for the
 * display/ranking score in both best-expedition rankings below.
 */
function statAlignmentScore(creature: Creature, expedition: Expedition): number {
  const statTotal = STAT_KEYS.reduce((sum, k) => sum + creature.stats[k], 0)
  const weightTotal = STAT_KEYS.reduce((sum, k) => sum + expedition.statWeights[k], 0)
  if (statTotal <= 0 || weightTotal <= 0) return 0
  return STAT_KEYS.reduce(
    (sum, k) => sum + (creature.stats[k] / statTotal) * (expedition.statWeights[k] / weightTotal),
    0,
  )
}

/**
 * Shared scaffolding for best-expedition rankings. Handles biome-status, stat-alignment,
 * and map/sort/slice; callers supply only the per-expedition numeric score.
 */
function rankExpeditions(
  creature: Creature,
  level: number,
  limit: number,
  scoreFn: (
    expedition: Expedition,
    biome: Biome | undefined,
    statAlignment: number,
    traitMatch: boolean,
  ) => number,
): BestExpeditionEntry[] {
  return expeditions
    .map((expedition) => {
      const biome = biomeMap.get(expedition.biome)
      const traitMatch = creature.trait === expedition.trait
      const statAlignment = statAlignmentScore(creature, expedition)

      // Biome status
      let biomeStatus: 'advantage' | 'disadvantage' | 'neutral' = 'neutral'
      if (biome) {
        const mult = biomeMultiplier(creature, biome)
        if (mult > 1) biomeStatus = 'advantage'
        else if (mult < 1) biomeStatus = 'disadvantage'
      }

      return {
        expedition,
        score: scoreFn(expedition, biome, statAlignment, traitMatch),
        biomeName: biome?.name ?? expedition.biome,
        traitMatch,
        biomeStatus,
        statAlignment: Math.round(statAlignment * 100),
        tier: bestTierByRate(creature, expedition, level, biome),
      }
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getBestExpeditionsForCreature(
  creature: Creature,
  limit: number = 5,
  level: number = 1,
): BestExpeditionEntry[] {
  return rankExpeditions(
    creature,
    level,
    limit,
    (_expedition, biome, statAlignment, traitMatch) => {
      const biomeScore = biome ? biomeMultiplier(creature, biome) : 1.0
      // Combined score: stat alignment * biome * trait
      const score = statAlignment * biomeScore * (traitMatch ? 1.5 : 1.0)
      return Math.round(score * 100)
    },
  )
}

export function getBestExpeditionsForLeveling(
  creature: Creature,
  level: number,
  limit: number = 5,
): BestExpeditionEntry[] {
  return rankExpeditions(creature, level, limit, (expedition, biome) => {
    // Score by best XP/sec across all tiers
    let bestXpPerSec = 0
    for (let tier = 1; tier <= 5; tier++) {
      const rating = calculateCreatureRating(creature, expedition, level, biome)
      const duration = calculateDuration(rating, expedition, tier)
      const xpPerRun = calculateExpeditionXp(expedition, tier, 0, 1)
      if (duration > 0 && xpPerRun > 0) {
        const xpPerSec = xpPerRun / duration
        if (xpPerSec > bestXpPerSec) bestXpPerSec = xpPerSec
      }
    }
    return Math.round(bestXpPerSec * 1000)
  })
}

export function getRecommendedCreatures(
  creatures: Creature[],
  expedition: Expedition,
  levels: Record<string, number> = {},
  biome?: Biome,
  excludeIds?: Set<string>,
): { creature: Creature; rating: number; level: number }[] {
  const pool = excludeIds ? creatures.filter((c) => !excludeIds.has(c.id)) : creatures
  return pool
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

// ── Dungeon formulas ──────────────────────────────────────────────────

export function calculateDungeonCreatureScore(
  creature: Creature,
  statWeights: ExpeditionStatWeights,
  level: number = 1,
): number {
  let weightedStatSum = 0
  for (const [stat, weight] of Object.entries(statWeights) as [ExpeditionStatKey, number][]) {
    if (weight > 0) {
      weightedStatSum += creature.stats[stat] * weight
    }
  }
  return Math.floor(weightedStatSum * level)
}

export function calculateDungeonPartyScore(
  creatures: (Creature | null)[],
  statWeights: ExpeditionStatWeights,
  levels: Record<string, number>,
): number {
  let total = 0
  for (const creature of creatures) {
    if (creature) {
      const level = levels[creature.id] || 1
      total += calculateDungeonCreatureScore(creature, statWeights, level)
    }
  }
  return total
}

export function getDungeonGrade(
  partyScore: number,
  baseRating: number,
  grades: DungeonGrade[],
): DungeonGrade {
  const ratio = baseRating > 0 ? partyScore / baseRating : 0
  for (const grade of grades) {
    if (ratio >= grade.minRatio) {
      return grade
    }
  }
  return grades[grades.length - 1]
}

export function getDungeonScaledRewards(
  baseRewards: DungeonReward[],
  multiplier: number,
): DungeonReward[] {
  return baseRewards.map((reward) => ({
    itemId: reward.itemId,
    amount: Math.max(1, Math.floor(reward.amount * multiplier)),
  }))
}

export function getRecommendedDungeonCreatures(
  creatures: Creature[],
  statWeights: ExpeditionStatWeights,
  levels: Record<string, number> = {},
): { creature: Creature; score: number; level: number }[] {
  return creatures
    .map((creature) => {
      const level = levels[creature.id] || 1
      return {
        creature,
        score: calculateDungeonCreatureScore(creature, statWeights, level),
        level,
      }
    })
    .toSorted((a, b) => b.score - a.score)
}

// ── Skilling / Player Level ───────────────────────────────────────────

// XP thresholds from game source (modules/skilling/helpers.ts)
// Index 0 = XP needed for level 2, index 1 = level 3, etc.
const skillingXpTable = [
  83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584, 1833, 2107, 2411, 2746, 3115, 3523, 3973,
  4470, 5018, 5624, 6291, 7028, 7842, 8740, 9730, 10824, 12031, 13363, 14833, 16456, 18247, 20224,
  22406, 24815, 27473, 30408, 33648, 37224, 41171, 45529, 50339, 55649, 61512, 67983, 75127, 83014,
  91721, 101333, 111945, 123660, 136594, 150872, 166636, 184040, 203254, 224466, 247886, 273742,
  302288, 333804, 368599, 407015, 449428, 496254, 547953, 605032, 668051, 737627, 814445, 899257,
  992895, 1096278, 1210421, 1336443, 1475581, 1629200, 1798808, 1986068, 2192818, 2421087, 2673114,
  2951373, 3258594, 3597792, 3972294, 4385776, 4842295, 5346332, 5902831, 6517253, 7195629, 7944614,
  8771558, 9684577, 10692629, 11805606, 13034431,
]

/** Convert cumulative XP to skill level (1–99). */
export function getSkillLevel(xp: number): number {
  if (xp < 0) return 1
  let level = 1
  while (level <= 99 && xp >= skillingXpTable[level - 1]) {
    level++
  }
  return Math.min(level, 99)
}

/** Minimum cumulative XP required to reach a given skill level (1–99). */
export function xpForSkillLevel(level: number): number {
  if (level <= 1) return 0
  const idx = Math.min(level, 99) - 2
  return skillingXpTable[idx]
}

/** All 9 skill IDs that contribute to player level (6 gathering + 3 workstation). */
export const SKILLING_IDS = [
  'Chopping',
  'Mining',
  'Digging',
  'Exploring',
  'Fishing',
  'Farming',
  'Furnace',
  'Stove',
  'Workbench',
] as const

/**
 * Player level = floor(average of all 9 skill levels), capped at 99.
 * Accepts a map of skill ID → level (1–99). Missing skills default to 1.
 */
export function getPlayerLevel(skillLevels: Record<string, number>): number {
  const totalLevels = SKILLING_IDS.reduce((sum, id) => sum + (skillLevels[id] || 1), 0)
  return Math.min(Math.floor(totalLevels / SKILLING_IDS.length), 99)
}

/** XP bonus percentage granted by player level: playerLevel × 0.25 + 0.25 */
export function getPlayerLevelXpBonus(playerLevel: number): number {
  return playerLevel * 0.25 + 0.25
}
