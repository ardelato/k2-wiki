import { useLocalStorage } from '@vueuse/core'
import { computed, ref, type Ref } from 'vue'

import { useAwakenSimulation } from '@/composables/useAwakenSimulation'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useGameConfig } from '@/composables/useGameConfig'
import { useTools } from '@/composables/useTools'
import {
  itemById,
  jobActivityIndex,
  containerSourceIndex,
  expeditionSourceIndex,
  machineRecipeIndex,
  machineSpeedMultipliers,
} from '@/data/indexes'
import toolsData from '@/data/tools.json'
import { activeLocale, t } from '@/i18n'
import type {
  AwakenGatherUpgrade,
  GardenFlowerEntry,
  ItemType,
  PlannerLockedGate,
  PlannerMethod,
  PlannerMethodChild,
  PlannerMethodDetail,
  PlannerMethodKind,
  PlannerNode,
  PlannerSchedule,
  PlannerSkillGateSummary,
  PlannerSummary,
  PlannerSummaryLeaf,
  PlannerTimeBreakdown,
  ScheduledTask,
} from '@/types'
import {
  formatChance,
  formatDuration,
  formatNumber,
  itemName as resolveItemName,
  methodKindLabel,
} from '@/utils/format/format'
import { JOB_TIER_DURATION_REDUCTION, JOB_TIER_YIELD_BONUS, tierModifiers } from '@/utils/formulas'
import { computeGoldPerMinute, goldToSeconds } from '@/utils/planner/goldIncome'
import { resourceSortPriority } from '@/utils/save/resourceType'

export type { GardenFlowerEntry, AwakenGatherUpgrade }

export interface PlannerModifiers {
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number> // per workstation, 0–4
  toolSpeedBonuses: Record<string, number> // workstation → speed bonus fraction (e.g. 0.10 = +10%)
  jobTiers: Record<string, number>
  goldPerMinute: number
  machineLevels: Record<string, number>
  machineRecipes: Record<string, string | null> // machineId → selectedRecipeId ('all' | outputItemId | null)
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
      flowerItemName: resolveItemName(flowerItemId),
      cycleSeconds: 60,
      yieldPerCycle: 1,
    },
  ]),
)

function expectedAmount(min: number, max: number): number {
  return (min + max) / 2
}

// `Number.prototype.toLocaleString()` builds a fresh Intl.NumberFormat on every call
// (~5.7µs each). buildPlannerGraph formats thousands of amounts per graph and the summon
// page builds many graphs, so we cache one formatter per locale (~0.1µs/call) — ~40× faster
// while staying locale-aware after the i18n pass: one cached formatter per locale.
const integerFormatterCache = new Map<string, Intl.NumberFormat>()

function formatInteger(value: number): string {
  const locale = activeLocale()
  let formatter = integerFormatterCache.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale)
    integerFormatterCache.set(locale, formatter)
  }
  return formatter.format(value)
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return formatInteger(value)
  if (value >= 100) return value.toFixed(1)
  if (value >= 10) return value.toFixed(2)
  return value.toFixed(3)
}

function formatTimeOrUnknown(value: number | null): string {
  return value == null ? t('methods.unknown') : formatDuration(value)
}

const FABRICATION_CYCLE_SECONDS = 180

// Expedition tier assumed for planner loot/yield modifiers. TODO: wire to the
// player's actual selected tier instead of assuming max.
const DEFAULT_EXPEDITION_TIER = 5

/**
 * Workstation tools (saw/knife/hammer) are owned, one-time prerequisites — they enable
 * a workstation and are NOT consumed per craft. Recipe data lists them as amount:1
 * ingredients, so treating them literally explodes requirements (every plank "needs" a
 * saw → 4 twig + 4 stone each). Exclude them from craft-method children; the workstation
 * itself is already represented by each craft method's skillGate.
 */
const WORKSTATION_TOOL_IDS = new Set(
  toolsData.tools.filter((t) => t.category === 'workstation').map((t) => t.id),
)

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
    ? t('planner.detail.passiveFormula', {
        amount: formatAmount(requiredAmount),
        active: (activeRate * 60).toFixed(1),
        passive: (passive.rate * 60).toFixed(1),
      })
    : baseFormula
}

export function getPassiveRate(
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
    // Phantom-credit gate: only credit a processor for the recipe it's actually set to.
    // Generators (inputItemId === null) always run their single output, so skip the gate.
    // selectedRecipeId: null/undefined → nothing selected; 'all' → sequential queue over all
    // recipes (still produces this one); a specific outputItemId → only that item.
    // NOTE: 'all' mode is sequential, so full-rate credit can over-count when several of a
    // machine's recipes are needed at once — rate-splitting is a follow-up (needs the queue order).
    if (source.inputItemId !== null) {
      const selected = (modifiers.machineRecipes ?? {})[source.machineId]
      if (selected == null || (selected !== 'all' && selected !== itemId)) continue
    }
    seenMachines.add(source.machineId)
    const level = modifiers.machineLevels[source.machineId] ?? 0
    const mult = machineSpeedMultipliers[Math.min(level, machineSpeedMultipliers.length - 1)]
    const interval = Math.max(1, Math.floor(source.baseInterval * mult))
    const machineRate = source.outputAmount / interval
    rate += machineRate
    details.push({
      label: t('planner.detail.machineSource', { name: source.machineName }),
      ratePerMin: machineRate * 60,
    })
  }

  // Fabrication production rate
  if (!excludeFabrication) {
    const points = modifiers.fabricationAllocations[itemId] ?? 0
    if (points > 0) {
      const fabRate = points / FABRICATION_CYCLE_SECONDS
      rate += fabRate
      details.push({
        label: t('planner.detail.fabricationSource', { points }),
        ratePerMin: fabRate * 60,
      })
    }
  }

  return { rate, details }
}

