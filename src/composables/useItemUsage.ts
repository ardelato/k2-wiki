import { computed } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { itemById, itemUseIndex, items, summoningIndex, type ItemUse } from '@/data/indexes'
import type { Item } from '@/types'

/**
 * Uses an item still has for a player who owns `ownedCreatureIds`. Summons are one-time
 * (prestige keeps the collection), so a summon use ends once the creature is owned. A recipe
 * or machine use ends when its output has no remaining use of its own and can't be sold,
 * which carries a finished summon down the chain (Cheeseburger ingredients go dead with the
 * last Cheeseburger creature). Upgrades, dungeon entry and opening a container never end.
 */
export function computeRemainingUses(ownedCreatureIds: ReadonlySet<string>) {
  const remaining = new Map<string, ItemUse[]>()
  const visiting = new Set<string>()

  function resolve(itemId: string): ItemUse[] {
    const cached = remaining.get(itemId)
    if (cached) return cached
    // A recipe cycle can't be settled here; assume the use is still live.
    if (visiting.has(itemId)) return itemUseIndex.get(itemId) ?? []
    visiting.add(itemId)
    const live = (itemUseIndex.get(itemId) ?? []).filter((use) => isLive(use))
    visiting.delete(itemId)
    remaining.set(itemId, live)
    return live
  }

  function isLive(use: ItemUse): boolean {
    if (use.kind === 'summon') return !ownedCreatureIds.has(use.creatureId)
    if (use.kind === 'recipe' || use.kind === 'machine') {
      if ((itemById.get(use.targetId)?.sellValue ?? 0) > 0) return true
      return resolve(use.targetId).length > 0
    }
    return true
  }

  for (const item of items) resolve(item.id)
  return remaining
}

/**
 * Distinct non-summon things an item feeds (summons have their own column). A recipe and a
 * machine making the same output count once.
 */
export function countUses(uses: ItemUse[]): number {
  const keys = new Set<string>()
  for (const use of uses) {
    if (use.kind === 'summon') continue
    if (use.kind === 'recipe' || use.kind === 'machine') keys.add(`make:${use.targetId}`)
    else if (use.kind === 'upgrade') keys.add(`upgrade:${use.target}`)
    else keys.add(use.kind)
  }
  return keys.size
}

/** Currencies are spent, not sold, so they never count as sell-only inventory. */
export function isSafeToSell(item: Item, remainingUses: ItemUse[]): boolean {
  return item.type !== 'Currency' && (item.sellValue ?? 0) > 0 && remainingUses.length === 0
}

export function useItemUsage() {
  const { ownedCreatureIds } = useCreatureCollection()

  const remainingUses = computed(() => computeRemainingUses(ownedCreatureIds.value))

  // The table counts show the game's data as-is; only safeToSell looks at the collection.
  function getUseCount(id: string): number {
    return countUses(itemUseIndex.get(id) ?? [])
  }

  function getSummonCount(id: string): number {
    return summoningIndex.get(id)?.length ?? 0
  }

  function safeToSell(item: Item): boolean {
    return isSafeToSell(item, remainingUses.value.get(item.id) ?? [])
  }

  return { getUseCount, getSummonCount, safeToSell }
}
