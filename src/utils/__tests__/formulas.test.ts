import creaturesData from '@/data/creatures.json'
import type { Biome, Creature, Expedition } from '@/types'
import {
  biomeMultiplier,
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  calculatePartyScore,
  getBestExpeditionsForCreature,
  getBestExpeditionsForLeveling,
  getLoopXpBonus,
  getRecommendedCreatures,
  levelFromXp,
  traitAbbreviations,
  xpForLevel,
} from '@/utils/formulas'

const creatures = creaturesData as Creature[]

const zeroStats = { power: 0, grit: 0, agility: 0, smarts: 0, looting: 0, luck: 0 }
const powerOnlyWeights = { ...zeroStats, power: 1 }

function makeCreature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: 'test-creature',
    name: 'Test',
    mainJob: 'All',
    description: '',
    image: '',
    tier: 0,
    trait: 'neutral',
    types: [],
    stats: { power: 10, grit: 10, agility: 10, smarts: 10, looting: 10, luck: 10 },
    jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
    summoningCost: [],
    ...overrides,
  } as Creature
}

function makeExpedition(overrides: Partial<Expedition> = {}): Expedition {
  return {
    id: 'test-expedition',
    name: 'Test Expedition',
    description: '',
    image: '',
    baseRating: 100,
    baseDuration: 300,
    baseXP: 200,
    maxPartySize: 3,
    trait: 'neutral',
    biome: 'plains',
    requiredExpeditionCompletions: 0,
    statWeights: powerOnlyWeights,
    rewards: [],
    ...overrides,
  } as Expedition
}

function makeBiome(overrides: Partial<Biome> = {}): Biome {
  return {
    id: 'test-biome',
    name: 'Test Biome',
    description: '',
    image: '',
    advantage: [],
    disadvantage: [],
    ...overrides,
  } as Biome
}

describe('biomeMultiplier', () => {
  test('returns 1.5 when creature type has advantage', () => {
    const creature = makeCreature({ types: ['Fire'] })
    const biome = makeBiome({ advantage: ['Fire'] })
    expect(biomeMultiplier(creature, biome)).toBe(1.5)
  })

  test('returns 0.5 when creature type has disadvantage', () => {
    const creature = makeCreature({ types: ['Water'] })
    const biome = makeBiome({ disadvantage: ['Water'] })
    expect(biomeMultiplier(creature, biome)).toBe(0.5)
  })

  test('returns 1.0 when creature type is neutral', () => {
    const creature = makeCreature({ types: ['Wind'] })
    const biome = makeBiome({ advantage: ['Fire'], disadvantage: ['Water'] })
    expect(biomeMultiplier(creature, biome)).toBe(1.0)
  })

  test('advantage wins over disadvantage when creature has both types', () => {
    const creature = makeCreature({ types: ['Fire', 'Water'] })
    const biome = makeBiome({ advantage: ['Fire'], disadvantage: ['Water'] })
    expect(biomeMultiplier(creature, biome)).toBe(1.5)
  })

  test('returns 1.0 for creature with no types', () => {
    const creature = makeCreature({ types: [] })
    const biome = makeBiome({ advantage: ['Fire'], disadvantage: ['Water'] })
    expect(biomeMultiplier(creature, biome)).toBe(1.0)
  })
})

