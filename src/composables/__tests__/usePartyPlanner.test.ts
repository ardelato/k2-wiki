import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

const terminateMock = vi.fn()
const addEventListenerMock = vi.fn()
const postMessageMock = vi.fn()

vi.mock('@/workers/partyPlannerWorker?worker', () => ({
  default: class MockWorker {
    addEventListener = addEventListenerMock
    removeEventListener = vi.fn()
    terminate = terminateMock
    postMessage = postMessageMock
  },
}))

vi.mock('@/composables/useCreatures', () => ({
  useCreatures: () => ({
    creatures: ref([
      {
        id: 'test-creature',
        name: 'Test',
        mainJob: 'chopping',
        tier: 0,
        trait: 'learner',
        types: [],
        stats: { power: 1, grit: 1, agility: 1, smarts: 1, looting: 1, luck: 1 },
        jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
      },
    ]),
  }),
}))

vi.mock('@/composables/useCreatureCollection', () => ({
  useCreatureCollection: () => ({
    ownedCreatureIds: ref(new Set(['test-creature'])),
    getLevel: () => 10,
    isAwakened: () => false,
  }),
}))

vi.mock('@/composables/useGameConfig', () => ({
  useGameConfig: () => ({
    excludedCreatureIds: ref(new Set<string>()),
    expeditionToolXpBonus: ref(1),
    expeditionParties: ref({}),
  }),
}))

vi.mock('@/composables/useExpeditionTierSelections', () => ({
  useExpeditionTierSelections: () => ({
    effectiveExpeditionTierSelections: ref({}),
  }),
}))

const { usePartyPlanner } = await import('@/composables/usePartyPlanner')

describe('usePartyPlanner — worker cleanup on unmount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('terminates active worker when component unmounts', () => {
    vi.useFakeTimers()

    const wrapper = mount(
      defineComponent({
        setup() {
          const targetLevel = ref(120)
          const { calculate } = usePartyPlanner(targetLevel)
          calculate()
          return {}
        },
        template: '<div />',
      }),
    )

    // Force the debounce timer to fire so the worker is created
    vi.advanceTimersByTime(100)
    vi.useRealTimers()

    expect(postMessageMock).toHaveBeenCalled()

    wrapper.unmount()
    expect(terminateMock).toHaveBeenCalled()
  })

  test('does not error when unmounting without an active worker', () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const targetLevel = ref(120)
          usePartyPlanner(targetLevel)
          return {}
        },
        template: '<div />',
      }),
    )

    expect(() => wrapper.unmount()).not.toThrow()
  })
})
