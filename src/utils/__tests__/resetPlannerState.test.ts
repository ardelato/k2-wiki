import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPlannerState } from '@/utils/save/resetPlannerState'

// Every save-scoped planner key "Reset all" must clear (see resetPlannerState). These
// live outside useGameConfig, so they used to survive a reset and point at a gone save.
const PLANNER_KEYS = [
  'awaken-planner-queue',
  'awaken-planner-boosters-excluded',
  'awaken-planner-boosters-included',
  'awaken-hands-free-fingerprint',
  'awaken-sim-added',
  'awaken-sim-removed',
  'sanctuary-target-tiers',
  'fabrication-simulated',
  'planner-expedition-tier-selections',
  'planner-include-all-expeditions',
]

// This sandbox's Node has no localStorage; install a minimal shim so the util has
// something to clear. (In the browser/happy-dom this is a no-op.)
beforeEach(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>()
    // @ts-expect-error minimal Storage shim for the test environment
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    }
  }
  localStorage.clear()
})

describe('resetPlannerState', () => {
  it('removes every save-scoped planner key', () => {
    for (const key of PLANNER_KEYS) localStorage.setItem(key, '["stale"]')
    // An unrelated key must be left untouched.
    localStorage.setItem('sidebar-collapsed', 'true')

    resetPlannerState()

    for (const key of PLANNER_KEYS) expect(localStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true')
  })

  it('dispatches a StorageEvent per cleared key so mounted refs revert', () => {
    localStorage.setItem('awaken-planner-queue', '["echo"]')
    const seen: (string | null)[] = []
    const handler = (e: StorageEvent) => {
      if (e.key === 'awaken-planner-queue') seen.push(e.newValue)
    }
    window.addEventListener('storage', handler)
    resetPlannerState()
    window.removeEventListener('storage', handler)

    expect(seen).toEqual([null])
  })

  it('is a no-op for keys that are already absent', () => {
    // No keys set → nothing to remove, no throw.
    expect(() => resetPlannerState()).not.toThrow()
    for (const key of PLANNER_KEYS) expect(localStorage.getItem(key)).toBeNull()
  })
})
