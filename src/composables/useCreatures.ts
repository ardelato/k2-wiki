import { ref, computed } from 'vue'

import creaturesData from '@/data/creatures.json'
import type { Creature, ElementType } from '@/types'

const creatures = ref<Creature[]>(creaturesData as Creature[])

export function useCreatures() {
  const searchQuery = ref('')
  const typeFilter = ref<ElementType | 'all'>('all')
  const tierFilter = ref<number | 'all'>('all')
  const traitFilter = ref<string | 'all'>('all')
  const jobFilter = ref<string | 'all'>('all')

  const allTraits = computed(() => [...new Set(creatures.value.map((c) => c.trait))].toSorted())

  const allJobs = computed(() => [...new Set(creatures.value.map((c) => c.mainJob))].toSorted())

  const filteredCreatures = computed(() => {
    return creatures.value.filter((creature) => {
      const q = searchQuery.value.toLowerCase()
      const matchesSearch =
        creature.name.toLowerCase().includes(q) ||
        creature.types.some((t) => t.toLowerCase().includes(q)) ||
        creature.trait.toLowerCase().includes(q) ||
        creature.mainJob.toLowerCase().includes(q)
      const matchesType = typeFilter.value === 'all' || creature.types.includes(typeFilter.value)
      const matchesTier = tierFilter.value === 'all' || creature.tier === tierFilter.value
      const matchesTrait = traitFilter.value === 'all' || creature.trait === traitFilter.value
      const matchesJob = jobFilter.value === 'all' || creature.mainJob === jobFilter.value
      return matchesSearch && matchesType && matchesTier && matchesTrait && matchesJob
    })
  })

  return {
    creatures,
    filteredCreatures,
    searchQuery,
    typeFilter,
    tierFilter,
    traitFilter,
    jobFilter,
    allTraits,
    allJobs,
  }
}
