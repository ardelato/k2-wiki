import type { Ref, WritableComputedRef } from 'vue'

import {
  armTourRecovery,
  disarmTourRecovery,
  registerTourDemo,
} from '@/composables/plannerTourDemo'
import type { Creature } from '@/types'

// ===== Guided-tour demo seeding =====
// The tour walks live components, so it always seeds a curated party — a few eligible
// (owned, unawakened) creatures, skipping the starter Moss — then restores the user's
// real queue when the tour ends. We force the synchronous hands-free strategy and call
// calculate() so the plan (and its timeline anchor) render without the optimizer worker.
// Only the awaken-rush instance registers; prestige/custom instances skip this.
// The queue snapshot is the RAW localStorage value, restored with a direct write — if
// the tour is torn down by navigation, the useLocalStorage watcher may be stopped before
// it flushes, so a direct write is the only guarantee the demo queue doesn't leak into
// the user's saved queue. (awakenMode is in-memory only, so the ref restore covers it.)
const AWAKEN_QUEUE_KEY = 'awaken-planner-queue'
// Hands-free gates the plan behind a persisted "calculated" fingerprint; the demo stamps
// its own, so we snapshot/restore it too — otherwise the real queue shows a "Calculate"
// prompt (no plan) after the tour.
const AWAKEN_FP_KEY = 'awaken-hands-free-fingerprint'
// Expedition scope is gated by completions, so a fresh account has only the first
// expedition unlocked — every creature would funnel onto it. The tour flips this flag to
// make all expeditions available, then restores it.
const INCLUDE_ALL_KEY = 'planner-include-all-expeditions'
const AWAKEN_DEMO_EXCLUDE = new Set(['moss']) // the starter you always own — not a realistic awaken pick
// The demo party: one creature from each of a few tiers, at staggered levels. Tier (→ stat
// spread) plus level decides which expedition is fastest, so this lands each creature on a
// DIFFERENT expedition (Training / a mid one / an advanced one) instead of stacking them on
// the single low-level expedition. Levels climb toward the level-70 target.
const AWAKEN_DEMO_PARTY = [
  { tier: 0, level: 1 },
  { tier: 2, level: 25 },
  { tier: 4, level: 35 },
]

// Direct writes are teardown-safe (nav can stop the useLocalStorage watcher mid-flush).
function writeBack(key: string, raw: string | null) {
  if (raw === null) localStorage.removeItem(key)
  else localStorage.setItem(key, raw)
}

type AwakenDemoSnapshot = {
  queueRaw: string | null
  fpRaw: string | null
  includeAllRaw: string | null
  mode: 'optimal' | 'hands-free'
}

type UseAwakenTourDemoOptions = {
  /** Whether this view instance is the awaken-rush objective (only it registers). */
  isAwaken: Ref<boolean>
  /** Whether this view instance owns the awaken-rush objective at setup (registration gate). */
  registerForObjective: boolean
  creatures: Ref<Creature[]>
  isAwakened: (id: string) => boolean
  awakenQueue: Ref<string[]>
  awakenMode: Ref<'optimal' | 'hands-free'>
  awakenTourDemoIds: Ref<Set<string>>
  awakenTourDemoLevels: Ref<Map<string, number>>
  /** Shared expedition flag (NOT a private copy) — the tour unlocks every expedition. */
  includeAllExpeditions: WritableComputedRef<boolean> | Ref<boolean>
  /** Recalculate the active multi-creature plan (mode-aware). */
  awakenMultiCalculate: () => void
}

/**
 * Tour-demo glue for the Awaken-rush planner, mirroring the Summon tour demo. Seeds a
 * curated party (snapshotting the raw localStorage it touches), then restores the user's
 * real queue on tour end. Registers with the tour registry only when this instance owns
 * the awaken-rush objective. Returns an unregister fn the caller must invoke on unmount,
 * plus the restore fn for the navigate-away safety net.
 */
