import { describe, test, expect } from 'vitest'

import {
  computeAcquisitionTimeline,
  type TimelineCreatureInput,
} from '@/utils/planner/acquisitionTimeline'

describe('computeAcquisitionTimeline', () => {
  test('the focused (first) creature has zero background time → everything stays active', () => {
    const seq: TimelineCreatureInput[] = [
      {
        creatureId: 'a',
        activeTimeSeconds: 1000,
        requirements: [{ itemId: 'ore', need: 500, passiveRate: 1 }],
      },
    ]
    const r = computeAcquisitionTimeline(seq).get('a')!.get('ore')!
    expect(r.accrued).toBe(0)
    expect(r.effectiveRemaining).toBe(500)
    expect(r.source).toBe('active')
  })

  test('a queued creature gets passive accrual from earlier active time', () => {
    const seq: TimelineCreatureInput[] = [
      { creatureId: 'a', activeTimeSeconds: 600, requirements: [] }, // 600s background for b
      {
        creatureId: 'b',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'ore', need: 500, passiveRate: 1 }], // 1/s × 600s = 600 ≥ 500
      },
    ]
    const r = computeAcquisitionTimeline(seq).get('b')!.get('ore')!
    expect(r.accrued).toBe(500) // capped at need
    expect(r.effectiveRemaining).toBe(0)
    expect(r.source).toBe('passive')
  })

  test('partial accrual leaves the remainder active (the Solarite-Ore shape)', () => {
    const seq: TimelineCreatureInput[] = [
      { creatureId: 'a', activeTimeSeconds: 6500, requirements: [] },
      {
        creatureId: 'brunk',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'solarite-ore', need: 20000, passiveRate: 1 }],
      },
    ]
    const r = computeAcquisitionTimeline(seq).get('brunk')!.get('solarite-ore')!
    expect(r.accrued).toBe(6500)
    expect(r.effectiveRemaining).toBe(13500)
    expect(r.source).toBe('active') // you still gather the remaining 13,500
  })

  test('FIFO single-pool: a shared item is NOT double-credited across creatures', () => {
    // One pool produces 1/s. Over the run it can make ~1000 units total; two creatures
    // each needing 800 cannot BOTH be covered — the second must stay active.
    const seq: TimelineCreatureInput[] = [
      {
        creatureId: 'a',
        activeTimeSeconds: 1000, // by the time we reach b, pool produced 1000
        requirements: [{ itemId: 'twig', need: 800, passiveRate: 1 }], // a: bg=0 → active, consumes 0
      },
      {
        creatureId: 'b',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'twig', need: 800, passiveRate: 1 }],
      },
      {
        creatureId: 'c',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'twig', need: 800, passiveRate: 1 }],
      },
    ]
    const tl = computeAcquisitionTimeline(seq)
    // a: background 0 → nothing accrued, stays active, consumes nothing
    expect(tl.get('a')!.get('twig')!.source).toBe('active')
    // b: background 1000 → 1000 produced, takes 800, covered
    expect(tl.get('b')!.get('twig')!.accrued).toBe(800)
    expect(tl.get('b')!.get('twig')!.source).toBe('passive')
    // c: background still 1000 (b added 0), produced 1000 − 800 consumed = 200 left → active
    const c = tl.get('c')!.get('twig')!
    expect(c.accrued).toBe(200)
    expect(c.effectiveRemaining).toBe(600)
    expect(c.source).toBe('active')
  })

  test('independent accrual would over-credit — the ledger prevents it', () => {
    // Without the shared ledger, both b and c would each see 1000 produced and both
    // flip passive (over-delivery). The ledger keeps the total handed out ≤ produced.
    const seq: TimelineCreatureInput[] = [
      { creatureId: 'a', activeTimeSeconds: 1000, requirements: [] },
      {
        creatureId: 'b',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'stone', need: 700, passiveRate: 1 }],
      },
      {
        creatureId: 'c',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'stone', need: 700, passiveRate: 1 }],
      },
    ]
    const tl = computeAcquisitionTimeline(seq)
    const flippedPassive = ['b', 'c'].filter(
      (id) => tl.get(id)!.get('stone')!.source === 'passive',
    ).length
    expect(flippedPassive).toBe(1) // only one of the two can truly be covered by 1000 units
  })

  test('items with no passive producer never accrue (rate 0 → always active)', () => {
    const seq: TimelineCreatureInput[] = [
      { creatureId: 'a', activeTimeSeconds: 100000, requirements: [] },
      {
        creatureId: 'b',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'rare-gem', need: 5, passiveRate: 0 }],
      },
    ]
    const r = computeAcquisitionTimeline(seq).get('b')!.get('rare-gem')!
    expect(r.accrued).toBe(0)
    expect(r.source).toBe('active')
    expect(r.coverEtaSeconds).toBeNull()
  })

  test('coverEtaSeconds reports how much more background time covers a still-active item', () => {
    const seq: TimelineCreatureInput[] = [
      { creatureId: 'a', activeTimeSeconds: 100, requirements: [] },
      {
        creatureId: 'b',
        activeTimeSeconds: 0,
        requirements: [{ itemId: 'ore', need: 500, passiveRate: 1 }], // bg=100, produced 100
      },
    ]
    const r = computeAcquisitionTimeline(seq).get('b')!.get('ore')!
    expect(r.accrued).toBe(100)
    expect(r.source).toBe('active')
    // covered at (0 + 500)/1 = 500s absolute; reached at 100s → 400s more.
    expect(r.coverEtaSeconds).toBe(400)
  })
})