describe('calculateCreatureRating', () => {
  const powerOnlyExpedition = makeExpedition({ statWeights: powerOnlyWeights, trait: 'other' })

  test('weights stats correctly at level 1', () => {
    const creature = makeCreature({
      stats: { ...zeroStats, power: 10, grit: 5, agility: 5, smarts: 5, looting: 5, luck: 5 },
    })
    expect(calculateCreatureRating(creature, powerOnlyExpedition)).toBe(10)
  })

  test('scales linearly with level', () => {
    const creature = makeCreature({ stats: { ...zeroStats, power: 10 } })
    expect(calculateCreatureRating(creature, powerOnlyExpedition, 5)).toBe(50)
  })

  test('applies biome multiplier of 1.5 for advantage', () => {
    const creature = makeCreature({ types: ['Fire'], stats: { ...zeroStats, power: 10 } })
    const biome = makeBiome({ advantage: ['Fire'] })
    expect(calculateCreatureRating(creature, powerOnlyExpedition, 1, biome)).toBe(15)
  })

  test('applies trait bonus of 1.5 when trait matches', () => {
    const creature = makeCreature({ trait: 'learner', stats: { ...zeroStats, power: 10 } })
    const expedition = makeExpedition({ trait: 'learner', statWeights: powerOnlyWeights })
    expect(calculateCreatureRating(creature, expedition, 1)).toBe(15)
  })

  test('combines biome advantage and trait bonus', () => {
    // rawScore=10, biome*1.5=15, trait*1.5=22.5, floor=22
    const creature = makeCreature({
      trait: 'learner',
      types: ['Fire'],
      stats: { ...zeroStats, power: 10 },
    })
    const expedition = makeExpedition({
      trait: 'learner',
      statWeights: powerOnlyWeights,
    })
    const biome = makeBiome({ advantage: ['Fire'] })
    expect(calculateCreatureRating(creature, expedition, 1, biome)).toBe(22)
  })

  test('zero-weight stats are excluded from sum', () => {
    const creature = makeCreature({
      stats: { power: 100, grit: 100, agility: 100, smarts: 100, looting: 100, luck: 100 },
    })
    const expedition = makeExpedition({ statWeights: zeroStats, trait: 'other' })
    expect(calculateCreatureRating(creature, expedition)).toBe(0)
  })

  test('uses default level of 1 when not provided', () => {
    const creature = makeCreature({ stats: { ...zeroStats, power: 20 } })
    expect(calculateCreatureRating(creature, powerOnlyExpedition)).toBe(20)
  })
})

describe('calculateDuration', () => {
  const expedition = makeExpedition({ baseRating: 100 })

  test('clamps to maxSeconds (3600) when partyScore is 0', () => {
    expect(calculateDuration(0, expedition, 1)).toBe(3600)
  })

  test('returns 300 when partyScore meets or exceeds difficultyRating', () => {
    expect(calculateDuration(100, expedition, 1)).toBe(300)
    expect(calculateDuration(200, expedition, 1)).toBe(300)
  })

  test('interpolates linearly between min and max', () => {
    // difficulty=100, partyScore=50, ratio=0.5
    // duration = 3600 - 0.5*(3600-300) = 1950
    expect(calculateDuration(50, expedition, 1)).toBe(1950)
  })

  test('clamps to minSeconds (300) for very high partyScore', () => {
    expect(calculateDuration(9999, expedition, 1)).toBe(300)
  })

  test('works across tiers - tier 2 difficulty is higher so same score yields longer duration', () => {
    const tier1Duration = calculateDuration(100, expedition, 1)
    const tier2Duration = calculateDuration(100, expedition, 2)
    expect(tier1Duration).toBeLessThan(tier2Duration)
  })
})

describe('calculateExpeditionXp', () => {
  const expedition = makeExpedition({ baseXP: 100 })

  test('base case: tier 1, no loops, party size 1', () => {
    expect(calculateExpeditionXp(expedition, 1, 0, 1)).toBe(100)
  })

  test('applies tier xp modifier', () => {
    expect(calculateExpeditionXp(expedition, 3, 0, 1)).toBe(140)
  })

  test('applies loop bonus at loopCount=10', () => {
    expect(calculateExpeditionXp(expedition, 1, 10, 1)).toBe(101)
  })

  test('divides xp by party size', () => {
    expect(calculateExpeditionXp(expedition, 1, 0, 3)).toBe(33)
  })

  test('floors the result', () => {
    // tier 2 xpMod=1.2 -> 120, party size 3 -> floor(120/3)=40
    expect(calculateExpeditionXp(expedition, 2, 0, 3)).toBe(40)
  })

  test('uses defaults: tier=1, loopCount=0, partySize=1', () => {
    expect(calculateExpeditionXp(expedition)).toBe(100)
  })
})

