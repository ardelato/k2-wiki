import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import creaturesData from '@/data/creatures.json'
import type { Creature } from '@/types'
import type { LevelingPlan } from '@/utils/planner/levelPlanner'

// Real roster from the reported save: Echo L66, Zibby L64, Wiggle L62 — all
// unawakened and heading to 70. Left alone, each solo plan picks the same single
// best expedition, so they used to stack overlapping runs on one lane.
const ROSTER = creaturesData.filter((c) => ['echo', 'zibby', 'wiggle'].includes(c.id)) as Creature[]
const LEVELS: Record<string, number> = { echo: 66, zibby: 64, wiggle: 62 }

vi.mock('@/composables/useCreatures', () => ({
  useCreatures: () => ({ creatures: ref(ROSTER) }),
}))

vi.mock('@/composables/useCreatureCollection', () => ({
  useCreatureCollection: () => ({
    ownedCreatureIds: ref(new Set(ROSTER.map((c) => c.id))),
    getLevel: (id: string) => LEVELS[id] ?? 1,
    isAwakened: () => false,
  }),
}))

vi.mock('@/composables/useGameConfig', () => ({
  useGameConfig: () => ({ expeditionToolXpBonus: ref(1) }),
}))

import { dominantExpeditionId, useAwakenHandsFree } from '@/composables/useAwakenHandsFree'

type Api = ReturnType<typeof useAwakenHandsFree>

function harness(queue: string[]) {
  const queueIds = ref(queue)
  const targetLevel = ref(70)
  let api: Api | null = null
  const Host = defineComponent({
    setup() {
      api = useAwakenHandsFree(queueIds, targetLevel)
      return () => null
    },
  })
  mount(Host)
  return api!
}

const dominant = dominantExpeditionId

describe('useAwakenHandsFree spread pass', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  it('gives each queued creature a distinct primary expedition', () => {
    const api = harness(['echo', 'zibby', 'wiggle'])
    api.calculate()

    const plans = api.plansById.value
    expect(plans.size).toBe(3)

    const lanes = [...plans.values()].map(dominant)
    expect(lanes.every((l) => l != null)).toBe(true)
    // The core fix: no two creatures share their dominant expedition lane.
    expect(new Set(lanes).size).toBe(3)
  })

  it('keeps the bottleneck (lowest-level) creature on the single best expedition', () => {
    // Wiggle (L62) is furthest from 70, so it should keep the globally-best expedition.
    const api = harness(['echo', 'zibby', 'wiggle'])
    api.calculate()

    const wigglePlan = api.plansById.value.get('wiggle')!
    // Solo-best expedition for this roster/level band is expedition-type-3 (from analysis).
    expect(dominant(wigglePlan)).toBe('expedition-type-3')
  })

  it('leaves a single-creature queue on its unrestricted best expedition', () => {
    const api = harness(['wiggle'])
    api.calculate()
    expect(dominant(api.plansById.value.get('wiggle')!)).toBe('expedition-type-3')
  })

  it('preserves the last-finish (makespan) at the parallel-solo optimum', () => {
    // Spreading is free here: the bottleneck keeps the best expedition and faster
    // creatures finish inside its window, so makespan matches the ideal 20100s.
    const api = harness(['echo', 'zibby', 'wiggle'])
    api.calculate()
    expect(api.lastFinishSeconds.value).toBe(20100)
  })
})

describe('dominantExpeditionId', () => {
  const runStep = (expId: string, timeSeconds: number) =>
    ({
      kind: 'run',
      expedition: { id: expId },
      timeSeconds,
    }) as unknown as LevelingPlan['steps'][number]
  const planOf = (...steps: LevelingPlan['steps']): LevelingPlan =>
    ({ steps, totalTimeSeconds: 0, totalRuns: 0, xpPerMinute: 0 }) as LevelingPlan

  it('picks the expedition with the greatest TOTAL time, not the single longest step', () => {
    // exp-A: two short revisits (300 + 300 = 600) beat exp-B's one long step (500).
    const plan = planOf(runStep('exp-A', 300), runStep('exp-B', 500), runStep('exp-A', 300))
    expect(dominantExpeditionId(plan)).toBe('exp-A')
  })

  it('returns null for a plan with no run steps', () => {
    expect(dominantExpeditionId(planOf())).toBeNull()
  })
})
