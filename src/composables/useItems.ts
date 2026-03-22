import { ref, computed } from 'vue'

import {
  items,
  itemById,
  jobActivityIndex,
  recipeUsageIndex,
  containerSourceIndex,
} from '@/data/indexes'
import type { Item, ItemType, JobActivitySource, RecipeUsage, ContainerSource } from '@/types'

const JOB_NAMES = ['chopping', 'mining', 'digging', 'exploring', 'fishing', 'farming']
const WORKSTATION_PREFIXES = ['crafting_furnace', 'crafting_stove', 'crafting_workbench']
const CONTAINER_IDS = new Set(items.filter((i) => i.type === 'Container').map((i) => i.id))

export type SourceCategory = 'all' | 'job' | 'workstation' | 'container' | 'expedition'

function categorizeSource(source: string): SourceCategory {
  if (!source) return 'all'
  if (JOB_NAMES.includes(source)) return 'job'
  if (WORKSTATION_PREFIXES.includes(source)) return 'workstation'
  if (source.startsWith('expedition_') || source === 'completing expeditions') return 'expedition'
  if (CONTAINER_IDS.has(source)) return 'container'
  return 'all'
}

// Build available sub-options per source category
const sourceSubOptions = new Map<SourceCategory, Set<string>>()
for (const item of items) {
  for (const source of item.sources ?? []) {
    if (!source) continue
    const category = categorizeSource(source)
    if (category === 'all' || category === 'expedition') continue
    if (!sourceSubOptions.has(category)) sourceSubOptions.set(category, new Set())
    sourceSubOptions.get(category)!.add(source)
  }
}

export function useItems() {
  const searchQuery = ref('')
  const typeFilter = ref<ItemType | 'all'>('all')
  const sourceFilter = ref<SourceCategory>('all')
  const sourceSubFilter = ref<Set<string>>(new Set())

  const availableSubFilters = computed(() => {
    if (sourceFilter.value === 'all') return []
    return [...(sourceSubOptions.get(sourceFilter.value) ?? [])].toSorted()
  })

  const filteredItems = computed(() => {
    return items.filter((item) => {
      const q = searchQuery.value.toLowerCase()
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      const matchesType = typeFilter.value === 'all' || item.type === typeFilter.value
      const matchesSource =
        sourceFilter.value === 'all' ||
        (item.sources ?? []).some((s) => {
          if (!s || categorizeSource(s) !== sourceFilter.value) return false
          if (sourceSubFilter.value.size === 0) return true
          return sourceSubFilter.value.has(s)
        })
      return matchesSearch && matchesType && matchesSource
    })
  })

  function getJobSources(id: string): JobActivitySource[] {
    return jobActivityIndex.get(id) ?? []
  }

  function getRecipeUsages(id: string): RecipeUsage[] {
    return recipeUsageIndex.get(id) ?? []
  }

  function getContainerSources(id: string): ContainerSource[] {
    return containerSourceIndex.get(id) ?? []
  }

  function getItemById(id: string): Item | undefined {
    return itemById.get(id)
  }

  return {
    items,
    filteredItems,
    searchQuery,
    typeFilter,
    sourceFilter,
    sourceSubFilter,
    availableSubFilters,
    getJobSources,
    getRecipeUsages,
    getContainerSources,
    getItemById,
  }
}
