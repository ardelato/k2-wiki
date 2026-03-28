import { useLocalStorage } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import type {
  PartyPlanCreature,
  PartyLevelingPlan,
  PartyPlannerInput,
  PartyPlannerProgress,
  PartyPlannerWorkerMessage,
  PlannerStrategy,
  PlannerTimeBudget,
} from '@/types'
import { maxLevelForState } from '@/utils/formulas'
import PartyPlannerWorker from '@/workers/partyPlannerWorker?worker'

export function usePartyPlanner(
  targetLevel: { value: number },
  strategy: { value: PlannerStrategy } = { value: 'optimal' },
  timeBudget: { value: PlannerTimeBudget } = { value: 'quick' },
  creatureOverrides?: {
    plannerExcluded: { value: Set<string> }
    plannerIncluded: { value: Set<string> }
  },
) {
  const { creatures } = useCreatures()
  const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
  const { excludedCreatureIds } = useGameConfig()
  const expeditionParties = useLocalStorage<Record<string, string[]>>('expedition-parties', {})
  const expeditionTiers = useLocalStorage<Record<string, number>>('expedition-tiers', {})
  const expeditionLoopCounts = useLocalStorage<Record<string, number>>('expedition-loop-counts', {})

  function cachePrefix(): string {
    return `party-planner-cache-${strategy.value}-${timeBudget.value}`
  }

  function readCachedPlan(): { key: string; plan: PartyLevelingPlan } | null {
    try {
      const prefix = cachePrefix()
      const key = localStorage.getItem(`${prefix}-key`)
      const raw = localStorage.getItem(prefix)
      if (!key || !raw) return null
      const plan = JSON.parse(raw) as PartyLevelingPlan
      if (!plan?.steps) return null
      return { key, plan }
    } catch {
      return null
    }
  }

  function writeCachedPlan(key: string, plan: PartyLevelingPlan) {
    try {
      const prefix = cachePrefix()
      localStorage.setItem(`${prefix}-key`, key)
      localStorage.setItem(prefix, JSON.stringify(plan))
    } catch {
      // Quota exceeded — silently skip caching
    }
  }

  const plan = ref<PartyLevelingPlan | null>(null)
  const isComputing = ref(false)
  const progress = ref<PartyPlannerProgress | null>(null)

  const DEBOUNCE_MS = 50

  let worker: Worker | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function cleanupWorker() {
    if (worker) {
      worker.terminate()
      worker = null
    }
    if (debounceTimer) clearTimeout(debounceTimer)
  }

  /** All owned creatures with override-aware exclusion, auto-classified as levelers or boosters */
  const partyCreatures = computed<PartyPlanCreature[]>(() => {
    const globalExcluded = excludedCreatureIds.value
    const plannerExcluded = creatureOverrides?.plannerExcluded.value ?? new Set<string>()
    const plannerIncluded = creatureOverrides?.plannerIncluded.value ?? new Set<string>()

    return creatures.value
      .filter((c) => {
        if (!ownedCreatureIds.value.has(c.id)) return false
        // effective excluded = (globalExcluded - plannerIncluded) + plannerExcluded
        const effectivelyExcluded =
          (globalExcluded.has(c.id) && !plannerIncluded.has(c.id)) || plannerExcluded.has(c.id)
        return !effectivelyExcluded
      })
      .map((c) => {
        const level = getLevel(c.id)
        const awakened = isAwakened(c.id)
        const max = maxLevelForState(awakened)
        const atMax = level >= max
        return {
          creature: c,
          startLevel: level,
          // Pass the full target — the algorithm handles awakening mid-simulation
          targetLevel: atMax ? max : targetLevel.value,
          isBooster: atMax,
          awakened,
        }
      })
  })

  const levelers = computed(() =>
    partyCreatures.value.filter((c) => !c.isBooster && c.startLevel < c.targetLevel),
  )
  const boosters = computed(() => partyCreatures.value.filter((c) => c.isBooster))
  const hasLevelers = computed(() => levelers.value.length > 0)

  /** Stable fingerprint for cache invalidation — only includes data that affects the plan output */
  function buildInputFingerprint(): string {
    const creatureKey = partyCreatures.value
      .map((c) => `${c.creature.id}:${c.startLevel}:${c.targetLevel}:${c.isBooster}:${c.awakened}`)
      .join('|')
    const expKeys = Object.keys({
      ...expeditionParties.value,
      ...expeditionTiers.value,
      ...expeditionLoopCounts.value,
    }).toSorted()
    const expKey = expKeys
      .map((id) => {
        const party = (expeditionParties.value[id] ?? []).join(',')
        const tier = expeditionTiers.value[id] ?? 1
        const loops = expeditionLoopCounts.value[id] ?? 0
        return `${id}:${party}:${tier}:${loops}`
      })
      .join('|')
    return `${creatureKey}||${expKey}||${strategy.value}||${timeBudget.value}`
  }

  // Load cached plan immediately if available (all inputs are localStorage-backed so fingerprint is stable on init)
  {
    const cached = readCachedPlan()
    if (cached && buildInputFingerprint() === cached.key) {
      plan.value = cached.plan
    }
  }

  function buildPlannerInput(): PartyPlannerInput {
    return {
      creatures: partyCreatures.value,
      strategy: strategy.value,
      timeBudget: timeBudget.value,
      expeditions: Object.fromEntries(
        Object.keys({
          ...expeditionParties.value,
          ...expeditionTiers.value,
          ...expeditionLoopCounts.value,
        }).map((expeditionId) => [
          expeditionId,
          {
            party: expeditionParties.value[expeditionId] ?? [],
            tier: expeditionTiers.value[expeditionId] ?? 1,
            loopCount: expeditionLoopCounts.value[expeditionId] ?? 0,
          },
        ]),
      ),
    }
  }

  function startWorker(inputKey: string) {
    const input = buildPlannerInput()
    progress.value = {
      phase: 'initializing',
      iteration: 0,
      maxIterations: 320,
      beamSize: 0,
      stateIndex: 0,
      statesInIteration: 0,
      exploredStates: 0,
      expeditionsConsidered: 0,
      waveVariantsEvaluated: 0,
      bestCompleteTimeSeconds: null,
      iterationBudget: timeBudget.value === 'thorough' ? 320 : 40,
      startedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      elapsedMs: 0,
    }
    worker = new PartyPlannerWorker()
    worker.addEventListener('message', (e: MessageEvent<PartyPlannerWorkerMessage>) => {
      if (e.data.type === 'progress') {
        progress.value = e.data.progress
        return
      }
      plan.value = e.data.result
      writeCachedPlan(inputKey, e.data.result)
      isComputing.value = false
      progress.value = null
      worker?.terminate()
      worker = null
    })
    worker.addEventListener('error', () => {
      isComputing.value = false
      progress.value = null
      worker?.terminate()
      worker = null
    })
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    worker.postMessage(JSON.parse(JSON.stringify(input)))
  }

  // When strategy or budget changes, try to load cached plan for the new combo; clear if none exists
  watch([() => strategy.value, () => timeBudget.value], () => {
    cleanupWorker()
    isComputing.value = false
    progress.value = null

    const cached = readCachedPlan()
    const currentKey = buildInputFingerprint()
    plan.value = cached && currentKey === cached.key ? cached.plan : null
  })

  // Terminate in-flight workers when creature data changes (collection edits invalidate results)
  watch(
    partyCreatures,
    () => {
      cleanupWorker()
      isComputing.value = false
      progress.value = null
      plan.value = null
    },
    { deep: true },
  )

  function calculate() {
    cleanupWorker()

    if (!hasLevelers.value) {
      plan.value = null
      isComputing.value = false
      progress.value = null
      return
    }

    isComputing.value = true
    debounceTimer = setTimeout(() => {
      const inputKey = buildInputFingerprint()
      const cached = readCachedPlan()

      // Use cached plan if input hasn't changed
      if (cached && inputKey === cached.key) {
        plan.value = cached.plan
        isComputing.value = false
        return
      }

      startWorker(inputKey)
    }, DEBOUNCE_MS)
  }

  function recalculate() {
    // Clear cached plan so we don't short-circuit
    try {
      const prefix = cachePrefix()
      localStorage.removeItem(`${prefix}-key`)
      localStorage.removeItem(prefix)
    } catch {
      // ignore
    }

    cleanupWorker()

    if (!hasLevelers.value) {
      plan.value = null
      isComputing.value = false
      progress.value = null
      return
    }

    plan.value = null
    isComputing.value = true
    debounceTimer = setTimeout(() => {
      const inputKey = buildInputFingerprint()
      startWorker(inputKey)
    }, DEBOUNCE_MS)
  }

  const summaries = computed(() => plan.value?.summaries ?? [])
  const totalTimeSeconds = computed(() => plan.value?.totalTimeSeconds ?? 0)
  const totalRuns = computed(() => plan.value?.totalRuns ?? 0)

  return {
    plan,
    partyCreatures,
    levelers,
    boosters,
    hasLevelers,
    summaries,
    totalTimeSeconds,
    totalRuns,
    isComputing,
    progress,
    calculate,
    recalculate,
  }
}