export function useAwakenTourDemo(opts: UseAwakenTourDemoOptions) {
  const {
    isAwaken,
    registerForObjective,
    creatures,
    isAwakened,
    awakenQueue,
    awakenMode,
    awakenTourDemoIds,
    awakenTourDemoLevels,
    includeAllExpeditions,
    awakenMultiCalculate,
  } = opts

  let awakenDemoSnapshot: AwakenDemoSnapshot | undefined

  function seedAwakenDemo(): boolean {
    if (!isAwaken.value) return false
    // Pick the lowest not-yet-awakened creature in each demo tier (owned or NOT — the planner
    // can level any creature, and awakenTourDemoIds exempts them from the eligibility prune so
    // this works on a fresh account that owns nothing). Skip Moss. Needs ≥2 for a party.
    const used = new Set<string>()
    const sample: { id: string; level: number }[] = []
    for (const { tier, level } of AWAKEN_DEMO_PARTY) {
      const pick = creatures.value
        .filter(
          (c) =>
            c.tier === tier &&
            !AWAKEN_DEMO_EXCLUDE.has(c.id) &&
            !isAwakened(c.id) &&
            !used.has(c.id),
        )
        .toSorted((a, b) => a.name.localeCompare(b.name))[0]
      if (pick) {
        used.add(pick.id)
        sample.push({ id: pick.id, level })
      }
    }
    if (sample.length < 2) return false
    const ids = sample.map((s) => s.id)
    awakenDemoSnapshot = {
      queueRaw: localStorage.getItem(AWAKEN_QUEUE_KEY),
      fpRaw: localStorage.getItem(AWAKEN_FP_KEY),
      includeAllRaw: localStorage.getItem(INCLUDE_ALL_KEY),
      mode: awakenMode.value,
    }
    // self-heal every key the demo touches if the tour is interrupted before it can restore
    armTourRecovery({
      [AWAKEN_QUEUE_KEY]: awakenDemoSnapshot.queueRaw,
      [AWAKEN_FP_KEY]: awakenDemoSnapshot.fpRaw,
      [INCLUDE_ALL_KEY]: awakenDemoSnapshot.includeAllRaw,
    })
    awakenTourDemoIds.value = new Set(ids) // keep these past the eligibility prune
    awakenTourDemoLevels.value = new Map(sample.map((s) => [s.id, s.level]))
    includeAllExpeditions.value = true // unlock every expedition so the party can spread out
    awakenMode.value = 'hands-free'
    awakenQueue.value = ids
    awakenMultiCalculate()
    return true
  }

  function restoreAwakenDemo() {
    if (awakenDemoSnapshot === undefined) return
    awakenTourDemoIds.value = new Set() // stop exempting demo creatures; unowned ones now prune out
    awakenTourDemoLevels.value = new Map() // drop the staggered demo levels
    const { queueRaw, fpRaw, includeAllRaw, mode } = awakenDemoSnapshot
    writeBack(AWAKEN_QUEUE_KEY, queueRaw)
    writeBack(AWAKEN_FP_KEY, fpRaw)
    writeBack(INCLUDE_ALL_KEY, includeAllRaw)
    includeAllExpeditions.value = includeAllRaw === 'true' // mirror the restored flag in-memory
    try {
      awakenQueue.value = queueRaw ? (JSON.parse(queueRaw) as string[]) : []
    } catch {
      awakenQueue.value = []
    }
    awakenMode.value = mode
    // Re-stamp the plan for the restored queue so the page shows it again instead of the
    // demo's stale fingerprint (fixes the in-memory ref the direct write can't reach).
    if (awakenQueue.value.length >= 2) awakenMultiCalculate()
    awakenDemoSnapshot = undefined
    disarmTourRecovery()
  }

  const unregisterAwakenDemo = registerForObjective
    ? registerTourDemo('awaken-rush', { seed: seedAwakenDemo, restore: restoreAwakenDemo })
    : null

  return { seedAwakenDemo, restoreAwakenDemo, unregisterAwakenDemo }
}
