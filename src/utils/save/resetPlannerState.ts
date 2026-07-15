import { writeStorageKey } from '@/utils/save/writeStorageKey'

// Planner and simulation state that each planner persists to its OWN localStorage
// key, independent of useGameConfig. "Reset all" on the Configs page must wipe these
// alongside the imported save — otherwise stale queues, targets, and scopes keep
// pointing at a save that no longer exists (the awaken-rush queue was the symptom).
// Owner composable is noted per key so this list stays discoverable.
const PLANNER_STATE_KEYS = [
  'awaken-planner-queue', // useAwakenGoals / AwakenRushPlanner — awaken-rush queue
  'awaken-planner-boosters-excluded', // useAwakenBoosterRoster — booster roster overrides
  'awaken-planner-boosters-included', // useAwakenBoosterRoster — booster roster overrides
  'awaken-hands-free-fingerprint', // useAwakenHandsFree — "already calculated" gate
  'awaken-sim-added', // useAwakenSimulation — Awaken Tree simulated purchases
  'awaken-sim-removed', // useAwakenSimulation — Awaken Tree simulated removals
  'sanctuary-target-tiers', // useSanctuary — sanctuary target-tier goals
  'fabrication-simulated', // useCraftPlanner — simulated fabrication amounts
  'planner-expedition-tier-selections', // useExpeditionTierSelections — expedition scope overrides
  'planner-include-all-expeditions', // useExpeditionTierSelections — include-all toggle
] as const

/**
 * Clear every save-scoped planner/simulation key. Each key is cleared through
 * `writeStorageKey`, which fires a same-tab `storage` event so any already-mounted
 * `useLocalStorage` ref reverts to its default.
 */
export function resetPlannerState(): void {
  for (const key of PLANNER_STATE_KEYS) writeStorageKey(key, null)
}
