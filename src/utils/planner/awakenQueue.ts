/**
 * Awaken-rush queue seeding.
 *
 * The creature drawer's "Plan Awakening" button routes to the Awaken tab with
 * ?creature=<id>, which the planner mirrors into `creatureId`. The tab itself is
 * driven by a persisted queue, so a routed creature only reaches the plan once it's
 * appended to that queue. This computes the next queue: append the routed id when it's
 * a valid, not-yet-queued awaken target; otherwise return the queue unchanged.
 *
 * The no-op path returns the SAME array reference so the reactive caller's assignment
 * is a genuine no-op (no spurious localStorage write, no watcher loop).
 *
 * Pure + unit-tested.
 */
export function seedAwakenQueue(
  queue: string[],
  id: string | undefined,
  eligibleIds: ReadonlySet<string>,
): string[] {
  if (!id || queue.includes(id) || !eligibleIds.has(id)) return queue
  return [...queue, id]
}
