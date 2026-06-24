import { describe, test, expect } from 'vitest'

import { buildCompletionQueue, type QueueInputCreature } from '@/utils/planner/completionQueue'

const req = (itemId: string, need: number, have: number) => ({
  itemId,
  itemName: itemId,
  need,
  have,
  sourceLabel: 'Fishing',
  sourceIcon: null,
})
const cr = (
  id: string,
  requirements: QueueInputCreature['requirements'],
  blocked = false,
): QueueInputCreature => ({
  id,
  name: id,
  image: null,
  blocked,
  requirements,
})

describe('buildCompletionQueue', () => {
  test('shared inventory is consumed, not double-counted (Zorb → Blorp)', () => {
    // One 20K pool of rainbow-fish; both need 20K. Summoning the first must empty it.
    const q = buildCompletionQueue([
      cr('zorb', [req('rainbow-fish', 20000, 20000)]),
      cr('blorp', [req('rainbow-fish', 20000, 20000)]),
    ])
    const zorb = q.find((c) => c.id === 'zorb')!
    const blorp = q.find((c) => c.id === 'blorp')!
    expect(q[0].id).toBe('zorb') // most ready goes first
    expect(zorb.readiness).toBe(100)
    expect(zorb.fulfilled).toBe(1)
    expect(zorb.remaining).toHaveLength(0)
    // Blorp now genuinely needs the full 20K — the pool is empty.
    expect(blorp.readiness).toBe(0)
    expect(blorp.remaining).toEqual([
      expect.objectContaining({ itemId: 'rainbow-fish', need: 20000, have: 0 }),
    ])
  })

  test('partial pool splits across creatures', () => {
    // 30K fish, two creatures need 20K each → first fully covered, second gets the remaining 10K.
    const q = buildCompletionQueue([
      cr('a', [req('rainbow-fish', 20000, 30000)]),
      cr('b', [req('rainbow-fish', 20000, 30000)]),
    ])
    expect(q[0].remaining).toHaveLength(0) // a: 20K of the 30K
    expect(q[1].remaining[0]).toMatchObject({ need: 20000, have: 10000 }) // b: leftover 10K → 10K short
  })

  test('most-ready-first ordering by pool coverage (distinct items)', () => {
    const q = buildCompletionQueue([
      cr('low', [req('ore', 100, 10)]), // 10%
      cr('high', [req('gem', 100, 100)]), // 100%
    ])
    expect(q[0].id).toBe('high')
  })

  test('blocked creatures sink to the bottom regardless of readiness', () => {
    const q = buildCompletionQueue([
      cr('blockedReady', [req('ore', 10, 10)], true),
      cr('openPartial', [req('gem', 10, 1)], false),
    ])
    expect(q[0].id).toBe('openPartial')
    expect(q[1].id).toBe('blockedReady')
  })

  test('independent items are not affected by each other', () => {
    const q = buildCompletionQueue([cr('x', [req('ore', 100, 100), req('gem', 5, 0)])])
    expect(q[0].fulfilled).toBe(1) // ore covered
    expect(q[0].remaining).toEqual([expect.objectContaining({ itemId: 'gem', need: 5, have: 0 })])
    expect(q[0].readiness).toBe(95) // 100/105
  })

  test('empty input → empty queue', () => {
    expect(buildCompletionQueue([])).toEqual([])
  })
})
