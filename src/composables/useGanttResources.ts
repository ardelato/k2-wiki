import type { PlannerNode, ScheduledTask } from '@/types'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'
import { getResourceGroupKey } from '@/utils/planner/ganttHelpers'

/** Visual group labels that render as a header + sub-rows rather than an inline bar. */
const KNOWN_MULTI_GROUPS = [
  'Gathering',
  'Refining',
  'Machines',
  'Expeditions',
  'Dungeons',
  'Garden',
  'Fabrication',
  'Merchant',
] as const

/** Prefixed resource kinds that drive label/icon dispatch in sub-rows. */
type ResourceKind = 'garden' | 'expedition' | 'fabrication' | 'buy' | 'other'

/** Classify a resource by its prefix, centralizing the repeated `startsWith` dispatch. */
function resourceKind(resource: string): ResourceKind {
  if (resource.startsWith('Garden:')) return 'garden'
  if (resource.startsWith('Expedition:')) return 'expedition'
  if (resource.startsWith('Fabrication:')) return 'fabrication'
  if (resource.startsWith('Buy:')) return 'buy'
  return 'other'
}

// Garden essence → flower display name mapping
const essenceToFlower: Record<string, string> = {
  'Raw Fire Essence': 'Fire Flower',
  'Raw Wind Essence': 'Wind Flower',
  'Raw Earth Essence': 'Earth Flower',
  'Raw Water Essence': 'Water Flower',
}

const essenceToFlowerId: Record<string, string> = {
  'raw-fire-essence': 'fire-flower',
  'raw-wind-essence': 'wind-flower',
  'raw-earth-essence': 'earth-flower',
  'raw-water-essence': 'water-flower',
}

/** Resource grouping, label, and icon logic for the planner Gantt sub-rows. */
export function useGanttResources(opts: { nodesById: () => Record<string, PlannerNode> }) {
  const { nodesById } = opts

  /** Whether a group label renders as a header + sub-rows (multi-group) vs an inline bar. */
  function isInlineGroup(group: string): boolean {
    return (KNOWN_MULTI_GROUPS as readonly string[]).includes(group)
  }

  function getSubRowLabel(resource: string, tasks: ScheduledTask[]): string {
    const stripped = resource.replace(/^(Machine|Garden|Expedition|Dungeon|Fabrication|Buy): /, '')
    const kind = resourceKind(resource)
    // Garden: show flower name instead of essence
    if (kind === 'garden') return essenceToFlower[stripped] ?? stripped
    // Expedition: show expedition name from method title
    if (kind === 'expedition') {
      const task = tasks?.[0]
      if (task) {
        const node = nodesById()[task.nodeId]
        if (node) {
          const method = node.methods.find((m) => m.kind === 'expedition')
          if (method?.title) return method.title
        }
      }
    }
    return stripped
  }

  function getSubRowIcon(resource: string, tasks: ScheduledTask[]): string | undefined {
    const kind = resourceKind(resource)
    // Garden: show flower image
    if (kind === 'garden') {
      const itemId = tasks?.[0]?.itemId ?? ''
      const flowerId = essenceToFlowerId[itemId]
      if (flowerId) return getItemImage({ id: flowerId })
    }
    // Expedition: show the reward item image
    if (kind === 'expedition') {
      const itemId = tasks?.[0]?.itemId ?? ''
      if (itemId) return getItemImage({ id: itemId })
    }
    // Fabrication / Merchant: show the item image
    if (kind === 'fabrication' || kind === 'buy') {
      const itemId = tasks?.[0]?.itemId ?? ''
      if (itemId) return getItemImage({ id: itemId })
    }
    // For all other sub-rows, use the source icon (job/workstation icon) not the item image
    const task = tasks?.[0]
    if (task)
      return (
        sourceIcons[task.resource.replace(/^(Machine|Garden|Expedition|Fabrication|Buy): /, '')] ??
        sourceIcons[task.resource]
      )
    return undefined
  }

  return {
    getResourceGroupKey,
    getSubRowLabel,
    getSubRowIcon,
    isInlineGroup,
  }
}
