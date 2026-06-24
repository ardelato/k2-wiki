// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { derivePrestigeLevelSeries } from '@/utils/planner/prestigeLevelSeries'
import type {
  PrestigeLoopAssignment,
  PrestigeTimelineStep,
} from '@/utils/planner/prestigeLoopPlanner'

// Compact helpers for hand-building a timeline window.
function member(creatureId: string, role: 'climber' | 'booster' | 'anchor', level: number) {
  return { creatureId, role, level }
}
function assign(...members: ReturnType<typeof member>[]): PrestigeLoopAssignment {
  return { expeditionId: 'exp', tier: 1, members }
}
function assignAt(
  expeditionId: string,
  ...members: ReturnType<typeof member>[]
): PrestigeLoopAssignment {
  return { expeditionId, tier: 1, members }
}
function step(
  checkInIndex: number,
  clockHours: number,
  prestigedCreatureIds: string[],
  assignment: PrestigeLoopAssignment[],
): PrestigeTimelineStep {
  return { checkInIndex, clockHours, prestigedCreatureIds, assignment }
}

describe('derivePrestigeLevelSeries', () => {
  test('returns empty for an empty timeline', () => {
    expect(derivePrestigeLevelSeries([], [])).toEqual([])
  })

  test('tags each creature with its dominant expedition', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(
        0,
        0,
        [],
        [
          assignAt('forest', member('c', 'climber', 10)),
          assignAt('cave', member('d', 'climber', 20)),
        ],
      ),
      step(
        1,
        4,
        [],
        [
          assignAt('forest', member('c', 'climber', 30)),
          assignAt('cave', member('d', 'climber', 40)),
        ],
      ),
      // d spends one check-in elsewhere — dominant should still be 'cave' (2 vs 1).
      step(
        2,
        8,
        [],
        [
          assignAt('forest', member('c', 'climber', 50)),
          assignAt('lake', member('d', 'climber', 60)),
        ],
      ),
    ]
    const series = derivePrestigeLevelSeries(timeline, [])
    expect(series.find((s) => s.creatureId === 'c')!.expeditionId).toBe('forest')
    expect(series.find((s) => s.creatureId === 'd')!.expeditionId).toBe('cave')
  })

  test('builds one series per creature with window-relative hours', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(0, 500, [], [assign(member('a', 'anchor', 120), member('c', 'climber', 40))]),
      step(1, 504, [], [assign(member('a', 'anchor', 120), member('c', 'climber', 80))]),
    ]
    const series = derivePrestigeLevelSeries(timeline, ['a'])
    const climber = series.find((s) => s.creatureId === 'c')!
    expect(climber.points.map((p) => p.hours)).toEqual([0, 4])
    expect(climber.points.map((p) => p.level)).toEqual([40, 80])
  })

  test('prestige resets read as level 1 and increment the token count', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(0, 0, [], [assign(member('c', 'climber', 110))]),
      step(1, 4, ['c'], [assign(member('c', 'climber', 1))]),
      step(2, 8, [], [assign(member('c', 'climber', 30))]),
    ]
    const [climber] = derivePrestigeLevelSeries(timeline, [])
    expect(climber.points.map((p) => p.level)).toEqual([110, 1, 30])
    expect(climber.points.map((p) => p.prestiged)).toEqual([false, true, false])
    expect(climber.tokens).toBe(1)
  })

  test('threads per-interval wasted hours from the step onto each point', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(0, 0, [], [assign(member('c', 'climber', 100))]),
      {
        checkInIndex: 1,
        clockHours: 12,
        prestigedCreatureIds: ['c'],
        assignment: [assign(member('c', 'climber', 1))],
        wastedHoursByCreature: { c: 5 },
      },
    ]
    const [climber] = derivePrestigeLevelSeries(timeline, [])
    expect(climber.points.map((p) => p.wastedHours)).toEqual([0, 5])
  })

  test('carries the last known level forward across benched check-ins', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(0, 0, [], [assign(member('c', 'climber', 50))]),
      step(1, 4, [], [assign(member('other', 'climber', 10))]), // c benched
      step(2, 8, [], [assign(member('c', 'climber', 70))]),
    ]
    const climber = derivePrestigeLevelSeries(timeline, []).find((s) => s.creatureId === 'c')!
    expect(climber.points.map((p) => p.level)).toEqual([50, 50, 70])
  })

  test('skips leading check-ins before a creature first appears', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(0, 0, [], [assign(member('a', 'anchor', 120))]),
      step(1, 4, [], [assign(member('a', 'anchor', 120), member('late', 'climber', 12))]),
    ]
    const late = derivePrestigeLevelSeries(timeline, ['a']).find((s) => s.creatureId === 'late')!
    expect(late.points.map((p) => p.checkIn)).toEqual([1])
  })

  test('classifies role by dominant appearance, with anchorIds overriding', () => {
    const timeline: PrestigeTimelineStep[] = [
      // 'x' climbs once then is held as a booster twice -> dominant booster.
      step(0, 0, [], [assign(member('x', 'climber', 90))]),
      step(1, 4, [], [assign(member('x', 'booster', 120))]),
      step(2, 8, [], [assign(member('x', 'booster', 120), member('a', 'booster', 120))]),
    ]
    const series = derivePrestigeLevelSeries(timeline, ['a'])
    expect(series.find((s) => s.creatureId === 'x')!.role).toBe('booster')
    // 'a' reads as booster in-party but is an anchor by id.
    expect(series.find((s) => s.creatureId === 'a')!.role).toBe('anchor')
  })

  test('orders anchors first, then by token count', () => {
    const timeline: PrestigeTimelineStep[] = [
      step(
        0,
        0,
        ['c1'],
        [
          assign(
            member('a', 'anchor', 120),
            member('c1', 'climber', 1),
            member('c2', 'climber', 60),
          ),
        ],
      ),
    ]
    const order = derivePrestigeLevelSeries(timeline, ['a']).map((s) => s.creatureId)
    expect(order[0]).toBe('a') // anchor first
    expect(order.indexOf('c1')).toBeLessThan(order.indexOf('c2')) // c1 earned a token
  })
})
