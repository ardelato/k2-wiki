import { deriveAwakenRole } from '@/composables/useSummonPlaybook'

// A swap recommendation shaped like recommendSanctuarySwap's output (only the fields
// deriveAwakenRole reads).
function swap(action: 'add' | 'swap' | 'hold' | 'already-in', jobs: string[] = []) {
  return {
    action,
    improvements: jobs.map((job) => ({ job, fromTier: 0, toTier: 1, durFrom: 0, durTo: 5 })),
  }
}

describe('deriveAwakenRole', () => {
  test('no downstream demand → no point job, no deployment, hasDownstream false', () => {
    const role = deriveAwakenRole({}, swap('hold'), false)
    expect(role).toEqual({
      inAwakenPlan: false,
      pointJob: null,
      deploymentJob: null,
      hasDownstream: false,
    })
  })

  test('point job is the heaviest downstream gather', () => {
    const role = deriveAwakenRole({ fishing: 100, mining: 300 }, swap('hold'), false)
    expect(role.pointJob).toBe('mining')
    expect(role.hasDownstream).toBe(true)
    expect(role.deploymentJob).toBeNull() // hold → no seat
  })

  test('zero-second jobs are not downstream demand', () => {
    const role = deriveAwakenRole({ fishing: 0 }, swap('hold'), false)
    expect(role.hasDownstream).toBe(false)
    expect(role.pointJob).toBeNull()
  })

  test('deployment job comes from the swap, picking the job with most downstream demand', () => {
    const role = deriveAwakenRole(
      { fishing: 100, mining: 300 },
      swap('add', ['fishing', 'mining']),
      false,
    )
    expect(role.deploymentJob).toBe('mining')
  })

  test('swap action also yields a deployment job', () => {
    const role = deriveAwakenRole({ chopping: 50 }, swap('swap', ['chopping']), false)
    expect(role.deploymentJob).toBe('chopping')
  })

  test('inAwakenPlan is passed through', () => {
    expect(deriveAwakenRole({}, swap('hold'), true).inAwakenPlan).toBe(true)
  })
})
