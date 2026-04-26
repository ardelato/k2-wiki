import { useLocalStorage } from '@vueuse/core'
import { computed, ref, type Ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useGameConfig } from '@/composables/useGameConfig'
import {
  itemById,
  jobActivityIndex,
  containerSourceIndex,
  expeditionSourceIndex,
  machineRecipeIndex,
  machineSpeedMultipliers,
} from '@/data/indexes'
import type {
  AwakenGatherUpgrade,
  GardenFlowerEntry,
  ItemType,
  PlannerMethod,
  PlannerMethodChild,
  PlannerMethodKind,
  PlannerNode,
  PlannerSchedule,
  PlannerSummary,
  PlannerSummaryLeaf,
  PlannerTimeBreakdown,
  ScheduledTask,
} from '@/types'
import { formatChance, formatDuration, methodKindLabel, toTitleCase } from '@/utils/format'
import { tierModifiers } from '@/utils/formulas'
import { computeGoldPerMinute, goldToSeconds } from '@/utils/goldIncome'

export type { GardenFlowerEntry, AwakenGatherUpgrade }

export interface PlannerModifiers {
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number> // per workstation, 0–4
  jobTiers: Record<string, number>
  goldPerMinute: number
  machineLevels: Record<string, number>
  fabricationAllocations: Record<string, number>
  expeditionTier: number // 1–5, multiplies expedition loot rewards
}

interface GardenSource {
  flowerItemId: string
  flowerItemName: string
  cycleSeconds: number
  yieldPerCycle: number
}

interface PlannerGraph {
  root: PlannerNode | null
  nodesById: Record<string, PlannerNode>
  methodsById: Record<string, PlannerMethod>
}

const gardenFlowerByItemId = new Map<string, string>([
  ['raw-fire-essence', 'fire-flower'],
  ['raw-wind-essence', 'wind-flower'],
  ['raw-earth-essence', 'earth-flower'],
  ['raw-water-essence', 'water-flower'],
])

const gardenSourcesByItem = new Map<string, GardenSource>(
  [...gardenFlowerByItemId.entries()].map(([itemId, flowerItemId]) => [
    itemId,
    {
      flowerItemId,
      flowerItemName: itemById.get(flowerItemId)?.name ?? toTitleCase(flowerItemId),
      cycleSeconds: 60,
      yieldPerCycle: 1,
    },
  ]),
)

function expectedAmount(min: number, max: number): number {
  return (min + max) / 2
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString()
  if (value >= 100) return value.toFixed(1)
  if (value >= 10) return value.toFixed(2)
  return value.toFixed(3)
}

function formatTimeOrUnknown(value: number | null): string {
  return value == null ? 'Unknown' : formatDuration(value)
}

const FABRICATION_CYCLE_SECONDS = 180

interface PassiveRateResult {
  rate: number
  details: { label: string; ratePerMin: number }[]
}

function applyPassiveRate(
  requiredAmount: number,
  activeRate: number,
  baseTime: number,
  passive: PassiveRateResult,
): number {
  return passive.rate > 0 ? requiredAmount / (activeRate + passive.rate) : baseTime
}

function passiveFormula(
  requiredAmount: number,
  activeRate: number,
  passive: PassiveRateResult,
  baseFormula: string,
): string {
  return passive.rate > 0
    ? `${formatAmount(requiredAmount)} ÷ (${(activeRate * 60).toFixed(1)}/min active + ${(passive.rate * 60).toFixed(1)}/min passive)`
    : baseFormula
}

function getPassiveRate(
  itemId: string,
  modifiers: PlannerModifiers,
  excludeMachineId?: string,
  excludeFabrication?: boolean,
): PassiveRateResult {
  let rate = 0
  const details: { label: string; ratePerMin: number }[] = []

  // Machine production rate (one entry per unique machine — a machine can only run one recipe)
  const seenMachines = new Set<string>()
  for (const source of machineRecipeIndex.get(itemId) ?? []) {
    if (source.machineId === excludeMachineId) continue
    if (seenMachines.has(source.machineId)) continue
    seenMachines.add(source.machineId)
    const level = modifiers.machineLevels[source.machineId] ?? 0
    const mult = machineSpeedMultipliers[Math.min(level, machineSpeedMultipliers.length - 1)]
    const interval = Math.max(1, Math.floor(source.baseInterval * mult))
    const machineRate = source.outputAmount / interval
    rate += machineRate
    details.push({ label: `Machine — ${source.machineName}`, ratePerMin: machineRate * 60 })
  }

  // Fabrication production rate
  if (!excludeFabrication) {
    const points = modifiers.fabricationAllocations[itemId] ?? 0
    if (points > 0) {
      const fabRate = points / FABRICATION_CYCLE_SECONDS
      rate += fabRate
      details.push({ label: `Fabrication (${points} pts)`, ratePerMin: fabRate * 60 })
    }
  }

  return { rate, details }
}

function passiveDetailRows(passive: PassiveRateResult): { label: string; value: string }[] {
  if (passive.rate <= 0) return []
  return passive.details.map((d) => ({
    label: d.label,
    value: `+${d.ratePerMin.toFixed(1)}/min`,
  }))
}

