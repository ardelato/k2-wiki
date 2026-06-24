import { computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { itemById, machineRecipeIndex, machineSpeedMultipliers } from '@/data/indexes'
import type { PlannerMethod, PlannerNode } from '@/types'
import { JOB_TIER_DURATION_REDUCTION } from '@/utils/formulas'

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
  const { t } = useI18n()

  return computed(() => {
    const result: Record<string, Recommendation> = {}

    const {
      machineLevels,
      machineRecipes,
      awakenGatherUpgrades,
      awakenSpeedTiers,
      fabricationAllocations,
      jobTiers,
    } = gameConfig

    // Phase C — machine switch advisory. A processor (one recipe at a time) that COULD make a
    // planned item but is set to a different recipe (or idle) can be retasked to produce it
    // passively. Pre-scan which processors are wanted by which plan items, to flag contention.
    const switchWants = new Map<string, { nodeId: string; itemName: string }[]>()
    for (const node of Object.values(nodesById.value)) {
      if (node.fulfilled) continue
      const m = getActiveMethod(node.id)
      if (!m || m.kind === 'machine') continue // already produced passively by a machine
      for (const source of machineRecipeIndex.get(node.itemId) ?? []) {
        if (source.inputItemId == null) continue // generator: always running, nothing to switch
        const selected = machineRecipes.value[source.machineId]
        if (selected === 'all' || selected === node.itemId) continue // already makes this item
        const list = switchWants.get(source.machineId) ?? []
        list.push({ nodeId: node.id, itemName: node.itemName })
        switchWants.set(source.machineId, list)
      }
    }

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

      // --- Machine switch advisory (Phase C) ---
      // If a processor could make this item but is set elsewhere, retasking it produces the
      // item passively (saving active gather/craft). Advisory only — does not change selection.
      if (kind !== 'machine') {
        const switchable = (machineRecipeIndex.get(node.itemId) ?? []).find((s) => {
          if (s.inputItemId == null) return false // generator
          const sel = machineRecipes.value[s.machineId]
          return sel !== 'all' && sel !== node.itemId
        })
        if (switchable) {
          const sel = machineRecipes.value[switchable.machineId]
          const current = sel
            ? (itemById.get(sel)?.name ?? sel)
            : t('recommendations.machineSwitchIdle')
          const others = (switchWants.get(switchable.machineId) ?? [])
            .filter((w) => w.nodeId !== node.id)
            .map((w) => w.itemName)
          const contention =
            others.length > 0
              ? t('recommendations.machineSwitchContention', {
                  items: others.slice(0, 2).join(', '),
                  more: others.length > 2 ? '…' : '',
                })
              : ''
          result[node.id] = {
            text:
              t('recommendations.machineSwitch', {
                machine: switchable.machineName,
                current,
                item: node.itemName,
              }) + contention,
          }
          continue
        }
      }

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
                text: t('recommendations.machineUpgrade', {
                  machineName: source.machineName,
                  level: currentLevel + 1,
                  pct: Math.round(improvement * 100),
                }),
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
              text: t('recommendations.sanctuaryTier', {
                jobId,
                tier: nextTier,
                pct: Math.round(improvement * 100),
              }),
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
              text: t('recommendations.awakenGatherDuration', {
                jobId,
                itemName: node.itemName,
                pct: Math.round(nextTier * 5),
              }),
            }
            continue
          }
        }

        // Awaken yield bonus recommendation (max is 2)
        if (awakenGather.yieldBonus < 2) {
          result[node.id] = {
            text: t('recommendations.awakenGatherYield', {
              jobId,
              itemName: node.itemName,
            }),
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
              text: t('recommendations.awakenSpeed', { workstation }),
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
            text: t('recommendations.fabricationPoints', {
              count: additionalPoints,
              itemName: node.itemName,
            }),
          }
        }
        continue
      }
    }

    return result
  })
}
