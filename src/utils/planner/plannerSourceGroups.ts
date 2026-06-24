import { expeditionSourceIndex, itemById, jobActivityIndex } from '@/data/indexes'

/**
 * Source-based grouping for planner materials, extracted from SummoningPlanner so the
 * Single Item planner's List view can group identically (Refined / Gathered → job / etc.).
 * Pure functions over the data indexes.
 */
export type SourceGroup =
  | 'Refined'
  | 'Gathered'
  | 'Expedition'
  | 'Garden'
  | 'Merchant'
  | 'Currency'
  | 'Other'

export const sourceGroupOrder: SourceGroup[] = [
  'Refined',
  'Gathered',
  'Expedition',
  'Garden',
  'Merchant',
  'Currency',
  'Other',
]

export const sourceGroupLabels: Record<SourceGroup, string> = {
  Refined: 'Refined Materials',
  Gathered: 'Gathered Resources',
  Expedition: 'Expedition Rewards',
  Garden: 'Garden Flowers',
  Merchant: 'Merchant',
  Currency: 'Currency',
  Other: 'Other',
}

/** Classify an item into a source group, using the active acquisition method's kind. */
export function getSourceGroup(itemId: string, activeMethodKind?: string): SourceGroup {
  if (activeMethodKind === 'buy') return 'Merchant'
  const item = itemById.get(itemId)
  if (!item) return 'Other'
  if (item.type === 'Refined') return 'Refined'
  if (item.type === 'Currency') return 'Currency'
  if (item.type === 'Gathered') {
    // Garden items have no job source and no expedition source (flowers + raw essences).
    const hasJob = jobActivityIndex.has(itemId)
    const hasExpedition = expeditionSourceIndex.has(itemId)
    if (!hasJob && !hasExpedition) return 'Garden'
    if (hasExpedition && !hasJob) return 'Expedition'
    return 'Gathered'
  }
  return 'Other'
}

/** Lowest-level gathering source (job + level requirement) for an item, or null if not gathered. */
export function getGatherSource(
  itemId: string,
): { jobId: string; levelRequirement: number } | null {
  const sources = jobActivityIndex.get(itemId)
  if (!sources || sources.length === 0) return null
  const best = sources.reduce((a, b) => (a.levelRequirement <= b.levelRequirement ? a : b))
  return { jobId: best.jobId, levelRequirement: best.levelRequirement }
}

/** Lowest-level gathering job for an item, for sub-grouping Gathered resources by job. */
export function getGatherJobId(itemId: string): string | null {
  return getGatherSource(itemId)?.jobId ?? null
}
