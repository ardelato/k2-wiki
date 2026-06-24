/**
 * Scheduled-resource labels carry a "Kind: name" prefix (e.g. `Machine: Furnace`,
 * `Garden: Raw Fire Essence`, `Expedition: Hide`, `Fabrication: …`, `Buy: …`, `Dungeon: …`).
 * Unprefixed labels are active workstation/gather lanes (e.g. `Workbench`, `Fishing`).
 *
 * This module centralizes the prefix parsing that was previously duplicated as ad-hoc
 * `.startsWith('Machine:')` ladders and strip regexes across ganttHelpers, mergeSchedules,
 * and useCraftPlanner.
 */
export type ResourceType =
  | 'machine'
  | 'garden'
  | 'expedition'
  | 'fabrication'
  | 'buy'
  | 'dungeon'
  | 'workstation'

const PREFIXED: ReadonlyArray<readonly [string, ResourceType]> = [
  ['Machine:', 'machine'],
  ['Garden:', 'garden'],
  ['Expedition:', 'expedition'],
  ['Fabrication:', 'fabrication'],
  ['Buy:', 'buy'],
  ['Dungeon:', 'dungeon'],
]

/** Classify a resource label by its prefix. Unprefixed labels are `'workstation'` lanes. */
export function parseResourceType(resource: string): ResourceType {
  for (const [prefix, type] of PREFIXED) {
    if (resource.startsWith(prefix)) return type
  }
  return 'workstation'
}

/** True when `resource` is of the given kind. */
export function isResourceType(resource: string, type: ResourceType): boolean {
  return parseResourceType(resource) === type
}

// Scheduling stagger order used by useCraftPlanner: passive lanes (machine/garden/fabrication/
// expedition) sort after the active workstation/gather/buy lanes. Preserves the exact values of
// the former inline `resourceSortPriority` ladder.
const SORT_PRIORITY: Record<ResourceType, number> = {
  workstation: 1,
  buy: 1,
  dungeon: 1,
  machine: 1.5,
  garden: 2,
  fabrication: 2.5,
  expedition: 3,
}

/** Stagger priority for the craft-planner schedule sort (lower sorts first). */
export function resourceSortPriority(resource: string): number {
  return SORT_PRIORITY[parseResourceType(resource)]
}
