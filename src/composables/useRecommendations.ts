import { computed, type ComputedRef, type Ref } from 'vue'

import { machineRecipeIndex, machineSpeedMultipliers } from '@/data/indexes'
import type { PlannerMethod, PlannerNode } from '@/types'

import { useGameConfig } from './useGameConfig'

interface Recommendation {
  text: string
}

/**
 * Analyzes a planner tree and generates per-node recommendations for optimization.
 * Returns a Record<nodeId, Recommendation>.
 */
export function useRecommendations(
  nodesById: Ref<Record<string, PlannerNode>>,
  getActiveMethod: (nodeId: string) => PlannerMethod | null,
  gameConfig: ReturnType<typeof useGameConfig>,
): ComputedRef<Record<string, Recommendation>> {
  return computed(() => {
    const result: Record<string, Recommendation> = {}

    const {
      machineLevels,
      awakenGatherUpgrades,
      awakenSpeedTiers,
      fabricationAllocations,
      jobTiers,
    } = gameConfig

    // Job tier reduction/bonus constants (mirrors useCraftPlanner.ts)
    const JOB_TIER_DURATION_REDUCTION = [0, 0, 0.1, 0.1, 0.2, 0.2]
    const MAX_JOB_TIER = JOB_TIER_DURATION_REDUCTION.length - 1

    // Max constants from useGameConfig setters
    const MAX_AWAKEN_DURATION_TIER = 4
    const MAX_AWAKEN_SPEED_TIER = 4
    const MAX_FABRICATION_POINTS = 5
    const MAX_MACHINE_LEVEL = machineSpeedMultipliers.length - 1 // index 0-10

    for (const node of Object.values(nodesById.value)) {
      if (node.fulfilled) continue

      const method = getActiveMethod(node.id)
      if (!method) continue

      const kind = method.kind

      // --- Machine upgrade recommendation ---
      if (kind === 'machine') {
        // Find the machine source for this item
        const machineSources = machineRecipeIndex.get(node.itemId) ?? []
        for (const source of machineSources) {
          const currentLevel = machineLevels.value[source.machineId] ?? 0
          if (currentLevel < MAX_MACHINE_LEVEL) {
            const currentMultiplier = machineSpeedMultipliers[currentLevel] ?? 1
            const nextMultiplier = machineSpeedMultipliers[currentLevel + 1]
            if (nextMultiplier == null) continue

            // Improvement factor: higher level → lower multiplier → faster production
            const improvement = 1 - nextMultiplier / currentMultiplier
            if (improvement >= 0.05) {
              result[node.id] = {
                text: `Upgrade ${source.machineName} to Lv${currentLevel + 1} for ~${Math.round(improvement * 100)}% faster passive generation`,
              }
            }
          }
          break // Only check first matching machine source
        }
        continue
      }

      // --- Gather node recommendations ---
      if (kind === 'gather') {
        // The gather method title is the jobId (e.g. "Mining", "Chopping")
        const jobId = method.title
        const currentTier = jobTiers.value[jobId] ?? 0
        const awakenGather = awakenGatherUpgrades.value[jobId] ?? { yieldBonus: 0, durationTier: 0 }

        // Sanctuary (job tier) recommendation — only suggest if not at max and meaningful
        if (currentTier < MAX_JOB_TIER) {
          const nextTier = currentTier + 1
          const currentReduction = JOB_TIER_DURATION_REDUCTION[currentTier] ?? 0
          const nextReduction = JOB_TIER_DURATION_REDUCTION[nextTier] ?? 0
          const improvement = nextReduction - currentReduction
          if (improvement >= 0.05) {
            result[node.id] = {
              text: `Place sanctuary creatures for ${jobId} to reach T${nextTier} (~${Math.round(improvement * 100)}% faster gathering)`,
            }
            continue
          }
        }

        // Awaken gather duration recommendation
        if (awakenGather.durationTier < MAX_AWAKEN_DURATION_TIER) {
          const nextTier = awakenGather.durationTier + 1
          const improvement = nextTier * 0.05 - awakenGather.durationTier * 0.05
          if (improvement >= 0.05) {
            result[node.id] = {
              text: `Awaken duration tier for ${jobId} would reduce ${node.itemName} gathering by ~${Math.round(nextTier * 5)}%`,
            }
            continue
          }
        }

        // Awaken yield bonus recommendation (max is 2)
        if (awakenGather.yieldBonus < 2) {
          result[node.id] = {
            text: `Awaken yield bonus for ${jobId} would increase ${node.itemName} gather yield`,
          }
          continue
        }

        continue
      }

      // --- Craft node recommendations ---
      if (kind === 'craft') {
        const workstation = method.title
        if (!workstation) continue

        const currentSpeedTier = awakenSpeedTiers.value[workstation] ?? 0
        if (currentSpeedTier < MAX_AWAKEN_SPEED_TIER) {
          const nextTier = currentSpeedTier + 1
          // Each tier reduces craft time by 5%
          const improvement = nextTier * 0.05 - currentSpeedTier * 0.05
          if (improvement >= 0.05) {
            result[node.id] = {
              text: `Awaken speed tier for ${workstation} would reduce craft time by ~5%`,
            }
          }
        }
        continue
      }

      // --- Fabrication recommendation ---
      if (kind === 'fabrication') {
        const currentPoints = fabricationAllocations.value[node.itemId] ?? 0
        if (currentPoints < MAX_FABRICATION_POINTS) {
          const additionalPoints = MAX_FABRICATION_POINTS - currentPoints
          result[node.id] = {
            text: `Allocate ${additionalPoints} more fabrication point${additionalPoints !== 1 ? 's' : ''} to ${node.itemName} for faster passive production`,
          }
        }
        continue
      }
    }

    return result
  })
}
