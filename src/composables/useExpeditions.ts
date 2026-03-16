import { ref, computed, watch } from 'vue'
import type { Creature, Expedition, Biome } from '@/types'
import expeditionsData from '@/data/expeditions.json'
import biomesData from '@/data/biomes.json'
import {
  calculateCreatureRating,
  calculateDifficultyRating,
  calculatePartyScore,
  calculateDuration,
  calculateExpeditionXp,
  estimateCompletionTime,
  xpForLevel,
  levelFromXp,
  getRecommendedCreatures,
  getLoopXpBonus,
  biomeMultiplier,
} from '@/utils/formulas'

const expeditions = ref<Expedition[]>(expeditionsData as Expedition[])
const biomes = ref<Biome[]>(biomesData as Biome[])

export function useExpeditions(creatures: Creature[]) {
  const searchQuery = ref('')
  const biomeFilter = ref<string | 'all'>('all')
  const selectedExpedition = ref<Expedition | null>(null)
  const selectedTier = ref(1)
  const partySlots = ref<(Creature | null)[]>([])
  const activeSlotIndex = ref<number | null>(null)
  const creatureLevels = ref<Record<string, number>>({})

  const filteredExpeditions = computed(() => {
    return expeditions.value
      .filter((exp) => {
        const matchesSearch =
          exp.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          exp.biome.toLowerCase().includes(searchQuery.value.toLowerCase())
        const matchesBiome =
          biomeFilter.value === 'all' || exp.biome === biomeFilter.value
        return matchesSearch && matchesBiome
      })
      .sort((a, b) => {
        const aNum = parseInt(a.id.replace(/\D/g, ''), 10) || 0
        const bNum = parseInt(b.id.replace(/\D/g, ''), 10) || 0
        return aNum - bNum
      })
  })

  // Reset party slots when expedition changes
  watch(selectedExpedition, (exp) => {
    if (exp) {
      partySlots.value = Array(exp.maxPartySize).fill(null)
    } else {
      partySlots.value = []
    }
    activeSlotIndex.value = null
  })

  const getBiome = (id: string): Biome | undefined => {
    return biomes.value.find(b => b.id === id)
  }

  const currentBiome = computed(() => {
    if (!selectedExpedition.value) return undefined
    return getBiome(selectedExpedition.value.biome)
  })

  const partyCreatureIds = computed(() => {
    return new Set(partySlots.value.filter(Boolean).map(c => c!.id))
  })

  const recommendedCreatures = computed(() => {
    if (!selectedExpedition.value) return []
    const expedition = selectedExpedition.value
    const biome = currentBiome.value
    const remainingScore = difficultyRating.value - partyScore.value
    const base = getRecommendedCreatures(
      creatures.filter(c => !partyCreatureIds.value.has(c.id)),
      expedition,
      creatureLevels.value,
      biome
    )
    return base.map(entry => {
      let weightedStatSum = 0
      for (const [stat, weight] of Object.entries(expedition.statWeights) as [keyof typeof entry.creature.stats, number][]) {
        if (weight > 0) {
          weightedStatSum += entry.creature.stats[stat] * weight
        }
      }
      let suggestedLevel: number | null = null
      if (weightedStatSum > 0) {
        const biomeMult = biome ? biomeMultiplier(entry.creature, biome) : 1.0
        const traitBonus = entry.creature.trait === expedition.trait ? 1.5 : 1.0
        const ratingPerLevel = weightedStatSum * biomeMult * traitBonus
        suggestedLevel = Math.max(1, Math.min(120, Math.ceil(remainingScore / ratingPerLevel)))
      }
      return { ...entry, suggestedLevel }
    })
  })

  const difficultyRating = computed(() => {
    if (!selectedExpedition.value) return 0
    return calculateDifficultyRating(selectedExpedition.value, selectedTier.value)
  })

  const partyScore = computed(() => {
    if (!selectedExpedition.value) return 0
    return calculatePartyScore(
      partySlots.value,
      selectedExpedition.value,
      creatureLevels.value,
      currentBiome.value
    )
  })

  const estimatedDuration = computed(() => {
    if (!selectedExpedition.value || partyScore.value <= 0) return null
    return calculateDuration(partyScore.value, selectedExpedition.value, selectedTier.value)
  })

  const estimatedDurationMinutes = computed(() => {
    if (!selectedExpedition.value || partyScore.value <= 0) return null
    return estimateCompletionTime(partyScore.value, selectedExpedition.value, selectedTier.value)
  })

  const scoreRatio = computed(() => {
    if (difficultyRating.value <= 0 || partyScore.value <= 0) return null
    return partyScore.value / difficultyRating.value
  })

  const loopCount = ref(0)

  const loopBonusPercent = computed(() => {
    return Math.round(getLoopXpBonus(loopCount.value) * 100)
  })

  const totalXp = computed(() => {
    if (!selectedExpedition.value) return null
    const activeCreatures = partySlots.value.filter(Boolean).length
    if (activeCreatures <= 0) return null
    return calculateExpeditionXp(
      selectedExpedition.value,
      selectedTier.value,
      loopCount.value,
      activeCreatures
    )
  })

  const xpPerMinute = computed(() => {
    if (!totalXp.value || !estimatedDuration.value || estimatedDuration.value <= 0) return null
    return Math.round(totalXp.value / (estimatedDuration.value / 60))
  })

  const levelsGained = computed(() => {
    if (!totalXp.value) return null
    const startXp = xpForLevel(1)
    const endLevel = Math.min(120, levelFromXp(startXp + totalXp.value))
    return endLevel - 1
  })

  const partyXpProgress = computed(() => {
    if (!totalXp.value) return []
    return partySlots.value
      .filter((c): c is Creature => c !== null)
      .map(creature => {
        const currentLevel = creatureLevels.value[creature.id] || 1
        const startXp = xpForLevel(currentLevel)
        const endXp = startXp + totalXp.value!
        const endLevel = Math.min(120, levelFromXp(endXp))
        const targetLevel = Math.min(120, endLevel + 1)
        const xpIntoLevel = endXp - xpForLevel(endLevel)
        const xpNeeded = xpForLevel(targetLevel) - xpForLevel(endLevel)
        const progress = xpNeeded > 0 ? xpIntoLevel / xpNeeded : 0
        return {
          creature,
          currentLevel,
          targetLevel: endLevel >= 120 ? 120 : targetLevel,
          progress: endLevel >= 120 ? 1 : Math.min(1, progress),
        }
      })
  })

  const assignCreatureToSlot = (creature: Creature) => {
    const slots = partySlots.value
    // If there's an active slot, fill it
    if (activeSlotIndex.value !== null && activeSlotIndex.value < slots.length && !slots[activeSlotIndex.value]) {
      slots[activeSlotIndex.value] = creature
      activeSlotIndex.value = null
      return
    }
    // Otherwise fill first empty slot
    const emptyIndex = slots.findIndex(s => s === null)
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

  const getCreatureSlotRating = (creature: Creature) => {
    if (!selectedExpedition.value) return 0
    const level = creatureLevels.value[creature.id] || 1
    return calculateCreatureRating(creature, selectedExpedition.value, level, currentBiome.value)
  }

  const updateCreatureLevel = (creatureId: string, level: number) => {
    creatureLevels.value[creatureId] = Math.max(1, Math.min(120, level))
  }

  const uniqueBiomes = computed(() => {
    const ids = new Set(expeditions.value.map(e => e.biome))
    return Array.from(ids).sort()
  })

  return {
    expeditions,
    filteredExpeditions,
    biomes,
    searchQuery,
    biomeFilter,
    selectedExpedition,
    selectedTier,
    partySlots,
    activeSlotIndex,
    creatureLevels,
    recommendedCreatures,
    difficultyRating,
    partyScore,
    estimatedDuration,
    estimatedDurationMinutes,
    scoreRatio,
    loopCount,
    loopBonusPercent,
    totalXp,
    xpPerMinute,
    levelsGained,
    partyXpProgress,
    currentBiome,
    getBiome,
    assignCreatureToSlot,
    removeCreatureFromSlot,
    setActiveSlot,
    getCreatureSlotRating,
    updateCreatureLevel,
    uniqueBiomes,
  }
}