describe('getLoopXpBonus', () => {
  test('returns 0 for loopCount 0-9', () => {
    expect(getLoopXpBonus(0)).toBe(0)
    expect(getLoopXpBonus(9)).toBe(0)
  })

  test('returns 0.01 for loopCount 10-19', () => {
    expect(getLoopXpBonus(10)).toBe(0.01)
    expect(getLoopXpBonus(19)).toBe(0.01)
  })

  test('returns 0.02 for loopCount 20-29', () => {
    expect(getLoopXpBonus(20)).toBe(0.02)
  })

  test('caps at 0.2 for high loopCount values', () => {
    expect(getLoopXpBonus(200)).toBe(0.2)
    expect(getLoopXpBonus(9999)).toBe(0.2)
  })
})

describe('xpForLevel', () => {
  test('returns 0 for level 1', () => {
    expect(xpForLevel(1)).toBe(0)
  })

  test('returns 0 for level <= 1', () => {
    expect(xpForLevel(0)).toBe(0)
    expect(xpForLevel(-5)).toBe(0)
  })

  test('returns 50 * level^2 for level > 1', () => {
    expect(xpForLevel(2)).toBe(50 * 4)
    expect(xpForLevel(5)).toBe(50 * 25)
    expect(xpForLevel(10)).toBe(50 * 100)
  })
})

describe('levelFromXp', () => {
  test('returns 1 for xp <= 0', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(-100)).toBe(1)
  })

  test('returns 1 for xp below level 2 threshold', () => {
    expect(levelFromXp(199)).toBe(1)
  })

  test('returns correct level at exact thresholds', () => {
    expect(levelFromXp(200)).toBe(2)
    expect(levelFromXp(1250)).toBe(5)
    expect(levelFromXp(5000)).toBe(10)
  })

  test('round-trips with xpForLevel for levels 1-120', () => {
    for (let level = 1; level <= 120; level++) {
      const xp = xpForLevel(level)
      expect(levelFromXp(xp)).toBe(level)
    }
  })

  test('mid-level XP returns the correct lower level', () => {
    expect(levelFromXp(1500)).toBe(5)
  })
})

describe('calculatePartyScore', () => {
  const powerOnlyExpedition = makeExpedition({ statWeights: powerOnlyWeights, trait: 'other' })

  test('sums ratings of all creatures in party', () => {
    const c1 = makeCreature({ id: 'a', stats: { ...zeroStats, power: 10 } })
    const c2 = makeCreature({ id: 'b', stats: { ...zeroStats, power: 20 } })
    expect(calculatePartyScore([c1, c2], powerOnlyExpedition, {})).toBe(30)
  })

  test('skips null slots', () => {
    const c1 = makeCreature({ id: 'a', stats: { ...zeroStats, power: 10 } })
    expect(calculatePartyScore([c1, null, null], powerOnlyExpedition, {})).toBe(10)
  })

  test('applies per-creature level from levels map', () => {
    const c1 = makeCreature({ id: 'a', stats: { ...zeroStats, power: 10 } })
    expect(calculatePartyScore([c1], powerOnlyExpedition, { a: 3 })).toBe(30)
  })

  test('defaults to level 1 when creature not in levels map', () => {
    const c1 = makeCreature({ id: 'a', stats: { ...zeroStats, power: 10 } })
    expect(calculatePartyScore([c1], powerOnlyExpedition, {})).toBe(10)
  })

  test('applies biome multiplier to all creatures', () => {
    const c1 = makeCreature({ id: 'a', types: ['Fire'], stats: { ...zeroStats, power: 10 } })
    const biome = makeBiome({ advantage: ['Fire'] })
    expect(calculatePartyScore([c1], powerOnlyExpedition, {}, biome)).toBe(15)
  })

  test('returns 0 for all-null party', () => {
    const expedition = makeExpedition()
    expect(calculatePartyScore([null, null, null], expedition, {})).toBe(0)
  })
})

