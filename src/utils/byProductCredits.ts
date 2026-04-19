import { activityOutputIndex } from '@/data/indexes'
import type { PlannerNode, PlannerSchedule, ScheduledTask } from '@/types'

interface GatherEntry {
  treeIndex: number
  nodeId: string
  itemId: string
  activityKey: string // "jobId/activityName"
  actionsNeeded: number
  requiredAmount: number
}

/**
 * Compute by-product credits across multiple material trees.
 *
 * When a gathering activity (e.g., fishing at Rainbow Pond) produces multiple
 * outputs, the primary item drives the action count while secondary items
 * (by-products) accumulate "for free". This function identifies those overlaps
 * and returns time adjustment ratios for gather tasks that are partially or
 * fully covered by by-products from OTHER gather tasks.
 *
 * Algorithm:
 * 1. Collect all active gather tasks across all trees
 * 2. For each gather task, look up the full output list of its activity
 * 3. Calculate how many of each by-product item is produced during that task
 * 4. Accumulate a "supply" ledger of by-product items across all tasks
 * 5. For each gather task, check if its item appears in the supply ledger
 *    (from OTHER tasks' by-products) and credit accordingly
 *
 * Returns a Map keyed by merged-schedule nodeId ("tree{i}/{nodeId}") → remaining
 * time fraction (0 = fully covered, 0.5 = half covered, etc.).
 */
export function computeByProductCredits(
  treeData: {
    nodesById: Record<string, PlannerNode>
    activeMethodIdByNode: Record<string, string | null>
  }[],
): Map<string, number> {
  // Step 1: Collect all active gather methods by walking the active path through each tree
  const gatherEntries: GatherEntry[] = []

  for (let treeIndex = 0; treeIndex < treeData.length; treeIndex++) {
    const { nodesById, activeMethodIdByNode } = treeData[treeIndex]

    // Walk the tree following only active methods to avoid counting nodes on inactive branches
    function walkActiveTree(nodeId: string) {
      const node = nodesById[nodeId]
      if (!node || node.fulfilled) return

      const methodId = activeMethodIdByNode[node.id]
      if (!methodId) return

      const method = node.methods.find((m) => m.id === methodId)
      if (!method) return

      if (method.kind === 'gather' && method.actionsNeeded) {
        const activityKey = `${method.title}/${method.subtitle}`
        gatherEntries.push({
          treeIndex,
          nodeId: node.id,
          itemId: node.itemId,
          activityKey,
          actionsNeeded: method.actionsNeeded,
          requiredAmount: method.requiredAmount,
        })
      }

      // Recurse into active method's children
      for (const child of method.children) {
        walkActiveTree(child.nodeId)
      }
    }

    // Find root node (depth 0) and start walking from there
    for (const node of Object.values(nodesById)) {
      if (node.depth === 0) {
        walkActiveTree(node.id)
        break
      }
    }
  }

  if (gatherEntries.length === 0) return new Map()

  // Step 2: For each gather task, calculate ALL by-products it produces
  // by-product supply: itemId → total amount produced as by-products across all tasks
  // We track per-entry contributions so we can exclude self-supply
  const byProductSupplyByEntry = new Map<
    GatherEntry,
    Map<string, number> // itemId → amount produced
  >()

  for (const entry of gatherEntries) {
    const activityInfo = activityOutputIndex.get(entry.activityKey)
    if (!activityInfo) continue

    const produced = new Map<string, number>()
    for (const output of activityInfo.outputs) {
      // Skip the item this task is actually gathering — that's the primary, not a by-product
      if (output.id === entry.itemId) continue

      const expectedYieldPerAction = output.chance * ((output.min + output.max) / 2)
      const totalProduced = entry.actionsNeeded * expectedYieldPerAction
      if (totalProduced > 0) {
        produced.set(output.id, totalProduced)
      }
    }

    if (produced.size > 0) {
      byProductSupplyByEntry.set(entry, produced)
    }
  }

  // Step 3: Aggregate total by-product supply per item (from all tasks)
  const totalSupply = new Map<string, number>()
  for (const produced of byProductSupplyByEntry.values()) {
    for (const [itemId, amount] of produced) {
      totalSupply.set(itemId, (totalSupply.get(itemId) ?? 0) + amount)
    }
  }

  // Step 4: For each gather task, check if its item has by-product supply
  // and compute the remaining time fraction
  const timeRatios = new Map<string, number>()

  // Group entries by itemId so we can distribute credit fairly when multiple
  // entries need the same item
  const entriesByItem = new Map<string, GatherEntry[]>()
  for (const entry of gatherEntries) {
    const list = entriesByItem.get(entry.itemId) ?? []
    list.push(entry)
    entriesByItem.set(entry.itemId, list)
  }

  for (const [itemId, entries] of entriesByItem) {
    // Total supply of this item from by-products of OTHER items' gathering
    // Exclude any entry that is itself gathering this item (no self-credit)
    let supply = 0
    for (const [sourceEntry, produced] of byProductSupplyByEntry) {
      // Only credit by-products from tasks gathering a DIFFERENT item
      if (sourceEntry.itemId === itemId) continue
      supply += produced.get(itemId) ?? 0
    }

    if (supply <= 0) continue

    // Total demand for this item across all entries
    const totalDemand = entries.reduce((sum, e) => sum + e.requiredAmount, 0)

    // Credit fraction applies equally to all entries for this item
    const creditFraction = Math.min(1, supply / totalDemand)
    const remainingFraction = 1 - creditFraction

    if (remainingFraction < 1) {
      for (const entry of entries) {
        const key = `tree${entry.treeIndex}/${entry.nodeId}`
        timeRatios.set(key, Math.max(0, remainingFraction))
      }
    }
  }

  return timeRatios
}

