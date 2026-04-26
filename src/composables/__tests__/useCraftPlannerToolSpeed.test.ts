import { ref } from 'vue'

import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'
import { useTools } from '@/composables/useTools'

/**
 * coal: Furnace workstation, craftTime = 16 centiseconds, outputAmount = 1
 * Tool: hammer (id) → Furnace (skillId), speedBonusPerLevel = 2% per level
 */

function getCraftMethod(planner: ReturnType<typeof useCraftPlanner>) {
  const methods = planner.rootNode.value!.methods
  return methods.find((m) => m.kind === 'craft' && m.title === 'Furnace')!
}

describe('useCraftPlanner — tool speed mode', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('baseline craft time without tool speed mode', () => {
    const planner = useCraftPlanner(ref('coal'), ref(1))
    const baseTime = getCraftMethod(planner).localTimeSeconds!
    expect(baseTime).toBeGreaterThan(0)
  })

  test('craft time is unchanged when tool has level but speed mode is off', () => {
    const { setToolLevels } = useGameConfig()
    const plannerBefore = useCraftPlanner(ref('coal'), ref(1))
    const timeBefore = getCraftMethod(plannerBefore).localTimeSeconds!

    setToolLevels({ hammer: 10 })

    const plannerAfter = useCraftPlanner(ref('coal'), ref(1))
    const timeAfter = getCraftMethod(plannerAfter).localTimeSeconds!

    expect(timeAfter).toBe(timeBefore)
  })

  test('craft time decreases when tool speed mode is enabled', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()

    const plannerBase = useCraftPlanner(ref('coal'), ref(1))
    const baseTime = getCraftMethod(plannerBase).localTimeSeconds!

    setToolLevels({ hammer: 5 })
    setToolSpeedModes({ Furnace: true })

    const plannerSpeed = useCraftPlanner(ref('coal'), ref(1))
    const speedTime = getCraftMethod(plannerSpeed).localTimeSeconds!

    expect(speedTime).toBeLessThan(baseTime)
  })

  test('higher tool level gives greater speed reduction', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()
    setToolSpeedModes({ Furnace: true })

    setToolLevels({ hammer: 3 })
    const plannerLow = useCraftPlanner(ref('coal'), ref(1))
    const timeLow = getCraftMethod(plannerLow).localTimeSeconds!

    setToolLevels({ hammer: 8 })
    const plannerHigh = useCraftPlanner(ref('coal'), ref(1))
    const timeHigh = getCraftMethod(plannerHigh).localTimeSeconds!

    expect(timeHigh).toBeLessThan(timeLow)
  })

  test('tool speed stacks with awaken speed tiers for greater reduction', () => {
    const { setToolLevels, setToolSpeedModes, setAwakenSpeedTier } = useGameConfig()

    // Awaken only
    setAwakenSpeedTier('Furnace', 2) // 30%
    const plannerAwaken = useCraftPlanner(ref('coal'), ref(1))
    const awakenTime = getCraftMethod(plannerAwaken).localTimeSeconds!

    // Awaken + tool speed
    setToolLevels({ hammer: 10 })
    setToolSpeedModes({ Furnace: true }) // +20%
    const plannerCombined = useCraftPlanner(ref('coal'), ref(1))
    const combinedTime = getCraftMethod(plannerCombined).localTimeSeconds!

    expect(combinedTime).toBeLessThan(awakenTime)
  })

  test('tool speed mode has no effect for level 0 tool', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()

    const plannerBase = useCraftPlanner(ref('coal'), ref(1))
    const baseTime = getCraftMethod(plannerBase).localTimeSeconds!

    setToolLevels({ hammer: 0 })
    setToolSpeedModes({ Furnace: true })

    const plannerZero = useCraftPlanner(ref('coal'), ref(1))
    const zeroTime = getCraftMethod(plannerZero).localTimeSeconds!

    expect(zeroTime).toBe(baseTime)
  })

  test('tool speed mode for one workstation does not affect another', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()

    const plannerBase = useCraftPlanner(ref('coal'), ref(1))
    const baseTime = getCraftMethod(plannerBase).localTimeSeconds!

    setToolLevels({ saw: 10 }) // Workbench tool, not Furnace
    setToolSpeedModes({ Workbench: true })

    const plannerOther = useCraftPlanner(ref('coal'), ref(1))
    const otherTime = getCraftMethod(plannerOther).localTimeSeconds!

    expect(otherTime).toBe(baseTime)
  })

  test('multiple crafts scale time linearly with tool speed', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()
    setToolLevels({ hammer: 10 })
    setToolSpeedModes({ Furnace: true })

    const planner1 = useCraftPlanner(ref('coal'), ref(1))
    const time1 = getCraftMethod(planner1).localTimeSeconds!

    const planner10 = useCraftPlanner(ref('coal'), ref(10))
    const time10 = getCraftMethod(planner10).localTimeSeconds!

    expect(time10).toBeCloseTo(time1 * 10, 4)
  })
})

