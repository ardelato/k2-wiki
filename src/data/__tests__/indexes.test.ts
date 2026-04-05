import {
  items,
  itemById,
  jobActivityIndex,
  recipeUsageIndex,
  containerSourceIndex,
  expeditionSourceIndex,
  summoningIndex,
  machineRecipeIndex,
  machineSpeedMultipliers,
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
  ['machineRecipeIndex', machineRecipeIndex],
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

describe('machineRecipeIndex', () => {
  test('has entries', () => {
    expect(machineRecipeIndex.size).toBeGreaterThan(0)
  })

  test('has no empty arrays', () => {
    for (const [key, value] of machineRecipeIndex) {
      expect(value.length, `empty array for key "${key}"`).toBeGreaterThan(0)
    }
  })

  test('maps copper-bar to Smelter', () => {
    const sources = machineRecipeIndex.get('copper-bar')
    expect(sources).toBeDefined()
    expect(sources!.some((s) => s.machineName === 'Smelter')).toBe(true)
  })

  test('maps stone to Stone Quarry generator', () => {
    const sources = machineRecipeIndex.get('stone')
    expect(sources).toBeDefined()
    expect(sources!.some((s) => s.machineName === 'Stone Quarry')).toBe(true)
    const quarry = sources!.find((s) => s.machineName === 'Stone Quarry')!
    expect(quarry.inputItemId).toBeNull() // generator has no input
  })

  test('maps planks to Sawmill', () => {
    const sources = machineRecipeIndex.get('planks')
    expect(sources).toBeDefined()
    expect(sources!.some((s) => s.machineName === 'Sawmill')).toBe(true)
  })
})

describe('machineSpeedMultipliers', () => {
  test('has 11 entries (levels 0-10)', () => {
    expect(machineSpeedMultipliers).toHaveLength(11)
  })

  test('level 0 is 1.0 (base speed)', () => {
    expect(machineSpeedMultipliers[0]).toBe(1.0)
  })

  test('level 10 is 0.28 (max speed)', () => {
    expect(machineSpeedMultipliers[10]).toBe(0.28)
  })

  test('each level is faster than the previous', () => {
    for (let i = 1; i < machineSpeedMultipliers.length; i++) {
      expect(machineSpeedMultipliers[i]).toBeLessThan(machineSpeedMultipliers[i - 1])
    }
  })
})
