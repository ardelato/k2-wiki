import { extractSaveConfig, parseAwakenUpgrades } from '@/utils/save/parseSave'

function baseSave(): Record<string, unknown> {
  return {
    sanctuary: [],
    helpers: [],
    inventory: [],
    creatures: [],
    purchasedUpgrades: [],
    garden: { flowers: [] },
    machines: { machines: {} },
    tools: {},
    fabrication: { allocations: {} },
    expeditionCompletions: {},
    activeExpeditions: [],
    dungeons: { activeDungeons: [] },
  }
}

describe('parseSave — toolLevels', () => {
  test('parses tool levels from save.tools', () => {
    const save = baseSave()
    save.tools = { axe: 3, pickaxe: 7, sword: 10 }

    const config = extractSaveConfig(save)
    expect(config.toolLevels).toEqual({ axe: 3, pickaxe: 7, sword: 10 })
  })

  test('filters out zero-level tools', () => {
    const save = baseSave()
    save.tools = { axe: 0, pickaxe: 5 }

    const config = extractSaveConfig(save)
    expect(config.toolLevels).toEqual({ pickaxe: 5 })
  })

  test('returns empty object when tools is missing', () => {
    const save = baseSave()
    delete save.tools

    const config = extractSaveConfig(save)
    expect(config.toolLevels).toEqual({})
  })

  test('returns empty object when tools is not an object', () => {
    const save = baseSave()
    save.tools = 'invalid'

    const config = extractSaveConfig(save)
    expect(config.toolLevels).toEqual({})
  })
})

describe('parseSave — machineLevels and machineRecipes', () => {
  test('parses machine levels and recipes from purchased machines', () => {
    const save = baseSave()
    save.machines = {
      machines: {
        smelter: {
          id: 'smelter',
          purchased: true,
          level: 5,
          selectedRecipeId: 'copper-ore',
        },
        sawmill: {
          id: 'sawmill',
          purchased: true,
          level: 3,
          selectedRecipeId: null,
        },
      },
    }

    const config = extractSaveConfig(save)
    expect(config.machineLevels).toEqual({ smelter: 5, sawmill: 3 })
    expect(config.machineRecipes).toEqual({ smelter: 'copper-ore', sawmill: null })
  })

  test('ignores unpurchased machines', () => {
    const save = baseSave()
    save.machines = {
      machines: {
        smelter: {
          id: 'smelter',
          purchased: false,
          level: 0,
        },
      },
    }

    const config = extractSaveConfig(save)
    expect(config.machineLevels).toEqual({})
    expect(config.machineRecipes).toEqual({})
  })

  test('returns empty objects when machines is missing', () => {
    const save = baseSave()
    delete save.machines

    const config = extractSaveConfig(save)
    expect(config.machineLevels).toEqual({})
    expect(config.machineRecipes).toEqual({})
  })

  test('returns empty objects when machines.machines is missing', () => {
    const save = baseSave()
    save.machines = {}

    const config = extractSaveConfig(save)
    expect(config.machineLevels).toEqual({})
    expect(config.machineRecipes).toEqual({})
  })
})

describe('parseSave — fabricationAllocations', () => {
  test('parses allocations from save.fabrication', () => {
    const save = baseSave()
    save.fabrication = {
      allocations: { 'pine-log': 3, 'copper-ore': 5 },
    }

    const config = extractSaveConfig(save)
    expect(config.fabricationAllocations).toEqual({ 'pine-log': 3, 'copper-ore': 5 })
  })

  test('filters out zero allocations', () => {
    const save = baseSave()
    save.fabrication = {
      allocations: { 'pine-log': 0, 'copper-ore': 2 },
    }

    const config = extractSaveConfig(save)
    expect(config.fabricationAllocations).toEqual({ 'copper-ore': 2 })
  })

  test('returns empty object when fabrication is missing', () => {
    const save = baseSave()
    delete save.fabrication

    const config = extractSaveConfig(save)
    expect(config.fabricationAllocations).toEqual({})
  })

  test('returns empty object when allocations is missing', () => {
    const save = baseSave()
    save.fabrication = {}

    const config = extractSaveConfig(save)
    expect(config.fabricationAllocations).toEqual({})
  })
})

describe('parseSave — skillLevels', () => {
  test('parses skill XP into levels', () => {
    const save = baseSave()
    save.skills = [
      { id: 'Chopping', xp: 388 }, // level 5
      { id: 'Mining', xp: 1154 }, // level 10
    ]

    const config = extractSaveConfig(save)
    expect(config.skillLevels).toEqual({ Chopping: 5, Mining: 10 })
  })

  test('includes level 1 skills (0 XP)', () => {
    const save = baseSave()
    save.skills = [{ id: 'Chopping', xp: 0 }]

    const config = extractSaveConfig(save)
    expect(config.skillLevels).toEqual({ Chopping: 1 })
  })

  test('returns empty object when skills is missing', () => {
    const save = baseSave()
    delete save.skills

    const config = extractSaveConfig(save)
    expect(config.skillLevels).toEqual({})
  })

  test('returns empty object when skills is not an array', () => {
    const save = baseSave()
    save.skills = 'invalid'

    const config = extractSaveConfig(save)
    expect(config.skillLevels).toEqual({})
  })

  test('skips entries with missing id or xp', () => {
    const save = baseSave()
    save.skills = [{ id: 'Chopping', xp: 388 }, { xp: 500 }, { id: 'Mining' }, {}]

    const config = extractSaveConfig(save)
    expect(config.skillLevels).toEqual({ Chopping: 5 })
  })
})

