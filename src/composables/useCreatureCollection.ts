import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { CreatureCollectionEntry } from '@/types'
import { PRE_AWAKEN_MAX, maxLevelForState } from '@/utils/formulas'

const collection = useLocalStorage<Record<string, CreatureCollectionEntry>>('creature-collection', {})

// Migration: add awakened field to existing entries
for (const [id, entry] of Object.entries(collection.value)) {
  if ((entry as any).awakened === undefined) {
    // If level > 70, they must have been awakened under the old 120-cap system
    const awakened = entry.level > PRE_AWAKEN_MAX
    collection.value = {
      ...collection.value,
      [id]: { ...entry, awakened },
    }
  }
}

export function useCreatureCollection() {
  const ownedCreatureIds = computed(() => {
    const ids = new Set<string>()
    for (const [id, entry] of Object.entries(collection.value)) {
      if (entry.owned) ids.add(id)
    }
    return ids
  })

  const collectionLevels = computed(() => {
    const levels: Record<string, number> = {}
    for (const [id, entry] of Object.entries(collection.value)) {
      if (entry.owned) levels[id] = entry.level
    }
    return levels
  })

  function isOwned(id: string): boolean {
    return collection.value[id]?.owned ?? false
  }

  function getLevel(id: string): number {
    return collection.value[id]?.level ?? 1
  }

  function isAwakened(id: string): boolean {
    return collection.value[id]?.awakened ?? false
  }

  function setAwakened(id: string, awakened: boolean) {
    const current = collection.value[id]
    if (!current) return
    if (awakened) {
      collection.value = {
        ...collection.value,
        [id]: { ...current, awakened: true },
      }
    } else {
      collection.value = {
        ...collection.value,
        [id]: { ...current, awakened: false, level: Math.min(current.level, PRE_AWAKEN_MAX) },
      }
    }
  }

  function toggleOwned(id: string) {
    const current = collection.value[id]
    collection.value = {
      ...collection.value,
      [id]: { owned: !current?.owned, level: current?.level ?? 1, awakened: current?.awakened ?? false },
    }
  }

  function setOwned(id: string, owned: boolean) {
    const current = collection.value[id]
    collection.value = {
      ...collection.value,
      [id]: { owned, level: current?.level ?? 1, awakened: current?.awakened ?? false },
    }
  }

  function setLevel(id: string, level: number) {
    const current = collection.value[id]
    const awakened = current?.awakened ?? false
    // Auto-awaken if level exceeds pre-awaken max
    const newAwakened = level > PRE_AWAKEN_MAX ? true : awakened
    const max = maxLevelForState(newAwakened)
    const clamped = Math.max(1, Math.min(max, Math.round(level)))
    collection.value = {
      ...collection.value,
      [id]: { owned: current?.owned ?? false, level: clamped, awakened: newAwakened },
    }
  }

  return {
    collection,
    ownedCreatureIds,
    collectionLevels,
    toggleOwned,
    setOwned,
    setLevel,
    isOwned,
    getLevel,
    isAwakened,
    setAwakened,
  }
}
