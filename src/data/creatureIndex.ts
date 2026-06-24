import creaturesData from '@/data/creatures.json'
import { createIdIndex } from '@/data/entityMaps'
import type { Creature } from '@/types'

/**
 * The creature id→entity map, kept in its own module (separate from `@/data/entityMaps`) so that
 * biome/expedition-only consumers — notably `formulas`/`precomputedTables`, which the off-thread
 * party & prestige workers bundle — never drag `creatures.json` into their chunk. Only genuinely
 * creature-centric modules import this. Replaces the per-module `new Map(creatures.map(...))` rebuilds.
 */
export const creatures = creaturesData as Creature[]
export const creatureMap = createIdIndex(creatures)
