import { useExpeditionTierSelections } from '@/composables/useExpeditionTierSelections'
import { useGameConfig } from '@/composables/useGameConfig'
import expeditionsData from '@/data/expeditions.json'
import type { Expedition } from '@/types'

const allExpeditions = expeditionsData as Expedition[]

// Find an expedition that requires 0 completions (always unlocked)
const freeExpedition = allExpeditions.find((e) => e.requiredExpeditionCompletions === 0)!
// Find an expedition that requires completions to unlock
const lockedExpedition = allExpeditions.find((e) => e.requiredExpeditionCompletions > 0)!

describe('useExpeditionTierSelections', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
    const { expeditionTierOverrides, includeAllExpeditions } = useExpeditionTierSelections()
    expeditionTierOverrides.value = {}
    includeAllExpeditions.value = false
  })

  describe('defaultExpeditionTierSelections', () => {
    test('returns [1] for expeditions with 0 required completions and no completion data', () => {
      const { defaultExpeditionTierSelections } = useExpeditionTierSelections()
      expect(defaultExpeditionTierSelections.value[freeExpedition.id]).toEqual([1])
    })

    test('returns [] for expeditions requiring completions when none exist', () => {
      const { defaultExpeditionTierSelections } = useExpeditionTierSelections()
      expect(defaultExpeditionTierSelections.value[lockedExpedition.id]).toEqual([])
    })

    test('returns correct tiers based on completion data', () => {
      const { setExpeditionCompletions } = useGameConfig()
      const completions: Record<string, Record<number, number>> = {}
      completions[freeExpedition.id] = { 1: lockedExpedition.requiredExpeditionCompletions }
      completions[lockedExpedition.id] = { 1: 5 }
      setExpeditionCompletions(completions)

      const { defaultExpeditionTierSelections } = useExpeditionTierSelections()
      expect(defaultExpeditionTierSelections.value[lockedExpedition.id]).toEqual([1, 2])
    })
  })

  describe('effectiveExpeditionTierSelections', () => {
    test('returns empty object when includeAllExpeditions is true', () => {
      const { effectiveExpeditionTierSelections, includeAllExpeditions } =
        useExpeditionTierSelections()
      includeAllExpeditions.value = true
      expect(effectiveExpeditionTierSelections.value).toEqual({})
    })

    test('uses overrides when present', () => {
      const { effectiveExpeditionTierSelections, expeditionTierOverrides } =
        useExpeditionTierSelections()
      expeditionTierOverrides.value = { [freeExpedition.id]: [3, 4, 5] }
      expect(effectiveExpeditionTierSelections.value[freeExpedition.id]).toEqual([3, 4, 5])
    })

    test('falls back to defaults when no override exists', () => {
      const { effectiveExpeditionTierSelections } = useExpeditionTierSelections()
      expect(effectiveExpeditionTierSelections.value[freeExpedition.id]).toEqual([1])
      expect(effectiveExpeditionTierSelections.value[lockedExpedition.id]).toEqual([])
    })

    test('override is kept even if it matches default', () => {
      const { effectiveExpeditionTierSelections, expeditionTierOverrides } =
        useExpeditionTierSelections()
      expeditionTierOverrides.value = { [freeExpedition.id]: [1] }
      expect(freeExpedition.id in expeditionTierOverrides.value).toBe(true)
      expect(effectiveExpeditionTierSelections.value[freeExpedition.id]).toEqual([1])
    })

    test('covers all expeditions in the result', () => {
      const { effectiveExpeditionTierSelections } = useExpeditionTierSelections()
      for (const exp of allExpeditions) {
        expect(exp.id in effectiveExpeditionTierSelections.value).toBe(true)
      }
    })

    test('allows excluding lower tiers while keeping higher tiers', () => {
      const { effectiveExpeditionTierSelections, expeditionTierOverrides } =
        useExpeditionTierSelections()
      expeditionTierOverrides.value = { [freeExpedition.id]: [3, 4, 5] }
      const tiers = effectiveExpeditionTierSelections.value[freeExpedition.id]
      expect(tiers).toEqual([3, 4, 5])
      expect(tiers).not.toContain(1)
      expect(tiers).not.toContain(2)
    })
  })
})
