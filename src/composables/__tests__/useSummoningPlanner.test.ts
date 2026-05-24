import { clearSummoningPlannerSelection } from '@/composables/useSummoningPlanner'

describe('clearSummoningPlannerSelection', () => {
  test('removes the summoning-planner-selection localStorage key', () => {
    localStorage.setItem('summoning-planner-selection', JSON.stringify(['moss', 'scoots']))
    clearSummoningPlannerSelection()
    expect(localStorage.getItem('summoning-planner-selection')).toBeNull()
  })

  test('is a no-op when the key is already absent', () => {
    expect(() => clearSummoningPlannerSelection()).not.toThrow()
    expect(localStorage.getItem('summoning-planner-selection')).toBeNull()
  })
})
