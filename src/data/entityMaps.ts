import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import type { Biome, Expedition } from '@/types'

/**
 * Shared id→entity maps for the expedition/biome static datasets, plus the generic index helper.
 *
 * Lives in its own minimal module — depending only on these two small JSON files — so it can be
 * imported by both main-thread code AND the off-thread planner workers (via
 * `@/utils/precomputedTables`) WITHOUT dragging the heavy precomputed tables or the full
 * `indexes.ts` (items/jobs/machines) into a worker bundle. The creature map lives separately in
 * `@/data/creatureIndex` so biome/expedition-only importers (e.g. partyPlannerWorker via formulas)
 * never pull `creatures.json`. Replaces ~10 ad-hoc `new Map(arr.map((x) => [x.id, x]))` rebuilds.
 */

/** Build a `Map<id, item>` from any array of `{ id }`-bearing records. */
export function createIdIndex<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.id, item)
  return map
}

export const expeditions = expeditionsData as Expedition[]
export const biomes = biomesData as Biome[]

export const expeditionMap = createIdIndex(expeditions)
export const biomeMap = createIdIndex(biomes)
