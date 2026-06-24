import { describe, test, expect } from 'vitest'

import { type PlannerModifiers } from '@/composables/useCraftPlanner'
import creaturesData from '@/data/creatures.json'
import {
  buildSummonGatherAdvisories,
  computeRemainingEtas,
  gatherVolumesByJob,
} from '@/utils/planner/summonGatherAdvisories'

type Cr = { id: string; name: string; jobs?: Record<string, number> }
const CREATURES = creaturesData as Cr[]

// A clean baseline: no Sanctuary tiers, no awaken upgrades, no passive supply.
const baseMods: PlannerModifiers = {
  gardenFlowers: {},
  awakenGatherUpgrades: {},
  awakenSpeedTiers: {},
  toolSpeedBonuses: {},
  jobTiers: {},
  goldPerMinute: 0,
  machineLevels: {},
  machineRecipes: {},
  fabricationAllocations: {},
  expeditionTier: 5,
}

describe('gatherVolumesByJob', () => {
  test('groups a Fishing gather (rainbow-fish) under its job with the right volume', () => {
    const byJob = gatherVolumesByJob([{ id: 'rainbow-fish', amount: 1000 }], baseMods)
    expect(byJob.has('Fishing')).toBe(true)
    const fishing = byJob.get('Fishing')!
    const fish = fishing.find((v) => v.itemId === 'rainbow-fish')
    expect(fish?.need).toBe(1000)
  })

  test('a creature with nothing left to gather yields no jobs', () => {
    expect(gatherVolumesByJob([], baseMods).size).toBe(0)
    expect(gatherVolumesByJob([{ id: 'rainbow-fish', amount: 0 }], baseMods).size).toBe(0)
  })
})

describe('buildSummonGatherAdvisories', () => {
  const allEligible = () => true

  test('ready creature (no remaining) → no advisories', () => {
    const out = buildSummonGatherAdvisories({
      remaining: [],
      mods: baseMods,
      sanctuaryIds: [],
      candidates: CREATURES,
      isEligible: allEligible,
    })
    expect(out).toEqual([])
  })

  test('Fishing gather surfaces a Sanctuary roster swap toward Fishing', () => {
    const out = buildSummonGatherAdvisories({
      remaining: [{ id: 'rainbow-fish', amount: 20_000 }],
      mods: baseMods,
      sanctuaryIds: [], // empty roster → the swap is pure additions
      candidates: CREATURES,
      isEligible: allEligible,
    })
    const sanctuary = out.find((a) => a.lever === 'sanctuary')
    expect(sanctuary).toBeDefined()
    expect(sanctuary!.partyDiff?.target.job).toBe('Fishing')
    expect(sanctuary!.partyDiff!.target.to).toBeGreaterThan(0)
    // The recommended party pulls in the strongest Fishing creatures.
    const swapInIds = sanctuary!.partyDiff!.swapIn.map((p) => p.id)
    expect(swapInIds).toContain('sarge')
    expect(sanctuary!.timeSavedSeconds).toBeGreaterThan(0)
  })

  test('advisories name the parent acquire item, not the deep gather leaf', () => {
    // carrot-cake → flour → leather → hide, and hide is gathered via Exploring. The
    // Exploring advisory should point at "Carrot Cake", never "hide".
    const out = buildSummonGatherAdvisories({
      remaining: [{ id: 'carrot-cake', amount: 1_300 }],
      mods: baseMods,
      sanctuaryIds: [],
      candidates: CREATURES,
      isEligible: allEligible,
    })
    const exploring = out.find((a) => a.job === 'Exploring')
    expect(exploring).toBeDefined()
    const forIds = exploring!.forItems?.map((i) => i.itemId) ?? []
    expect(forIds).toContain('carrot-cake')
    expect(forIds).not.toContain('hide')
  })

  test('advisories rank by time saved (descending)', () => {
    const out = buildSummonGatherAdvisories({
      remaining: [{ id: 'rainbow-fish', amount: 20_000 }],
      mods: baseMods,
      sanctuaryIds: [],
      candidates: CREATURES,
      isEligible: allEligible,
    })
    const saved = out.map((a) => a.timeSavedSeconds)
    expect(saved).toEqual([...saved].sort((a, b) => b - a))
  })

  test("no eligible creatures → no Sanctuary lever (party can't reach a higher tier)", () => {
    const out = buildSummonGatherAdvisories({
      remaining: [{ id: 'rainbow-fish', amount: 20_000 }],
      mods: baseMods,
      sanctuaryIds: [],
      candidates: CREATURES,
      isEligible: () => false,
    })
    expect(out.some((a) => a.lever === 'sanctuary')).toBe(false)
  })
})

describe('computeRemainingEtas', () => {
  test('gives a positive ETA per gatherable item and a creature total', () => {
    const { totalSeconds, byItem } = computeRemainingEtas(
      [{ id: 'rainbow-fish', amount: 20_000 }],
      baseMods,
    )
    expect(byItem.get('rainbow-fish')).toBeGreaterThan(0)
    expect(totalSeconds).toBeGreaterThan(0)
    // Single resource → the creature total equals that item's standalone ETA.
    expect(totalSeconds).toBeCloseTo(byItem.get('rainbow-fish')!, 0)
  })

  test('more units → longer ETA (active gather scales with volume)', () => {
    const small = computeRemainingEtas([{ id: 'rainbow-fish', amount: 1_000 }], baseMods)
    const big = computeRemainingEtas([{ id: 'rainbow-fish', amount: 50_000 }], baseMods)
    expect(big.byItem.get('rainbow-fish')!).toBeGreaterThan(small.byItem.get('rainbow-fish')!)
  })

  test('nothing remaining → zero ETA', () => {
    const { totalSeconds, byItem } = computeRemainingEtas(
      [{ id: 'rainbow-fish', amount: 0 }],
      baseMods,
    )
    expect(totalSeconds).toBe(0)
    expect(byItem.get('rainbow-fish')).toBe(0)
  })
})
