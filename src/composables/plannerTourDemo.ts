import type { TourObjective } from './usePlannerTour'

/**
 * Bridge between the tour (owned by the planner shell) and the live planner views
 * that hold the actual state. On an empty planner there's nothing for the tour to
 * highlight, so each view registers a pair of handlers: `seed` briefly populates a
 * few sample creatures so the real components render, and `restore` puts the user's
 * own selection back when the tour ends.
 *
 * The view registers synchronously in setup (the closures capture its refs) and
 * unregisters on unmount, so the registry only ever holds handlers for the
 * currently-mounted objective.
 */
export type TourDemoHandlers = {
  /** Populate sample data so the section renders. Returns true if it actually seeded. */
  seed: () => boolean
  /** Restore the user's real state. Must be safe to call more than once. */
  restore: () => void
  /** Optional: let a step drive one of the view's sub-views (e.g. Summon's Plan vs
   *  All-materials toggle) so the tour can actually show it. */
  setView?: (view: string) => void
}

const registry = new Map<TourObjective, TourDemoHandlers>()

// ===== Crash-safe restore =====
// The tour always overwrites real planner data with a demo and restores it on exit. If a
// tour is interrupted before it can restore — a hard refresh, crash, or tab close mid-tour
// — that in-memory restore is lost. To stop the demo leaking into saved data, a seed first
// writes the pre-seed raw values here; a normal restore clears them, and any planner mount
// replays whatever's still armed (a self-heal) before its composables read localStorage.
const RECOVERY_KEY = 'planner-tour-restore'

/** Replay an interrupted tour's saved originals, if any. Call before reading seeded keys. */
export function recoverTourDemo(): void {
  let raw: string | null
  try {
    raw = localStorage.getItem(RECOVERY_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, string | null>)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
  } catch {
    // corrupt payload — fall through and clear it
  }
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // ignore
  }
}

/** Arm the recovery snapshot for a seed: maps each key it overwrites to its pre-seed raw value. */
export function armTourRecovery(entries: Record<string, string | null>): void {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(entries))
  } catch {
    // quota / unavailable — best effort
  }
}

/** Clear the recovery snapshot after a successful restore. */
export function disarmTourRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // ignore
  }
}

export function registerTourDemo(objective: TourObjective, handlers: TourDemoHandlers): () => void {
  registry.set(objective, handlers)
  return () => {
    if (registry.get(objective) === handlers) registry.delete(objective)
  }
}

export function getTourDemo(objective: TourObjective): TourDemoHandlers | null {
  return registry.get(objective) ?? null
}
