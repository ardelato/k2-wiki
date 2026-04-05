import { ref, computed, watch } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { itemById } from '@/data/indexes'
import { toTitleCase } from '@/utils/format'

const STORAGE_KEY = 'summoning-planner-selection'

function loadSelection(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw) as string[]
    return new Set(ids)
  } catch {
    return new Set()
  }
}

function saveSelection(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Quota exceeded — silently skip
  }
}

export interface AggregatedCost {
  itemId: string
  itemName: string
  amount: number
}

export function useSummoningPlanner() {
  const { creatures } = useCreatures()
  const { ownedCreatureIds } = useCreatureCollection()

  const selectedIds = ref(loadSelection())

  watch(selectedIds, (ids) => saveSelection(ids), { deep: true })

  // Remove owned creatures from selection (they've been summoned)
  watch(ownedCreatureIds, (owned) => {
    const next = new Set([...selectedIds.value].filter((id) => !owned.has(id)))
    if (next.size !== selectedIds.value.size) selectedIds.value = next
  })

  const unsummonedCreatures = computed(() =>
    creatures.value.filter((c) => !ownedCreatureIds.value.has(c.id)),
  )

  const selectedCreatures = computed(() =>
    unsummonedCreatures.value
      .filter((c) => selectedIds.value.has(c.id))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  )

  const aggregatedCosts = computed(() => {
    const totals = new Map<string, AggregatedCost>()
    for (const creature of selectedCreatures.value) {
      for (const cost of creature.summoningCost) {
        const existing = totals.get(cost.id)
        if (existing) {
          existing.amount += cost.amount
        } else {
          const item = itemById.get(cost.id)
          totals.set(cost.id, {
            itemId: cost.id,
            itemName: item?.name ?? toTitleCase(cost.id),
            amount: cost.amount,
          })
        }
      }
    }
    return [...totals.values()].toSorted((a, b) => a.itemName.localeCompare(b.itemName))
  })

  function toggleCreature(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function toggleTier(ids: string[], select: boolean) {
    const next = new Set(selectedIds.value)
    for (const id of ids) {
      if (select) next.add(id)
      else next.delete(id)
    }
    selectedIds.value = next
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  return {
    selectedIds,
    unsummonedCreatures,
    selectedCreatures,
    aggregatedCosts,
    toggleCreature,
    toggleTier,
    clearSelection,
  }
}
