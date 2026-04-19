import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import creatureRatingsData from '@/data/precomputed/creature-ratings.json'
import levelTransitionsData from '@/data/precomputed/level-transitions.json'
import soloRatesData from '@/data/precomputed/solo-rates.json'
import topExpeditionsData from '@/data/precomputed/top-expeditions.json'
import type { Biome, Expedition } from '@/types'

export const expeditions = expeditionsData as Expedition[]
const biomes = biomesData as Biome[]

export const expeditionMap = new Map(expeditions.map((e) => [e.id, e]))
export const biomeMap = new Map(biomes.map((b) => [b.id, b]))

const NUM_LEVELS = 120

const creatureRatings = creatureRatingsData as Record<string, Record<string, number[]>>
const soloRates = soloRatesData as Record<string, number[]>
const topExpeditionsRaw = topExpeditionsData as Record<string, string[][]>
const levelTransitions = levelTransitionsData as Record<string, number[]>

// Lazily convert top expedition arrays to Sets on first access
const topExpeditionsCache: Record<string, (Set<string> | null)[]> = {}

export function getCreatureRating(creatureId: string, expeditionId: string, level: number): number {
  const byExpedition = creatureRatings[creatureId]
  if (!byExpedition) return 0
  const ratings = byExpedition[expeditionId]
  if (!ratings || level < 1 || level > NUM_LEVELS) return 0
  return ratings[level - 1]
}

export function getPrecomputedSoloRate(creatureId: string, level: number): number {
  const rates = soloRates[creatureId]
  if (!rates || level < 1 || level > NUM_LEVELS) return 0
  return rates[level - 1]
}

export function getTopExpeditions(creatureId: string, level: number): Set<string> | undefined {
  const raw = topExpeditionsRaw[creatureId]
  if (!raw || level < 1 || level > NUM_LEVELS) return undefined

  let sets = topExpeditionsCache[creatureId]
  if (!sets) {
    sets = Array.from<Set<string> | null>({ length: raw.length }).fill(null)
    topExpeditionsCache[creatureId] = sets
  }

  const idx = level - 1
  let set = sets[idx]
  if (!set) {
    set = new Set(raw[idx])
    sets[idx] = set
  }
  return set
}

export function getLevelTransitions(creatureId: string): number[] {
  return levelTransitions[creatureId] ?? []
}
