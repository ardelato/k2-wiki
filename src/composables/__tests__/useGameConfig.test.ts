import { useGameConfig } from '@/composables/useGameConfig'

describe('useGameConfig', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('excludedCreatureIds combines sanctuary, helper, machine, expedition, and dungeon IDs', () => {
    const {
      excludedCreatureIds,
      expeditionParties,
      dungeonParty,
      setSanctuaryCreatures,
      setHelperCreatures,
      setMachineCreatures,
    } = useGameConfig()
    setSanctuaryCreatures(['s1', 's2'])
    setHelperCreatures(['h1'])
    setMachineCreatures(['m1'])
    expeditionParties.value = { exp1: ['e1'] }
    dungeonParty.value = ['d1']
    expect(excludedCreatureIds.value.has('s1')).toBe(true)
    expect(excludedCreatureIds.value.has('s2')).toBe(true)
    expect(excludedCreatureIds.value.has('h1')).toBe(true)
    expect(excludedCreatureIds.value.has('m1')).toBe(true)
    expect(excludedCreatureIds.value.has('e1')).toBe(true)
    expect(excludedCreatureIds.value.has('d1')).toBe(true)
    expect(excludedCreatureIds.value.size).toBe(6)
  })

  test('excludedCreatureIds deduplicates IDs that appear in multiple sources', () => {
    const {
      excludedCreatureIds,
      expeditionParties,
      dungeonParty,
      setSanctuaryCreatures,
      setHelperCreatures,
      setMachineCreatures,
    } = useGameConfig()
    setSanctuaryCreatures(['shared', 'unique-s'])
    setHelperCreatures(['shared', 'unique-h'])
    setMachineCreatures(['shared'])
    expeditionParties.value = { exp1: ['shared'] }
    dungeonParty.value = ['shared']
    expect(excludedCreatureIds.value.has('shared')).toBe(true)
    expect(excludedCreatureIds.value.size).toBe(3)
  })

  test('expeditionCreatureIds flattens all expedition party members', () => {
    const { expeditionCreatureIds, expeditionParties } = useGameConfig()
    expeditionParties.value = { exp1: ['c1', 'c2'], exp2: ['c3'] }
    expect(expeditionCreatureIds.value.has('c1')).toBe(true)
    expect(expeditionCreatureIds.value.has('c2')).toBe(true)
    expect(expeditionCreatureIds.value.has('c3')).toBe(true)
    expect(expeditionCreatureIds.value.size).toBe(3)
  })

  test('setInventory stores a positive amount', () => {
    const { inventoryAmounts, setInventory } = useGameConfig()
    setInventory('twig', 10)
    expect(inventoryAmounts.value['twig']).toBe(10)
  })

  test('setInventory removes the item when amount is <= 0', () => {
    const { inventoryAmounts, setInventory } = useGameConfig()
    setInventory('twig', 5)
    setInventory('twig', 0)
    expect(inventoryAmounts.value['twig']).toBeUndefined()

    setInventory('twig', 3)
    setInventory('twig', -1)
    expect(inventoryAmounts.value['twig']).toBeUndefined()
  })

  test('setAwakenGatherYieldBonus clamps value to [0, 2]', () => {
    const { awakenGatherUpgrades, setAwakenGatherYieldBonus } = useGameConfig()
    setAwakenGatherYieldBonus('Chopping', -1)
    expect(awakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(0)

    setAwakenGatherYieldBonus('Chopping', 5)
    expect(awakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(2)

    setAwakenGatherYieldBonus('Chopping', 1)
    expect(awakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(1)
  })

  test('setAwakenGatherDurationTier clamps value to [0, 4]', () => {
    const { awakenGatherUpgrades, setAwakenGatherDurationTier } = useGameConfig()
    setAwakenGatherDurationTier('Mining', -1)
    expect(awakenGatherUpgrades.value['Mining'].durationTier).toBe(0)

    setAwakenGatherDurationTier('Mining', 10)
    expect(awakenGatherUpgrades.value['Mining'].durationTier).toBe(4)

    setAwakenGatherDurationTier('Mining', 2)
    expect(awakenGatherUpgrades.value['Mining'].durationTier).toBe(2)
  })

  test('setAwakenSpeedTier clamps value to [0, 4]', () => {
    const { awakenSpeedTiers, setAwakenSpeedTier } = useGameConfig()
    setAwakenSpeedTier('Furnace', -1)
    expect(awakenSpeedTiers.value['Furnace']).toBe(0)

    setAwakenSpeedTier('Furnace', 10)
    expect(awakenSpeedTiers.value['Furnace']).toBe(4)

    setAwakenSpeedTier('Furnace', 3)
    expect(awakenSpeedTiers.value['Furnace']).toBe(3)
  })

  test('resetGameConfig clears all state', () => {
    const {
      inventoryAmounts,
      sanctuaryCreatureIds,
      awakenGatherUpgrades,
      awakenSpeedTiers,
      setSanctuaryCreatures,
      setInventory,
      setAwakenGatherYieldBonus,
      setAwakenSpeedTier,
      resetGameConfig,
    } = useGameConfig()

    setSanctuaryCreatures(['c1', 'c2'])
    setInventory('twig', 5)
    setAwakenGatherYieldBonus('Chopping', 2)
    setAwakenSpeedTier('Furnace', 3)

    resetGameConfig()

    expect(sanctuaryCreatureIds.value).toEqual([])
    expect(inventoryAmounts.value).toEqual({})
    expect(awakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(0)
    expect(awakenSpeedTiers.value['Furnace']).toBe(0)
  })

  test('setSanctuaryCreatures updates the sanctuary ref', () => {
    const { sanctuaryCreatureIds, setSanctuaryCreatures } = useGameConfig()
    setSanctuaryCreatures(['a', 'b', 'c'])
    expect(sanctuaryCreatureIds.value).toEqual(['a', 'b', 'c'])
  })

  test('setHelperCreatures updates the helper ref', () => {
    const { helperCreatureIds, setHelperCreatures } = useGameConfig()
    setHelperCreatures(['h1', 'h2'])
    expect(helperCreatureIds.value).toEqual(['h1', 'h2'])
  })

  test('setMachineCreatures updates the machine ref', () => {
    const { machineCreatureIds, setMachineCreatures } = useGameConfig()
    setMachineCreatures(['m1'])
    expect(machineCreatureIds.value).toEqual(['m1'])
  })

  test('setToolLevels stores tool levels', () => {
    const { toolLevels, setToolLevels } = useGameConfig()
    setToolLevels({ axe: 3, pickaxe: 7 })
    expect(toolLevels.value).toEqual({ axe: 3, pickaxe: 7 })
  })

  test('resetToolLevels clears tool levels', () => {
    const { toolLevels, setToolLevels, resetToolLevels } = useGameConfig()
    setToolLevels({ axe: 5 })
    resetToolLevels()
    expect(toolLevels.value).toEqual({})
  })

  test('setMachineLevels stores machine levels', () => {
    const { machineLevels, setMachineLevels } = useGameConfig()
    setMachineLevels({ smelter: 5, sawmill: 3 })
    expect(machineLevels.value).toEqual({ smelter: 5, sawmill: 3 })
  })

  test('setMachineRecipes stores machine recipes', () => {
    const { machineRecipes, setMachineRecipes } = useGameConfig()
    setMachineRecipes({ smelter: 'copper-ore', sawmill: null })
    expect(machineRecipes.value).toEqual({ smelter: 'copper-ore', sawmill: null })
  })

  test('resetMachines clears machine levels and recipes', () => {
    const { machineLevels, machineRecipes, setMachineLevels, setMachineRecipes, resetMachines } =
      useGameConfig()
    setMachineLevels({ smelter: 5 })
    setMachineRecipes({ smelter: 'copper-ore' })
    resetMachines()
    expect(machineLevels.value).toEqual({})
    expect(machineRecipes.value).toEqual({})
  })

  test('setFabricationAllocations stores allocations', () => {
    const { fabricationAllocations, setFabricationAllocations } = useGameConfig()
    setFabricationAllocations({ 'pine-log': 3, 'copper-ore': 5 })
    expect(fabricationAllocations.value).toEqual({ 'pine-log': 3, 'copper-ore': 5 })
  })

  test('resetFabrication clears allocations', () => {
    const { fabricationAllocations, setFabricationAllocations, resetFabrication } = useGameConfig()
    setFabricationAllocations({ 'pine-log': 3 })
    resetFabrication()
    expect(fabricationAllocations.value).toEqual({})
  })

  test('resetGameConfig clears new state fields', () => {
    const {
      toolLevels,
      machineLevels,
      machineRecipes,
      fabricationAllocations,
      setToolLevels,
      setMachineLevels,
      setMachineRecipes,
      setFabricationAllocations,
      resetGameConfig,
    } = useGameConfig()

    setToolLevels({ axe: 5 })
    setMachineLevels({ smelter: 3 })
    setMachineRecipes({ smelter: 'copper-ore' })
    setFabricationAllocations({ 'pine-log': 2 })

    resetGameConfig()

    expect(toolLevels.value).toEqual({})
    expect(machineLevels.value).toEqual({})
    expect(machineRecipes.value).toEqual({})
    expect(fabricationAllocations.value).toEqual({})
  })

  test('setDungeonParty updates the dungeon party ref', () => {
    const { dungeonParty, setDungeonParty } = useGameConfig()
    setDungeonParty(['pudge', 'finn', 'kroko'])
    expect(dungeonParty.value).toEqual(['pudge', 'finn', 'kroko'])
  })

  test('resetDungeonParty clears the dungeon party', () => {
    const { dungeonParty, setDungeonParty, resetDungeonParty } = useGameConfig()
    setDungeonParty(['pudge', 'finn'])
    resetDungeonParty()
    expect(dungeonParty.value).toEqual([])
  })

  test('resetGameConfig clears every settable field back to defaults', () => {
    const config = useGameConfig()

    // Set every piece of state to a non-default value
    config.setSanctuaryCreatures(['c1', 'c2'])
    config.setHelperCreatures(['h1'])
    config.setMachineCreatures(['m1'])
    config.setExpeditionToolXpBonus(1.25)
    config.setInventory('twig', 10)
    config.setGardenFlowerEntries('fire-flower', [{ level: 3, count: 2 }])
    config.setAwakenGatherYieldBonus('Chopping', 2)
    config.setAwakenGatherDurationTier('Mining', 3)
    config.setAwakenSpeedTier('Furnace', 4)
    config.setAwakenGoldLevel(3)
    config.setExpeditionCompletions({ 'expedition-type-1': { 1: 5 } })
    config.setExpeditionParties({ 'expedition-type-1': ['c1', 'c2'] })
    config.setExpeditionTiers({ 'expedition-type-1': 3 })
    config.setExpeditionCreatureLevels({ c1: 50, c2: 30 })
    config.setExpeditionLoopCounts({ 'expedition-type-1': 10 })
    config.setToolLevels({ axe: 5 })
    config.setToolSpeedModes({ Furnace: true })
    config.setMachineLevels({ smelter: 3 })
    config.setMachineRecipes({ smelter: 'copper-ore' })
    config.setFabricationAllocations({ 'pine-log': 2 })
    config.setSkillLevels({ mining: 5 })
    config.setQueuedAmounts({ Furnace: { 'copper-bar': 10 } })
    config.setQueuedTimes({ Furnace: 5000 })
    config.setDungeonParty(['c1', 'c2'])

    // Reset everything
    config.resetGameConfig()

    // Verify every field is back to its default
    expect(config.sanctuaryCreatureIds.value).toEqual([])
    expect(config.helperCreatureIds.value).toEqual([])
    expect(config.machineCreatureIds.value).toEqual([])
    expect(config.expeditionToolXpBonus.value).toBe(1)
    expect(config.inventoryAmounts.value).toEqual({})
    expect(config.gardenFlowers.value['fire-flower']).toEqual([])
    expect(config.awakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(0)
    expect(config.awakenGatherUpgrades.value['Mining'].durationTier).toBe(0)
    expect(config.awakenSpeedTiers.value['Furnace']).toBe(0)
    expect(config.awakenGoldLevel.value).toBe(0)
    expect(config.expeditionCompletions.value).toEqual({})
    expect(config.expeditionParties.value).toEqual({})
    expect(config.expeditionTiers.value).toEqual({})
    expect(config.expeditionCreatureLevels.value).toEqual({})
    expect(config.expeditionLoopCounts.value).toEqual({})
    expect(config.toolLevels.value).toEqual({})
    expect(config.toolSpeedModes.value).toEqual({})
    expect(config.machineLevels.value).toEqual({})
    expect(config.machineRecipes.value).toEqual({})
    expect(config.fabricationAllocations.value).toEqual({})
    expect(config.skillLevels.value).toEqual({})
    expect(config.queuedAmounts.value).toEqual({})
    expect(config.queuedTimes.value).toEqual({})
    expect(config.dungeonParty.value).toEqual([])
  })
})
