import { useItems } from '@/composables/useItems'
import { jobActivityIndex, recipeUsageIndex, containerSourceIndex } from '@/data/indexes'
import itemsData from '@/data/items.json'

describe('useItems', () => {
  test('items returns all items matching source data length', () => {
    const { items } = useItems()
    expect(items).toHaveLength(itemsData.length)
  })

  test('filteredItems with no filters returns all items', () => {
    const { filteredItems } = useItems()
    expect(filteredItems.value).toHaveLength(itemsData.length)
  })

  test('searchQuery filters by name', () => {
    const { filteredItems, searchQuery } = useItems()
    const first = itemsData[0]
    searchQuery.value = first.name.toLowerCase()
    expect(filteredItems.value.every((i) => i.name.toLowerCase().includes(searchQuery.value))).toBe(
      true,
    )
    expect(filteredItems.value.length).toBeGreaterThan(0)
  })

  test('typeFilter filters to matching type only', () => {
    const { filteredItems, typeFilter } = useItems()
    typeFilter.value = 'Currency'
    expect(filteredItems.value.length).toBeGreaterThan(0)
    expect(filteredItems.value.every((i) => i.type === 'Currency')).toBe(true)
  })

  test('getItemById returns the correct item for a known ID', () => {
    const { getItemById } = useItems()
    const known = itemsData[0]
    const result = getItemById(known.id)
    expect(result).toBeDefined()
    expect(result!.id).toBe(known.id)
    expect(result!.name).toBe(known.name)
  })

  test('getItemById returns undefined for an unknown ID', () => {
    const { getItemById } = useItems()
    expect(getItemById('__nonexistent_item__')).toBeUndefined()
  })

  test('getJobSources returns a non-empty array for an item with job sources', () => {
    const { getJobSources } = useItems()
    // Find the first item that has entries in jobActivityIndex
    const [itemId] = [...jobActivityIndex.keys()]
    const result = getJobSources(itemId)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('jobId')
  })

  test('getRecipeUsages returns a non-empty array for an item used as a recipe ingredient', () => {
    const { getRecipeUsages } = useItems()
    // 'twig' is used as ingredient to craft 'coal'
    const [itemId] = [...recipeUsageIndex.keys()]
    const result = getRecipeUsages(itemId)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('outputItemId')
  })

  test('getContainerSources returns a non-empty array for an item found in a container', () => {
    const { getContainerSources } = useItems()
    // 'chopping-charm' is in the loot table of 'pouch'
    const [itemId] = [...containerSourceIndex.keys()]
    const result = getContainerSources(itemId)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('containerId')
  })

  test('getJobSources returns empty array for an unknown item ID', () => {
    const { getJobSources } = useItems()
    expect(getJobSources('__nonexistent_item__')).toEqual([])
  })
})
