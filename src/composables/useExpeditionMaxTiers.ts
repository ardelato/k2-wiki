import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import { getMaxUnlockedTier, getTotalCompletedExpeditions } from '@/utils/expeditionUnlocks'
import { expeditions as allExpeditions } from '@/utils/precomputedTables'

export function useExpeditionMaxTiers() {
  const { expeditionCompletions } = useGameConfig()
  const expeditionMaxTierOverrides = useLocalStorage<Record<string, number>>(
    'planner-expedition-max-tiers',
    {},
  )
  const includeAllExpeditions = useLocalStorage<boolean>('planner-include-all-expeditions', false)

  /** Default max tiers derived from unlock state (no user overrides) */
  const defaultExpeditionMaxTiers = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    const completions = expeditionCompletions.value
    const totalCompletions = getTotalCompletedExpeditions(completions)

    for (const exp of allExpeditions) {
      const unlocked = totalCompletions >= exp.requiredExpeditionCompletions
      result[exp.id] = unlocked ? getMaxUnlockedTier(exp.id, completions) : 0
    }
    return result
  })

  const effectiveExpeditionMaxTiers = computed<Record<string, number>>(() => {
    if (includeAllExpeditions.value) return {}

    const defaults = defaultExpeditionMaxTiers.value
    const result: Record<string, number> = {}

    for (const exp of allExpeditions) {
      if (exp.id in expeditionMaxTierOverrides.value) {
        result[exp.id] = expeditionMaxTierOverrides.value[exp.id]
      } else {
        result[exp.id] = defaults[exp.id] ?? 0
      }
    }
    return result
  })

  return {
    expeditionMaxTierOverrides,
    includeAllExpeditions,
    defaultExpeditionMaxTiers,
    effectiveExpeditionMaxTiers,
  }
}
