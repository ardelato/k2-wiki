import { useExpeditionMaxTiers } from '@/composables/useExpeditionMaxTiers'
import { useGameConfig } from '@/composables/useGameConfig'
import expeditionsData from '@/data/expeditions.json'
import type { Expedition } from '@/types'

const allExpeditions = expeditionsData as Expedition[]

// Find an expedition that requires 0 completions (always unlocked)
const freeExpedition = allExpeditions.find((e) => e.requiredExpeditionCompletions === 0)!
// Find an expedition that requires completions to unlock
const lockedExpedition = allExpeditions.find((e) => e.requiredExpeditionCompletions > 0)!

describe('useExpeditionMaxTiers', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
    const { expeditionMaxTierOverrides, includeAllExpeditions } = useExpeditionMaxTiers()
    expeditionMaxTierOverrides.value = {}
    includeAllExpeditions.value = false
  })

  describe('defaultExpeditionMaxTiers', () => {
    test('returns tier 1 for expeditions with 0 required completions and no completion data', () => {
      const { defaultExpeditionMaxTiers } = useExpeditionMaxTiers()
      expect(defaultExpeditionMaxTiers.value[freeExpedition.id]).toBe(1)
    })

    test('returns 0 for expeditions requiring completions when none exist', () => {
      const { defaultExpeditionMaxTiers } = useExpeditionMaxTiers()
      expect(defaultExpeditionMaxTiers.value[lockedExpedition.id]).toBe(0)
    })

    test('returns correct max tier based on completion data', () => {
      const { setExpeditionCompletions } = useGameConfig()
      // Unlock tier 2 by having 5 completions of tier 1, and enough total to unlock the expedition
      const completions: Record<string, Record<number, number>> = {}
      // Ensure enough total completions to unlock the expedition
      completions[freeExpedition.id] = { 1: lockedExpedition.requiredExpeditionCompletions }
      completions[lockedExpedition.id] = { 1: 5 }
      setExpeditionCompletions(completions)

      const { defaultExpeditionMaxTiers } = useExpeditionMaxTiers()
      expect(defaultExpeditionMaxTiers.value[lockedExpedition.id]).toBe(2)
    })
  })

  describe('effectiveExpeditionMaxTiers', () => {
    test('returns empty object when includeAllExpeditions is true', () => {
      const { effectiveExpeditionMaxTiers, includeAllExpeditions } = useExpeditionMaxTiers()
      includeAllExpeditions.value = true
      expect(effectiveExpeditionMaxTiers.value).toEqual({})
    })

    test('uses overrides when present', () => {
      const { effectiveExpeditionMaxTiers, expeditionMaxTierOverrides } = useExpeditionMaxTiers()
      expeditionMaxTierOverrides.value = { [freeExpedition.id]: 3 }
      expect(effectiveExpeditionMaxTiers.value[freeExpedition.id]).toBe(3)
    })

    test('falls back to defaults when no override exists', () => {
      const { effectiveExpeditionMaxTiers } = useExpeditionMaxTiers()
      // Free expedition should use default tier 1
      expect(effectiveExpeditionMaxTiers.value[freeExpedition.id]).toBe(1)
      // Locked expedition should use default tier 0
      expect(effectiveExpeditionMaxTiers.value[lockedExpedition.id]).toBe(0)
    })

    test('override is kept even if it matches default', () => {
      const { effectiveExpeditionMaxTiers, expeditionMaxTierOverrides } = useExpeditionMaxTiers()
      // Set override to match default (tier 1 for free expedition)
      expeditionMaxTierOverrides.value = { [freeExpedition.id]: 1 }
      // Override is still stored (composable doesn't auto-remove)
      expect(freeExpedition.id in expeditionMaxTierOverrides.value).toBe(true)
      expect(effectiveExpeditionMaxTiers.value[freeExpedition.id]).toBe(1)
    })

    test('covers all expeditions in the result', () => {
      const { effectiveExpeditionMaxTiers } = useExpeditionMaxTiers()
      for (const exp of allExpeditions) {
        expect(exp.id in effectiveExpeditionMaxTiers.value).toBe(true)
      }
    })
  })
})
