import { computed, ref, watch } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import type { PartyPlanCreature, PartyLevelingPlan } from '@/types'
import { maxLevelForState } from '@/utils/formulas'
import PartyPlannerWorker from '@/workers/partyPlannerWorker?worker'

export function usePartyPlanner(targetLevel: { value: number }) {
  const { creatures } = useCreatures()
  const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
  const { excludedCreatureIds } = useGameConfig()

  const plan = ref<PartyLevelingPlan | null>(null)
  const isComputing = ref(false)

  let worker: Worker | null = null

  /** All owned creatures (excluding sanctuary, helpers, machines), auto-classified as levelers or boosters */
  const partyCreatures = computed<PartyPlanCreature[]>(() => {
    return creatures.value
      .filter((c) => ownedCreatureIds.value.has(c.id) && !excludedCreatureIds.value.has(c.id))
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

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    partyCreatures,
    (updatedCreatures) => {
      if (debounceTimer) clearTimeout(debounceTimer)

      // Terminate any in-flight worker
      if (worker) {
        worker.terminate()
        worker = null
      }

      if (!hasLevelers.value) {
        plan.value = null
        isComputing.value = false
        return
      }

      isComputing.value = true
      debounceTimer = setTimeout(() => {
        worker = new PartyPlannerWorker()
        worker.addEventListener('message', (e: MessageEvent<PartyLevelingPlan>) => {
          plan.value = e.data
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
        worker.postMessage(JSON.parse(JSON.stringify(updatedCreatures)))
      }, 150)
    },
    { deep: true, immediate: true },
  )

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
  }
}
