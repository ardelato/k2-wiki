import { useMachines } from '@/composables/useMachines'

describe('useMachines', () => {
  const {
    machines,
    generators,
    processors,
    maxLevel,
    upgradeCosts,
    speedMultipliers,
    getMachineById,
    getUpgradeCost,
    getSpeedMultiplier,
    getInterval,
  } = useMachines()

  test('machines array has 9 entries', () => {
    expect(machines).toHaveLength(9)
  })

  test('maxLevel is 10', () => {
    expect(maxLevel).toBe(10)
  })

  test('generators returns only generator-type machines', () => {
    expect(generators.value.length).toBe(3)
    for (const m of generators.value) {
      expect(m.machineType).toBe('generator')
    }
  })

  test('processors returns only processor-type machines', () => {
    expect(processors.value.length).toBe(6)
    for (const m of processors.value) {
      expect(m.machineType).toBe('processor')
    }
  })

  test('getMachineById returns correct machine', () => {
    const smelter = getMachineById('smelter')
    expect(smelter).toBeDefined()
    expect(smelter!.name).toBe('Smelter')
    expect(smelter!.machineType).toBe('processor')
  })

  test('getMachineById returns undefined for unknown ID', () => {
    expect(getMachineById('nonexistent')).toBeUndefined()
  })

  test('getUpgradeCost returns correct cost for valid levels', () => {
    const cost0 = getUpgradeCost(0)
    expect(cost0).toBeDefined()
    expect(cost0!.barId).toBe('copper-bar')
    expect(cost0!.barAmount).toBe(100)
    expect(cost0!.planksAmount).toBe(100)

    const cost9 = getUpgradeCost(9)
    expect(cost9).toBeDefined()
    expect(cost9!.barId).toBe('arcanum-bar')
  })

  test('getUpgradeCost returns undefined for out-of-range level', () => {
    expect(getUpgradeCost(10)).toBeUndefined()
    expect(getUpgradeCost(-1)).toBeUndefined()
  })

  test('speedMultipliers has 11 entries (level 0 through 10)', () => {
    expect(speedMultipliers).toHaveLength(11)
  })

  test('getSpeedMultiplier returns 1.0 at level 0', () => {
    expect(getSpeedMultiplier(0)).toBe(1.0)
  })

  test('getSpeedMultiplier decreases with level', () => {
    expect(getSpeedMultiplier(1)).toBe(0.9)
    expect(getSpeedMultiplier(5)).toBe(0.56)
    expect(getSpeedMultiplier(10)).toBe(0.28)
  })

  test('getSpeedMultiplier clamps at max level', () => {
    expect(getSpeedMultiplier(99)).toBe(0.28)
  })

  test('getInterval calculates correctly for stone-quarry at level 0', () => {
    // Stone Quarry: baseInterval 60, level 0 multiplier 1.0
    expect(getInterval('stone-quarry', 0)).toBe(60)
  })

  test('getInterval reduces with higher levels', () => {
    // Stone Quarry: baseInterval 60, level 1 multiplier 0.9 → 54
    expect(getInterval('stone-quarry', 1)).toBe(54)
    // Level 10 multiplier 0.28 → floor(60 * 0.28) = 16
    expect(getInterval('stone-quarry', 10)).toBe(16)
  })

  test('getInterval returns 60 for unknown machine', () => {
    expect(getInterval('nonexistent', 0)).toBe(60)
  })

  test('upgradeCosts has 10 entries', () => {
    expect(upgradeCosts).toHaveLength(10)
  })

  test('all generators have outputItemId set', () => {
    for (const m of generators.value) {
      expect(m.outputItemId).not.toBeNull()
    }
  })

  test('all processors have recipes', () => {
    for (const m of processors.value) {
      expect(m.recipes.length).toBeGreaterThan(0)
    }
  })
})
