import { computed, type Ref } from 'vue'
import { useCreatures } from '@/composables/useCreatures'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { planLevelingPath, type LevelingPlan } from '@/utils/levelPlanner'
import { xpForLevel, maxLevelForState, PRE_AWAKEN_MAX } from '@/utils/formulas'

export function useLevelPlanner(
  creatureId: Ref<string>,
  targetLevel: Ref<number>,
) {
  const { creatures } = useCreatures()
  const { getLevel, isAwakened: getIsAwakened } = useCreatureCollection()

  const creature = computed(() =>
    creatures.value.find(c => c.id === creatureId.value) ?? null,
  )

  const startLevel = computed(() =>
    creature.value ? getLevel(creature.value.id) : 1,
  )

  const awakened = computed(() =>
    creature.value ? getIsAwakened(creature.value.id) : false,
  )

  const isMaxLevel = computed(() =>
    startLevel.value >= maxLevelForState(awakened.value) && targetLevel.value <= startLevel.value,
  )

  const totalXpNeeded = computed(() => {
    if (!creature.value) return 0
    // If unawakened and targeting past 70: XP for start→70 + XP for 1→target (level resets on awaken)
    if (!awakened.value && targetLevel.value > PRE_AWAKEN_MAX && startLevel.value <= PRE_AWAKEN_MAX) {
      const preAwakenXp = xpForLevel(PRE_AWAKEN_MAX) - xpForLevel(startLevel.value)
      const postAwakenXp = xpForLevel(targetLevel.value) - xpForLevel(1)
      return Math.max(0, preAwakenXp + postAwakenXp)
    }
    return Math.max(0, xpForLevel(targetLevel.value) - xpForLevel(startLevel.value))
  })

  const plan = computed<LevelingPlan | null>(() => {
    if (!creature.value || isMaxLevel.value) return null
    return planLevelingPath({
      creature: creature.value,
      startLevel: startLevel.value,
      targetLevel: targetLevel.value,
      isAwakened: awakened.value,
    })
  })

  return {
    creature,
    startLevel,
    targetLevel,
    plan,
    totalXpNeeded,
    isMaxLevel,
    awakened,
  }
}
