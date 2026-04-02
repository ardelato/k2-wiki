import {
  items,
  itemById,
  jobActivityIndex,
  recipeUsageIndex,
  containerSourceIndex,
  expeditionSourceIndex,
  summoningIndex,
} from '@/data/indexes'

describe('itemById', () => {
  test('has the same count as the items array', () => {
    expect(itemById.size).toBe(items.length)
  })

  test('every item in items array has an entry in itemById', () => {
    for (const item of items) {
      expect(itemById.has(item.id)).toBe(true)
    }
  })

  test('each itemById entry matches the corresponding item', () => {
    for (const item of items) {
      expect(itemById.get(item.id)).toBe(item)
    }
  })
})

const indexCases = [
  ['jobActivityIndex', jobActivityIndex],
  ['recipeUsageIndex', recipeUsageIndex],
  ['containerSourceIndex', containerSourceIndex],
  ['summoningIndex', summoningIndex],
] as const

describe('secondary indexes', () => {
  test.each(indexCases)('%s has entries', (_, index) => {
    expect(index.size).toBeGreaterThan(0)
  })

  test.each(indexCases)('%s has no empty arrays', (_, index) => {
    for (const [key, value] of index) {
      expect(value.length, `empty array for key "${key}"`).toBeGreaterThan(0)
    }
  })
})

describe('expeditionSourceIndex', () => {
  test('has entries (size > 0)', () => {
    expect(expeditionSourceIndex.size).toBeGreaterThan(0)
  })

  test('no entry has an empty array as its value', () => {
    for (const [, sources] of expeditionSourceIndex) {
      expect(sources.length).toBeGreaterThan(0)
    }
  })
})
