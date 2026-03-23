import { computed, type Ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { xpForLevel, maxLevelForState, PRE_AWAKEN_MAX } from '@/utils/formulas'
import { planLevelingPath, type LevelingPlan } from '@/utils/levelPlanner'

export function useLevelPlanner(creatureId: Ref<string>, targetLevel: Ref<number>) {
  const { creatures } = useCreatures()
  const { getLevel, isAwakened } = useCreatureCollection()

  const creature = computed(() => creatures.value.find((c) => c.id === creatureId.value) ?? null)

  const awakened = computed(() => (creature.value ? isAwakened(creature.value.id) : false))

  const creatureMaxLevel = computed(() => maxLevelForState(awakened.value))

  const startLevel = computed(() => (creature.value ? getLevel(creature.value.id) : 1))

  const isMaxLevel = computed(
    () => startLevel.value >= creatureMaxLevel.value && targetLevel.value <= startLevel.value,
  )

  /** True when the target exceeds the creature's current cap (needs awaken mid-plan) */
  const needsAwaken = computed(() => !awakened.value && targetLevel.value > PRE_AWAKEN_MAX)

  const totalXpNeeded = computed(() => {
    if (!creature.value) return 0
    if (needsAwaken.value) {
      // XP to reach 70 + XP from 1 to target (post-awaken resets to level 1)
      const preXp = Math.max(0, xpForLevel(PRE_AWAKEN_MAX) - xpForLevel(startLevel.value))
      const postXp = Math.max(0, xpForLevel(targetLevel.value) - xpForLevel(1))
      return preXp + postXp
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
    needsAwaken,
    totalXpNeeded,
    isMaxLevel,
    creatureMaxLevel,
  }
}
