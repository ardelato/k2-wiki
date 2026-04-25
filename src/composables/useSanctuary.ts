import { useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature } from '@/types'
import {
  MAX_SANCTUARY_SLOTS,
  SANCTUARY_JOBS,
  SCORE_DIVISOR,
  TIER_THRESHOLDS,
  TIER_THRESHOLDS_RAW,
  MAX_TIER,
} from '@/utils/sanctuaryConstants'

interface JobProgress {
  job: string
  score: number
  tier: number
  nextThreshold: number
  pointsToNext: number
  isMaxed: boolean
}

export function useSanctuary() {
  const { creatures } = useCreatures()
  const { isOwned, isAwakened } = useCreatureCollection()
  const {
    sanctuaryCreatureIds,
    helperCreatureIds,
    machineCreatureIds,
    excludedCreatureIds,
    expeditionCreatureIds,
    jobTiers,
    setSanctuaryCreatures,
  } = useGameConfig()

  // Local state
  const targetTiers = useLocalStorage<Record<string, number>>('sanctuary-target-tiers', {})
  const activeSlotIndex = ref<number | null>(null)
  const showExcludedCreatures = ref(false)
  const ownedOnly = ref(true)

  // Party slots (8 fixed slots)
  const partySlots = computed<(Creature | null)[]>(() => {
    const creatureMap = new Map(creatures.value.map((c) => [c.id, c]))
    const slots: (Creature | null)[] = Array(MAX_SANCTUARY_SLOTS).fill(null)
    for (let i = 0; i < sanctuaryCreatureIds.value.length && i < MAX_SANCTUARY_SLOTS; i++) {
      slots[i] = creatureMap.get(sanctuaryCreatureIds.value[i]) ?? null
    }
    return slots
  })

  const partyCreatureIds = computed(() => new Set(sanctuaryCreatureIds.value))

  const isFull = computed(() => sanctuaryCreatureIds.value.length >= MAX_SANCTUARY_SLOTS)
  const hasEmptySlot = computed(() => sanctuaryCreatureIds.value.length < MAX_SANCTUARY_SLOTS)

  // Raw job scores from sanctuary creatures
  const jobScores = computed(() => {
    const scores: Record<string, number> = {}
    for (const job of SANCTUARY_JOBS) {
      scores[job] = 0
    }
    for (const slot of partySlots.value) {
      if (!slot) continue
      for (const job of SANCTUARY_JOBS) {
        const key = job.toLowerCase() as keyof typeof slot.jobs
        scores[job] += slot.jobs[key] ?? 0
      }
    }
    return scores
  })

  // Per-job progress details
  const jobProgress = computed<JobProgress[]>(() => {
    return SANCTUARY_JOBS.map((job) => {
      const score = jobScores.value[job]
      const tier = jobTiers.value[job] ?? 0
      const isMaxed = tier >= MAX_TIER
      const nextThresholdIndex = TIER_THRESHOLDS.findIndex((t) => score < t * SCORE_DIVISOR)
      const nextThreshold =
        nextThresholdIndex === -1
          ? TIER_THRESHOLDS_RAW[TIER_THRESHOLDS_RAW.length - 1]
          : TIER_THRESHOLDS_RAW[nextThresholdIndex]
      const pointsToNext = isMaxed ? 0 : Math.ceil(nextThreshold) - score

      return {
        job,
        score,
        tier,
        nextThreshold,
        pointsToNext,
        isMaxed,
      }
    })
  })

  // Whether any targets are set
  const hasTargets = computed(() => Object.values(targetTiers.value).some((t) => t > 0))

  // Greedy simulation: iteratively pick creatures that contribute most toward remaining deficits.
  // Returns the ordered picks and final simulated scores.
  function greedySimulation(
    available: Creature[],
    emptySlots: number,
    currentScores: Record<string, number>,
    unmetJobs: readonly string[],
  ): { picks: Creature[]; simScores: Record<string, number> } {
    const simScores = { ...currentScores }
    const picks: Creature[] = []
    const picked = new Set<string>()

    for (let slot = 0; slot < emptySlots && picked.size < available.length; slot++) {
      let bestCreature: Creature | null = null
      let bestValue = -1

      for (const c of available) {
        if (picked.has(c.id)) continue
        let value = 0
        for (const job of unmetJobs) {
          const key = job.toLowerCase() as keyof typeof c.jobs
          const contribution = c.jobs[key] ?? 0
          const target = targetTiers.value[job] ?? 0
          const remaining = TIER_THRESHOLDS_RAW[target - 1] - simScores[job]
          if (remaining > 0) {
            value += Math.min(contribution, remaining)
          }
        }
        if (value > bestValue) {
          bestValue = value
          bestCreature = c
        }
      }

      if (!bestCreature || bestValue <= 0) break
      picked.add(bestCreature.id)
      picks.push(bestCreature)
      for (const job of SANCTUARY_JOBS) {
        const key = job.toLowerCase() as keyof typeof bestCreature.jobs
        simScores[job] += bestCreature.jobs[key] ?? 0
      }
    }

    return { picks, simScores }
  }

  // Per-job max achievable tier given the current party and available creatures.
  // For each job, picks the top N creatures (by that job's contribution) to find the upper bound.
  const maxAchievableTiers = computed<Record<string, number>>(() => {
    const emptySlots = MAX_SANCTUARY_SLOTS - sanctuaryCreatureIds.value.length
    const available = creatures.value.filter((c) => {
      if (partyCreatureIds.value.has(c.id)) return false
      if (ownedOnly.value && !isOwned(c.id)) return false
      return true
    })

    const result: Record<string, number> = {}
    for (const job of SANCTUARY_JOBS) {
      const key = job.toLowerCase() as keyof (typeof available)[0]['jobs']
      // Sort available creatures by this job's contribution descending, take top N
      const topContributions = available
        .map((c) => c.jobs[key] ?? 0)
        .toSorted((a, b) => b - a)
        .slice(0, emptySlots)

      const maxScore = jobScores.value[job] + topContributions.reduce((s, v) => s + v, 0)
      const pct = maxScore / SCORE_DIVISOR
      let tier = 0
      for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
        if (pct >= TIER_THRESHOLDS[i]) {
          tier = i + 1
          break
        }
      }
      result[job] = Math.min(tier, MAX_TIER)
    }
    return result
  })

  // Recommendation scoring
  function getRecommendationValue(creature: Creature): number {
    if (hasTargets.value) {
      let totalValue = 0
      for (const job of SANCTUARY_JOBS) {
        const target = targetTiers.value[job] ?? 0
        const currentTier = jobTiers.value[job] ?? 0
        if (target <= currentTier) continue
        const deficit = TIER_THRESHOLDS_RAW[target - 1] - jobScores.value[job]
        if (deficit <= 0) continue
        const key = job.toLowerCase() as keyof typeof creature.jobs
        const contribution = creature.jobs[key] ?? 0
        totalValue += Math.min(contribution, deficit)
      }
      return totalValue
    }
    // No targets: rank by total job score
    return Object.values(creature.jobs).reduce((sum, v) => sum + v, 0)
  }

  // Filtered and sorted creature list for the browser.
  // When targets are set, uses greedy simulation to order creatures by how well
  // they complement each other toward meeting all targets collectively.
  const recommendedCreatures = computed(() => {
    const browsable = creatures.value.filter((c) => {
      if (partyCreatureIds.value.has(c.id)) return false
      if (!showExcludedCreatures.value && excludedCreatureIds.value.has(c.id)) return false
      return true
    })

    // No targets: rank by total job score
    if (!hasTargets.value) {
      return browsable
        .map((c) => ({ creature: c, score: getRecommendationValue(c) }))
        .toSorted((a, b) => b.score - a.score)
    }

    // Find unmet target jobs
    const unmetJobs = SANCTUARY_JOBS.filter((job) => {
      const target = targetTiers.value[job] ?? 0
      const currentTier = jobTiers.value[job] ?? 0
      return target > currentTier
    })

    // All targets met: rank by total job score
    if (unmetJobs.length === 0) {
      return browsable
        .map((c) => ({ creature: c, score: getRecommendationValue(c) }))
        .toSorted((a, b) => b.score - a.score)
    }

    // Run greedy simulation to determine optimal pick order.
    // When showing all creatures, include unowned in the simulation so suggestions
    // reflect the best party composition from the full browsable pool.
    const emptySlots = MAX_SANCTUARY_SLOTS - sanctuaryCreatureIds.value.length
    const available = ownedOnly.value ? browsable.filter((c) => isOwned(c.id)) : browsable
    const { picks } = greedySimulation(available, emptySlots, jobScores.value, unmetJobs)

    // Build pick-order ranking: first pick = highest priority
    const pickRank = new Map<string, number>()
    for (let i = 0; i < picks.length; i++) {
      pickRank.set(picks[i].id, i)
    }

    return browsable
      .map((c) => ({ creature: c, score: getRecommendationValue(c) }))
      .toSorted((a, b) => {
        const rankA = pickRank.get(a.creature.id)
        const rankB = pickRank.get(b.creature.id)
        // Simulation-picked creatures always come first, in pick order
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB
        if (rankA !== undefined) return -1
        if (rankB !== undefined) return 1
        // Non-picked creatures sorted by individual score
        return b.score - a.score
      })
  })

  // Slot actions
  function setActiveSlot(index: number) {
    activeSlotIndex.value = activeSlotIndex.value === index ? null : index
  }

  function assignCreatureToSlot(creature: Creature) {
    const slots = partySlots.value
    if (
      activeSlotIndex.value !== null &&
      activeSlotIndex.value < slots.length &&
      !slots[activeSlotIndex.value]
    ) {
      const ids = [...sanctuaryCreatureIds.value]
      // Insert at the correct position
      while (ids.length < activeSlotIndex.value) ids.push('')
      ids.splice(activeSlotIndex.value, 0, creature.id)
      setSanctuaryCreatures(ids.filter(Boolean))
      activeSlotIndex.value = null
      return
    }
    // Fill first empty slot
    if (!isFull.value) {
      setSanctuaryCreatures([...sanctuaryCreatureIds.value, creature.id])
      activeSlotIndex.value = null
    }
  }

  function removeCreatureFromSlot(index: number) {
    const creature = partySlots.value[index]
    if (!creature) return
    setSanctuaryCreatures(sanctuaryCreatureIds.value.filter((id) => id !== creature.id))
  }

  function setTargetTier(job: string, tier: number) {
    targetTiers.value = { ...targetTiers.value, [job]: Math.max(0, Math.min(MAX_TIER, tier)) }
  }

  function setAllTargets(tier: number) {
    const clamped = Math.max(0, Math.min(MAX_TIER, tier))
    const newTargets: Record<string, number> = {}
    for (const job of SANCTUARY_JOBS) {
      newTargets[job] = clamped
    }
    targetTiers.value = newTargets
  }

  function clearSanctuary() {
    setSanctuaryCreatures([])
  }

  function getCreatureStatus(id: string): 'helper' | 'machine' | 'expedition' | null {
    if (helperCreatureIds.value.includes(id)) return 'helper'
    if (machineCreatureIds.value.includes(id)) return 'machine'
    if (expeditionCreatureIds.value.has(id)) return 'expedition'
    return null
  }

  return {
    // State
    sanctuaryCreatureIds,
    partySlots,
    activeSlotIndex,
    hasEmptySlot,
    jobScores,
    jobTiers,
    jobProgress,
    targetTiers,
    maxAchievableTiers,

    // Creature browser
    recommendedCreatures,
    showExcludedCreatures,
    ownedOnly,

    // Actions
    setActiveSlot,
    assignCreatureToSlot,
    removeCreatureFromSlot,
    setTargetTier,
    setAllTargets,
    clearSanctuary,

    // Helpers
    isOwned,
    isAwakened,
    getCreatureStatus,
  }
}
