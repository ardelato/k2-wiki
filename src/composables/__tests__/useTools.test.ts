import { useTools } from '@/composables/useTools'

describe('useTools', () => {
  const {
    tools,
    gatheringTools,
    workstationTools,
    otherTools,
    maxLevel,
    xpBonusPerLevel,
    upgradeCosts,
    getToolById,
    getToolBySkillId,
    getUpgradeCost,
    getXpBonus,
  } = useTools()

  test('tools array has 11 entries', () => {
    expect(tools).toHaveLength(11)
  })

  test('maxLevel is 10', () => {
    expect(maxLevel).toBe(10)
  })

  test('xpBonusPerLevel is 5', () => {
    expect(xpBonusPerLevel).toBe(5)
  })

  test('gatheringTools returns 6 tools', () => {
    expect(gatheringTools.value).toHaveLength(6)
    for (const t of gatheringTools.value) {
      expect(t.category).toBe('gathering')
    }
  })

  test('workstationTools returns 3 tools', () => {
    expect(workstationTools.value).toHaveLength(3)
    for (const t of workstationTools.value) {
      expect(t.category).toBe('workstation')
    }
  })

  test('otherTools returns 2 tools', () => {
    expect(otherTools.value).toHaveLength(2)
    for (const t of otherTools.value) {
      expect(t.category).toBe('other')
    }
  })

  test('getToolById returns correct tool', () => {
    const axe = getToolById('axe')
    expect(axe).toBeDefined()
    expect(axe!.name).toBe('Axe')
    expect(axe!.skillId).toBe('Chopping')
    expect(axe!.category).toBe('gathering')
  })

  test('getToolById returns undefined for unknown ID', () => {
    expect(getToolById('nonexistent')).toBeUndefined()
  })

  test('getToolBySkillId returns correct tool', () => {
    const tool = getToolBySkillId('Mining')
    expect(tool).toBeDefined()
    expect(tool!.id).toBe('pickaxe')
  })

  test('getToolBySkillId returns undefined for unknown skill', () => {
    expect(getToolBySkillId('Dancing')).toBeUndefined()
  })

  test('getUpgradeCost returns correct cost for valid levels', () => {
    const cost0 = getUpgradeCost(0)
    expect(cost0).toBeDefined()
    expect(cost0!.barId).toBe('copper-bar')
    expect(cost0!.amount).toBe(50)

    const cost9 = getUpgradeCost(9)
    expect(cost9).toBeDefined()
    expect(cost9!.barId).toBe('arcanum-bar')
    expect(cost9!.amount).toBe(500)
  })

  test('getUpgradeCost returns undefined for out-of-range level', () => {
    expect(getUpgradeCost(10)).toBeUndefined()
    expect(getUpgradeCost(-1)).toBeUndefined()
  })

  test('getXpBonus returns correct bonus', () => {
    expect(getXpBonus(0)).toBe(0)
    expect(getXpBonus(1)).toBe(5)
    expect(getXpBonus(5)).toBe(25)
    expect(getXpBonus(10)).toBe(50)
  })

  test('upgradeCosts has 10 entries', () => {
    expect(upgradeCosts).toHaveLength(10)
  })

  test('all tools have unique IDs', () => {
    const ids = tools.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('all tools have unique skillIds', () => {
    const skillIds = tools.map((t) => t.skillId)
    expect(new Set(skillIds).size).toBe(skillIds.length)
  })
})