function passiveDetailRows(passive: PassiveRateResult): { label: string; value: string }[] {
  if (passive.rate <= 0) return []
  return passive.details.map((d) => ({
    label: d.label,
    value: t('planner.detail.ratePerMin', { rate: d.ratePerMin.toFixed(1) }),
  }))
}

/**
 * Shared inputs every method-kind builder needs. Passed explicitly so each builder reads
 * independently of `buildNode`'s closure. The maps are the same per-graph instances that
 * `buildNode` mutates; `recurse` is the `buildNode` recursion callback; `remainingStock`
 * is the live inventory map (the container builder snapshots/restores it for its two-pass).
 */
interface BuildMethodsCtx {
  modifiers: PlannerModifiers
  inventory: Record<string, number>
  nodesById: Map<string, PlannerNode>
  methodsById: Map<string, PlannerMethod>
  remainingStock: Map<string, number>
  recurse: (
    itemId: string,
    requiredAmount: number,
    depth: number,
    ancestry: string[],
    path: string,
  ) => PlannerNode
}

/**
 * Roll up a method's total time as localTime + max(child default-method total times).
 * Returns null when any child's time is unknown (matching the original craft/machine logic).
 * Shared verbatim by the craft and machine builders.
 */
function rollUpChildTimes(
  children: PlannerMethodChild[],
  localTimeSeconds: number,
  ctx: BuildMethodsCtx,
): number | null {
  const childTimes = children.map((child) => {
    const childNode = ctx.nodesById.get(child.nodeId)
    if (!childNode) return null
    if (childNode.fulfilled) return 0
    if (!childNode.defaultMethodId) return null
    const childMethod = ctx.methodsById.get(childNode.defaultMethodId)
    if (!childMethod) return null
    return childMethod.totalTimeSeconds ?? null
  })
  const knownChildTimes = childTimes.filter((time): time is number => time != null)
  const maxChildTime = knownChildTimes.length > 0 ? Math.max(...knownChildTimes) : 0
  return knownChildTimes.length !== childTimes.length ? null : localTimeSeconds + maxChildTime
}

function buildCraftMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  depth: number,
  nextAncestry: string[],
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const item = itemById.get(itemId)
  if (!item) return []
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

  item.recipes.forEach((recipe, recipeIndex) => {
    const craftsNeeded = Math.ceil(requiredAmount / recipe.outputAmount)
    const children: PlannerMethodChild[] = recipe.ingredients
      .filter((ingredient) => !WORKSTATION_TOOL_IDS.has(ingredient.id))
      .map((ingredient, childIndex) => {
        const childPath = `${nodeId}/recipe-${recipeIndex}/ingredient-${childIndex}:${ingredient.id}`
        const childNode = ctx.recurse(
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

    const awakenReduction = (modifiers.awakenSpeedTiers[recipe.workstation] ?? 0) * 0.15
    const toolSpeedBonus = modifiers.toolSpeedBonuses[recipe.workstation] ?? 0
    const speedReduction = awakenReduction + toolSpeedBonus
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
    const totalTimeSeconds = rollUpChildTimes(children, localTimeSeconds, ctx)

    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#recipe-${recipeIndex}`,
      nodeId,
      kind: 'craft',
      title: recipe.workstation,
      subtitle: t(
        craftsNeeded === 1 ? 'planner.detail.craftSubtitle' : 'planner.detail.craftSubtitlePlural',
        { count: craftsNeeded, output: formatAmount(requiredAmount) },
      ),
      requiredAmount,
      localTimeSeconds,
      totalTimeSeconds,
      skillGate: { skill: recipe.workstation, level: recipe.levelRequirement },
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          {
            label: t('planner.detail.output'),
            value: t('planner.detail.eachValue', { amount: recipe.outputAmount }),
          },
          { label: t('planner.detail.crafts'), value: formatAmount(craftsNeeded) },
          {
            label: t('planner.detail.level'),
            value: t('planner.detail.lvValue', { level: recipe.levelRequirement }),
          },
          ...((modifiers.awakenSpeedTiers[recipe.workstation] ?? 0) > 0
            ? [
                {
                  label: t('planner.detail.speedTier'),
                  value: t('planner.detail.speedBonus', {
                    pct: modifiers.awakenSpeedTiers[recipe.workstation] * 15,
                  }),
                },
              ]
            : []),
          ...((modifiers.toolSpeedBonuses[recipe.workstation] ?? 0) > 0
            ? [
                {
                  label: t('planner.detail.toolSpeed'),
                  value: t('planner.detail.speedBonus', {
                    pct: Math.round(modifiers.toolSpeedBonuses[recipe.workstation] * 100),
                  }),
                },
              ]
            : []),
          ...passiveDetailRows(passive),
          { label: t('planner.detail.stepTime'), value: formatDuration(localTimeSeconds) },
          { label: t('planner.detail.totalTime'), value: formatTimeOrUnknown(totalTimeSeconds) },
          ...(totalTimeSeconds != null && totalTimeSeconds > localTimeSeconds
            ? [
                {
                  label: t('planner.detail.depsTime'),
                  value: formatDuration(totalTimeSeconds - localTimeSeconds),
                },
              ]
            : []),
        ])
      },
      get formula() {
        return passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          t('planner.detail.craftFormula', {
            crafts: formatAmount(craftsNeeded),
            time: formatDuration(recipe.craftTime),
          }),
        )
      },
      notes: [],
      children,
    }

    methods.push(method)
    methodsById.set(method.id, method)
  })

  return methods
}

function buildGatherMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

  ;(jobActivityIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
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
    let detailRowsCache: PlannerMethodDetail[] | undefined
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
      skillGate: { skill: source.jobId, level: source.levelRequirement },
      get detailRows() {
        return (detailRowsCache ??= [
          { label: t('planner.detail.activity'), value: source.activityName },
          {
            label: t('planner.detail.level'),
            value: t('planner.detail.lvValue', { level: source.levelRequirement }),
          },
          {
            label: t('planner.detail.yieldPerAction'),
            value: `${formatChance(source.chance)} × ${formatAmount(expectedAmount(source.min, source.max))}`,
          },
          ...(yieldBonus > 0 || (awakenGather?.durationTier ?? 0) > 0
            ? [
                {
                  label: t('planner.detail.awakenTree'),
                  value: [
                    ...(yieldBonus > 0
                      ? [t('planner.detail.yieldBonus', { amount: yieldBonus })]
                      : []),
                    ...((awakenGather?.durationTier ?? 0) > 0
                      ? [
                          t('planner.detail.durationReduction', {
                            pct: (awakenGather?.durationTier ?? 0) * 5,
                          }),
                        ]
                      : []),
                  ].join(', '),
                },
              ]
            : []),
          ...((JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) > 0 ||
          (JOB_TIER_YIELD_BONUS[jobTier] ?? 0) > 0
            ? [
                {
                  label: t('planner.detail.sanctuary'),
                  value: `T${jobTier} (${[
                    ...((JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) > 0
                      ? [
                          t('planner.detail.durationReduction', {
                            pct: (JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) * 100,
                          }),
                        ]
                      : []),
                    ...((JOB_TIER_YIELD_BONUS[jobTier] ?? 0) > 0
                      ? [
                          t('planner.detail.yieldBonus', {
                            amount: JOB_TIER_YIELD_BONUS[jobTier],
                          }),
                        ]
                      : []),
                  ].join(', ')})`,
                },
              ]
            : []),
          ...passiveDetailRows(passive),
          {
            label: t('planner.detail.actions'),
            value: formatAmount(actionsNeeded),
            estimated: isEstimated,
          },
          {
            label: t('planner.detail.stepTime'),
            value: formatDuration(localTimeSeconds),
            estimated: isEstimated,
          },
        ])
      },
      get formula() {
        return passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          t('planner.detail.gatherFormula', {
            amount: formatAmount(requiredAmount),
            chance: formatChance(source.chance),
            yield: formatAmount(expectedAmount(source.min, source.max)),
            time: formatDuration(source.duration),
          }),
        )
      },
      notes: [t('planner.detail.gatherNote')],
      children: [],
    }

    methods.push(method)
    methodsById.set(method.id, method)
  })

  return methods
}

function buildGardenMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const gardenSource = gardenSourcesByItem.get(itemId)
  if (!gardenSource) return []
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

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
    const breakdownParts = entries.filter((e) => e.count > 0).map((e) => `${e.count}×Lv${e.level}`)
    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#garden`,
      nodeId,
      kind: 'garden',
      title: gardenSource.flowerItemName,
      subtitle: t('planner.detail.gardenGrowth'),
      requiredAmount,
      localTimeSeconds,
      totalTimeSeconds: localTimeSeconds,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          { label: t('planner.detail.flower'), value: gardenSource.flowerItemName },
          {
            label: t('planner.detail.setup'),
            value: breakdownParts.join(' + ') || t('planner.detail.none'),
          },
          { label: t('planner.detail.totalFlowers'), value: String(totalFlowers) },
          {
            label: t('planner.detail.yieldPerCycle'),
            value: t('planner.detail.yieldPer60s', { amount: formatAmount(yieldPerCycle) }),
          },
          ...passiveDetailRows(passive),
          { label: t('planner.detail.cycles'), value: formatAmount(cyclesNeeded) },
          { label: t('planner.detail.stepTime'), value: formatDuration(localTimeSeconds) },
        ])
      },
      get formula() {
        return passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          t('planner.detail.gardenFormula', {
            amount: formatAmount(requiredAmount),
            yield: formatAmount(yieldPerCycle),
            time: formatDuration(gardenSource.cycleSeconds),
          }),
        )
      },
      notes: [
        t('planner.detail.gardenNote', {
          setup: breakdownParts.join(' + '),
          rate: yieldPerCycle,
        }),
      ],
      children: [],
    }

    methods.push(method)
    methodsById.set(method.id, method)
  } else {
    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#garden`,
      nodeId,
      kind: 'garden',
      title: gardenSource.flowerItemName,
      subtitle: t('planner.detail.gardenNoFlowers'),
      requiredAmount,
      localTimeSeconds: null,
      totalTimeSeconds: null,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          { label: t('planner.detail.flower'), value: gardenSource.flowerItemName },
          { label: t('planner.detail.setup'), value: t('planner.detail.none') },
          { label: t('planner.detail.totalFlowers'), value: '0' },
        ])
      },
      notes: [t('planner.detail.gardenConfigureNote')],
      children: [],
    }

    methods.push(method)
    methodsById.set(method.id, method)
  }

  return methods
}

function buildContainerMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  depth: number,
  nextAncestry: string[],
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const { modifiers, methodsById, remainingStock } = ctx
  const methods: PlannerMethod[] = []

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
      const probeNode = ctx.recurse(
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

    const containerNode = ctx.recurse(
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
    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#container-${sourceIndex}`,
      nodeId,
      kind: 'container',
      title: source.containerName,
      subtitle: t('planner.detail.containerSubtitle', { count: formatAmount(openingsNeeded) }),
      requiredAmount,
      localTimeSeconds: 0,
      totalTimeSeconds,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          {
            label: t('planner.detail.yieldPerOpen'),
            value: `${formatChance(source.chance)} × ${source.amount}`,
          },
          {
            label: t('planner.detail.containersNeeded'),
            value: formatAmount(openingsNeeded),
            estimated: isContainerEstimated,
          },
          ...passiveDetailRows(passive),
          {
            label: t('planner.detail.totalTime'),
            value: formatTimeOrUnknown(totalTimeSeconds),
            estimated: isContainerEstimated,
          },
        ])
      },
      get formula() {
        return passiveReduced
          ? t('planner.detail.containerFormulaPassive', {
              amount: formatAmount(requiredAmount),
              openings: formatAmount(openingsNeeded),
              container: source.containerName.toLowerCase(),
            })
          : t('planner.detail.containerFormula', {
              amount: formatAmount(requiredAmount),
              chance: formatChance(source.chance),
              yield: source.amount,
              container: source.containerName.toLowerCase(),
            })
      },
      notes: [
        t('planner.detail.containerNote'),
        ...(passiveReduced
          ? [
              t('planner.detail.containerPassiveNote', {
                from: formatAmount(fullOpeningsNeeded),
                to: formatAmount(openingsNeeded),
              }),
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

  return methods
}

function buildExpeditionMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

  ;(expeditionSourceIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
    const lootAmount = source.amount * tierModifiers.loot[(modifiers.expeditionTier || 1) - 1]
    const runsNeeded = requiredAmount / lootAmount
    const estimatedTime = runsNeeded * source.baseDuration
    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#expedition-${sourceIndex}`,
      nodeId,
      kind: 'expedition',
      title: source.expeditionName,
      subtitle: t('planner.detail.expeditionSubtitle', { count: formatAmount(runsNeeded) }),
      requiredAmount,
      localTimeSeconds: estimatedTime,
      totalTimeSeconds: estimatedTime,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          {
            label: t('planner.detail.rewardPerRun'),
            value: `${formatAmount(lootAmount)}${lootAmount !== source.amount ? ` (T${modifiers.expeditionTier})` : ''}`,
          },
          { label: t('planner.detail.baseDuration'), value: formatDuration(source.baseDuration) },
          { label: t('planner.detail.runsNeeded'), value: formatAmount(runsNeeded) },
          {
            label: t('planner.detail.totalTime'),
            value: formatDuration(estimatedTime),
            estimated: true,
          },
        ])
      },
      get formula() {
        return t('planner.detail.expeditionFormula', {
          runs: formatAmount(runsNeeded),
          time: formatDuration(source.baseDuration),
        })
      },
      notes: [t('planner.detail.expeditionNote')],
      children: [],
    }

    methods.push(method)
    methodsById.set(method.id, method)
  })

  return methods
}

function buildMachineMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  depth: number,
  nextAncestry: string[],
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

  // Machine methods (processors and generators)
  ;(machineRecipeIndex.get(itemId) ?? []).forEach((source, sourceIndex) => {
    // A2 gate (method level): only offer a processor's machine method for the recipe it's
    // actually set to. Generators (no input) always run; 'all' or a matching output → offer;
    // a different selected output / null → skip (switching it is a Phase C advisory, not a method).
    if (source.inputItemId !== null) {
      const selected = (modifiers.machineRecipes ?? {})[source.machineId]
      if (selected == null || (selected !== 'all' && selected !== itemId)) return
    }
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
      const childNode = ctx.recurse(
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
        const childNode = ctx.recurse(
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
    const totalTimeSeconds = rollUpChildTimes(children, localTimeSeconds, ctx)

    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#machine-${sourceIndex}`,
      nodeId,
      kind: 'machine',
      title: source.machineName,
      subtitle: t(
        cyclesNeeded === 1
          ? 'planner.detail.machineSubtitle'
          : 'planner.detail.machineSubtitlePlural',
        { count: cyclesNeeded, output: formatAmount(requiredAmount) },
      ),
      requiredAmount,
      localTimeSeconds,
      totalTimeSeconds,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          {
            label: t('planner.detail.output'),
            value: t('planner.detail.eachValue', { amount: source.outputAmount }),
          },
          { label: t('planner.detail.cycles'), value: formatAmount(cyclesNeeded) },
          {
            label: t('planner.detail.level'),
            value: `${machineLevel}/${machineSpeedMultipliers.length - 1}`,
          },
          {
            label: t('planner.detail.interval'),
            value: t('planner.detail.intervalValue', { seconds: effectiveInterval }),
          },
          ...passiveDetailRows(passive),
          { label: t('planner.detail.stepTime'), value: formatDuration(localTimeSeconds) },
          { label: t('planner.detail.totalTime'), value: formatTimeOrUnknown(totalTimeSeconds) },
          ...(totalTimeSeconds != null && totalTimeSeconds > localTimeSeconds
            ? [
                {
                  label: t('planner.detail.depsTime'),
                  value: formatDuration(totalTimeSeconds - localTimeSeconds),
                },
              ]
            : []),
        ])
      },
      get formula() {
        return passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          t('planner.detail.machineFormula', {
            cycles: formatAmount(cyclesNeeded),
            seconds: effectiveInterval,
          }),
        )
      },
      notes:
        machineLevel > 0
          ? [
              t('planner.detail.machineNote', {
                level: machineLevel,
                from: source.baseInterval,
                to: effectiveInterval,
              }),
            ]
          : [],
      children,
    }

    methods.push(method)
    methodsById.set(method.id, method)
  })

  return methods
}

function buildFabricationMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const { modifiers, methodsById } = ctx
  const methods: PlannerMethod[] = []

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

    let detailRowsCache: PlannerMethodDetail[] | undefined
    const method: PlannerMethod = {
      id: `${nodeId}#fabrication`,
      nodeId,
      kind: 'fabrication',
      title: 'Fabrication',
      subtitle: t(
        allocationPoints === 1
          ? 'planner.detail.fabricationSubtitle'
          : 'planner.detail.fabricationSubtitlePlural',
        { count: allocationPoints },
      ),
      requiredAmount,
      localTimeSeconds,
      totalTimeSeconds: localTimeSeconds,
      cost: null,
      get detailRows() {
        return (detailRowsCache ??= [
          { label: t('planner.detail.points'), value: String(allocationPoints) },
          { label: t('planner.detail.itemsPerCycle'), value: String(itemsPerCycle) },
          {
            label: t('planner.detail.cycleTime'),
            value: t('planner.detail.secondsValue', { seconds: FABRICATION_CYCLE_SECONDS }),
          },
          {
            label: t('planner.detail.rate'),
            value: t('planner.detail.perHourValue', { amount: formatAmount(itemsPerHour) }),
          },
          ...passiveDetailRows(passive),
          { label: t('planner.detail.stepTime'), value: formatDuration(localTimeSeconds) },
        ])
      },
      get formula() {
        return passiveFormula(
          requiredAmount,
          activeRate,
          passive,
          t('planner.detail.fabricationFormula', {
            amount: formatAmount(requiredAmount),
            perCycle: itemsPerCycle,
            seconds: FABRICATION_CYCLE_SECONDS,
          }),
        )
      },
      notes: [t('planner.detail.fabricationNote')],
      children: [],
    }

    methods.push(method)
    methodsById.set(method.id, method)
  }

  return methods
}

