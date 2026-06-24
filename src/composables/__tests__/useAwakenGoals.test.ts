import { useAwakenGoals } from '@/composables/useAwakenGoals'

describe('useAwakenGoals', () => {
  beforeEach(() => {
    localStorage.clear()
    // Each test starts from an empty queue regardless of prior state.
    useAwakenGoals().awakenQueue.value = []
  })

  test('isInAwakenQueue is false for an empty queue', () => {
    const { isInAwakenQueue } = useAwakenGoals()
    expect(isInAwakenQueue('zorb')).toBe(false)
  })

  test('isInAwakenQueue reflects the queue and updates reactively', () => {
    const { awakenQueue, isInAwakenQueue } = useAwakenGoals()
    awakenQueue.value = ['zorb', 'florb']
    expect(isInAwakenQueue('zorb')).toBe(true)
    expect(isInAwakenQueue('florb')).toBe(true)
    expect(isInAwakenQueue('gloomtail')).toBe(false)

    awakenQueue.value = ['gloomtail']
    expect(isInAwakenQueue('gloomtail')).toBe(true)
    expect(isInAwakenQueue('zorb')).toBe(false)
  })

  test('reads the persisted awaken-planner-queue key written elsewhere', () => {
    localStorage.setItem('awaken-planner-queue', JSON.stringify(['tidecaller']))
    const { isInAwakenQueue } = useAwakenGoals()
    expect(isInAwakenQueue('tidecaller')).toBe(true)
  })
})
