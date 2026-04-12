import { useLocalStorage } from '@vueuse/core'
import { ref, computed, watch, type Ref } from 'vue'

import dungeonData from '@/data/dungeons.json'
import type {
  Creature,
  DungeonConfig,
  DungeonFocus,
  DungeonGradeLetter,
  GatheringSubFocus,
  ExpeditionStatWeights,
} from '@/types'
import {
  calculateDungeonCreatureScore,
  calculateDungeonPartyScore,
  getDungeonGrade,
  getDungeonScaledRewards,
  getRecommendedDungeonCreatures,
} from '@/utils/formulas'

import { useGameConfig } from './useGameConfig'

const config = dungeonData as DungeonConfig

const GRADE_COLORS: Record<DungeonGradeLetter, { text: string; bg: string; border: string }> = {
  S: {
    text: 'text-amber-600 dark:text-amber-300',
    bg: 'bg-amber-100 dark:bg-amber-500/15',
    border: 'border-amber-300 dark:border-amber-500/40',
  },
  A: {
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-500/15',
    border: 'border-emerald-300 dark:border-emerald-500/40',
  },
  B: {
    text: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-100 dark:bg-sky-500/15',
    border: 'border-sky-300 dark:border-sky-500/40',
  },
  C: {
    text: 'text-orange-700 dark:text-orange-400',
    bg: 'bg-orange-100 dark:bg-orange-500/15',
    border: 'border-orange-300 dark:border-orange-500/40',
  },
  F: {
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-500/15',
    border: 'border-red-300 dark:border-red-500/40',
  },
}

const GATHERING_SUB_FOCUSES: GatheringSubFocus[] = [
  'Chopping',
  'Mining',
  'Digging',
  'Farming',
  'Fishing',
  'Exploring',
]