function buildPlannerGraph(
  targetItemId: string,
  targetQuantity: number,
  inventory: Record<string, number>,
  modifiers: PlannerModifiers,
  deductRootInventory = false,
): PlannerGraph {
  const nodesById = new Map<string, PlannerNode>()
  const methodsById = new Map<string, PlannerMethod>()
  const remainingStock = new Map<string, number>(Object.entries(inventory).filter(([, v]) => v > 0))

  function claimStock(itemId: string, needed: number): number {
    const available = remainingStock.get(itemId) ?? 0
    const claimed = Math.min(available, needed)
    remainingStock.set(itemId, available - claimed)
    return needed - claimed
  }

  function buildNode(
    itemId: string,
    requiredAmount: number,
    depth: number,
    ancestry: string[],
    path: string,
  ): PlannerNode {
    const item = itemById.get(itemId)
    const nodeId = path

    // Skip inventory deduction for the root target in craft planner (we want to build
    // *additional* items). Summoning planner passes deductRootInventory=true since
    // you just need to *have* the materials.
    const effectiveAmount =
      depth === 0 && !deductRootInventory ? requiredAmount : claimStock(itemId, requiredAmount)

    if (effectiveAmount <= 0) {
      const fulfilledNode: PlannerNode = {
        id: nodeId,
        itemId,
        itemName: item?.name ?? toTitleCase(itemId),
        itemType: item?.type ?? 'Gathered',
        requiredAmount: 0,
        depth,
        defaultMethodId: null,
        methods: [],
        issues: [],
        fulfilled: true,
      }
      nodesById.set(nodeId, fulfilledNode)
      return fulfilledNode
    }

    requiredAmount = effectiveAmount

    if (!item) {
      const unknownNode: PlannerNode = {
        id: nodeId,
        itemId,
        itemName: toTitleCase(itemId),
        itemType: 'Gathered',
        requiredAmount,
        depth,
        defaultMethodId: null,
        methods: [],
        issues: ['Item data not found.'],
        fulfilled: false,
      }
      nodesById.set(nodeId, unknownNode)
      return unknownNode
    }

    if (ancestry.includes(itemId)) {
      const cycleMethod: PlannerMethod = {
        id: `${nodeId}#cycle`,
        nodeId,
        kind: 'cycle',
        title: 'Cycle detected',
        subtitle: 'This dependency loops back to an ancestor item.',
        requiredAmount,
        localTimeSeconds: null,
        totalTimeSeconds: null,
        cost: null,
        detailRows: [],
        notes: ['Planner expansion stopped here to avoid an infinite loop.'],
        children: [],
      }
      const cycleNode: PlannerNode = {
        id: nodeId,
        itemId,
        itemName: item.name,
        itemType: item.type,
        requiredAmount,
        depth,
        defaultMethodId: cycleMethod.id,
        methods: [cycleMethod],
        issues: ['Cycle detected in dependency chain.'],
        fulfilled: false,
      }
      nodesById.set(nodeId, cycleNode)
      methodsById.set(cycleMethod.id, cycleMethod)
      return cycleNode
    }

    const methods: PlannerMethod[] = []
    const nextAncestry = [...ancestry, itemId]

    item.recipes.forEach((recipe, recipeIndex) => {
      const craftsNeeded = Math.ceil(requiredAmount / recipe.outputAmount)
      const children: PlannerMethodChild[] = recipe.ingredients.map((ingredient, childIndex) => {
        const childPath = `${nodeId}/recipe-${recipeIndex}/ingredient-${childIndex}:${ingredient.id}`
        const childNode = buildNode(
          ingredient.id,
          ingredient.amount * craftsNeeded,
          depth + 1,
          nextAncestry,
          childPath,
        )
        return {
          itemId: ingredient.id,
          amount: ingredient.amount * craftsNeeded,
          nodeId: childNode.id,
        }
      })

      const speedReduction = (modifiers.awakenSpeedTiers[recipe.workstation] ?? 0) * 0.15
      const effectiveCraftTime = Math.max(
        recipe.craftTime * 0.01,
        recipe.craftTime * (1 - speedReduction),
      )
      const passive = getPassiveRate(itemId, modifiers)
      const activeRate = recipe.outputAmount / effectiveCraftTime
      const localTimeSeconds = applyPassiveRate(
        requiredAmount,
        activeRate,
        craftsNeeded * effectiveCraftTime,
        passive,
      )
      const childTimes = children.map((child) => {
        const childNode = nodesById.get(child.nodeId)
        if (!childNode) return null
        if (childNode.fulfilled) return 0
        if (!childNode.defaultMethodId) return null
        const childMethod = methodsById.get(childNode.defaultMethodId)
        if (!childMethod) return null
        return childMethod.totalTimeSeconds ?? null
      })
      const knownChildTimes = childTimes.filter((time): time is number => time != null)
      const maxChildTime = knownChildTimes.length > 0 ? Math.max(...knownChildTimes) : 0
      const totalTimeSeconds =
        knownChildTimes.length !== childTimes.length ? null : localTimeSeconds + maxChildTime

      const method: PlannerMethod = {
        id: `${nodeId}#recipe-${recipeIndex}`,
        nodeId,
        kind: 'craft',
        title: recipe.workstation,
        subtitle: `${craftsNeeded} craft${craftsNeeded === 1 ? '' : 's'} for ${formatAmount(requiredAmount)} output`,
        requiredAmount,
        localTimeSeconds,
        totalTimeSeconds,
        cost: null,
        detailRows: [
          { label: 'Output', value: `${recipe.outputAmount} each` },
          { label: 'Crafts', value: formatAmount(craftsNeeded) },
          { label: 'Level', value: `Lv${recipe.levelRequirement}` },
          ...((modifiers.awakenSpeedTiers[recipe.workstation] ?? 0) > 0
            ? [
                {
                  label: 'Speed Tier',
                  value: `+${modifiers.awakenSpeedTiers[recipe.workstation] * 15}%`,
                },
              ]
            : []),
          ...passiveDetailRows(passive),
          { label: 'Step time', value: formatDuration(localTimeSeconds) },
          { label: 'Total time', value: formatTimeOrUnknown(totalTimeSeconds) },
          ...(totalTimeSeconds != null && totalTimeSeconds > localTimeSeconds
            ? [{ label: 'Deps time', value: formatDuration(totalTimeSeconds - localTimeSeconds) }]
            : []),
        ],
        formula: passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          `${formatAmount(craftsNeeded)} crafts × ${formatDuration(recipe.craftTime)}`,
        ),
        notes: [],
        children,
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    ;(jobActivityIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
      // Cumulative duration reduction percentage per tier (0-5)
      const JOB_TIER_DURATION_REDUCTION = [0, 0, 0.1, 0.1, 0.2, 0.2]
      // Cumulative yield bonus per tier (0-5)
      const JOB_TIER_YIELD_BONUS = [0, 0, 0, 0, 0, 1]

      const awakenGather = modifiers.awakenGatherUpgrades[source.jobId]
      const yieldBonus = awakenGather?.yieldBonus ?? 0
      const jobTier = modifiers.jobTiers[source.jobId] ?? 0
      const jobYieldBonus = JOB_TIER_YIELD_BONUS[jobTier] ?? 0
      const baseYield = source.chance * expectedAmount(source.min, source.max)
      const expectedYield = baseYield + yieldBonus + jobYieldBonus
      if (expectedYield <= 0) return

      const actionsNeeded = requiredAmount / expectedYield
      const awakenReduction = (awakenGather?.durationTier ?? 0) * 0.05
      const jobReduction = JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0
      const effectiveDuration = Math.max(
        Math.max(source.duration * 0.01, 1),
        source.duration * (1 - awakenReduction) * (1 - jobReduction),
      )
      const passive = getPassiveRate(itemId, modifiers)
      const activeRate = expectedYield / effectiveDuration
      const localTimeSeconds = applyPassiveRate(
        requiredAmount,
        activeRate,
        actionsNeeded * effectiveDuration,
        passive,
      )
      const isEstimated = source.chance !== 1 || source.min !== source.max
      const method: PlannerMethod = {
        id: `${nodeId}#gather-${sourceIndex}`,
        nodeId,
        kind: 'gather',
        title: source.jobId,
        subtitle: source.activityName,
        requiredAmount,
        localTimeSeconds,
        totalTimeSeconds: localTimeSeconds,
        cost: null,
        actionsNeeded,
        detailRows: [
          { label: 'Activity', value: source.activityName },
          { label: 'Level', value: `Lv${source.levelRequirement}` },
          {
            label: 'Yield / action',
            value: `${formatChance(source.chance)} × ${formatAmount(expectedAmount(source.min, source.max))}`,
          },
          ...(yieldBonus > 0 || (awakenGather?.durationTier ?? 0) > 0
            ? [
                {
                  label: 'Awaken Tree',
                  value: [
                    ...(yieldBonus > 0 ? [`+${yieldBonus} yield`] : []),
                    ...((awakenGather?.durationTier ?? 0) > 0
                      ? [`-${(awakenGather?.durationTier ?? 0) * 5}% duration`]
                      : []),
                  ].join(', '),
                },
              ]
            : []),
          ...((JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) > 0 ||
          (JOB_TIER_YIELD_BONUS[jobTier] ?? 0) > 0
            ? [
                {
                  label: 'Sanctuary',
                  value: `T${jobTier} (${[
                    ...((JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) > 0
                      ? [`-${(JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) * 100}% duration`]
                      : []),
                    ...((JOB_TIER_YIELD_BONUS[jobTier] ?? 0) > 0
                      ? [`+${JOB_TIER_YIELD_BONUS[jobTier]} yield`]
                      : []),
                  ].join(', ')})`,
                },
              ]
            : []),
          ...passiveDetailRows(passive),
          { label: 'Actions', value: formatAmount(actionsNeeded), estimated: isEstimated },
          { label: 'Step time', value: formatDuration(localTimeSeconds), estimated: isEstimated },
        ],
        formula: passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          `${formatAmount(requiredAmount)} ÷ (${formatChance(source.chance)} × ${formatAmount(expectedAmount(source.min, source.max))}) actions × ${formatDuration(source.duration)}`,
        ),
        notes: ['Expected time uses average yield from chance and output range.'],
        children: [],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    const gardenSource = gardenSourcesByItem.get(itemId)
    if (gardenSource) {
      const entries = modifiers.gardenFlowers[gardenSource.flowerItemId] ?? []
      const totalFlowers = entries.reduce((sum, e) => sum + e.count, 0)
      const yieldPerCycle = entries.reduce((sum, e) => sum + e.count * e.level, 0)

      if (yieldPerCycle > 0) {
        const cyclesNeeded = requiredAmount / yieldPerCycle
        const passive = getPassiveRate(itemId, modifiers)
        const activeRate = yieldPerCycle / gardenSource.cycleSeconds
        const localTimeSeconds = applyPassiveRate(
          requiredAmount,
          activeRate,
          cyclesNeeded * gardenSource.cycleSeconds,
          passive,
        )
        const breakdownParts = entries
          .filter((e) => e.count > 0)
          .map((e) => `${e.count}×Lv${e.level}`)
        const method: PlannerMethod = {
          id: `${nodeId}#garden`,
          nodeId,
          kind: 'garden',
          title: gardenSource.flowerItemName,
          subtitle: 'Garden growth',
          requiredAmount,
          localTimeSeconds,
          totalTimeSeconds: localTimeSeconds,
          cost: null,
          detailRows: [
            { label: 'Flower', value: gardenSource.flowerItemName },
            { label: 'Setup', value: breakdownParts.join(' + ') || 'None' },
            { label: 'Total flowers', value: String(totalFlowers) },
            { label: 'Yield / cycle', value: `${formatAmount(yieldPerCycle)} per 60s` },
            ...passiveDetailRows(passive),
            { label: 'Cycles', value: formatAmount(cyclesNeeded) },
            { label: 'Step time', value: formatDuration(localTimeSeconds) },
          ],
          formula: passiveFormula(
            requiredAmount,
            activeRate,
            passive,
            `${formatAmount(requiredAmount)} ÷ ${formatAmount(yieldPerCycle)} per cycle × ${formatDuration(gardenSource.cycleSeconds)}`,
          ),
          notes: [`Garden yield: ${breakdownParts.join(' + ')} = ${yieldPerCycle}/min.`],
          children: [],
        }

        methods.push(method)
        methodsById.set(method.id, method)
      } else {
        const method: PlannerMethod = {
          id: `${nodeId}#garden`,
          nodeId,
          kind: 'garden',
          title: gardenSource.flowerItemName,
          subtitle: 'Garden — no flowers configured',
          requiredAmount,
          localTimeSeconds: null,
          totalTimeSeconds: null,
          cost: null,
          detailRows: [
            { label: 'Flower', value: gardenSource.flowerItemName },
            { label: 'Setup', value: 'None' },
            { label: 'Total flowers', value: '0' },
          ],
          notes: ['Configure the flowers under Planner Settings > Garden to calculate time.'],
          children: [],
        }

        methods.push(method)
        methodsById.set(method.id, method)
      }
    }

    ;(containerSourceIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
      const expectedYield = source.amount * source.chance
      if (expectedYield <= 0) return

      const passive = getPassiveRate(itemId, modifiers)
      const fullOpeningsNeeded = requiredAmount / expectedYield
      let openingsNeeded = fullOpeningsNeeded
      const childPath = `${nodeId}/container-${sourceIndex}:${source.containerId}`

      // When passive production (machines/fabrication) contributes to this item,
      // reduce containers needed. Two-pass: probe with full amount for a
      // time-per-container estimate, then rebuild the child with reduced amount.
      if (passive.rate > 0) {
        const stockSnapshot = new Map(remainingStock)
        const probeNode = buildNode(
          source.containerId,
          fullOpeningsNeeded,
          depth + 1,
          nextAncestry,
          childPath,
        )
        // Restore inventory — we'll rebuild with the adjusted amount
        remainingStock.clear()
        for (const [k, v] of stockSnapshot) remainingStock.set(k, v)

        const probeMethodId = probeNode.defaultMethodId
        const probeTime = probeMethodId
          ? (methodsById.get(probeMethodId)?.totalTimeSeconds ?? null)
          : null

        if (probeTime != null && probeTime > 0) {
          // activeRate = items/sec obtained through container openings
          const activeRate = requiredAmount / probeTime
          const adjustedTime = applyPassiveRate(requiredAmount, activeRate, probeTime, passive)
          openingsNeeded = Math.max(0, (adjustedTime / probeTime) * fullOpeningsNeeded)
        }
      }

      const containerNode = buildNode(
        source.containerId,
        openingsNeeded,
        depth + 1,
        nextAncestry,
        childPath,
      )

      const childMethodId = containerNode.defaultMethodId
      const childTime = childMethodId
        ? (methodsById.get(childMethodId)?.totalTimeSeconds ?? null)
        : null
      const totalTimeSeconds = childTime
      const isContainerEstimated = source.chance !== 1
      const passiveReduced = passive.rate > 0 && openingsNeeded < fullOpeningsNeeded
      const method: PlannerMethod = {
        id: `${nodeId}#container-${sourceIndex}`,
        nodeId,
        kind: 'container',
        title: source.containerName,
        subtitle: `Expected ${formatAmount(openingsNeeded)} openings`,
        requiredAmount,
        localTimeSeconds: 0,
        totalTimeSeconds,
        cost: null,
        detailRows: [
          {
            label: 'Yield / open',
            value: `${formatChance(source.chance)} × ${source.amount}`,
          },
          {
            label: 'Containers needed',
            value: formatAmount(openingsNeeded),
            estimated: isContainerEstimated,
          },
          ...passiveDetailRows(passive),
          {
            label: 'Total time',
            value: formatTimeOrUnknown(totalTimeSeconds),
            estimated: isContainerEstimated,
          },
        ],
        formula: passiveReduced
          ? `${formatAmount(requiredAmount)} need − passive → ${formatAmount(openingsNeeded)} openings of ${source.containerName.toLowerCase()}`
          : `${formatAmount(requiredAmount)} ÷ (${formatChance(source.chance)} × ${source.amount}) per ${source.containerName.toLowerCase()} opening`,
        notes: [
          'Opening time is treated as negligible; only obtaining the container contributes time.',
          ...(passiveReduced
            ? [
                `Passive production reduces containers from ${formatAmount(fullOpeningsNeeded)} to ${formatAmount(openingsNeeded)}.`,
              ]
            : []),
        ],
        children: [
          {
            itemId: source.containerId,
            amount: openingsNeeded,
            nodeId: containerNode.id,
          },
        ],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    ;(expeditionSourceIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
      const lootAmount = source.amount * tierModifiers.loot[(modifiers.expeditionTier || 1) - 1]
      const runsNeeded = requiredAmount / lootAmount
      const estimatedTime = runsNeeded * source.baseDuration
      const method: PlannerMethod = {
        id: `${nodeId}#expedition-${sourceIndex}`,
        nodeId,
        kind: 'expedition',
        title: source.expeditionName,
        subtitle: `${formatAmount(runsNeeded)} expected runs`,
        requiredAmount,
        localTimeSeconds: estimatedTime,
        totalTimeSeconds: estimatedTime,
        cost: null,
        detailRows: [
          {
            label: 'Reward / run',
            value: `${formatAmount(lootAmount)}${lootAmount !== source.amount ? ` (T${modifiers.expeditionTier})` : ''}`,
          },
          { label: 'Base duration', value: formatDuration(source.baseDuration) },
          { label: 'Runs needed', value: formatAmount(runsNeeded) },
          { label: 'Total time', value: formatDuration(estimatedTime), estimated: true },
        ],
        formula: `${formatAmount(runsNeeded)} runs × ${formatDuration(source.baseDuration)} base duration`,
        notes: ['Estimated using base duration — actual time depends on party strength and tier.'],
        children: [],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    // Machine methods (processors and generators)
    ;(machineRecipeIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
      const machineLevel = modifiers.machineLevels[source.machineId] ?? 0
      const speedMultiplier =
        machineSpeedMultipliers[Math.min(machineLevel, machineSpeedMultipliers.length - 1)]
      const effectiveInterval = Math.max(1, Math.floor(source.baseInterval * speedMultiplier))
      const cyclesNeeded = Math.ceil(requiredAmount / source.outputAmount)
      const passive = getPassiveRate(itemId, modifiers, source.machineId)
      const activeRate = source.outputAmount / effectiveInterval
      const localTimeSeconds = applyPassiveRate(
        requiredAmount,
        activeRate,
        cyclesNeeded * effectiveInterval,
        passive,
      )

      const children: PlannerMethodChild[] = []

      // Input items (processors have inputs, generators don't)
      if (source.inputItemId) {
        const inputAmount = source.inputAmount * cyclesNeeded
        const childPath = `${nodeId}/machine-${sourceIndex}-input:${source.inputItemId}`
        const childNode = buildNode(
          source.inputItemId,
          inputAmount,
          depth + 1,
          nextAncestry,
          childPath,
        )
        children.push({
          itemId: source.inputItemId,
          amount: inputAmount,
          nodeId: childNode.id,
        })
      }

      // Secondary input (e.g., Bakery: flour + egg, Refinery: essence + stone)
      if (source.secondaryInputItemId) {
        const secondaryAmount = (source.secondaryInputAmount ?? 0) * cyclesNeeded
        if (secondaryAmount > 0) {
          const childPath = `${nodeId}/machine-${sourceIndex}-secondary:${source.secondaryInputItemId}`
          const childNode = buildNode(
            source.secondaryInputItemId,
            secondaryAmount,
            depth + 1,
            nextAncestry,
            childPath,
          )
          children.push({
            itemId: source.secondaryInputItemId,
            amount: secondaryAmount,
            nodeId: childNode.id,
          })
        }
      }

      // Calculate total time including children
      const childTimes = children.map((child) => {
        const childNode = nodesById.get(child.nodeId)
        if (!childNode) return null
        if (childNode.fulfilled) return 0
        if (!childNode.defaultMethodId) return null
        const childMethod = methodsById.get(childNode.defaultMethodId)
        if (!childMethod) return null
        return childMethod.totalTimeSeconds ?? null
      })
      const knownChildTimes = childTimes.filter((time): time is number => time != null)
      const maxChildTime = knownChildTimes.length > 0 ? Math.max(...knownChildTimes) : 0
      const totalTimeSeconds =
        knownChildTimes.length !== childTimes.length ? null : localTimeSeconds + maxChildTime

      const method: PlannerMethod = {
        id: `${nodeId}#machine-${sourceIndex}`,
        nodeId,
        kind: 'machine',
        title: source.machineName,
        subtitle: `${cyclesNeeded} cycle${cyclesNeeded === 1 ? '' : 's'} for ${formatAmount(requiredAmount)} output`,
        requiredAmount,
        localTimeSeconds,
        totalTimeSeconds,
        cost: null,
        detailRows: [
          { label: 'Output', value: `${source.outputAmount} each` },
          { label: 'Cycles', value: formatAmount(cyclesNeeded) },
          { label: 'Level', value: `${machineLevel}/${machineSpeedMultipliers.length - 1}` },
          { label: 'Interval', value: `${effectiveInterval}s per cycle` },
          ...passiveDetailRows(passive),
          { label: 'Step time', value: formatDuration(localTimeSeconds) },
          { label: 'Total time', value: formatTimeOrUnknown(totalTimeSeconds) },
          ...(totalTimeSeconds != null && totalTimeSeconds > localTimeSeconds
            ? [{ label: 'Deps time', value: formatDuration(totalTimeSeconds - localTimeSeconds) }]
            : []),
        ],
        formula: passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          `${formatAmount(cyclesNeeded)} cycles × ${effectiveInterval}s`,
        ),
        notes:
          machineLevel > 0
            ? [
                `Machine level ${machineLevel} reduces interval from ${source.baseInterval}s to ${effectiveInterval}s.`,
              ]
            : [],
        children,
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    // Fabrication method (passive item generation)
    const allocationPoints = modifiers.fabricationAllocations[itemId] ?? 0
    if (allocationPoints > 0) {
      const itemsPerCycle = allocationPoints
      const cyclesNeeded = requiredAmount / itemsPerCycle
      const passive = getPassiveRate(itemId, modifiers, undefined, true)
      const activeRate = itemsPerCycle / FABRICATION_CYCLE_SECONDS
      const localTimeSeconds = applyPassiveRate(
        requiredAmount,
        activeRate,
        cyclesNeeded * FABRICATION_CYCLE_SECONDS,
        passive,
      )
      const itemsPerHour = itemsPerCycle * (3600 / FABRICATION_CYCLE_SECONDS)

      const method: PlannerMethod = {
        id: `${nodeId}#fabrication`,
        nodeId,
        kind: 'fabrication',
        title: 'Fabrication',
        subtitle: `${allocationPoints} point${allocationPoints === 1 ? '' : 's'} allocated`,
        requiredAmount,
        localTimeSeconds,
        totalTimeSeconds: localTimeSeconds,
        cost: null,
        detailRows: [
          { label: 'Points', value: String(allocationPoints) },
          { label: 'Items / cycle', value: String(itemsPerCycle) },
          { label: 'Cycle time', value: `${FABRICATION_CYCLE_SECONDS}s` },
          { label: 'Rate', value: `${formatAmount(itemsPerHour)}/hr` },
          ...passiveDetailRows(passive),
          { label: 'Step time', value: formatDuration(localTimeSeconds) },
        ],
        formula: passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          `${formatAmount(requiredAmount)} ÷ ${itemsPerCycle}/cycle × ${FABRICATION_CYCLE_SECONDS}s`,
        ),
        notes: ['Fabrication generates items passively every 3 minutes.'],
        children: [],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    }

    if (item.buyValue != null) {
      const cost = requiredAmount * item.buyValue
      const currentGold = inventory['gold'] ?? 0
      const remainingCost = Math.max(0, cost - currentGold)
      const goldTime =
        modifiers.goldPerMinute > 0 && remainingCost > 0
          ? goldToSeconds(remainingCost, modifiers.goldPerMinute)
          : remainingCost <= 0
            ? 0
            : null
      const method: PlannerMethod = {
        id: `${nodeId}#buy`,
        nodeId,
        kind: 'buy',
        title: 'Merchant',
        subtitle: `Buy ${formatAmount(requiredAmount)} directly`,
        requiredAmount,
        localTimeSeconds: goldTime ?? 0,
        totalTimeSeconds: goldTime ?? 0,
        cost,
        detailRows: [
          { label: 'Unit price', value: `${item.buyValue.toLocaleString()} gold` },
          { label: 'Total cost', value: `${Math.round(cost).toLocaleString()} gold` },
          ...(currentGold > 0
            ? [
                { label: 'On hand', value: `${Math.round(currentGold).toLocaleString()} gold` },
                {
                  label: 'Still need',
                  value: `${Math.round(remainingCost).toLocaleString()} gold`,
                },
              ]
            : []),
          ...(goldTime != null && goldTime > 0
            ? [
                { label: 'Gold rate', value: `${modifiers.goldPerMinute.toFixed(0)} gold/min` },
                {
                  label: 'Gold time',
                  value: `~${formatDuration(goldTime)} to earn`,
                  estimated: true,
                },
              ]
            : remainingCost <= 0
              ? [{ label: 'Gold time', value: 'Affordable now' }]
              : [{ label: 'Gold rate', value: 'Not configured' }]),
        ],
        notes:
          remainingCost <= 0
            ? ['You have enough gold on hand to buy this now.']
            : goldTime != null && goldTime > 0
              ? [
                  `Time estimated from passive gold income (${modifiers.goldPerMinute.toFixed(0)} gold/min).`,
                ]
              : ['Configure gold income in Settings for time estimates.'],
        children: [],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    }

    methods.sort((a, b) => {
      const kindOrder = [
        'craft',
        'machine',
        'gather',
        'fabrication',
        'garden',
        'container',
        'expedition',
        'buy',
        'unknown',
        'cycle',
      ]
      return kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
    })

    const nonBuyMethods = methods.filter((method) => method.kind !== 'buy')
    const knownTimeMethods = (nonBuyMethods.length > 0 ? nonBuyMethods : methods).filter(
      (method) => method.totalTimeSeconds != null,
    )
    const defaultMethodId =
      knownTimeMethods.length > 0
        ? knownTimeMethods.toSorted(
            (a, b) =>
              (a.totalTimeSeconds ?? Number.POSITIVE_INFINITY) -
              (b.totalTimeSeconds ?? Number.POSITIVE_INFINITY),
          )[0].id
        : ((nonBuyMethods[0] ?? methods[0])?.id ?? null)

    const node: PlannerNode = {
      id: nodeId,
      itemId,
      itemName: item.name,
      itemType: item.type,
      requiredAmount,
      depth,
      defaultMethodId,
      methods,
      issues: methods.length === 0 ? [`No planner source found for ${item.name}.`] : [],
      fulfilled: false,
    }

    nodesById.set(nodeId, node)
    return node
  }

  const rootItem = itemById.get(targetItemId)
  if (!rootItem) {
    return {
      root: null,
      nodesById: {},
      methodsById: {},
    }
  }

  const root = buildNode(rootItem.id, Math.max(targetQuantity, 1), 0, [], `node:${rootItem.id}`)

  return {
    root,
    nodesById: Object.fromEntries(nodesById.entries()),
    methodsById: Object.fromEntries(methodsById.entries()),
  }
}

const resourceSortPriority = (r: string) =>
  r.startsWith('Machine:')
    ? 1.5
    : r.startsWith('Garden:')
      ? 2
      : r.startsWith('Fabrication:')
        ? 2.5
        : r.startsWith('Expedition:')
          ? 3
          : 1

export function computeSchedule(
  root: PlannerNode,
  nodesById: Record<string, PlannerNode>,
  activeMethodIdByNode: Record<string, string | null>,
  methodsById: Record<string, PlannerMethod>,
  modifiers?: PlannerModifiers,
  /** Pre-existing queue times per workstation — offsets when the planner can start using each station */
  queueOffsets?: Record<string, number>,
): PlannerSchedule {
  const tasks: ScheduledTask[] = []
  const resourceNextFree: Record<string, number> = { ...queueOffsets }
  const completionTime = new Map<string, number>()

  function schedule(node: PlannerNode): number {
    if (completionTime.has(node.id)) return completionTime.get(node.id)!
    if (node.fulfilled) {
      completionTime.set(node.id, 0)
      return 0
    }

    const methodId = activeMethodIdByNode[node.id]
    const method = methodId ? methodsById[methodId] : null
    if (!method || method.localTimeSeconds == null) {
      completionTime.set(node.id, 0)
      return 0
    }

    // Recurse children first — bottom-up
    let depsReady = 0
    const depNodeIds: string[] = []
    for (const child of method.children) {
      const childNode = nodesById[child.nodeId]
      if (childNode) {
        depsReady = Math.max(depsReady, schedule(childNode))
        depNodeIds.push(childNode.id)
      }
    }

    // Determine resource and start time
    let resource: string
    let startTime: number

    if (method.kind === 'craft') {
      resource = method.title
      startTime = Math.max(depsReady, resourceNextFree[resource] ?? 0)
    } else if (method.kind === 'machine') {
      resource = `Machine: ${method.title}`
      startTime = Math.max(depsReady, resourceNextFree[resource] ?? 0)
    } else if (method.kind === 'gather') {
      resource = method.title
      startTime = Math.max(depsReady, resourceNextFree[resource] ?? 0)
    } else if (method.kind === 'garden') {
      resource = `Garden: ${node.itemName}`
      startTime = 0
    } else if (method.kind === 'expedition') {
      resource = `Expedition: ${node.itemName}`
      startTime = 0
    } else if (method.kind === 'fabrication') {
      resource = `Fabrication: ${node.itemName}`
      startTime = 0
    } else if (method.kind === 'buy' && method.localTimeSeconds > 0) {
      resource = `Buy: ${node.itemName}`
      startTime = Math.max(depsReady, resourceNextFree[resource] ?? 0)
    } else {
      // container, stocked, instant buy, etc. — negligible time
      completionTime.set(node.id, depsReady)
      return depsReady
    }

    const endTime = startTime + method.localTimeSeconds
    resourceNextFree[resource] = endTime

    tasks.push({
      nodeId: node.id,
      itemId: node.itemId,
      itemName: node.itemName,
      resource,
      kind: method.kind,
      startTime,
      endTime,
      localTime: method.localTimeSeconds,
      depth: node.depth,
      dependencies: depNodeIds.length > 0 ? depNodeIds : undefined,
    })

    completionTime.set(node.id, endTime)
    return endTime
  }

  const totalTime = schedule(root)

  // Add passive generation lanes for machines and fabrication that produce items in the tree
  // but are NOT the selected method for that item
  if (modifiers && totalTime > 0) {
    const treeItemIds = new Set<string>()
    const activeMethodKindByItem = new Map<string, Set<string>>()
    const firstNodeIdByItem = new Map<string, string>()

    function collectItems(node: PlannerNode) {
      if (node.fulfilled) return
      treeItemIds.add(node.itemId)
      if (!firstNodeIdByItem.has(node.itemId)) firstNodeIdByItem.set(node.itemId, node.id)
      const methodId = activeMethodIdByNode[node.id]
      const method = methodId ? methodsById[methodId] : null
      if (method) {
        const kinds = activeMethodKindByItem.get(node.itemId) ?? new Set()
        // Track which machine IDs are active for this item
        if (method.kind === 'machine') kinds.add(`machine:${method.title}`)
        else if (method.kind === 'fabrication') kinds.add('fabrication')
        activeMethodKindByItem.set(node.itemId, kinds)
        for (const child of method.children) {
          const childNode = nodesById[child.nodeId]
          if (childNode) collectItems(childNode)
        }
      }
    }
    collectItems(root)

    for (const itemId of treeItemIds) {
      const item = itemById.get(itemId)
      const itemName = item?.name ?? itemId
      const activeKinds = activeMethodKindByItem.get(itemId) ?? new Set()

      // Machine passive lanes (one per unique machine)
      const seenPassiveMachines = new Set<string>()
      for (const source of machineRecipeIndex.get(itemId) ?? []) {
        if (activeKinds.has(`machine:${source.machineName}`)) continue
        if (seenPassiveMachines.has(source.machineId)) continue
        seenPassiveMachines.add(source.machineId)
        const level = modifiers.machineLevels[source.machineId] ?? 0
        const mult = machineSpeedMultipliers[Math.min(level, machineSpeedMultipliers.length - 1)]
        const interval = Math.max(1, Math.floor(source.baseInterval * mult))
        const produced = Math.floor(totalTime / interval) * source.outputAmount
        if (produced <= 0) continue

        const resource = `Machine: ${source.machineName}`
        tasks.push({
          nodeId: `passive:machine:${source.machineId}:${itemId}`,
          itemId,
          itemName,
          resource,
          kind: 'machine',
          startTime: 0,
          endTime: totalTime,
          localTime: totalTime,
          depth: 0,
          passive: {
            kind: 'machine',
            machineName: source.machineName,
            machineId: source.machineId,
            machineLevel: level,
            baseInterval: source.baseInterval,
            effectiveInterval: interval,
            outputAmount: source.outputAmount,
            produced,
            ratePerMin: (source.outputAmount / interval) * 60,
            linkedNodeId: firstNodeIdByItem.get(itemId),
          },
        })
      }

      // Fabrication passive lane
      if (!activeKinds.has('fabrication')) {
        const points = modifiers.fabricationAllocations[itemId] ?? 0
        if (points > 0) {
          const produced = Math.floor((totalTime / 180) * points)
          if (produced > 0) {
            const resource = `Fabrication: ${itemName}`
            tasks.push({
              nodeId: `passive:fabrication:${itemId}`,
              itemId,
              itemName,
              resource,
              kind: 'fabrication',
              startTime: 0,
              endTime: totalTime,
              localTime: totalTime,
              depth: 0,
              passive: {
                kind: 'fabrication',
                fabricationPoints: points,
                produced,
                ratePerMin: (points / 180) * 60,
                linkedNodeId: firstNodeIdByItem.get(itemId),
              },
            })
          }
        }
      }
    }
  }

  const resourceOrder = [...new Set(tasks.map((t) => t.resource))].toSorted((a, b) => {
    return resourceSortPriority(a) - resourceSortPriority(b) || a.localeCompare(b)
  })

  return {
    tasks,
    resourceOrder,
    totalTime,
    completionTimeByNode: Object.fromEntries(completionTime),
  }
}

interface CraftPlannerOptions {
  /** When true, inventory deduction applies to the root node too (used by summoning planner) */
  deductRootInventory?: boolean
}

export function useCraftPlanner(
  targetItemId: Readonly<Ref<string>>,
  targetQuantity: Readonly<Ref<number>>,
  options: CraftPlannerOptions = {},
) {
  const pinnedMethodIds = ref<Record<string, string>>({})

  const {
    inventoryAmounts: baseInventory,
    queuedAmounts: baseQueuedAmounts,
    queuedTimes: baseQueuedTimes,
    gardenFlowers: baseGarden,
    awakenGatherUpgrades: baseAwakenGather,
    awakenSpeedTiers: baseAwakenSpeed,
    jobTiers: baseJobTiers,
    machineLevels: baseMachineLevels,
    fabricationAllocations: baseFabricationAllocations,
    awakenGoldLevel,
  } = useGameConfig()

  const { ownedCreatureIds, isAwakened: isCreatureAwakened } = useCreatureCollection()

  // Fabrication simulated allocations (from Fabrication page, separate from save baseline)
  const fabricationSimulated = useLocalStorage<Record<string, number>>('fabrication-simulated', {})

  // Temporary overrides — null means "use config value", non-null means "planner simulation"
  const inventoryOverrides = ref<Record<string, number> | null>(null)
  const gardenOverrides = ref<Record<string, GardenFlowerEntry[]> | null>(null)
  const awakenGatherOverrides = ref<Record<string, AwakenGatherUpgrade> | null>(null)
  const awakenSpeedOverrides = ref<Record<string, number> | null>(null)
  const jobTierOverrides = ref<Record<string, number> | null>(null)
  const machineLevelOverrides = ref<Record<string, number> | null>(null)
  const fabricationOverrides = ref<Record<string, number> | null>(null)

  const rawInventoryAmounts = computed(() => inventoryOverrides.value ?? baseInventory.value)
  const queuedAmounts = computed(() => baseQueuedAmounts.value)
  const inventoryAmounts = computed(() => {
    const inv = rawInventoryAmounts.value
    const queued = queuedAmounts.value
    if (Object.keys(queued).length === 0) return inv
    const merged = { ...inv }
    for (const stationItems of Object.values(queued)) {
      for (const [id, amount] of Object.entries(stationItems)) {
        if (amount > 0) merged[id] = (merged[id] ?? 0) + amount
      }
    }
    return merged
  })
  const gardenFlowers = computed(() => gardenOverrides.value ?? baseGarden.value)
  const awakenGatherUpgrades = computed(() => awakenGatherOverrides.value ?? baseAwakenGather.value)
  const awakenSpeedTiers = computed(() => awakenSpeedOverrides.value ?? baseAwakenSpeed.value)
  const jobTiers = computed(() => jobTierOverrides.value ?? baseJobTiers.value)
  const machineLevels = computed(() => machineLevelOverrides.value ?? baseMachineLevels.value)
  const fabricationAllocations = computed(
    () =>
      fabricationOverrides.value ?? {
        ...baseFabricationAllocations.value,
        ...fabricationSimulated.value,
      },
  )

  const awakenedCount = computed(() => {
    let count = 0
    for (const id of ownedCreatureIds.value) {
      if (isCreatureAwakened(id)) count++
    }
    return count
  })

  const goldPerMinute = computed(() =>
    computeGoldPerMinute(
      awakenedCount.value,
      awakenGoldLevel.value,
      gardenFlowers.value['gold-flower'] ?? [],
    ),
  )

  const modifiers = computed<PlannerModifiers>(() => ({
    gardenFlowers: gardenFlowers.value,
    awakenGatherUpgrades: awakenGatherUpgrades.value,
    awakenSpeedTiers: awakenSpeedTiers.value,
    jobTiers: jobTiers.value,
    goldPerMinute: goldPerMinute.value,
    machineLevels: machineLevels.value,
    fabricationAllocations: fabricationAllocations.value,
    expeditionTier: 5,
  }))

  const graph = computed(() =>
    buildPlannerGraph(
      targetItemId.value,
      targetQuantity.value,
      inventoryAmounts.value,
      modifiers.value,
      options.deductRootInventory,
    ),
  )

  function getActiveMethodId(node: PlannerNode): string | null {
    return pinnedMethodIds.value[node.id] ?? node.defaultMethodId
  }

  function getActiveMethod(nodeId: string): PlannerMethod | null {
    const node = graph.value.nodesById[nodeId]
    if (!node) return null
    const methodId = getActiveMethodId(node)
    return methodId ? (graph.value.methodsById[methodId] ?? null) : null
  }

  const summary = computed<PlannerSummary | null>(() => {
    if (!graph.value.root) return null

    const leafAmounts = new Map<
      string,
      { itemName: string; amount: number; acquisitionKind: PlannerMethodKind }
    >()
    let totalCost = 0
    let craftStepCount = 0
    let branchPointCount = 0
    let missingTimeNodeCount = 0

    // Time buckets
    const gatherTimeByJob: Record<string, number> = {}
    const craftTimeByWorkstation: Record<string, number> = {}
    const machineTimeByMachine: Record<string, number> = {}
    let gardenTimeSeconds = 0
    let expeditionTimeSeconds = 0
    let fabricationTimeSeconds = 0

    function addLeaf(itemId: string, itemName: string, amount: number, kind: PlannerMethodKind) {
      const existing = leafAmounts.get(itemId)
      if (existing) existing.amount += amount
      else leafAmounts.set(itemId, { itemName, amount, acquisitionKind: kind })
    }

    function walk(node: PlannerNode) {
      if (node.fulfilled) {
        addLeaf(node.itemId, node.itemName, 0, 'stocked')
        return
      }

      if (node.methods.length > 1) branchPointCount += 1

      const activeMethod = getActiveMethod(node.id)
      if (!activeMethod) {
        missingTimeNodeCount += 1
        addLeaf(node.itemId, node.itemName, node.requiredAmount, 'unknown')
        return
      }

      if (activeMethod.kind === 'craft') craftStepCount += 1
      if (activeMethod.cost != null) totalCost += activeMethod.cost

      if (activeMethod.localTimeSeconds == null) {
        missingTimeNodeCount += 1
      } else {
        switch (activeMethod.kind) {
          case 'craft':
            craftTimeByWorkstation[activeMethod.title] =
              (craftTimeByWorkstation[activeMethod.title] ?? 0) + activeMethod.localTimeSeconds
            break
          case 'gather':
            gatherTimeByJob[activeMethod.title] =
              (gatherTimeByJob[activeMethod.title] ?? 0) + activeMethod.localTimeSeconds
            break
          case 'machine':
            machineTimeByMachine[activeMethod.title] =
              (machineTimeByMachine[activeMethod.title] ?? 0) + activeMethod.localTimeSeconds
            break
          case 'fabrication':
            fabricationTimeSeconds = Math.max(fabricationTimeSeconds, activeMethod.localTimeSeconds)
            break
          case 'garden':
            gardenTimeSeconds = Math.max(gardenTimeSeconds, activeMethod.localTimeSeconds)
            break
          case 'expedition':
            expeditionTimeSeconds = Math.max(expeditionTimeSeconds, activeMethod.localTimeSeconds)
            break
          default:
            // buy, container opening time, etc. — negligible
            break
        }
      }

      if (activeMethod.children.length === 0) {
        addLeaf(node.itemId, node.itemName, node.requiredAmount, activeMethod.kind)
        return
      }

      for (const child of activeMethod.children) {
        const childNode = graph.value.nodesById[child.nodeId]
        if (!childNode) continue
        walk(childNode)
      }
    }

    walk(graph.value.root)

    const maxGatherTime = Math.max(0, ...Object.values(gatherTimeByJob))
    const maxWorkstationTime = Math.max(0, ...Object.values(craftTimeByWorkstation))
    const maxMachineTime = Math.max(0, ...Object.values(machineTimeByMachine))
    const activeTimeSeconds = Math.max(maxGatherTime, maxWorkstationTime, maxMachineTime)
    const passiveTimeSeconds = Math.max(
      gardenTimeSeconds,
      expeditionTimeSeconds,
      fabricationTimeSeconds,
    )
    // Prefer schedule-based total (accounts for dependency ordering + resource contention)
    const scheduledTotal = schedule.value?.totalTime ?? null
    const totalTimeSeconds =
      missingTimeNodeCount > 0
        ? null
        : (scheduledTotal ?? Math.max(activeTimeSeconds, passiveTimeSeconds))

    const timeBreakdown: PlannerTimeBreakdown | null =
      missingTimeNodeCount > 0
        ? null
        : {
            gatherTimeByJob,
            craftTimeByWorkstation,
            machineTimeByMachine,
            gardenTimeSeconds,
            expeditionTimeSeconds,
            fabricationTimeSeconds,
            activeTimeSeconds,
            passiveTimeSeconds,
          }

    return {
      totalTimeSeconds,
      timeBreakdown,
      totalCost,
      craftStepCount,
      branchPointCount,
      missingTimeNodeCount,
      leafItems: [...leafAmounts.entries()]
        .map(([itemId, value]): PlannerSummaryLeaf => {
          const inv = inventoryAmounts.value[itemId] ?? 0
          // When deductRootInventory is true, value.amount is already net (after inventory claimed).
          // Recover total: original = deducted + inventory claimed at root.
          const total = options.deductRootInventory ? value.amount + inv : value.amount
          const needed = options.deductRootInventory
            ? value.amount
            : Math.max(0, value.amount - inv)
          return {
            itemId,
            itemName: value.itemName,
            amount: total,
            stillNeeded: needed,
            acquisitionKind: value.acquisitionKind,
            inventoryAmount: inv,
          }
        })
        .toSorted((a, b) => b.amount - a.amount),
    }
  })

  const shoppingListText = computed(() => {
    if (!summary.value) return ''
    const needed = summary.value.leafItems.filter((l) => l.stillNeeded > 0)
    const grouped = new Map<PlannerMethodKind, PlannerSummaryLeaf[]>()
    for (const leaf of needed) {
      const group = grouped.get(leaf.acquisitionKind) ?? []
      group.push(leaf)
      grouped.set(leaf.acquisitionKind, group)
    }
    const lines: string[] = []
    for (const [kind, leaves] of grouped) {
      lines.push(`── ${methodKindLabel(kind)} ──`)
      for (const leaf of leaves) {
        lines.push(`  x${formatAmount(leaf.stillNeeded)} ${leaf.itemName}`)
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  })

  function setPinnedMethod(nodeId: string, methodId: string) {
    pinnedMethodIds.value = {
      ...pinnedMethodIds.value,
      [nodeId]: methodId,
    }
  }

  function resetPins() {
    pinnedMethodIds.value = {}
  }

  function setInventory(itemId: string, amount: number) {
    const base = inventoryOverrides.value ?? { ...baseInventory.value }
    if (amount <= 0) {
      const { [itemId]: _, ...rest } = base
      inventoryOverrides.value = rest
    } else {
      inventoryOverrides.value = { ...base, [itemId]: amount }
    }
  }

  function resetInventory() {
    inventoryOverrides.value = null
  }

  function setGardenFlowerEntries(flowerId: string, entries: GardenFlowerEntry[]) {
    const base = gardenOverrides.value ?? { ...baseGarden.value }
    gardenOverrides.value = {
      ...base,
      [flowerId]: entries.filter((e) => e.count > 0),
    }
  }

  function resetGarden() {
    gardenOverrides.value = null
  }

  function setAwakenGatherYieldBonus(jobId: string, yieldBonus: number) {
    const base = awakenGatherOverrides.value ?? { ...baseAwakenGather.value }
    const current = base[jobId] ?? { yieldBonus: 0, durationTier: 0 }
    awakenGatherOverrides.value = {
      ...base,
      [jobId]: { ...current, yieldBonus: Math.max(0, Math.min(2, yieldBonus)) },
    }
  }

  function setAwakenGatherDurationTier(jobId: string, tier: number) {
    const base = awakenGatherOverrides.value ?? { ...baseAwakenGather.value }
    const current = base[jobId] ?? { yieldBonus: 0, durationTier: 0 }
    awakenGatherOverrides.value = {
      ...base,
      [jobId]: { ...current, durationTier: Math.max(0, Math.min(4, tier)) },
    }
  }

  function setAwakenSpeedTier(workstation: string, tier: number) {
    const base = awakenSpeedOverrides.value ?? { ...baseAwakenSpeed.value }
    awakenSpeedOverrides.value = {
      ...base,
      [workstation]: Math.max(0, Math.min(4, tier)),
    }
  }

  function resetAwaken() {
    awakenGatherOverrides.value = null
    awakenSpeedOverrides.value = null
  }

  function setJobTier(jobId: string, tier: number) {
    const base = jobTierOverrides.value ?? { ...baseJobTiers.value }
    jobTierOverrides.value = { ...base, [jobId]: Math.max(0, Math.min(5, tier)) }
  }

  function resetJobTiers() {
    jobTierOverrides.value = null
  }

  function setMachineLevel(machineId: string, level: number) {
    const base = machineLevelOverrides.value ?? { ...baseMachineLevels.value }
    machineLevelOverrides.value = { ...base, [machineId]: Math.max(0, Math.min(10, level)) }
  }

  function resetMachineLevels() {
    machineLevelOverrides.value = null
  }

  function setFabricationAllocation(itemId: string, points: number) {
    const base = fabricationOverrides.value ?? { ...baseFabricationAllocations.value }
    if (points <= 0) {
      const { [itemId]: _, ...rest } = base
      fabricationOverrides.value = rest
    } else {
      fabricationOverrides.value = { ...base, [itemId]: Math.max(0, Math.min(5, points)) }
    }
  }

  function resetFabrication() {
    fabricationOverrides.value = null
  }

  function resetAllSettings() {
    inventoryOverrides.value = null
    gardenOverrides.value = null
    awakenGatherOverrides.value = null
    awakenSpeedOverrides.value = null
    jobTierOverrides.value = null
    machineLevelOverrides.value = null
    fabricationOverrides.value = null
    resetPins()
  }

  const activeMethodIdByNode = computed<Record<string, string | null>>(() => {
    return Object.fromEntries(
      Object.values(graph.value.nodesById).map((node) => [node.id, getActiveMethodId(node)]),
    )
  })

  const schedule = computed<PlannerSchedule | null>(() => {
    const root = graph.value.root
    if (!root) return null
    return computeSchedule(
      root,
      graph.value.nodesById,
      activeMethodIdByNode.value,
      graph.value.methodsById,
      modifiers.value,
      baseQueuedTimes.value,
    )
  })

  const allTreeItems = computed(() => {
    const root = graph.value.root
    if (!root) return []

    const treeItems = new Map<string, { itemId: string; itemName: string; itemType: ItemType }>()

    function walk(node: PlannerNode) {
      if (!treeItems.has(node.itemId)) {
        treeItems.set(node.itemId, {
          itemId: node.itemId,
          itemName: node.itemName,
          itemType: node.itemType,
        })
      }
      const method = getActiveMethod(node.id)
      if (!method) return
      for (const child of method.children) {
        const childNode = graph.value.nodesById[child.nodeId]
        if (childNode) walk(childNode)
      }
    }

    walk(root)
    return [...treeItems.values()].toSorted((a, b) => a.itemName.localeCompare(b.itemName))
  })

  return {
    rootNode: computed(() => graph.value.root),
    nodesById: computed(() => graph.value.nodesById),
    methodsById: computed(() => graph.value.methodsById),
    activeMethodIdByNode,
    schedule,
    summary,
    shoppingListText,
    pinnedMethodIds,
    inventoryAmounts,
    queuedAmounts,
    flatQueuedAmounts: computed(() => {
      const flat: Record<string, number> = {}
      for (const stationItems of Object.values(queuedAmounts.value)) {
        for (const [id, amount] of Object.entries(stationItems)) {
          if (amount > 0) flat[id] = (flat[id] ?? 0) + amount
        }
      }
      return flat
    }),
    gardenFlowers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    getActiveMethod,
    setPinnedMethod,
    resetPins,
    allTreeItems,
    setInventory,
    resetInventory,
    setGardenFlowerEntries,
    resetGarden,
    setAwakenGatherYieldBonus,
    setAwakenGatherDurationTier,
    setAwakenSpeedTier,
    resetAwaken,
    jobTiers,
    setJobTier,
    resetJobTiers,
    machineLevels,
    setMachineLevel,
    resetMachineLevels,
    fabricationAllocations,
    setFabricationAllocation,
    resetFabrication,
    resetAllSettings,
    formatAmount,
  }
}