describe('useCraftPlanner — tool speed detail rows', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('Tool Speed row shows +10% Speed at level 5', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()
    setToolLevels({ hammer: 5 })
    setToolSpeedModes({ Furnace: true })

    const planner = useCraftPlanner(ref('coal'), ref(1))
    const row = getCraftMethod(planner).detailRows.find((r) => r.label === 'Tool Speed')
    expect(row).toBeDefined()
    expect(row!.value).toBe('+10% Speed')
  })

  test('Tool Speed row shows +20% Speed at level 10', () => {
    const { setToolLevels, setToolSpeedModes } = useGameConfig()
    setToolLevels({ hammer: 10 })
    setToolSpeedModes({ Furnace: true })

    const planner = useCraftPlanner(ref('coal'), ref(1))
    const row = getCraftMethod(planner).detailRows.find((r) => r.label === 'Tool Speed')
    expect(row).toBeDefined()
    expect(row!.value).toBe('+20% Speed')
  })

  test('Tool Speed row is absent when speed mode is off', () => {
    const { setToolLevels } = useGameConfig()
    setToolLevels({ hammer: 5 })

    const planner = useCraftPlanner(ref('coal'), ref(1))
    const row = getCraftMethod(planner).detailRows.find((r) => r.label === 'Tool Speed')
    expect(row).toBeUndefined()
  })

  test('Speed Tier row includes Speed unit', () => {
    const { setAwakenSpeedTier } = useGameConfig()
    setAwakenSpeedTier('Furnace', 2)

    const planner = useCraftPlanner(ref('coal'), ref(1))
    const row = getCraftMethod(planner).detailRows.find((r) => r.label === 'Speed Tier')
    expect(row).toBeDefined()
    expect(row!.value).toBe('+30% Speed')
  })

  test('both Speed Tier and Tool Speed rows appear when both active', () => {
    const { setToolLevels, setToolSpeedModes, setAwakenSpeedTier } = useGameConfig()
    setToolLevels({ hammer: 5 })
    setToolSpeedModes({ Furnace: true })
    setAwakenSpeedTier('Furnace', 1)

    const planner = useCraftPlanner(ref('coal'), ref(1))
    const rows = getCraftMethod(planner).detailRows

    expect(rows.find((r) => r.label === 'Speed Tier')).toBeDefined()
    expect(rows.find((r) => r.label === 'Speed Tier')!.value).toBe('+15% Speed')
    expect(rows.find((r) => r.label === 'Tool Speed')).toBeDefined()
    expect(rows.find((r) => r.label === 'Tool Speed')!.value).toBe('+10% Speed')
  })
})

describe('useTools — speed bonus', () => {
  test('speedBonusPerLevel is 2', () => {
    const { speedBonusPerLevel } = useTools()
    expect(speedBonusPerLevel).toBe(2)
  })

  test('getSpeedBonus returns correct bonus per level', () => {
    const { getSpeedBonus } = useTools()
    expect(getSpeedBonus(0)).toBe(0)
    expect(getSpeedBonus(1)).toBe(2)
    expect(getSpeedBonus(5)).toBe(10)
    expect(getSpeedBonus(10)).toBe(20)
  })
})