export function useDungeons(creatures: Creature[], collectionLevels?: Ref<Record<string, number>>) {
  const { excludedCreatureIds } = useGameConfig()
  const showExcludedCreatures = ref(false)

  const selectedTier = useLocalStorage<number>('dungeon-tier', 1)
  const selectedFocus = useLocalStorage<DungeonFocus>('dungeon-focus', 'combat')
  const selectedSubFocus = useLocalStorage<GatheringSubFocus>('dungeon-sub-focus', 'Mining')
  const dungeonParty = useLocalStorage<string[]>('dungeon-party', [])
  const creatureLevels = useLocalStorage<Record<string, number>>('dungeon-creature-levels', {})

  // Merge collection levels as defaults behind dungeon-specific levels
  const effectiveLevels = computed<Record<string, number>>(() => {
    if (!collectionLevels?.value) return creatureLevels.value
    return { ...collectionLevels.value, ...creatureLevels.value }
  })

  const partySlots = ref<(Creature | null)[]>([null, null, null])
  const activeSlotIndex = ref<number | null>(null)

  // Restore party from localStorage on init
  const restoreParty = () => {
    const ids = dungeonParty.value
    partySlots.value = Array(config.maxPartySize)
      .fill(null)
      .map((_, i) => {
        const id = ids[i]
        return id ? (creatures.find((c) => c.id === id) ?? null) : null
      })
  }
  restoreParty()

  // Persist party changes
  watch(
    partySlots,
    (slots) => {
      dungeonParty.value = slots.map((s) => s?.id ?? '').filter((id) => id !== '')
    },
    { deep: true },
  )

  const activeStatWeights = computed<ExpeditionStatWeights>(() => {
    return config.statWeights[selectedFocus.value]
  })

  const currentTierConfig = computed(() => {
    return config.tiers.find((t) => t.tier === selectedTier.value) ?? config.tiers[0]
  })

  const partyCreatureIds = computed(() => {
    return new Set(partySlots.value.filter(Boolean).map((c) => c!.id))
  })

  const partyScore = computed(() => {
    return calculateDungeonPartyScore(
      partySlots.value,
      activeStatWeights.value,
      effectiveLevels.value,
    )
  })

  const currentGrade = computed(() => {
    if (partySlots.value.every((s) => s === null)) return null
    return getDungeonGrade(partyScore.value, currentTierConfig.value.baseRating, config.grades)
  })

  const gradeClasses = computed(() => {
    if (!currentGrade.value) return undefined
    return GRADE_COLORS[currentGrade.value.grade]
  })

  const scoreRatio = computed(() => {
    const base = currentTierConfig.value.baseRating
    if (base <= 0 || partyScore.value <= 0) return null
    return partyScore.value / base
  })

  const predictedXP = computed(() => {
    if (!currentGrade.value) return null
    return currentTierConfig.value.xpReward
  })

  const baseRewards = computed(() => {
    const tier = String(selectedTier.value)
    if (selectedFocus.value === 'combat') {
      return config.combatRewards[tier] ?? []
    }
    const subFocusRewards = config.gatheringRewards[selectedSubFocus.value]
    return subFocusRewards?.[tier] ?? []
  })

  const predictedRewards = computed(() => {
    if (!currentGrade.value) return []
    return getDungeonScaledRewards(baseRewards.value, currentGrade.value.multiplier)
  })

  const recommendedCreatures = computed(() => {
    const pool = creatures.filter(
      (c) =>
        !partyCreatureIds.value.has(c.id) &&
        (showExcludedCreatures.value || !excludedCreatureIds.value.has(c.id)),
    )
    const base = getRecommendedDungeonCreatures(
      pool,
      activeStatWeights.value,
      effectiveLevels.value,
    )
    const remainingScore = currentTierConfig.value.baseRating - partyScore.value
    return base.map((entry) => {
      let weightedStatSum = 0
      for (const [stat, weight] of Object.entries(activeStatWeights.value) as [
        keyof typeof entry.creature.stats,
        number,
      ][]) {
        if (weight > 0) {
          weightedStatSum += entry.creature.stats[stat] * weight
        }
      }
      let suggestedLevel: number | null = null
      if (weightedStatSum > 0) {
        suggestedLevel = Math.max(1, Math.min(120, Math.ceil(remainingScore / weightedStatSum)))
      }
      return { ...entry, suggestedLevel }
    })
  })

  const assignCreatureToSlot = (creature: Creature) => {
    const slots = partySlots.value
    if (
      activeSlotIndex.value !== null &&
      activeSlotIndex.value < slots.length &&
      !slots[activeSlotIndex.value]
    ) {
      slots[activeSlotIndex.value] = creature
      activeSlotIndex.value = null
      return
    }
    const emptyIndex = slots.findIndex((s) => s === null)
    if (emptyIndex !== -1) {
      slots[emptyIndex] = creature
      activeSlotIndex.value = null
    }
  }

  const removeCreatureFromSlot = (index: number) => {
    if (index >= 0 && index < partySlots.value.length) {
      partySlots.value[index] = null
    }
  }

  const setActiveSlot = (index: number) => {
    if (activeSlotIndex.value === index) {
      activeSlotIndex.value = null
    } else {
      activeSlotIndex.value = index
    }
  }

  const getCreatureSlotScore = (creature: Creature) => {
    const level = effectiveLevels.value[creature.id] || 1
    return calculateDungeonCreatureScore(creature, activeStatWeights.value, level)
  }

  const updateCreatureLevel = (creatureId: string, level: number) => {
    creatureLevels.value[creatureId] = Math.max(1, Math.min(120, level))
  }

  return {
    config,
    selectedTier,
    selectedFocus,
    selectedSubFocus,
    partySlots,
    activeSlotIndex,
    creatureLevels,
    effectiveLevels,
    activeStatWeights,
    currentTierConfig,
    partyScore,
    currentGrade,
    gradeClasses,
    scoreRatio,
    predictedXP,
    predictedRewards,
    recommendedCreatures,
    showExcludedCreatures,
    assignCreatureToSlot,
    removeCreatureFromSlot,
    setActiveSlot,
    getCreatureSlotScore,
    updateCreatureLevel,
    GRADE_COLORS,
    GATHERING_SUB_FOCUSES,
  }
}