const resourceSortPriority = (r: string) =>
  r.startsWith('Garden:') ? 2 : r.startsWith('Expedition:') ? 3 : 1

/**
 * Apply by-product credits to a merged schedule by adjusting task local times.
 * Returns a new schedule with adjusted times.
 */
export function applyByProductCreditsToSchedule(
  schedule: PlannerSchedule,
  timeRatios: Map<string, number>,
): PlannerSchedule {
  if (timeRatios.size === 0) return schedule

  const adjustedTasks: ScheduledTask[] = []
  const removedNodeIds = new Set<string>()

  for (const task of schedule.tasks) {
    const ratio = timeRatios.get(task.nodeId)
    if (ratio != null) {
      if (ratio <= 0.001) {
        // Fully covered by by-products — remove from schedule
        removedNodeIds.add(task.nodeId)
        continue
      }
      // Partially covered — reduce local time proportionally
      const adjustedLocalTime = task.localTime * ratio
      adjustedTasks.push({
        ...task,
        localTime: adjustedLocalTime,
        endTime: task.startTime + adjustedLocalTime,
      })
    } else {
      adjustedTasks.push(task)
    }
  }

  // Recalculate total time from remaining tasks
  const totalTime =
    adjustedTasks.filter((t) => !t.passive).reduce((max, t) => Math.max(max, t.endTime), 0) ||
    adjustedTasks.reduce((max, t) => Math.max(max, t.endTime), 0)

  // Update completion times
  const completionTimeByNode: Record<string, number> = { ...schedule.completionTimeByNode }
  for (const task of adjustedTasks) {
    completionTimeByNode[task.nodeId] = task.endTime
  }
  for (const nodeId of removedNodeIds) {
    completionTimeByNode[nodeId] = 0
  }

  // Recalculate resource order from remaining tasks
  const resources = new Set(adjustedTasks.map((t) => t.resource))
  const resourceOrder = [...resources].toSorted((a, b) => {
    return resourceSortPriority(a) - resourceSortPriority(b) || a.localeCompare(b)
  })

  return {
    tasks: adjustedTasks,
    resourceOrder,
    totalTime,
    completionTimeByNode,
  }
}
