import { mount } from '@vue/test-utils'
import { defineComponent, ref, nextTick } from 'vue'

import type { Creature } from '@/types'

const target: Creature = {
  id: 'target',
  name: 'Target',
  mainJob: 'chopping',
  description: '',
  image: '',
  tier: 0,
  trait: 'learner',
  types: ['Fire'],
  stats: { power: 10, grit: 8, agility: 6, smarts: 4, looting: 2, luck: 1 },
  jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
  summoningCost: [],
}

const helper: Creature = { ...target, id: 'helper', name: 'Helper' }

vi.mock('@/composables/useCreatures', () => ({
  useCreatures: () => ({ creatures: ref([target, helper]) }),
}))

const ownedRef = ref(new Set<string>(['target']))
const awakenedMap: Record<string, boolean> = {}
const levelMap: Record<string, number> = { target: 1, helper: 1 }

vi.mock('@/composables/useCreatureCollection', () => ({
  useCreatureCollection: () => ({
    ownedCreatureIds: ownedRef,
    isOwned: (id: string) => ownedRef.value.has(id),
    getLevel: (id: string) => levelMap[id] ?? 1,
    isAwakened: (id: string) => awakenedMap[id] ?? false,
  }),
}))

const expeditionToolXpBonusRef = ref(1)
vi.mock('@/composables/useGameConfig', () => ({
  useGameConfig: () => ({
    expeditionToolXpBonus: expeditionToolXpBonusRef,
  }),
}))

import { useLevelPlanner } from '@/composables/useLevelPlanner'

function harness(creatureIdValue = 'target', targetLevelValue = 10) {
  const creatureId = ref(creatureIdValue)
  const targetLevel = ref(targetLevelValue)
  const expeditionTierSelections = ref<Record<string, number[]>>({})

  let api: ReturnType<typeof useLevelPlanner> | null = null

  const Host = defineComponent({
    setup() {
      api = useLevelPlanner(creatureId, targetLevel, expeditionTierSelections)
      return () => null
    },
  })
  const wrapper = mount(Host)
  return { wrapper, creatureId, targetLevel, expeditionTierSelections, api: api! }
}

describe('useLevelPlanner — calculate gate', () => {
  test('plan is null until calculate() is called', async () => {
    const { api } = harness()
    expect(api.hasCalculated.value).toBe(false)
    expect(api.plan.value).toBeNull()
    api.calculate()
    await nextTick()
    expect(api.hasCalculated.value).toBe(true)
    expect(api.plan.value).not.toBeNull()
    expect(api.plan.value!.steps.length).toBeGreaterThan(0)
  })

  test('changing target level invalidates the plan and requires Calculate again', async () => {
    const { api, targetLevel } = harness('target', 10)
    api.calculate()
    await nextTick()
    expect(api.plan.value).not.toBeNull()
    targetLevel.value = 15
    await nextTick()
    expect(api.hasCalculated.value).toBe(false)
    expect(api.plan.value).toBeNull()
    api.calculate()
    await nextTick()
    expect(api.plan.value).not.toBeNull()
  })

  test('changing target creature invalidates the plan', async () => {
    const { api, creatureId } = harness('target', 10)
    api.calculate()
    await nextTick()
    expect(api.plan.value).not.toBeNull()
    creatureId.value = 'helper'
    await nextTick()
    expect(api.hasCalculated.value).toBe(false)
    expect(api.plan.value).toBeNull()
  })

  test('calling calculate() with no input change still forces a re-run', async () => {
    const { api } = harness()
    api.calculate()
    await nextTick()
    const first = api.plan.value
    api.calculate()
    await nextTick()
    // Same shape but a freshly produced object — confirms the toggle re-evaluated
    expect(api.plan.value).not.toBeNull()
    expect(api.plan.value).not.toBe(first)
  })
})