function buildBuyMethods(
  itemId: string,
  requiredAmount: number,
  nodeId: string,
  ctx: BuildMethodsCtx,
): PlannerMethod[] {
  const item = itemById.get(itemId)
  if (!item || item.buyValue == null) return []
  const { modifiers, inventory, methodsById } = ctx
  const methods: PlannerMethod[] = []

  // Capture the narrowed value — the lazy `detailRows` getter below is a closure, and
  // TS doesn't carry the `!= null` narrowing of `item.buyValue` into nested functions.
  const buyValue = item.buyValue
  const cost = requiredAmount * buyValue
  const currentGold = inventory['gold'] ?? 0
  const remainingCost = Math.max(0, cost - currentGold)
  const goldTime =
    modifiers.goldPerMinute > 0 && remainingCost > 0
      ? goldToSeconds(remainingCost, modifiers.goldPerMinute)
      : remainingCost <= 0
        ? 0
        : null
  let detailRowsCache: PlannerMethodDetail[] | undefined
  const method: PlannerMethod = {
    id: `${nodeId}#buy`,
    nodeId,
    kind: 'buy',
    title: t('planner.detail.merchant'),
    subtitle: t('planner.detail.buySubtitle', { amount: formatAmount(requiredAmount) }),
    requiredAmount,
    localTimeSeconds: goldTime ?? 0,
    totalTimeSeconds: goldTime ?? 0,
    cost,
    get detailRows() {
      return (detailRowsCache ??= [
        {
          label: t('planner.detail.unitPrice'),
          value: t('planner.detail.goldValue', {
            amount: formatNumber(buyValue),
          }),
        },
        {
          label: t('planner.detail.totalCost'),
          value: t('planner.detail.goldValue', {
            amount: formatNumber(Math.round(cost)),
          }),
        },
        ...(currentGold > 0
          ? [
              {
                label: t('planner.detail.onHand'),
                value: t('planner.detail.goldValue', {
                  amount: formatNumber(Math.round(currentGold)),
                }),
              },
              {
                label: t('planner.detail.stillNeed'),
                value: t('planner.detail.goldValue', {
                  amount: formatNumber(Math.round(remainingCost)),
                }),
              },
            ]
          : []),
        ...(goldTime != null && goldTime > 0
          ? [
              {
                label: t('planner.detail.goldRate'),
                value: t('planner.detail.goldPerMinValue', {
                  rate: modifiers.goldPerMinute.toFixed(0),
                }),
              },
              {
                label: t('planner.detail.goldTime'),
                value: t('planner.detail.goldTimeToEarn', { time: formatDuration(goldTime) }),
                estimated: true,
              },
            ]
          : remainingCost <= 0
            ? [
                {
                  label: t('planner.detail.goldTime'),
                  value: t('planner.detail.affordableNow'),
                },
              ]
            : [
                {
                  label: t('planner.detail.goldRate'),
                  value: t('planner.detail.notConfigured'),
                },
              ]),
      ])
    },
    notes:
      remainingCost <= 0
        ? [t('planner.detail.buyAffordableNote')]
        : goldTime != null && goldTime > 0
          ? [
              t('planner.detail.buyGoldIncomeNote', {
                rate: modifiers.goldPerMinute.toFixed(0),
              }),
            ]
          : [t('planner.detail.buyConfigureNote')],
    children: [],
  }

  methods.push(method)
  methodsById.set(method.id, method)

  return methods
}

