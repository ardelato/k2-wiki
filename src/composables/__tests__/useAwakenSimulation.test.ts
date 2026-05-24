import { useAwakenSimulation } from '@/composables/useAwakenSimulation'
import { useGameConfig } from '@/composables/useGameConfig'

function resetSim() {
  const { resetGameConfig } = useGameConfig()
  resetGameConfig()
  const { simAdded, simRemoved } = useAwakenSimulation()
  simAdded.value = []
  simRemoved.value = []
}

describe('useAwakenSimulation', () => {
  beforeEach(() => {
    resetSim()
  })

  test('savedIds is empty when no upgrades are configured', () => {
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.size).toBe(0)
  })

  test('savedIds reflects gather yield upgrades', () => {
    const { setAwakenGatherYieldBonus } = useGameConfig()
    setAwakenGatherYieldBonus('Chopping', 2)
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.has('chopping-yield-i')).toBe(true)
    expect(savedIds.value.has('chopping-yield-ii')).toBe(true)
  })

  test('savedIds reflects gather duration upgrades', () => {
    const { setAwakenGatherDurationTier } = useGameConfig()
    setAwakenGatherDurationTier('Mining', 3)
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.has('mining-duration-i')).toBe(true)
    expect(savedIds.value.has('mining-duration-ii')).toBe(true)
    expect(savedIds.value.has('mining-duration-iii')).toBe(true)
  })

  test('savedIds reflects workstation speed tiers', () => {
    const { setAwakenSpeedTier } = useGameConfig()
    setAwakenSpeedTier('Furnace', 2)
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.has('furnace-speed-i')).toBe(true)
    expect(savedIds.value.has('furnace-speed-ii')).toBe(true)
  })

  test('savedIds reflects awaken gold level', () => {
    const { setAwakenGoldLevel } = useGameConfig()
    setAwakenGoldLevel(3)
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.has('awaken-gold-i')).toBe(true)
    expect(savedIds.value.has('awaken-gold-ii')).toBe(true)
    expect(savedIds.value.has('awaken-gold-iii')).toBe(true)
  })

  test('savedIds includes prerequisite upgrades transitively', () => {
    // chopping-yield-i requires chopping-xp-ii, which requires chopping-xp-i
    const { setAwakenGatherYieldBonus } = useGameConfig()
    setAwakenGatherYieldBonus('Chopping', 1)
    const { savedIds } = useAwakenSimulation()
    expect(savedIds.value.has('chopping-yield-i')).toBe(true)
    expect(savedIds.value.has('chopping-xp-ii')).toBe(true)
    expect(savedIds.value.has('chopping-xp-i')).toBe(true)
  })

  test('effectiveIds equals savedIds when no simulation deltas exist', () => {
    const { setAwakenGoldLevel } = useGameConfig()
    setAwakenGoldLevel(2)
    const { savedIds, effectiveIds } = useAwakenSimulation()
    expect([...effectiveIds.value].toSorted()).toEqual([...savedIds.value].toSorted())
  })

  test('simAdded extends effectiveIds beyond savedIds', () => {
    const { simAdded, savedIds, effectiveIds } = useAwakenSimulation()
    simAdded.value = ['awaken-gold-i']
    expect(savedIds.value.has('awaken-gold-i')).toBe(false)
    expect(effectiveIds.value.has('awaken-gold-i')).toBe(true)
  })

  test('simRemoved drops ids from effectiveIds even if saved', () => {
    const { setAwakenGoldLevel } = useGameConfig()
    setAwakenGoldLevel(1)
    const { simRemoved, savedIds, effectiveIds } = useAwakenSimulation()
    simRemoved.value = ['awaken-gold-i']
    expect(savedIds.value.has('awaken-gold-i')).toBe(true)
    expect(effectiveIds.value.has('awaken-gold-i')).toBe(false)
  })

  test('effectiveAwakenGoldLevel reflects saved + simulation deltas', () => {
    const { setAwakenGoldLevel } = useGameConfig()
    setAwakenGoldLevel(1)
    const { effectiveAwakenGoldLevel, simAdded } = useAwakenSimulation()
    expect(effectiveAwakenGoldLevel.value).toBe(1)

    simAdded.value = ['awaken-gold-ii']
    expect(effectiveAwakenGoldLevel.value).toBe(2)
  })

  test('effectiveAwakenSpeedTiers reflects simulation additions', () => {
    const { effectiveAwakenSpeedTiers, simAdded } = useAwakenSimulation()
    expect(effectiveAwakenSpeedTiers.value['Furnace']).toBe(0)
    simAdded.value = ['furnace-speed-i']
    expect(effectiveAwakenSpeedTiers.value['Furnace']).toBe(1)
  })

  test('effectiveAwakenGatherUpgrades reflects simulation additions for yield', () => {
    const { effectiveAwakenGatherUpgrades, simAdded } = useAwakenSimulation()
    expect(effectiveAwakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(0)
    simAdded.value = ['chopping-yield-i']
    expect(effectiveAwakenGatherUpgrades.value['Chopping'].yieldBonus).toBe(1)
  })

  test('effectiveAwakenGatherUpgrades reflects simulation additions for duration', () => {
    const { effectiveAwakenGatherUpgrades, simAdded } = useAwakenSimulation()
    expect(effectiveAwakenGatherUpgrades.value['Mining'].durationTier).toBe(0)
    simAdded.value = ['mining-duration-i', 'mining-duration-ii']
    expect(effectiveAwakenGatherUpgrades.value['Mining'].durationTier).toBe(2)
  })

  test('simRemoved on a saved tier reduces effectiveAwakenSpeedTiers', () => {
    const { setAwakenSpeedTier } = useGameConfig()
    setAwakenSpeedTier('Furnace', 2)
    const { effectiveAwakenSpeedTiers, simRemoved } = useAwakenSimulation()
    expect(effectiveAwakenSpeedTiers.value['Furnace']).toBe(2)
    simRemoved.value = ['furnace-speed-ii']
    expect(effectiveAwakenSpeedTiers.value['Furnace']).toBe(1)
  })
})
