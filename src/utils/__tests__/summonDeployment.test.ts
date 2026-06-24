import { describe, test, expect } from 'vitest'

import creaturesData from '@/data/creatures.json'
import {
  creatureJobScores,
  recommendRoles,
  recommendSanctuarySwap,
} from '@/utils/planner/summonDeployment'

type Cr = { id: string; jobs?: Record<string, number> }
const CREATURES = creaturesData as Cr[]

const lowFisher = CREATURES.find(
  (c) => c.id !== 'zorb' && (creatureJobScores(c.id).Fishing ?? 0) === 0,
)!.id

describe('creatureJobScores', () => {
  test('normalizes lowercase job keys to capitalized Sanctuary jobs', () => {
    const s = creatureJobScores('zorb')
    expect(s.Fishing).toBe(9) // from fixture: jobs.fishing = 9
    expect(s.Farming).toBe(8)
    expect('fishing' in s).toBe(false)
  })
})

describe('recommendSanctuarySwap', () => {
  test('already-in when the creature is seated', () => {
    const r = recommendSanctuarySwap({
      creatureId: 'zorb',
      sanctuaryIds: ['zorb'],
      neededJobs: new Set(['Fishing']),
    })
    expect(r.action).toBe('already-in')
  })

  test('hold when no jobs are still needed', () => {
    const r = recommendSanctuarySwap({
      creatureId: 'zorb',
      sanctuaryIds: [],
      neededJobs: new Set(),
    })
    expect(r.action).toBe('hold')
  })

  test('hold when the creature contributes nothing to needed jobs', () => {
    // zorb has Chopping 0 → seating it for Chopping is pointless.
    const r = recommendSanctuarySwap({
      creatureId: 'zorb',
      sanctuaryIds: [],
      neededJobs: new Set(['Chopping']),
    })
    expect(r.action).toBe('hold')
  })

  test('add (free slot) when it lifts a needed tier', () => {
    const r = recommendSanctuarySwap({
      creatureId: 'zorb',
      sanctuaryIds: [],
      neededJobs: new Set(['Fishing']),
    })
    expect(r.action).toBe('add')
    expect(r.improvements[0]).toMatchObject({ job: 'Fishing', fromTier: 0, toTier: 1 })
  })

  test('swap (full) benches the low contributor and names the tier gain', () => {
    const r = recommendSanctuarySwap({
      creatureId: 'zorb',
      sanctuaryIds: [lowFisher],
      neededJobs: new Set(['Fishing']),
      maxSlots: 1, // force "full"
    })
    expect(r.action).toBe('swap')
    expect(r.benchId).toBe(lowFisher)
    expect(r.benchName).toBeTruthy()
    expect(r.improvements.some((i) => i.job === 'Fishing' && i.toTier > i.fromTier)).toBe(true)
  })

  test('hold (full) when no swap raises a needed tier', () => {
    // Seat zorb already-strong-fishing; adding another low fisher for Fishing won't help.
    const r = recommendSanctuarySwap({
      creatureId: lowFisher,
      sanctuaryIds: ['zorb'],
      neededJobs: new Set(['Fishing']),
      maxSlots: 1,
    })
    expect(r.action).toBe('hold')
  })
})

describe('recommendRoles', () => {
  test('flags a strong gather job as a helper fit and surfaces top stats', () => {
    const r = recommendRoles({ creatureId: 'zorb', hasRemainingPassiveNeed: true })
    expect(r.helper).toMatchObject({ job: 'Fishing', score: 9 })
    expect(r.expedition?.topStats.length).toBeGreaterThan(0)
    expect(r.machine).toEqual({ suggest: true })
  })

  test('no machine suggestion when nothing passive remains', () => {
    const r = recommendRoles({ creatureId: 'zorb', hasRemainingPassiveNeed: false })
    expect(r.machine).toBeNull()
  })
})