describe('getBestExpeditionsForCreature', () => {
  const creature = creatures[0]

  test('returns up to the specified limit', () => {
    const results = getBestExpeditionsForCreature(creature, 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  test('returns at most 5 by default', () => {
    const results = getBestExpeditionsForCreature(creature)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  test('results are sorted by score descending', () => {
    const results = getBestExpeditionsForCreature(creature, 10)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  test('each entry has the expected shape', () => {
    const results = getBestExpeditionsForCreature(creature, 1)
    expect(results.length).toBeGreaterThan(0)
    const entry = results[0]
    expect(entry).toHaveProperty('expedition')
    expect(entry).toHaveProperty('score')
    expect(entry).toHaveProperty('biomeName')
    expect(entry).toHaveProperty('traitMatch')
    expect(entry).toHaveProperty('biomeStatus')
    expect(entry).toHaveProperty('statAlignment')
  })

  test('scores are non-negative', () => {
    const results = getBestExpeditionsForCreature(creature, 5)
    for (const entry of results) {
      expect(entry.score).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('getBestExpeditionsForLeveling', () => {
  const creature = creatures[0]

  test('returns up to the specified limit', () => {
    const results = getBestExpeditionsForLeveling(creature, 1, 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  test('returns at most 5 by default', () => {
    const results = getBestExpeditionsForLeveling(creature, 1)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  test('results are sorted by score descending', () => {
    const results = getBestExpeditionsForLeveling(creature, 10, 10)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  test('each entry has the expected shape', () => {
    const results = getBestExpeditionsForLeveling(creature, 1, 1)
    expect(results.length).toBeGreaterThan(0)
    const entry = results[0]
    expect(entry).toHaveProperty('expedition')
    expect(entry).toHaveProperty('score')
    expect(entry).toHaveProperty('biomeName')
    expect(entry).toHaveProperty('traitMatch')
    expect(entry).toHaveProperty('biomeStatus')
    expect(entry).toHaveProperty('statAlignment')
  })

  test('higher level creatures produce valid results', () => {
    const results = getBestExpeditionsForLeveling(creature, 50, 5)
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('getRecommendedCreatures', () => {
  const expedition = makeExpedition({
    statWeights: powerOnlyWeights,
    trait: 'other',
  })

  test('returns an entry for each creature', () => {
    const subset = creatures.slice(0, 3)
    const results = getRecommendedCreatures(subset, expedition)
    expect(results.length).toBe(3)
  })

  test('results are sorted by rating descending', () => {
    const results = getRecommendedCreatures(creatures, expedition)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rating).toBeGreaterThanOrEqual(results[i].rating)
    }
  })

  test('each entry has creature, rating, and level', () => {
    const results = getRecommendedCreatures(creatures.slice(0, 1), expedition)
    expect(results[0]).toHaveProperty('creature')
    expect(results[0]).toHaveProperty('rating')
    expect(results[0]).toHaveProperty('level')
  })

  test('uses provided levels map', () => {
    const c = creatures[0]
    const results = getRecommendedCreatures([c], expedition, { [c.id]: 10 })
    expect(results[0].level).toBe(10)
  })

  test('defaults to level 1 when not in levels map', () => {
    const c = creatures[0]
    const results = getRecommendedCreatures([c], expedition, {})
    expect(results[0].level).toBe(1)
  })

  test('applies biome multiplier to ratings', () => {
    const fireCreature = creatures.find((c) => c.types.includes('Fire'))
    if (!fireCreature) return

    const biome = makeBiome({ advantage: ['Fire'] })
    const withBiome = getRecommendedCreatures([fireCreature], expedition, {}, biome)
    const withoutBiome = getRecommendedCreatures([fireCreature], expedition, {})
    expect(withBiome[0].rating).toBeGreaterThan(withoutBiome[0].rating)
  })

  test('returns empty array for empty creature list', () => {
    const results = getRecommendedCreatures([], expedition)
    expect(results).toEqual([])
  })
})

// ── Formula relationship tests ───────────────────────────────────────
// These verify that inputs affect outputs in the expected direction,
// catching regressions where a formula change silently breaks the math.

describe('XP rate relationships', () => {
  const expedition = makeExpedition({ baseXP: 200, baseRating: 100 })

  test('higher loop count produces higher XP per creature', () => {
    const xpNoLoops = calculateExpeditionXp(expedition, 1, 0, 1)
    const xpWith10Loops = calculateExpeditionXp(expedition, 1, 10, 1)
    const xpWith100Loops = calculateExpeditionXp(expedition, 1, 100, 1)

    expect(xpWith10Loops).toBeGreaterThan(xpNoLoops)
    expect(xpWith100Loops).toBeGreaterThan(xpWith10Loops)
  })

  test('more party members reduces XP per creature', () => {
    const xpSolo = calculateExpeditionXp(expedition, 1, 0, 1)
    const xpDuo = calculateExpeditionXp(expedition, 1, 0, 2)
    const xpTrio = calculateExpeditionXp(expedition, 1, 0, 3)

    expect(xpDuo).toBeLessThan(xpSolo)
    expect(xpTrio).toBeLessThan(xpDuo)
  })

  test('higher tier gives more XP per creature', () => {
    const xpTier1 = calculateExpeditionXp(expedition, 1, 0, 1)
    const xpTier3 = calculateExpeditionXp(expedition, 3, 0, 1)
    const xpTier5 = calculateExpeditionXp(expedition, 5, 0, 1)

    expect(xpTier3).toBeGreaterThan(xpTier1)
    expect(xpTier5).toBeGreaterThan(xpTier3)
  })
})

describe('duration and score relationships', () => {
  const expedition = makeExpedition({ baseRating: 100, baseDuration: 300 })

  test('higher party score produces shorter duration', () => {
    const durationLowScore = calculateDuration(30, expedition, 1)
    const durationMidScore = calculateDuration(60, expedition, 1)
    const durationHighScore = calculateDuration(100, expedition, 1)

    expect(durationMidScore).toBeLessThan(durationLowScore)
    expect(durationHighScore).toBeLessThan(durationMidScore)
  })

  test('higher tier increases duration for same party score', () => {
    const durationTier1 = calculateDuration(50, expedition, 1)
    const durationTier3 = calculateDuration(50, expedition, 3)
    const durationTier5 = calculateDuration(50, expedition, 5)

    expect(durationTier3).toBeGreaterThan(durationTier1)
    expect(durationTier5).toBeGreaterThan(durationTier3)
  })
})

describe('tier trade-off: XP vs duration', () => {
  const expedition = makeExpedition({ baseRating: 100, baseXP: 200 })

  test('party at tier threshold gets worse XP rate when pushed to higher tier', () => {
    // Party that can handle tier 1 but not tier 3
    const creature = makeCreature({ id: 'mid', stats: { ...zeroStats, power: 10 } })

    // At level 10, party score = 100 (meets tier 1 difficulty 100, min duration)
    // At tier 3, difficulty = 200, party is underpowered → longer duration
    const partyScore = calculateCreatureRating(creature, expedition, 10)

    const xpTier1 = calculateExpeditionXp(expedition, 1, 0, 1)
    const durationTier1 = calculateDuration(partyScore, expedition, 1)
    const rateTier1 = xpTier1 / durationTier1

    const xpTier3 = calculateExpeditionXp(expedition, 3, 0, 1)
    const durationTier3 = calculateDuration(partyScore, expedition, 3)
    const rateTier3 = xpTier3 / durationTier3

    // Tier 1: party meets difficulty → min duration (300s), decent XP rate
    // Tier 3: difficulty doubles (200) but party score unchanged → much longer duration
    // The 40% XP increase doesn't compensate for the duration increase
    expect(durationTier3).toBeGreaterThan(durationTier1)
    expect(rateTier1).toBeGreaterThan(rateTier3)
  })

  test('strong party maintains good XP rate at higher tiers', () => {
    // A strong party that exceeds tier 1 difficulty
    const strongCreature = makeCreature({ id: 'strong', stats: { ...zeroStats, power: 50 } })
    const partyScore = calculatePartyScore([strongCreature], expedition, { strong: 20 })

    // At tier 1 the party massively over-caps, so duration is at minimum
    // Higher tiers give more XP while duration stays near minimum
    const xpRate1 =
      calculateExpeditionXp(expedition, 1, 0, 1) / calculateDuration(partyScore, expedition, 1)
    const xpRate3 =
      calculateExpeditionXp(expedition, 3, 0, 1) / calculateDuration(partyScore, expedition, 3)

    expect(xpRate3).toBeGreaterThan(xpRate1)
  })
})

describe('creature fit affects expedition performance', () => {
  const powerExpedition = makeExpedition({
    baseRating: 100,
    baseXP: 200,
    statWeights: { ...zeroStats, power: 1 },
    trait: 'learner',
  })
  const advantageBiome = makeBiome({ advantage: ['Fire'], disadvantage: ['Water'] })

  test('good-fit creature (matching stats + biome + trait) scores higher than bad-fit', () => {
    const goodFit = makeCreature({
      stats: { ...zeroStats, power: 20 },
      types: ['Fire'],
      trait: 'learner',
    })
    const badFit = makeCreature({
      stats: { ...zeroStats, agility: 20 },
      types: ['Water'],
      trait: 'other',
    })

    const goodScore = calculateCreatureRating(goodFit, powerExpedition, 10, advantageBiome)
    const badScore = calculateCreatureRating(badFit, powerExpedition, 10, advantageBiome)

    expect(goodScore).toBeGreaterThan(badScore)
  })

  test('good-fit party produces shorter duration than bad-fit party', () => {
    const goodFit = makeCreature({
      id: 'good',
      stats: { ...zeroStats, power: 20 },
      types: ['Fire'],
      trait: 'learner',
    })
    const badFit = makeCreature({
      id: 'bad',
      stats: { ...zeroStats, agility: 20 },
      types: ['Water'],
      trait: 'other',
    })

    const goodPartyScore = calculatePartyScore(
      [goodFit],
      powerExpedition,
      { good: 10 },
      advantageBiome,
    )
    const badPartyScore = calculatePartyScore(
      [badFit],
      powerExpedition,
      { bad: 10 },
      advantageBiome,
    )

    const goodDuration = calculateDuration(goodPartyScore, powerExpedition, 1)
    const badDuration = calculateDuration(badPartyScore, powerExpedition, 1)

    expect(goodDuration).toBeLessThan(badDuration)
  })

  test('good-fit party achieves higher XP rate than bad-fit party', () => {
    const goodFit = makeCreature({
      id: 'good',
      stats: { ...zeroStats, power: 20 },
      types: ['Fire'],
      trait: 'learner',
    })
    const badFit = makeCreature({
      id: 'bad',
      stats: { ...zeroStats, agility: 20 },
      types: ['Water'],
      trait: 'other',
    })

    const goodScore = calculatePartyScore([goodFit], powerExpedition, { good: 10 }, advantageBiome)
    const badScore = calculatePartyScore([badFit], powerExpedition, { bad: 10 }, advantageBiome)

    const goodDuration = calculateDuration(goodScore, powerExpedition, 1)
    const badDuration = calculateDuration(badScore, powerExpedition, 1)

    const xpPerCreature = calculateExpeditionXp(powerExpedition, 1, 0, 1)

    const goodXpRate = xpPerCreature / goodDuration
    const badXpRate = xpPerCreature / badDuration

    expect(goodXpRate).toBeGreaterThan(badXpRate)
  })
})

// ── Trait abbreviations ─────────────────────────────────────────────

describe('traitAbbreviations', () => {
  test('covers every trait in creatures data', () => {
    const allTraits = new Set(creatures.map((c) => c.trait))
    for (const trait of allTraits) {
      expect(traitAbbreviations).toHaveProperty(trait)
    }
  })

  test('all abbreviations are shorter than or equal to their full trait name', () => {
    for (const [trait, abbrev] of Object.entries(traitAbbreviations)) {
      expect(abbrev.length).toBeLessThanOrEqual(trait.length)
    }
  })

  test('no duplicate abbreviations', () => {
    const values = Object.values(traitAbbreviations)
    expect(new Set(values).size).toBe(values.length)
  })
})
