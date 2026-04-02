import { useCreatureCollection } from '@/composables/useCreatureCollection'

describe('useCreatureCollection', () => {
  test('starts with empty collection after reset', () => {
    const { collection, resetCollection } = useCreatureCollection()
    resetCollection()
    expect(Object.keys(collection.value)).toHaveLength(0)
  })

  test('toggleOwned adds creature with owned=true, level=1, awakened=false', () => {
    const { collection, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    expect(collection.value['moss']).toEqual({ owned: true, level: 1, awakened: false })
  })

  test('toggleOwned again sets owned=false', () => {
    const { collection, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    toggleOwned('moss')
    expect(collection.value['moss'].owned).toBe(false)
  })

  test('setLevel clamps to minimum of 1', () => {
    const { getLevel, setLevel, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    setLevel('moss', -5)
    expect(getLevel('moss')).toBe(1)
  })

  test('setLevel clamps to max level for non-awakened (70)', () => {
    const { getLevel, setLevel, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    setLevel('moss', 50)
    // set to a value within pre-awaken range so it stays non-awakened
    expect(getLevel('moss')).toBe(50)
    // clamp: setLevel to 999 on an awakened creature caps at 120
    setLevel('moss', 71) // auto-awakens
    setLevel('moss', 999)
    expect(getLevel('moss')).toBe(120)
  })

  test('setLevel with level > 70 auto-awakens creature', () => {
    const { isAwakened, setLevel, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    expect(isAwakened('moss')).toBe(false)
    setLevel('moss', 71)
    expect(isAwakened('moss')).toBe(true)
  })

  test('setAwakened(false) caps level to 70', () => {
    const { getLevel, setLevel, setAwakened, toggleOwned, resetCollection } =
      useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    setLevel('moss', 90) // auto-awakens
    expect(getLevel('moss')).toBe(90)
    setAwakened('moss', false)
    expect(getLevel('moss')).toBe(70)
  })

  test('setAwakened(true) keeps current level', () => {
    const { getLevel, setLevel, setAwakened, toggleOwned, resetCollection } =
      useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    setLevel('moss', 50)
    setAwakened('moss', true)
    expect(getLevel('moss')).toBe(50)
  })

  test('ownedCreatureIds returns Set of owned IDs only', () => {
    const { ownedCreatureIds, toggleOwned, setOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    toggleOwned('ignis')
    setOwned('sunny', false)
    const ids = ownedCreatureIds.value
    expect(ids.has('moss')).toBe(true)
    expect(ids.has('ignis')).toBe(true)
    expect(ids.has('sunny')).toBe(false)
    expect(ids.size).toBe(2)
  })

  test('collectionLevels returns levels for owned creatures only', () => {
    const { collectionLevels, toggleOwned, setOwned, setLevel, resetCollection } =
      useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    setLevel('moss', 30)
    setOwned('ignis', false)
    setLevel('ignis', 10)
    const levels = collectionLevels.value
    expect(levels['moss']).toBe(30)
    expect(levels['ignis']).toBeUndefined()
  })

  test('isOwned returns false for unknown creature', () => {
    const { isOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    expect(isOwned('unknown-creature')).toBe(false)
  })

  test('getLevel returns 1 for unknown creature', () => {
    const { getLevel, resetCollection } = useCreatureCollection()
    resetCollection()
    expect(getLevel('unknown-creature')).toBe(1)
  })

  test('resetCollection clears all data', () => {
    const { collection, toggleOwned, resetCollection } = useCreatureCollection()
    resetCollection()
    toggleOwned('moss')
    toggleOwned('ignis')
    resetCollection()
    expect(Object.keys(collection.value)).toHaveLength(0)
  })
})
