import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { getCreatureImage } from '@/utils/images/creatureImages'
import type {
  MemberRole,
  PrestigeLoopInput,
  PrestigeLoopPlan,
  PrestigeLoopRosterEntry,
} from '@/utils/planner/prestigeLoopPlanner'
import PrestigeLoopWorker from '@/workers/prestigeLoopWorker?worker'

/** A roster row shaped for the Awaken-style rail. `role` is null until a plan is computed. */
export interface PrestigeRosterRailEntry {
  id: string
  name: string
  image: string | null
  tier: number
  level: number
  role: MemberRole | null
}

/**
 * Drives the prestige-loop planner (sub-project #9). Builds the prestige-eligible roster
 * (owned + awakened, override-aware), runs the deterministic simulation off the main thread,
 * and exposes the recommended stable assignment + comparison grid.
 */
export function usePrestigeLoopPlanner(
  cadenceHours: { value: number },
  boosterCount: { value: number },
  creatureOverrides?: {
    plannerExcluded: { value: Set<string> }
    plannerIncluded: { value: Set<string> }
  },
  expeditionTierSelections?: { value: Record<string, number[]> },
  /**
   * Overrides the auto-excluded roster basis. Prestige passes a set that omits
   * Sanctuary-seated creatures (the loop reassigns them, so they stay eligible),
   * unlike the default `excludedCreatureIds` which excludes every deployed creature.
   */
  globalExcludedIds?: { value: Set<string> },
) {
  const { creatures } = useCreatures()
  const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
  const { excludedCreatureIds } = useGameConfig()

  /** Owned, awakened (prestige-capable), override-aware roster. */
  const eligibleEntries = computed<PrestigeLoopRosterEntry[]>(() => {
    const globalExcluded = globalExcludedIds?.value ?? excludedCreatureIds.value
    const plannerExcluded = creatureOverrides?.plannerExcluded.value ?? new Set<string>()
    const plannerIncluded = creatureOverrides?.plannerIncluded.value ?? new Set<string>()

    return creatures.value
      .filter((c) => {
        if (!ownedCreatureIds.value.has(c.id)) return false
        if (!isAwakened(c.id)) return false // only awakened creatures can prestige
        const effectivelyExcluded =
          (globalExcluded.has(c.id) && !plannerIncluded.has(c.id)) || plannerExcluded.has(c.id)
        return !effectivelyExcluded
      })
      .map((c) => ({ creatureId: c.id, level: getLevel(c.id), awakened: true }))
  })

  const eligibleCount = computed(() => eligibleEntries.value.length)
  const hasEligible = computed(() => eligibleCount.value > 0)

  const plan = ref<PrestigeLoopPlan | null>(null)

  /**
   * The eligible roster shaped for the Awaken-style rail. Once a plan exists, each row
   * carries the creature's planned role (anchor / booster / climber) so the roster reads
   * as a live legend; before computation `role` is null and the rail shows level instead.
   */
  const rosterEntries = computed<PrestigeRosterRailEntry[]>(() => {
    const roleById = new Map<string, MemberRole>()
    if (plan.value) {
      for (const id of plan.value.anchorIds) roleById.set(id, 'anchor')
      for (const a of plan.value.assignment) {
        for (const m of a.members) {
          if (!roleById.has(m.creatureId)) roleById.set(m.creatureId, m.role)
        }
      }
    }
    const creatureById = new Map(creatures.value.map((c) => [c.id, c]))
    return eligibleEntries.value
      .map((e) => {
        const c = creatureById.get(e.creatureId)
        if (!c) return null
        return {
          id: c.id,
          name: c.name,
          image: getCreatureImage(c) ?? null,
          tier: c.tier,
          level: e.level,
          role: roleById.get(c.id) ?? null,
        }
      })
      .filter((e): e is PrestigeRosterRailEntry => e !== null)
  })
  const lastInput = ref<PrestigeLoopInput | null>(null)
  const isComputing = ref(false)
  const startedAtMs = ref(0)

  const DEBOUNCE_MS = 50
  let worker: Worker | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Computed plans keyed by cadence. The result is deterministic for a fixed roster + scope, so
  // switching back to an already-computed cadence is served from here with no recompute. Roster
  // and scope changes clear it (they invalidate every cadence).
  const planCache = new Map<number, PrestigeLoopPlan>()

  // The cache is also persisted so a page refresh with unchanged inputs reuses the last result
  // instead of re-running the simulation.
  const PLAN_CACHE_STORAGE_KEY = 'prestige-loop-plan-cache'

  // A stable fingerprint of every result-affecting input EXCEPT cadence (the per-plan cache key).
  // A refresh only reuses cached plans when this still matches the saved one.
  function baseSignature(): string {
    const roster = eligibleEntries.value
      .map((e) => `${e.creatureId}:${e.level}:${e.awakened ? 1 : 0}`)
      .toSorted()
    const tiers = expeditionTierSelections?.value
    const tierSig = tiers
      ? Object.keys(tiers)
          .toSorted()
          .map((k) => `${k}=${[...tiers[k]].toSorted((a, b) => a - b).join(',')}`)
          .join('|')
      : ''
    return JSON.stringify({ roster, k: boosterCount.value, tiers: tierSig })
  }

  function persistCache() {
    try {
      localStorage.setItem(
        PLAN_CACHE_STORAGE_KEY,
        JSON.stringify({ signature: baseSignature(), plans: Object.fromEntries(planCache) }),
      )
    } catch {
      // Storage full or unavailable — persistence is best-effort, so skip silently.
    }
  }

  // On load, restore cached plans when the saved inputs still match, so the previous result shows
  // immediately instead of forcing a recompute.
  function rehydrateCache() {
    try {
      const raw = localStorage.getItem(PLAN_CACHE_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as {
        signature: string
        plans: Record<string, PrestigeLoopPlan>
      }
      if (saved.signature !== baseSignature()) return
      for (const [cadence, p] of Object.entries(saved.plans)) planCache.set(Number(cadence), p)
      const current = planCache.get(cadenceHours.value)
      if (current) {
        plan.value = current
        lastInput.value = buildInput()
      }
    } catch {
      // Corrupt or incompatible payload — ignore and recompute on demand.
    }
  }

  function cleanupWorker() {
    if (worker) {
      worker.terminate()
      worker = null
    }
    if (debounceTimer) clearTimeout(debounceTimer)
  }

  function buildInput(): PrestigeLoopInput {
    return {
      creatures: eligibleEntries.value,
      cadenceHours: cadenceHours.value,
      boosterCount: boosterCount.value,
      allowedExpeditionTiers: expeditionTierSelections?.value,
    }
  }

  function startWorker() {
    isComputing.value = true
    startedAtMs.value = Date.now()
    const input = buildInput()
    lastInput.value = input
    worker = new PrestigeLoopWorker()
    worker.addEventListener('message', (e: MessageEvent<PrestigeLoopPlan>) => {
      plan.value = e.data
      planCache.set(input.cadenceHours, e.data)
      persistCache()
      isComputing.value = false
      worker?.terminate()
      worker = null
    })
    worker.addEventListener('error', () => {
      isComputing.value = false
      worker?.terminate()
      worker = null
    })
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    worker.postMessage(JSON.parse(JSON.stringify(input)))
  }

  function calculate() {
    cleanupWorker()
    if (!hasEligible.value) {
      plan.value = null
      isComputing.value = false
      return
    }
    isComputing.value = true
    debounceTimer = setTimeout(startWorker, DEBOUNCE_MS)
  }

  function recalculate() {
    plan.value = null
    calculate()
  }

  // Cadence is a live knob — its payoff is already shown in the comparison rows, so switching
  // cadences updates in place instead of dropping back to the Calculate prompt. (boosterCount is
  // fixed, so this effectively fires only on cadence changes.) Before the first calculation there's
  // nothing to refresh, so we leave the Calculate prompt up. An already-computed cadence is served
  // from cache instantly; only a new cadence triggers a recompute.
  watch([() => cadenceHours.value, () => boosterCount.value], () => {
    if (plan.value === null && !isComputing.value) return
    const cached = planCache.get(cadenceHours.value)
    if (cached) {
      cleanupWorker()
      isComputing.value = false
      plan.value = cached
      return
    }
    recalculate()
  })

  watch(
    eligibleEntries,
    () => {
      cleanupWorker()
      isComputing.value = false
      plan.value = null
      planCache.clear()
    },
    { deep: true },
  )

  // Scoping the calculator to a different set of expeditions/tiers changes the result.
  if (expeditionTierSelections) {
    watch(
      () => expeditionTierSelections.value,
      () => {
        cleanupWorker()
        isComputing.value = false
        plan.value = null
        planCache.clear()
      },
      { deep: true },
    )
  }

  onBeforeUnmount(cleanupWorker)

  // Restore the last result for the current inputs so a refresh doesn't re-run the simulation.
  rehydrateCache()

  return {
    plan,
    lastInput,
    eligibleEntries,
    eligibleCount,
    hasEligible,
    rosterEntries,
    isComputing,
    startedAtMs,
    calculate,
    recalculate,
  }
}
