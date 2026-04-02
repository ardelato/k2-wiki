import { useCreatures } from '@/composables/useCreatures'
import creaturesData from '@/data/creatures.json'
import type { Creature, ElementType } from '@/types'

const allCreatures = creaturesData as Creature[]
// first creature: id=moss, name=Moss, types=[Wind], tier=0, trait=learner, mainJob=All
const firstCreature = allCreatures[0]

describe('useCreatures', () => {
  test('creatures returns all creatures from data (length > 0)', () => {
    const { creatures } = useCreatures()
    expect(creatures.value.length).toBe(allCreatures.length)
    expect(creatures.value.length).toBeGreaterThan(0)
  })

  test('filteredCreatures with no filters returns all creatures', () => {
    const { filteredCreatures } = useCreatures()
    expect(filteredCreatures.value.length).toBe(allCreatures.length)
  })

  test('searchQuery filters by name', () => {
    const { filteredCreatures, searchQuery } = useCreatures()
    searchQuery.value = firstCreature.name.toLowerCase()
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(
      filteredCreatures.value.every((c) =>
        c.name.toLowerCase().includes(firstCreature.name.toLowerCase()),
      ),
    ).toBe(true)
  })

  test('searchQuery filters by type string', () => {
    const { filteredCreatures, searchQuery } = useCreatures()
    searchQuery.value = 'fire'
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(
      filteredCreatures.value.every(
        (c) =>
          c.name.toLowerCase().includes('fire') ||
          c.types.some((t) => t.toLowerCase().includes('fire')) ||
          c.trait.toLowerCase().includes('fire') ||
          c.mainJob.toLowerCase().includes('fire'),
      ),
    ).toBe(true)
  })

  test('typeFilter filters to only creatures with that type', () => {
    const { filteredCreatures, typeFilter } = useCreatures()
    typeFilter.value = 'Fire' as ElementType
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(filteredCreatures.value.every((c) => c.types.includes('Fire'))).toBe(true)
  })

  test('tierFilter filters to only creatures with that tier', () => {
    const { filteredCreatures, tierFilter } = useCreatures()
    tierFilter.value = 1
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(filteredCreatures.value.every((c) => c.tier === 1)).toBe(true)
  })

  test('traitFilter filters correctly', () => {
    const { filteredCreatures, traitFilter } = useCreatures()
    traitFilter.value = 'learner'
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(filteredCreatures.value.every((c) => c.trait === 'learner')).toBe(true)
  })

  test('jobFilter filters correctly', () => {
    const { filteredCreatures, jobFilter } = useCreatures()
    jobFilter.value = 'Chopping'
    expect(filteredCreatures.value.length).toBeGreaterThan(0)
    expect(filteredCreatures.value.every((c) => c.mainJob === 'Chopping')).toBe(true)
  })

  test('combined filters work together (type + tier)', () => {
    const { filteredCreatures, typeFilter, tierFilter } = useCreatures()
    // tier-1 Fire creatures: ignis is one example
    typeFilter.value = 'Fire' as ElementType
    tierFilter.value = 1
    const results = filteredCreatures.value
    expect(results.every((c) => c.types.includes('Fire') && c.tier === 1)).toBe(true)
  })

  test('allTraits returns sorted unique traits', () => {
    const { allTraits } = useCreatures()
    const traits = allTraits.value
    const expected = [...new Set(allCreatures.map((c) => c.trait))].toSorted()
    expect(traits).toEqual(expected)
    // verify sorted
    for (let i = 1; i < traits.length; i++) {
      expect(traits[i - 1].localeCompare(traits[i])).toBeLessThanOrEqual(0)
    }
    // verify unique
    expect(new Set(traits).size).toBe(traits.length)
  })

  test('allJobs returns sorted unique jobs', () => {
    const { allJobs } = useCreatures()
    const jobs = allJobs.value
    const expected = [...new Set(allCreatures.map((c) => c.mainJob))].toSorted()
    expect(jobs).toEqual(expected)
    // verify sorted
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].localeCompare(jobs[i])).toBeLessThanOrEqual(0)
    }
    // verify unique
    expect(new Set(jobs).size).toBe(jobs.length)
  })
})
