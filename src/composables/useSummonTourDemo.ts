import { onBeforeUnmount, type Ref } from 'vue'

import {
  armTourRecovery,
  disarmTourRecovery,
  registerTourDemo,
} from '@/composables/plannerTourDemo'
import { SUMMONING_SELECTION_KEY } from '@/composables/useSummoningPlanner'
import type { Creature } from '@/types'

// ===== Guided-tour demo seeding =====
// The tour walks live components, so it always shows a curated demo: a few unowned
// creatures from the LOWEST tiers, regardless of any real selection — which is restored
// when the tour ends. Low-tier picks are attainable, so the demo plan stays clean (small
// estimates, no blockers, no stacks of "ways to improve" cards) instead of the wall of
// noise high-tier creatures produce. setView lets a step flip the Plan ⇄ All-materials
// toggle so the tour can actually show the materials view.
//
// The selection snapshot is the RAW localStorage value, restored with a direct write: if
// the tour is torn down by navigation, the persistence watcher may be stopped before it
// flushes, so a direct write is the only guarantee the demo doesn't leak into the user's
// saved selection. The view snapshot is in-memory (viewMode/materialsView aren't persisted).

export interface UseSummonTourDemoOptions {
  unsummonedCreatures: Ref<Creature[]>
  selectedIds: Ref<Set<string>>
  viewMode: Ref<'plan' | 'materials'>
  materialsView: Ref<'list' | 'tree'>
}

/**
 * Tour-demo glue for the Summon planner. Seeds a curated low-tier selection (snapshotting
 * the raw localStorage selection it touches and the in-memory view state), then restores
 * the user's real selection + view on tour end. Registers with the tour registry and wires
 * its own onBeforeUnmount safety net (restore + unregister).
 */
export function useSummonTourDemo(opts: UseSummonTourDemoOptions) {
  const { unsummonedCreatures, selectedIds, viewMode, materialsView } = opts

  let summonDemoRaw: string | null | undefined
  let summonViewSnapshot: { mode: 'plan' | 'materials'; materials: 'list' | 'tree' } | undefined

  function seedSummonDemo(): boolean {
    const sample = unsummonedCreatures.value
      .toSorted((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((c) => c.id)
    if (sample.length === 0) return false
    summonDemoRaw = localStorage.getItem(SUMMONING_SELECTION_KEY)
    summonViewSnapshot = { mode: viewMode.value, materials: materialsView.value }
    armTourRecovery({ [SUMMONING_SELECTION_KEY]: summonDemoRaw }) // self-heal if interrupted
    selectedIds.value = new Set(sample)
    viewMode.value = 'plan' // tours open on the Plan view
    return true
  }

  function restoreSummonDemo() {
    if (summonDemoRaw === undefined) return // not seeded
    if (summonDemoRaw === null) localStorage.removeItem(SUMMONING_SELECTION_KEY)
    else localStorage.setItem(SUMMONING_SELECTION_KEY, summonDemoRaw)
    try {
      selectedIds.value = new Set(summonDemoRaw ? (JSON.parse(summonDemoRaw) as string[]) : [])
    } catch {
      selectedIds.value = new Set()
    }
    if (summonViewSnapshot) {
      viewMode.value = summonViewSnapshot.mode
      materialsView.value = summonViewSnapshot.materials
      summonViewSnapshot = undefined
    }
    summonDemoRaw = undefined
    disarmTourRecovery()
  }

  function setSummonView(view: string) {
    if (view === 'materials') {
      materialsView.value = 'list' // the grouped list is the richest demo of the gather list
      viewMode.value = 'materials'
    } else {
      viewMode.value = 'plan'
    }
  }

  const unregisterSummonDemo = registerTourDemo('summon', {
    seed: seedSummonDemo,
    restore: restoreSummonDemo,
    setView: setSummonView,
  })

  onBeforeUnmount(() => {
    restoreSummonDemo() // safety net if the tour is still open when navigating away
    unregisterSummonDemo()
  })

  return { seedSummonDemo, restoreSummonDemo, setSummonView }
}
