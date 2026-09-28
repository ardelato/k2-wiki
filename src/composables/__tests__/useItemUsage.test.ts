import { useCreatureCollection } from '@/composables/useCreatureCollection'
import {
  computeRemainingUses,
  countUses,
  isSafeToSell,
  useItemUsage,
} from '@/composables/useItemUsage'
import creaturesData from '@/data/creatures.json'
import { itemById, itemUseIndex, summoningIndex } from '@/data/indexes'

const allCreatureIds = new Set(creaturesData.map((c) => c.id))

function safeIds(owned: ReadonlySet<string>) {
  const remaining = computeRemainingUses(owned)
  return new Set(
    [...itemById.values()]
      .filter((item) => isSafeToSell(item, remaining.get(item.id) ?? []))
      .map((i) => i.id),
  )
}

describe('itemUseIndex', () => {
  test('counts machine inputs as uses', () => {
    expect(itemUseIndex.get('stone')?.some((u) => u.kind === 'machine')).toBe(true)
  })

  test('ignores the Greenhouse picking a crop, which consumes nothing', () => {
    const uses = itemUseIndex.get('grass') ?? []
    expect(uses.some((u) => u.kind === 'machine' && u.machineName === 'Greenhouse')).toBe(false)
  })

  test('counts upgrade bars, planks, the dungeon Armor Set and containers', () => {
    expect(itemUseIndex.get('copper-bar')?.some((u) => u.kind === 'upgrade')).toBe(true)
    expect(itemUseIndex.get('planks')?.some((u) => u.kind === 'upgrade')).toBe(true)
    expect(itemUseIndex.get('armor-set')?.some((u) => u.kind === 'dungeon')).toBe(true)
    expect(itemUseIndex.get('pouch')?.some((u) => u.kind === 'open')).toBe(true)
  })
})

describe('countUses', () => {
  test('counts a recipe and a machine making the same output once', () => {
    expect(
      countUses([
        { kind: 'recipe', targetId: 'copper-bar' },
        {
          kind: 'machine',
          targetId: 'copper-bar',
          machineId: 'm',
          machineName: 'M',
        },
      ]),
    ).toBe(1)
  })

  test('leaves summons out, since they have their own column', () => {
    expect(countUses([{ kind: 'summon', creatureId: 'poko' }, { kind: 'dungeon' }])).toBe(1)
  })
})

describe('safe to sell', () => {
  test('with no collection, only items nothing consumes are listed', () => {
    const safe = safeIds(new Set())
    for (const id of ['ruby', 'emerald', 'sapphire', 'relic', 'braymens-letter']) {
      expect(safe.has(id)).toBe(true)
    }
    // Currencies are spent, not sold; containers are opened.
    expect(safe.has('prestige-points')).toBe(false)
    expect(safe.has('pouch')).toBe(false)
    expect(safe.has('armor-set')).toBe(false)
  })

  test('a summon-only material becomes sellable once every creature needing it is owned', () => {
    const pearlCreatures = (summoningIndex.get('pearl') ?? []).map((c) => c.id)
    expect(pearlCreatures.length).toBeGreaterThan(0)

    const allButOne = new Set(pearlCreatures.slice(1))
    expect(safeIds(allButOne).has('pearl')).toBe(false)
    expect(safeIds(new Set(pearlCreatures)).has('pearl')).toBe(true)
  })

  test('an ingredient stays live while it crafts something with a sell value', () => {
    const remaining = computeRemainingUses(allCreatureIds)
    // Cheeseburger sells for gold, so its ingredients keep that recipe as a use.
    const cheeseburgerInputs = itemById.get('cheeseburger')!.recipes[0].ingredients
    for (const { id } of cheeseburgerInputs) {
      expect(remaining.get(id)?.some((u) => 'targetId' in u && u.targetId === 'cheeseburger')).toBe(
        true,
      )
    }
  })

  test('owning every creature leaves upgrade and dungeon uses in place', () => {
    const remaining = computeRemainingUses(allCreatureIds)
    expect(remaining.get('copper-bar')?.length).toBeGreaterThan(0)
    expect(remaining.get('armor-set')?.length).toBeGreaterThan(0)
  })
})

describe('useItemUsage columns', () => {
  test('Uses leaves summons to the Summons column', () => {
    const { getUseCount, getSummonCount } = useItemUsage()
    // Pearl is only ever a summon material.
    expect(getUseCount('pearl')).toBe(0)
    expect(getSummonCount('pearl')).toBe(summoningIndex.get('pearl')?.length)
    // Copper Bar feeds recipes and upgrades, never a summon.
    expect(getUseCount('copper-bar')).toBeGreaterThan(0)
    expect(getSummonCount('copper-bar')).toBe(0)
  })

  test('columns show the full counts even after the creatures are owned', () => {
    const { setOwned, resetCollection } = useCreatureCollection()
    const { getUseCount, getSummonCount, safeToSell } = useItemUsage()
    const pearlCreatures = (summoningIndex.get('pearl') ?? []).map((c) => c.id)
    for (const id of pearlCreatures) setOwned(id, true)

    expect(getSummonCount('pearl')).toBe(pearlCreatures.length)
    expect(getUseCount('pearl')).toBe(0)
    expect(safeToSell(itemById.get('pearl')!)).toBe(true)
    resetCollection()
  })
})
