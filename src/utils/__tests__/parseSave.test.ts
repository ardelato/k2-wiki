import { extractSaveConfig } from '@/utils/parseSave'

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