describe('parseSave — collectedItems', () => {
  test('parses collections.items into a string array', () => {
    const save = baseSave()
    save.collections = { items: ['twig', 'pine-log', 'copper-ore'] }
    const config = extractSaveConfig(save)
    expect(config.collectedItems).toEqual(['twig', 'pine-log', 'copper-ore'])
  })

  test('filters non-string entries', () => {
    const save = baseSave()
    save.collections = { items: ['twig', 42, null, 'pine-log'] }
    const config = extractSaveConfig(save)
    expect(config.collectedItems).toEqual(['twig', 'pine-log'])
  })

  test('returns empty array when collections is missing', () => {
    const save = baseSave()
    delete save.collections
    const config = extractSaveConfig(save)
    expect(config.collectedItems).toEqual([])
  })

  test('returns empty array when collections.items is not an array', () => {
    const save = baseSave()
    save.collections = { items: 'oops' }
    const config = extractSaveConfig(save)
    expect(config.collectedItems).toEqual([])
  })
})

describe('parseSave — gardenLayout', () => {
  test('places flowers at their (x, y) positions in a 25-cell layout', () => {
    const save = baseSave()
    save.garden = {
      flowers: [
        { flowerId: 'fire-flower', level: 3, x: 0, y: 0 },
        { flowerId: 'gold-flower', level: 5, x: 4, y: 4 },
        { flowerId: 'wind-flower', level: 1, x: 2, y: 1 },
      ],
    }
    const config = extractSaveConfig(save)
    expect(config.gardenLayout).toHaveLength(25)
    expect(config.gardenLayout[0]).toEqual({ flowerId: 'fire-flower', level: 3 })
    // y*5 + x → (1*5 + 2) = 7
    expect(config.gardenLayout[7]).toEqual({ flowerId: 'wind-flower', level: 1 })
    expect(config.gardenLayout[24]).toEqual({ flowerId: 'gold-flower', level: 5 })
  })

  test('drops flowers outside the 5×5 grid', () => {
    const save = baseSave()
    save.garden = {
      flowers: [
        { flowerId: 'fire-flower', level: 1, x: -1, y: 0 },
        { flowerId: 'fire-flower', level: 1, x: 0, y: 5 },
        { flowerId: 'fire-flower', level: 1, x: 5, y: 0 },
      ],
    }
    const config = extractSaveConfig(save)
    expect(config.gardenLayout.every((c) => c === null)).toBe(true)
  })

  test('returns an empty 25-cell layout when garden is missing', () => {
    const save = baseSave()
    delete save.garden
    const config = extractSaveConfig(save)
    expect(config.gardenLayout).toHaveLength(25)
    expect(config.gardenLayout.every((c) => c === null)).toBe(true)
  })
})

