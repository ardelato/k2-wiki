import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import { getMaxUnlockedTier, getTotalCompletedExpeditions } from '@/utils/planner/expeditionUnlocks'
import { expeditions as allExpeditions } from '@/utils/save/precomputedTables'

function tiersUpTo(max: number): number[] {
  const result: number[] = []
  for (let i = 1; i <= max; i++) result.push(i)
  return result
}

export function useExpeditionTierSelections() {
  const { expeditionCompletions } = useGameConfig()
  const expeditionTierOverrides = useLocalStorage<Record<string, number[]>>(
    'planner-expedition-tier-selections',
    {},
  )
  const includeAllExpeditions = useLocalStorage<boolean>('planner-include-all-expeditions', false)

  /** Default tier selections derived from unlock state (no user overrides) */
  const defaultExpeditionTierSelections = computed<Record<string, number[]>>(() => {
    const result: Record<string, number[]> = {}
    const completions = expeditionCompletions.value
    const totalCompletions = getTotalCompletedExpeditions(completions)

    for (const exp of allExpeditions) {
      const unlocked = totalCompletions >= exp.requiredExpeditionCompletions
      result[exp.id] = unlocked ? tiersUpTo(getMaxUnlockedTier(exp.id, completions)) : []
    }
    return result
  })

  const effectiveExpeditionTierSelections = computed<Record<string, number[]>>(() => {
    if (includeAllExpeditions.value) return {}

    const defaults = defaultExpeditionTierSelections.value
    const result: Record<string, number[]> = {}

    for (const exp of allExpeditions) {
      if (exp.id in expeditionTierOverrides.value) {
        result[exp.id] = expeditionTierOverrides.value[exp.id]
      } else {
        result[exp.id] = defaults[exp.id] ?? []
      }
    }
    return result
  })

  return {
    expeditionTierOverrides,
    includeAllExpeditions,
    defaultExpeditionTierSelections,
    effectiveExpeditionTierSelections,
  }
}