// `detailRows` and `formula` on every method are only read when a node is actually
// rendered (modifier chips) or its popover opens — never by `summary`/`schedule`. Trees
// default collapsed, so on mount/reload almost nothing renders. We build them lazily via
// memoized getters (one closure cache per method) so the graph build that blocks first
// paint skips this i18n-heavy formatting work. The graph rebuilds whole on locale change
// (eager `t()` in subtitles/notes), so each method's cache can't outlive its locale.
export function buildPlannerGraph(
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
    const grossAmount = requiredAmount

    // Skip inventory deduction for the root target in craft planner (we want to build
    // *additional* items). Summoning planner passes deductRootInventory=true since
    // you just need to *have* the materials.
    const effectiveAmount =
      depth === 0 && !deductRootInventory ? requiredAmount : claimStock(itemId, requiredAmount)

    if (effectiveAmount <= 0) {
      const fulfilledNode: PlannerNode = {
        id: nodeId,
        itemId,
        itemName: resolveItemName(itemId),
        itemType: item?.type ?? 'Gathered',
        requiredAmount: 0,
        grossAmount,
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
        itemName: resolveItemName(itemId),
        itemType: 'Gathered',
        requiredAmount,
        grossAmount,
        depth,
        defaultMethodId: null,
        methods: [],
        issues: [t('planner.detail.itemDataNotFound')],
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
        title: t('planner.detail.cycleDetected'),
        subtitle: t('planner.detail.cycleSubtitle'),
        requiredAmount,
        localTimeSeconds: null,
        totalTimeSeconds: null,
        cost: null,
        detailRows: [],
        notes: [t('planner.detail.cycleNote')],
        children: [],
      }
      const cycleNode: PlannerNode = {
        id: nodeId,
        itemId,
        itemName: item.name,
        itemType: item.type,
        requiredAmount,
        grossAmount,
        depth,
        defaultMethodId: cycleMethod.id,
        methods: [cycleMethod],
        issues: [t('planner.detail.cycleInChain')],
        fulfilled: false,
      }
      nodesById.set(nodeId, cycleNode)
      methodsById.set(cycleMethod.id, cycleMethod)
      return cycleNode
    }

    const nextAncestry = [...ancestry, itemId]
    const ctx: BuildMethodsCtx = {
      modifiers,
      inventory,
      nodesById,
      methodsById,
      remainingStock,
      recurse: buildNode,
    }

    // Assemble methods in the original push order: craft, gather, garden, container,
    // expedition, machine, fabrication, buy. Each builder also registers its methods in
    // methodsById (preserving the original side effect). Order matters for the planner graph.
    const methods: PlannerMethod[] = [
      ...buildCraftMethods(itemId, requiredAmount, nodeId, depth, nextAncestry, ctx),
      ...buildGatherMethods(itemId, requiredAmount, nodeId, ctx),
      ...buildGardenMethods(itemId, requiredAmount, nodeId, ctx),
      ...buildContainerMethods(itemId, requiredAmount, nodeId, depth, nextAncestry, ctx),
      ...buildExpeditionMethods(itemId, requiredAmount, nodeId, ctx),
      ...buildMachineMethods(itemId, requiredAmount, nodeId, depth, nextAncestry, ctx),
      ...buildFabricationMethods(itemId, requiredAmount, nodeId, ctx),
      ...buildBuyMethods(itemId, requiredAmount, nodeId, ctx),
    ]

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

    // B1 — active hands-on time. Only manual gathering counts as active; crafting
    // (queue & walk away), machine/fabrication/garden/expedition (passive) and buy
    // (instant) cost 0 active locally. Children SUM (the player acts serially).
    // Bottom-up: child nodes are already finalized, so their methods carry activeTimeSeconds.
    for (const method of methods) {
      const activeLocal = method.kind === 'gather' ? (method.localTimeSeconds ?? 0) : 0
      let childActive = 0
      let known = true
      for (const child of method.children) {
        const childNode = nodesById.get(child.nodeId)
        if (!childNode) {
          known = false
          break
        }
        if (childNode.fulfilled) continue
        const cm = childNode.defaultMethodId
          ? methodsById.get(childNode.defaultMethodId)
          : undefined
        if (!cm || cm.activeTimeSeconds == null) {
          known = false
          break
        }
        childActive += cm.activeTimeSeconds
      }
      method.activeTimeSeconds = known ? activeLocal + childActive : null
    }

    // Select the lowest active-time method. Buy is de-prioritized until the gold-budget
    // model (B2) lands — otherwise instant (0-active) buys would dominate everything.
    const nonBuyMethods = methods.filter((method) => method.kind !== 'buy')
    const knownActiveMethods = (nonBuyMethods.length > 0 ? nonBuyMethods : methods).filter(
      (method) => method.activeTimeSeconds != null,
    )
    const defaultMethodId =
      knownActiveMethods.length > 0
        ? knownActiveMethods.toSorted(
            (a, b) =>
              (a.activeTimeSeconds ?? Number.POSITIVE_INFINITY) -
              (b.activeTimeSeconds ?? Number.POSITIVE_INFINITY),
          )[0].id
        : ((nonBuyMethods[0] ?? methods[0])?.id ?? null)

    const node: PlannerNode = {
      id: nodeId,
      itemId,
      itemName: item.name,
      itemType: item.type,
      requiredAmount,
      grossAmount,
      depth,
      defaultMethodId,
      methods,
      issues: methods.length === 0 ? [t('planner.detail.noSourceFound', { name: item.name })] : [],
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

  allocateGoldBudget(nodesById, methodsById, inventory)

  return {
    root,
    nodesById: Object.fromEntries(nodesById.entries()),
    methodsById: Object.fromEntries(methodsById.entries()),
  }
}

/**
 * B2 — gold spendable-budget allocation. Gold is a finite shared budget
 * (on-hand + sellable surplus), NOT a free per-purchase cost. Over the produce-optimal
 * baseline (B1), greedily swap a node's default to `buy` for the purchases that save the
 * most active time per gold, until the budget is spent. Ancestor/descendant buys are
 * skipped so the same subtree isn't paid for twice.
 *
 * v1 limits: by-product surplus isn't modelled (only un-referenced inventory is sold);
 * greedy-by-deal may pick a child buy over a better parent buy.
 */
function allocateGoldBudget(
  nodesById: Map<string, PlannerNode>,
  methodsById: Map<string, PlannerMethod>,
  inventory: Record<string, number>,
): void {
  const onHandGold = inventory['gold'] ?? 0
  const referenced = new Set<string>()
  for (const node of nodesById.values()) referenced.add(node.itemId)
  let surplusGold = 0
  for (const [id, count] of Object.entries(inventory)) {
    if (id === 'gold' || count <= 0 || referenced.has(id)) continue
    surplusGold += count * (itemById.get(id)?.sellValue ?? 0)
  }
  const budget = onHandGold + surplusGold
  if (budget <= 0) return

  // Static produce-subtree descendants, captured before any buy mutation.
  const descCache = new Map<string, Set<string>>()
  function descendants(nodeId: string, stack = new Set<string>()): Set<string> {
    const cached = descCache.get(nodeId)
    if (cached) return cached
    if (stack.has(nodeId)) return new Set()
    stack.add(nodeId)
    const out = new Set<string>()
    const node = nodesById.get(nodeId)
    const method = node?.defaultMethodId ? methodsById.get(node.defaultMethodId) : undefined
    for (const child of method?.children ?? []) {
      out.add(child.nodeId)
      for (const d of descendants(child.nodeId, stack)) out.add(d)
    }
    stack.delete(nodeId)
    descCache.set(nodeId, out)
    return out
  }

  type Candidate = { nodeId: string; buyId: string; cost: number; deal: number }
  const candidates: Candidate[] = []
  for (const node of nodesById.values()) {
    const def = node.defaultMethodId ? methodsById.get(node.defaultMethodId) : undefined
    if (!def || def.kind === 'buy') continue
    const buyMethod = node.methods.find((m) => m.kind === 'buy')
    if (!buyMethod || buyMethod.cost == null || buyMethod.cost <= 0) continue
    const activeSaved = def.activeTimeSeconds ?? 0
    if (activeSaved <= 0) continue // buying a passive/instant node saves no hands-on time
    candidates.push({
      nodeId: node.id,
      buyId: buyMethod.id,
      cost: buyMethod.cost,
      deal: activeSaved / buyMethod.cost,
    })
  }
  for (const c of candidates) descendants(c.nodeId) // freeze subtrees before mutating
  candidates.sort((a, b) => b.deal - a.deal)

  const bought = new Set<string>()
  const coveredByBought = new Set<string>()
  let spent = 0
  for (const c of candidates) {
    if (coveredByBought.has(c.nodeId)) continue // already inside a bought subtree
    const cDesc = descendants(c.nodeId)
    let ancestorOfBought = false
    for (const b of bought) {
      if (cDesc.has(b)) {
        ancestorOfBought = true
        break
      }
    }
    if (ancestorOfBought) continue // buying this would re-pay for an already-bought descendant
    if (spent + c.cost > budget) continue
    nodesById.get(c.nodeId)!.defaultMethodId = c.buyId
    spent += c.cost
    bought.add(c.nodeId)
    for (const d of cDesc) coveredByBought.add(d)
  }
}

/**
 * Computes per-tree inventory budgets by simulating a shared stock pool across all targets.
 * Each target is processed sequentially; after each, the consumed amounts are deducted from
 * the shared pool so that cross-tree items are only counted once.
 */
export function computeInventoryBudgets(
  // `key` (optional) names the result entry — pass it when the same itemId appears for
  // several targets (e.g. one per creature) so their budgets don't overwrite each other.
  targets: { itemId: string; quantity: number; key?: string }[],
  inventory: Record<string, number>,
  modifiers: PlannerModifiers,
): Record<string, Record<string, number>> {
  const remainingStock = new Map<string, number>(Object.entries(inventory).filter(([, v]) => v > 0))
  const budgets: Record<string, Record<string, number>> = {}

  for (const target of targets) {
    // Snapshot the current pool as this tree's budget
    const currentInventory: Record<string, number> = {}
    for (const [id, amount] of remainingStock.entries()) {
      if (amount > 0) currentInventory[id] = amount
    }
    budgets[target.key ?? target.itemId] = currentInventory

    // Build the graph to determine what this tree consumes
    const graph = buildPlannerGraph(
      target.itemId,
      target.quantity,
      currentInventory,
      modifiers,
      true,
    )

    // Deduct what this tree consumed from the shared pool
    for (const node of Object.values(graph.nodesById)) {
      const consumed = node.grossAmount - node.requiredAmount
      if (consumed > 0) {
        const current = remainingStock.get(node.itemId) ?? 0
        remainingStock.set(node.itemId, Math.max(0, current - consumed))
      }
    }
  }

  return budgets
}

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
      const itemName = resolveItemName(itemId)
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

  const resourceOrder = [...new Set(tasks.map((task) => task.resource))].toSorted((a, b) => {
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
  /** When provided, overrides the internally-computed inventory (owned + queued) for graph building.
   *  Used by summoning planner to pass a pre-partitioned inventory budget that accounts for
   *  cross-tree demands against a shared stock pool. */
  inventoryBudget?: Readonly<Ref<Record<string, number> | null>>
}

/**
 * Roll up locked gates (keyed by itemId, already deduped) into a plan-level summary:
 * how many distinct resources are blocked and the single most-blocking gate. Returns
 * null when nothing is locked. Exported so multi-target views (summoning) can union
 * several plans' gates before summarizing.
 */
export function summarizeLockedGates(
  byItem: Record<string, PlannerLockedGate>,
): PlannerSkillGateSummary | null {
  const entries = Object.values(byItem)
  if (entries.length === 0) return null
  let highest = entries[0]
  for (const e of entries) {
    if (e.level > highest.level || (e.level === highest.level && e.current < highest.current)) {
      highest = e
    }
  }
  return { count: entries.length, highest: { skill: highest.skill, level: highest.level } }
}

/**
 * Merges queued workstation amounts into a base inventory record.
 * Returns `base` unchanged when `queued` is empty (no allocation).
 */
function mergeQueuedInto(
  base: Record<string, number>,
  queued: Record<string, Record<string, number>>,
): Record<string, number> {
  if (Object.keys(queued).length === 0) return base
  const merged = { ...base }
  for (const stationItems of Object.values(queued)) {
    for (const [id, amount] of Object.entries(stationItems)) {
      if (amount > 0) merged[id] = (merged[id] ?? 0) + amount
    }
  }
  return merged
}

export function useCraftPlanner(
  targetItemId: Readonly<Ref<string>>,
  targetQuantity: Readonly<Ref<number>>,
  options: CraftPlannerOptions = {},
) {
  const pinnedMethodIds = ref<Record<string, string>>({})

  const {
    skillLevels,
    inventoryAmounts: baseInventory,
    queuedAmounts: baseQueuedAmounts,
    queuedTimes: baseQueuedTimes,
    gardenFlowers: baseGarden,
    jobTiers: baseJobTiers,
    machineLevels: baseMachineLevels,
    machineRecipes: baseMachineRecipes,
    fabricationAllocations: baseFabricationAllocations,
    toolSpeedModes: baseToolSpeedModes,
    toolLevels: baseToolLevels,
  } = useGameConfig()

  const {
    effectiveAwakenGoldLevel: awakenGoldLevel,
    effectiveAwakenGatherUpgrades: baseAwakenGather,
    effectiveAwakenSpeedTiers: baseAwakenSpeed,
  } = useAwakenSimulation()

  const { workstationTools, speedBonusPerLevel } = useTools()
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
  const toolSpeedModeOverrides = ref<Record<string, boolean> | null>(null)
  const toolLevelOverrides = ref<Record<string, number> | null>(null)

  const rawInventoryAmounts = computed(() => inventoryOverrides.value ?? baseInventory.value)
  const mergedInventoryAmounts = computed(() =>
    mergeQueuedInto(rawInventoryAmounts.value, baseQueuedAmounts.value),
  )
  const inventoryAmounts = computed(
    () => options.inventoryBudget?.value ?? mergedInventoryAmounts.value,
  )
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
  const toolSpeedModes = computed(() => toolSpeedModeOverrides.value ?? baseToolSpeedModes.value)
  const toolLevels = computed(() => toolLevelOverrides.value ?? baseToolLevels.value)

  const toolSpeedBonuses = computed(() => {
    const bonuses: Record<string, number> = {}
    for (const tool of workstationTools.value) {
      if (toolSpeedModes.value[tool.skillId]) {
        bonuses[tool.skillId] = ((toolLevels.value[tool.id] ?? 0) * speedBonusPerLevel) / 100
      }
    }
    return bonuses
  })

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
    toolSpeedBonuses: toolSpeedBonuses.value,
    jobTiers: jobTiers.value,
    goldPerMinute: goldPerMinute.value,
    machineLevels: machineLevels.value,
    machineRecipes: baseMachineRecipes.value,
    fabricationAllocations: fabricationAllocations.value,
    expeditionTier: DEFAULT_EXPEDITION_TIER,
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

  // #2 skill-gate surfacing: which planned resources the player can't yet acquire.
  // Walk the *active* plan (the nodes the UI actually renders) and flag any node whose
  // chosen method is gated above the player's current level in that skill.
  const skillGates = computed(() => {
    const root = graph.value.root
    const levels = skillLevels.value
    const byNode: Record<string, PlannerLockedGate> = {}
    const byItem: Record<string, PlannerLockedGate> = {}

    if (root) {
      const visited = new Set<string>()
      const walk = (node: PlannerNode) => {
        if (visited.has(node.id)) return
        visited.add(node.id)
        const method = getActiveMethod(node.id)
        if (!method) return
        const gate = method.skillGate
        if (gate && !node.fulfilled) {
          const current = levels[gate.skill] ?? 1
          if (current < gate.level) {
            const locked: PlannerLockedGate = { skill: gate.skill, level: gate.level, current }
            byNode[node.id] = locked
            byItem[node.itemId] = locked
          }
        }
        for (const child of method.children) {
          const childNode = graph.value.nodesById[child.nodeId]
          if (childNode) walk(childNode)
        }
      }
      walk(root)
    }

    const gateSummary = summarizeLockedGates(byItem)
    return { byNode, byItem, summary: gateSummary }
  })

  const lockedGateByNode = computed(() => skillGates.value.byNode)
  const lockedGateByItem = computed(() => skillGates.value.byItem)
  const skillGateSummary = computed(() => skillGates.value.summary)

  return {
    rootNode: computed(() => graph.value.root),
    nodesById: computed(() => graph.value.nodesById),
    methodsById: computed(() => graph.value.methodsById),
    activeMethodIdByNode,
    lockedGateByNode,
    lockedGateByItem,
    skillGateSummary,
    schedule,
    summary,
    shoppingListText,
    pinnedMethodIds,
    inventoryAmounts,
    queuedAmounts: baseQueuedAmounts,
    flatQueuedAmounts: computed(() => mergeQueuedInto({}, baseQueuedAmounts.value)),
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

/**
 * Lightweight composable that exposes the merged inventory (owned + queued) and planner modifiers
 * without building a graph. Used by the summoning planner view to compute cross-tree inventory budgets.
 */
export function usePlannerModifiers() {
  const {
    inventoryAmounts: baseInventory,
    queuedAmounts: baseQueuedAmounts,
    gardenFlowers: baseGarden,
    jobTiers: baseJobTiers,
    machineLevels: baseMachineLevels,
    machineRecipes: baseMachineRecipes,
    fabricationAllocations: baseFabricationAllocations,
    toolSpeedModes: baseToolSpeedModes,
    toolLevels: baseToolLevels,
  } = useGameConfig()

  const {
    effectiveAwakenGoldLevel: awakenGoldLevel,
    effectiveAwakenGatherUpgrades: baseAwakenGather,
    effectiveAwakenSpeedTiers: baseAwakenSpeed,
  } = useAwakenSimulation()

  const { workstationTools, speedBonusPerLevel } = useTools()
  const { ownedCreatureIds, isAwakened: isCreatureAwakened } = useCreatureCollection()

  const fabricationSimulated = useLocalStorage<Record<string, number>>('fabrication-simulated', {})

  const mergedInventory = computed(() =>
    mergeQueuedInto(baseInventory.value, baseQueuedAmounts.value),
  )

  const toolSpeedBonuses = computed(() => {
    const bonuses: Record<string, number> = {}
    for (const tool of workstationTools.value) {
      if (baseToolSpeedModes.value[tool.skillId]) {
        bonuses[tool.skillId] = ((baseToolLevels.value[tool.id] ?? 0) * speedBonusPerLevel) / 100
      }
    }
    return bonuses
  })

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
      baseGarden.value['gold-flower'] ?? [],
    ),
  )

  const modifiers = computed<PlannerModifiers>(() => ({
    gardenFlowers: baseGarden.value,
    awakenGatherUpgrades: baseAwakenGather.value,
    awakenSpeedTiers: baseAwakenSpeed.value,
    toolSpeedBonuses: toolSpeedBonuses.value,
    jobTiers: baseJobTiers.value,
    goldPerMinute: goldPerMinute.value,
    machineLevels: baseMachineLevels.value,
    machineRecipes: baseMachineRecipes.value,
    fabricationAllocations: { ...baseFabricationAllocations.value, ...fabricationSimulated.value },
    expeditionTier: DEFAULT_EXPEDITION_TIER,
  }))

  return { mergedInventory, modifiers }
}