describe('parseAwakenUpgrades (exported)', () => {
  test('returns defaults when given an empty list', () => {
    const result = parseAwakenUpgrades([])
    expect(result.awakenGoldLevel).toBe(0)
    expect(result.awakenSpeedTiers['Furnace']).toBe(0)
    expect(result.awakenGatherUpgrades['Chopping']).toEqual({
      yieldBonus: 0,
      durationTier: 0,
      xpTier: 0,
    })
  })

  test('accumulates skill_xp nodes into xpTier', () => {
    const result = parseAwakenUpgrades(['chopping-xp-i', 'chopping-xp-ii'])
    expect(result.awakenGatherUpgrades['Chopping'].xpTier).toBe(2)
  })

  test('counts a fully-maxed gathering XP tree (I–VI) as xpTier 6', () => {
    const result = parseAwakenUpgrades([
      'chopping-xp-i',
      'chopping-xp-ii',
      'chopping-xp-iii',
      'chopping-xp-iv',
      'chopping-xp-v',
      'chopping-xp-vi',
    ])
    expect(result.awakenGatherUpgrades['Chopping'].xpTier).toBe(6)
  })

  test('counts a fully-maxed workstation XP tree (I–V) as 5', () => {
    const result = parseAwakenUpgrades([
      'furnace-xp-i',
      'furnace-xp-ii',
      'furnace-xp-iii',
      'furnace-xp-iv',
      'furnace-xp-v',
    ])
    expect(result.awakenWorkstationXpTiers['Furnace']).toBe(5)
  })

  test('parses awaken-gold tier as the highest matched roman numeral', () => {
    const result = parseAwakenUpgrades(['awaken-gold-i', 'awaken-gold-ii', 'awaken-gold-iii'])
    expect(result.awakenGoldLevel).toBe(3)
  })

  test('accumulates yield-i and yield-ii into yieldBonus 2', () => {
    const result = parseAwakenUpgrades(['chopping-yield-i', 'chopping-yield-ii'])
    expect(result.awakenGatherUpgrades['Chopping'].yieldBonus).toBe(2)
  })

  test('uses the highest tier for duration upgrades', () => {
    const result = parseAwakenUpgrades([
      'mining-duration-i',
      'mining-duration-ii',
      'mining-duration-iii',
    ])
    expect(result.awakenGatherUpgrades['Mining'].durationTier).toBe(3)
  })

  test('parses workstation speed tiers', () => {
    const result = parseAwakenUpgrades(['furnace-speed-i', 'furnace-speed-ii'])
    expect(result.awakenSpeedTiers['Furnace']).toBe(2)
  })

  test('accumulates workstation_xp nodes into awakenWorkstationXpTiers', () => {
    const result = parseAwakenUpgrades(['furnace-xp-i', 'furnace-xp-ii', 'furnace-xp-iii'])
    expect(result.awakenWorkstationXpTiers['Furnace']).toBe(3)
  })

  test('closes over prerequisites: a Speed node implies its XP spine', () => {
    // furnace-speed-i is gated behind furnace-xp-ii → furnace-xp-i, so owning it
    // means those two XP nodes are owned even if the save lists only the leaf.
    const result = parseAwakenUpgrades(['furnace-speed-i'])
    expect(result.awakenSpeedTiers['Furnace']).toBe(1)
    expect(result.awakenWorkstationXpTiers['Furnace']).toBe(2)
  })

  test('closes over prerequisites: a gathering Duration node implies its XP spine', () => {
    // mining-duration-i is gated behind mining-xp-ii → mining-xp-i.
    const result = parseAwakenUpgrades(['mining-duration-i'])
    expect(result.awakenGatherUpgrades['Mining'].durationTier).toBe(1)
    expect(result.awakenGatherUpgrades['Mining'].xpTier).toBe(2)
  })

  test('ignores unknown upgrade ids', () => {
    const result = parseAwakenUpgrades(['not-an-upgrade', 'random'])
    expect(result.awakenGoldLevel).toBe(0)
  })
})

describe('parseSave — currentDungeon', () => {
  test('parses active dungeon with creature mapping', () => {
    const save = baseSave()
    save.creatures = [
      { id: 'inst-1', species: 'pudge', experience: 5000 },
      { id: 'inst-2', species: 'finn', experience: 20000 },
    ]
    save.dungeons = {
      activeDungeons: [
        {
          tier: 4,
          focus: 'combat',
          gatheringSkill: null,
          creatures: ['inst-1', 'inst-2'],
        },
      ],
    }

    const config = extractSaveConfig(save)
    expect(config.currentDungeon).toEqual({
      party: ['pudge', 'finn'],
      tier: 4,
      focus: 'combat',
      gatheringSkill: null,
      levels: { pudge: 10, finn: 20 },
    })
  })

  test('parses gathering dungeon with sub-focus', () => {
    const save = baseSave()
    save.creatures = [{ id: 'inst-1', species: 'kroko', experience: 5000 }]
    save.dungeons = {
      activeDungeons: [
        {
          tier: 2,
          focus: 'gathering',
          gatheringSkill: 'Mining',
          creatures: ['inst-1'],
        },
      ],
    }

    const config = extractSaveConfig(save)
    expect(config.currentDungeon).toEqual({
      party: ['kroko'],
      tier: 2,
      focus: 'gathering',
      gatheringSkill: 'Mining',
      levels: { kroko: 10 },
    })
  })

  test('returns null when no active dungeons', () => {
    const save = baseSave()

    const config = extractSaveConfig(save)
    expect(config.currentDungeon).toBeNull()
  })

  test('returns null when dungeons key is missing', () => {
    const save = baseSave()
    delete save.dungeons

    const config = extractSaveConfig(save)
    expect(config.currentDungeon).toBeNull()
  })

  test('filters out creatures not found in creature map', () => {
    const save = baseSave()
    save.creatures = [{ id: 'inst-1', species: 'pudge', experience: 5000 }]
    save.dungeons = {
      activeDungeons: [
        {
          tier: 1,
          focus: 'combat',
          gatheringSkill: null,
          creatures: ['inst-1', 'missing-id'],
        },
      ],
    }

    const config = extractSaveConfig(save)
    expect(config.currentDungeon!.party).toEqual(['pudge'])
    expect(config.currentDungeon!.levels).toEqual({ pudge: 10 })
  })
})
