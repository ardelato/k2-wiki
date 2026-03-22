import { computed, ref, type Ref } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import expeditionsData from '@/data/expeditions.json'
import itemsData from '@/data/items.json'
import jobsData from '@/data/jobs.json'
import type {
  AwakenGatherUpgrade,
  GardenFlowerEntry,
  Item,
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
import { formatDuration, methodKindLabel, toTitleCase } from '@/utils/format'

export type { GardenFlowerEntry, AwakenGatherUpgrade }

export interface PlannerModifiers {
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number> // per workstation, 0–4
  jobTiers: Record<string, number>
}

interface GatherSource {
  jobId: string
  activityName: string
  levelRequirement: number
  duration: number
  chance: number
  min: number
  max: number
}

interface ContainerSource {
  containerId: string
  containerName: string
  amount: number
  chance: number
}

interface ExpeditionSource {
  expeditionId: string
  expeditionName: string
  amount: number
  baseDuration: number
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

const items = itemsData as Item[]
const itemById = new Map(items.map((item) => [item.id, item]))

const gatherSourcesByItem = new Map<string, GatherSource[]>()
for (const job of jobsData) {
  if (!job.activities) continue
  for (const activity of job.activities) {
    if (!activity.output) continue
    for (const output of activity.output) {
      const existing = gatherSourcesByItem.get(output.id) ?? []
      existing.push({
        jobId: job.id,
        activityName: activity.name,
        levelRequirement: activity.levelRequirement,
        duration: activity.duration,
        chance: output.chance,
        min: output.min,
        max: output.max,
      })
      gatherSourcesByItem.set(output.id, existing)
    }
  }
}

const containerSourcesByItem = new Map<string, ContainerSource[]>()
for (const item of items) {
  if (!item.lootTable?.length) continue
  for (const entry of item.lootTable) {
    const existing = containerSourcesByItem.get(entry.id) ?? []
    existing.push({
      containerId: item.id,
      containerName: item.name,
      amount: entry.amount,
      chance: entry.chance,
    })
    containerSourcesByItem.set(entry.id, existing)
  }
}

const expeditionSourcesByItem = new Map<string, ExpeditionSource[]>()
for (const expedition of expeditionsData) {
  for (const reward of expedition.rewards) {
    const existing = expeditionSourcesByItem.get(reward.itemId) ?? []
    existing.push({
      expeditionId: expedition.id,
      expeditionName: expedition.name,
      amount: reward.amount,
      baseDuration: expedition.baseDuration,
    })
    expeditionSourcesByItem.set(reward.itemId, existing)
  }
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

function buildPlannerGraph(
  targetItemId: string,
  targetQuantity: number,
  inventory: Record<string, number>,
  modifiers: PlannerModifiers,
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

    // Skip inventory deduction for the root target — we want to build
    // *additional* items, not just ensure we own the requested quantity.
    const effectiveAmount = depth === 0 ? requiredAmount : claimStock(itemId, requiredAmount)

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

      const speedReduction = (modifiers.awakenSpeedTiers[recipe.workstation] ?? 0) * 0.1
      const effectiveCraftTime = Math.max(
        recipe.craftTime * 0.01,
        recipe.craftTime * (1 - speedReduction),
      )
      const localTimeSeconds = craftsNeeded * effectiveCraftTime
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
                  value: `+${modifiers.awakenSpeedTiers[recipe.workstation] * 10}%`,
                },
              ]
            : []),
          { label: 'Step time', value: formatDuration(localTimeSeconds) },
          { label: 'Total time', value: formatTimeOrUnknown(totalTimeSeconds) },
          ...(totalTimeSeconds != null && totalTimeSeconds > localTimeSeconds
            ? [{ label: 'Deps time', value: formatDuration(totalTimeSeconds - localTimeSeconds) }]
            : []),
        ],
        formula: `${formatAmount(craftsNeeded)} crafts × ${formatDuration(recipe.craftTime)}`,
        notes: [],
        children,
      }

      methods.push(method)
      methodsById.set(method.id, method)
    })

    ;(gatherSourcesByItem.get(itemId) ?? []).forEach((source, sourceIndex) => {
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
      const localTimeSeconds = actionsNeeded * effectiveDuration
      const isEstimated = source.chance < 1 || source.min !== source.max
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
        detailRows: [
          { label: 'Activity', value: source.activityName },
          { label: 'Level', value: `Lv${source.levelRequirement}` },
          {
            label: 'Yield / action',
            value: `${(source.chance * 100).toFixed(source.chance < 0.01 ? 2 : 1)}% × ${formatAmount(expectedAmount(source.min, source.max))}`,
          },
          ...(yieldBonus > 0 ? [{ label: 'Yield Bonus', value: `+${yieldBonus}` }] : []),
          ...((awakenGather?.durationTier ?? 0) > 0
            ? [{ label: 'Awaken Duration', value: `-${(awakenGather?.durationTier ?? 0) * 5}%` }]
            : []),
          ...(jobTier > 0
            ? [
                {
                  label: 'Job Tier',
                  value: `-${(JOB_TIER_DURATION_REDUCTION[jobTier] ?? 0) * 100}%`,
                },
              ]
            : []),
          { label: 'Actions', value: formatAmount(actionsNeeded), estimated: isEstimated },
          { label: 'Step time', value: formatDuration(localTimeSeconds), estimated: isEstimated },
        ],
        formula: `${formatAmount(requiredAmount)} ÷ (${(source.chance * 100).toFixed(source.chance < 0.01 ? 2 : 1)}% × ${formatAmount(expectedAmount(source.min, source.max))}) actions × ${formatDuration(source.duration)}`,
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
        const localTimeSeconds = cyclesNeeded * gardenSource.cycleSeconds
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
            { label: 'Cycles', value: formatAmount(cyclesNeeded) },
            { label: 'Step time', value: formatDuration(localTimeSeconds) },
          ],
          formula: `${formatAmount(requiredAmount)} ÷ ${formatAmount(yieldPerCycle)} per cycle × ${formatDuration(gardenSource.cycleSeconds)}`,
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

    ;(containerSourcesByItem.get(itemId) ?? []).forEach((source, sourceIndex) => {
      const expectedYield = source.amount * source.chance
      if (expectedYield <= 0) return

      const openingsNeeded = requiredAmount / expectedYield
      const childPath = `${nodeId}/container-${sourceIndex}:${source.containerId}`
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
      const isContainerEstimated = source.chance < 1
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
            value: `${(source.chance * 100).toFixed(source.chance < 0.01 ? 2 : 1)}% × ${source.amount}`,
          },
          {
            label: 'Containers needed',
            value: formatAmount(openingsNeeded),
            estimated: isContainerEstimated,
          },
          {
            label: 'Total time',
            value: formatTimeOrUnknown(totalTimeSeconds),
            estimated: isContainerEstimated,
          },
        ],
        formula: `${formatAmount(requiredAmount)} ÷ (${(source.chance * 100).toFixed(source.chance < 0.01 ? 2 : 1)}% × ${source.amount}) per ${source.containerName.toLowerCase()} opening`,
        notes: [
          'Opening time is treated as negligible; only obtaining the container contributes time.',
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

    ;(expeditionSourcesByItem.get(itemId) ?? []).forEach((source, sourceIndex) => {
      const runsNeeded = requiredAmount / source.amount
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
          { label: 'Reward / run', value: formatAmount(source.amount) },
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

    if (item.buyValue != null) {
      const cost = requiredAmount * item.buyValue
      const method: PlannerMethod = {
        id: `${nodeId}#buy`,
        nodeId,
        kind: 'buy',
        title: 'Merchant',
        subtitle: `Buy ${formatAmount(requiredAmount)} directly`,
        requiredAmount,
        localTimeSeconds: 0,
        totalTimeSeconds: 0,
        cost,
        detailRows: [
          { label: 'Unit price', value: `${item.buyValue.toLocaleString()} gold` },
          { label: 'Total cost', value: `${Math.round(cost).toLocaleString()} gold` },
          { label: 'Total time', value: '0m' },
        ],
        notes: ['Buying is treated as immediate and excluded from craft/gather time.'],
        children: [],
      }

      methods.push(method)
      methodsById.set(method.id, method)
    }

    methods.sort((a, b) => {
      const kindOrder = [
        'craft',
        'gather',
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
  r.startsWith('Garden:') ? 2 : r.startsWith('Expedition:') ? 3 : 1

function computeSchedule(
  root: PlannerNode,
  nodesById: Record<string, PlannerNode>,
  activeMethodIdByNode: Record<string, string | null>,
  methodsById: Record<string, PlannerMethod>,
): PlannerSchedule {
  const tasks: ScheduledTask[] = []
  const resourceNextFree: Record<string, number> = {}
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
    for (const child of method.children) {
      const childNode = nodesById[child.nodeId]
      if (childNode) depsReady = Math.max(depsReady, schedule(childNode))
    }

    // Determine resource and start time
    let resource: string
    let startTime: number

    if (method.kind === 'craft') {
      resource = method.title
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
    } else {
      // buy, container, stocked, etc. — negligible time
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
    })

    completionTime.set(node.id, endTime)
    return endTime
  }

  const totalTime = schedule(root)

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

export function useCraftPlanner(
  targetItemId: Readonly<Ref<string>>,
  targetQuantity: Readonly<Ref<number>>,
) {
  const pinnedMethodIds = ref<Record<string, string>>({})

  const {
    inventoryAmounts: baseInventory,
    gardenFlowers: baseGarden,
    awakenGatherUpgrades: baseAwakenGather,
    awakenSpeedTiers: baseAwakenSpeed,
    jobTiers: baseJobTiers,
  } = useGameConfig()

  // Temporary overrides — null means "use config value", non-null means "planner simulation"
  const inventoryOverrides = ref<Record<string, number> | null>(null)
  const gardenOverrides = ref<Record<string, GardenFlowerEntry[]> | null>(null)
  const awakenGatherOverrides = ref<Record<string, AwakenGatherUpgrade> | null>(null)
  const awakenSpeedOverrides = ref<Record<string, number> | null>(null)
  const jobTierOverrides = ref<Record<string, number> | null>(null)

  const inventoryAmounts = computed(() => inventoryOverrides.value ?? baseInventory.value)
  const gardenFlowers = computed(() => gardenOverrides.value ?? baseGarden.value)
  const awakenGatherUpgrades = computed(() => awakenGatherOverrides.value ?? baseAwakenGather.value)
  const awakenSpeedTiers = computed(() => awakenSpeedOverrides.value ?? baseAwakenSpeed.value)
  const jobTiers = computed(() => jobTierOverrides.value ?? baseJobTiers.value)

  const modifiers = computed<PlannerModifiers>(() => ({
    gardenFlowers: gardenFlowers.value,
    awakenGatherUpgrades: awakenGatherUpgrades.value,
    awakenSpeedTiers: awakenSpeedTiers.value,
    jobTiers: jobTiers.value,
  }))

  const graph = computed(() =>
    buildPlannerGraph(
      targetItemId.value,
      targetQuantity.value,
      inventoryAmounts.value,
      modifiers.value,
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
    let gardenTimeSeconds = 0
    let expeditionTimeSeconds = 0

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
    const activeTimeSeconds = Math.max(maxGatherTime, maxWorkstationTime)
    const passiveTimeSeconds = Math.max(gardenTimeSeconds, expeditionTimeSeconds)
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
            gardenTimeSeconds,
            expeditionTimeSeconds,
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
        .map(
          ([itemId, value]): PlannerSummaryLeaf => ({
            itemId,
            itemName: value.itemName,
            amount: value.amount,
            stillNeeded: value.amount,
            acquisitionKind: value.acquisitionKind,
            inventoryAmount: inventoryAmounts.value[itemId] ?? 0,
          }),
        )
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

  function resetAllSettings() {
    inventoryOverrides.value = null
    gardenOverrides.value = null
    awakenGatherOverrides.value = null
    awakenSpeedOverrides.value = null
    jobTierOverrides.value = null
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
    resetAllSettings,
    formatAmount,
  }
}
