import { computed, ref, watch, type Ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { xpForLevel, maxLevelForState, PRE_AWAKEN_MAX } from '@/utils/formulas'
import {
  planLevelingPath,
  type BoosterCandidate,
  type LevelingPlan,
} from '@/utils/planner/levelPlanner'

export function useLevelPlanner(
  creatureId: Ref<string>,
  targetLevel: Ref<number>,
  expeditionTierSelections?: { value: Record<string, number[]> },
) {
  const { creatures } = useCreatures()
  const { getLevel, isAwakened, isOwned } = useCreatureCollection()
  const { expeditionToolXpBonus } = useGameConfig()

  const creature = computed(() => creatures.value.find((c) => c.id === creatureId.value) ?? null)

  const awakened = computed(() => (creature.value ? isAwakened(creature.value.id) : false))

  const creatureMaxLevel = computed(() => maxLevelForState(awakened.value))

  const startLevel = computed(() => (creature.value ? getLevel(creature.value.id) : 1))

  /** True when awakened creature is at max level — treated as prestige (re-awaken from level 1) */
  const isPrestige = computed(() => awakened.value && startLevel.value >= creatureMaxLevel.value)

  const isMaxLevel = computed(
    () =>
      !isPrestige.value &&
      startLevel.value >= creatureMaxLevel.value &&
      targetLevel.value <= startLevel.value,
  )

  /** True when the target exceeds the creature's current cap (needs awaken mid-plan) */
  const needsAwaken = computed(() => !awakened.value && targetLevel.value > PRE_AWAKEN_MAX)

  /** The effective start level used for planning (1 for prestige creatures) */
  const effectiveStartLevel = computed(() => (isPrestige.value ? 1 : startLevel.value))

  const totalXpNeeded = computed(() => {
    if (!creature.value) return 0
    if (isPrestige.value) {
      return Math.max(0, xpForLevel(targetLevel.value) - xpForLevel(1))
    }
    if (needsAwaken.value) {
      // XP to reach 70 + XP from 1 to target (post-awaken resets to level 1)
      const preXp = Math.max(0, xpForLevel(PRE_AWAKEN_MAX) - xpForLevel(startLevel.value))
      const postXp = Math.max(0, xpForLevel(targetLevel.value) - xpForLevel(1))
      return preXp + postXp
    }
    return Math.max(0, xpForLevel(targetLevel.value) - xpForLevel(startLevel.value))
  })

  // Step overrides for alternative route selection (keyed by fromLevel)
  const stepOverrides = ref(
    new Map<number, { expeditionId: string; tier: number; toLevel: number }>(),
  )

  const hasOverrides = computed(() => stepOverrides.value.size > 0)

  function selectAlternative(
    fromLevel: number,
    toLevel: number,
    expeditionId: string,
    tier: number,
  ) {
    const next = new Map(stepOverrides.value)
    next.set(fromLevel, { expeditionId, tier, toLevel })
    stepOverrides.value = next
  }

  function resetOverride(fromLevel: number) {
    const next = new Map(stepOverrides.value)
    next.delete(fromLevel)
    stepOverrides.value = next
  }

  function resetAllOverrides() {
    stepOverrides.value = new Map()
  }

  /**
   * Owned non-target creatures eligible to boost the target via party expeditions.
   * The planner ranks candidates by per-expedition rating, so lower-level creatures
   * naturally fall out of the top picks without needing a hard level cutoff here.
   */
  const boosterCandidates = computed<BoosterCandidate[]>(() => {
    if (!creature.value) return []
    const targetId = creature.value.id
    const result: BoosterCandidate[] = []
    for (const c of creatures.value) {
      if (c.id === targetId) continue
      if (!isOwned(c.id)) continue
      result.push({ creature: c, level: getLevel(c.id) })
    }
    return result
  })

  // Calculate-on-demand: plan only computes after calculate() is called.
  const hasCalculated = ref(false)

  const plan = computed<LevelingPlan | null>(() => {
    if (!hasCalculated.value) return null
    if (!creature.value || isMaxLevel.value) return null
    return planLevelingPath({
      creature: creature.value,
      startLevel: effectiveStartLevel.value,
      targetLevel: targetLevel.value,
      isAwakened: awakened.value,
      isPrestige: isPrestige.value,
      swordXpMultiplier: expeditionToolXpBonus.value,
      expeditionTierSelections: expeditionTierSelections?.value,
      stepOverrides: stepOverrides.value.size > 0 ? stepOverrides.value : undefined,
      boosterCandidates: boosterCandidates.value.length > 0 ? boosterCandidates.value : undefined,
    })
  })

  function calculate() {
    resetAllOverrides()
    // Toggle so the plan re-runs even when nothing else changed (Recalculate case)
    hasCalculated.value = false
    hasCalculated.value = true
  }

  // Invalidate the plan when key inputs change so the user must hit Calculate again.
  watch(
    [
      creatureId,
      targetLevel,
      () => expeditionTierSelections?.value,
      expeditionToolXpBonus,
      boosterCandidates,
    ],
    () => {
      hasCalculated.value = false
    },
    { deep: true },
  )

  const overriddenFromLevels = computed(() => new Set(stepOverrides.value.keys()))

  return {
    creature,
    startLevel,
    targetLevel,
    plan,
    needsAwaken,
    totalXpNeeded,
    isMaxLevel,
    creatureMaxLevel,
    selectAlternative,
    resetOverride,
    resetAllOverrides,
    hasOverrides,
    overriddenFromLevels,
    hasCalculated,
    calculate,
  }
}
