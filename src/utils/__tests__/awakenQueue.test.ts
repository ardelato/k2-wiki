import { describe, test, expect } from 'vitest'

import { seedAwakenQueue } from '@/utils/planner/awakenQueue'

const eligible = (...ids: string[]) => new Set(ids)

describe('seedAwakenQueue', () => {
  test('appends an eligible, not-yet-queued creature to an empty queue', () => {
    expect(seedAwakenQueue([], 'pudge', eligible('pudge', 'finn'))).toEqual(['pudge'])
  })

  test('appends to the end of a non-empty queue, preserving order', () => {
    expect(seedAwakenQueue(['finn'], 'pudge', eligible('pudge', 'finn'))).toEqual(['finn', 'pudge'])
  })

  test('does not mutate the input queue', () => {
    const queue = ['finn']
    seedAwakenQueue(queue, 'pudge', eligible('pudge', 'finn'))
    expect(queue).toEqual(['finn'])
  })

  test('is a no-op when the creature is already queued (same reference)', () => {
    const queue = ['pudge', 'finn']
    const next = seedAwakenQueue(queue, 'pudge', eligible('pudge', 'finn'))
    expect(next).toBe(queue)
  })

  test('is a no-op when the creature is not an eligible awaken target (same reference)', () => {
    const queue = ['finn']
    // e.g. already awakened / not owned → not in the eligible set
    const next = seedAwakenQueue(queue, 'pudge', eligible('finn'))
    expect(next).toBe(queue)
  })

  test('is a no-op for an empty id (no creature routed in)', () => {
    const queue = ['finn']
    expect(seedAwakenQueue(queue, '', eligible('pudge', 'finn'))).toBe(queue)
  })

  test('is a no-op for an undefined id', () => {
    const queue = ['finn']
    expect(seedAwakenQueue(queue, undefined, eligible('pudge', 'finn'))).toBe(queue)
  })
})
