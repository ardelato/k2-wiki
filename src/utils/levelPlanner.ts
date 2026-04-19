import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
import type { Creature, Expedition, Biome } from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  biomeMultiplier,
  xpForLevel,
  PRE_AWAKEN_MAX,
} from '@/utils/formulas'

interface LevelPlannerInput {
  creature: Creature
  startLevel: number
  targetLevel: number
  isAwakened: boolean
  /** Prestige mode: creature is at max level and re-awakening from level 1 */
  isPrestige?: boolean
  swordXpMultiplier?: number
  expeditionTierSelections?: Record<string, number[]>
  /** Force specific expedition+tier for a level range (keyed by fromLevel of merged step) */
  stepOverrides?: Map<number, { expeditionId: string; tier: number; toLevel: number }>
}

export interface AlternativeRoute {
  expedition: Expedition
  tier: number
  biomeName: string
  traitMatch: boolean
  biomeStatus: 'advantage' | 'disadvantage' | 'neutral'
  /** XP/min at loop count 0 for the level range of this merged step */
  xpPerMinute: number
  /** Total runs across the level range */
  runs: number
  /** Total time in seconds across the level range */
  timeSeconds: number
  /** Relative time difference vs the chosen step (positive = slower) */
  timeDeltaPercent: number
  /** Relative XP/min difference vs the chosen step (negative = worse) */
  xpPerMinuteDeltaPercent: number
}

export interface PlanStep {
  expedition: Expedition
  tier: number
  fromLevel: number
  toLevel: number
  runs: number
  timeSeconds: number
  xpPerRun: number
  durationPerRun: number
  xpPerMinute: number
  startXpPerMinute: number
  endXpPerMinute: number
  biomeName: string
  traitMatch: boolean
  biomeStatus: 'advantage' | 'disadvantage' | 'neutral'
  partyTip?: string
  isAwakeningStep?: boolean
  alternatives?: AlternativeRoute[]
}

export interface LevelingPlan {
  steps: PlanStep[]
  totalTimeSeconds: number
  totalRuns: number
  xpPerMinute: number
}

/** Minimum improvement required to justify switching expedition+tier (accounts for loop bonus loss) */
const SWITCH_THRESHOLD = 0.15

/** Maximum number of alternative routes to surface per step */
const MAX_ALTERNATIVES = 5

function getBiomeStatus(
  creature: Creature,
  biome: Biome,
): 'advantage' | 'disadvantage' | 'neutral' {
  const mult = biomeMultiplier(creature, biome)
  if (mult > 1) return 'advantage'
  if (mult < 1) return 'disadvantage'
  return 'neutral'
}

interface ExpeditionWithBiome {
  expedition: Expedition
  biome: Biome | undefined
}

interface ComboKey {
  expeditionId: string
  tier: number
}

function comboId(key: ComboKey): string {
  return `${key.expeditionId}:${key.tier}`
}

interface EvalResult {
  expedition: Expedition
  biome: Biome | undefined
  tier: number
  xpPerRun: number
  duration: number
  xpPerMinute: number
  runsForLevel: number
  timeForLevel: number
}

type EvaluateComboFn = (
  expedition: Expedition,
  biome: Biome | undefined,
  tier: number,
  level: number,
  loopCount: number,
) => EvalResult | null

function makeAwakeningStep(fromLevel: number): PlanStep {
  return {
    expedition: {} as Expedition,
    tier: 0,
    fromLevel,
    toLevel: 1,
    runs: 0,
    timeSeconds: 0,
    xpPerRun: 0,
    durationPerRun: 0,
    xpPerMinute: 0,
    startXpPerMinute: 0,
    endXpPerMinute: 0,
    biomeName: '',
    traitMatch: false,
    biomeStatus: 'neutral',
    isAwakeningStep: true,
  }
}

/**
 * Build an optimal leveling plan. At each level:
 * 1. Evaluate continuing the current expedition+tier (with accumulated loop bonus)
 * 2. Evaluate all other options (at loop count 0, since switching resets it)
 * 3. Only switch if the new option is >15% faster (to account for loop bonus loss)
 */
export function planLevelingPath(settings: LevelPlannerInput): LevelingPlan {
  const expeditions = expeditionsData as Expedition[]
  const biomes = biomesData as Biome[]
  const biomeMap = new Map(biomes.map((b) => [b.id, b]))

  const { creature, startLevel, targetLevel, isAwakened, expeditionTierSelections } = settings
  const swordXpMultiplier = settings.swordXpMultiplier ?? 1
  const tierSelections = expeditionTierSelections ?? {}
  const hasTierRestrictions = Object.keys(tierSelections).length > 0
  const allTiers = [1, 2, 3, 4, 5]
  const stepOverrides = settings.stepOverrides

  const candidates: ExpeditionWithBiome[] = expeditions
    .filter((exp) => !hasTierRestrictions || (tierSelections[exp.id] ?? allTiers).length > 0)
    .map((exp) => ({
      expedition: exp,
      biome: biomeMap.get(exp.biome),
    }))

  /**
   * Evaluate a single expedition+tier for a creature at a specific level.
   * Reads swordXpMultiplier from the enclosing planLevelingPath scope.
   */
  function evaluateCombo(
    expedition: Expedition,
    biome: Biome | undefined,
    tier: number,
    level: number,
    loopCount: number,
  ): EvalResult | null {
    const rating = calculateCreatureRating(creature, expedition, level, biome)
    const duration = calculateDuration(rating, expedition, tier)
    const xpPerRun = Math.floor(
      calculateExpeditionXp(expedition, tier, loopCount, 1) * swordXpMultiplier,
    )

    if (xpPerRun <= 0 || duration <= 0) return null

    const xpPerMinute = (xpPerRun / duration) * 60
    const xpNeeded = xpForLevel(level + 1) - xpForLevel(level)
    const runsForLevel = Math.ceil(xpNeeded / xpPerRun)
    const timeForLevel = runsForLevel * duration

    return { expedition, biome, tier, xpPerRun, duration, xpPerMinute, runsForLevel, timeForLevel }
  }

  /**
   * Plan optimal steps for a contiguous level range.
   * Mutates rawSteps in place and returns the final combo/loop state.
   * Also populates levelAlternatives with per-level alternative EvalResults.
   */
  function planLevelRange(
    from: number,
    to: number,
    rawSteps: PlanStep[],
    initialCombo: ComboKey | null,
    initialLoopCount: number,
    levelAlternatives: Map<number, EvalResult[]>,
  ): { currentCombo: ComboKey | null; loopCount: number } {
    let currentCombo = initialCombo
    let loopCount = initialLoopCount
    let activeOverride: { expeditionId: string; tier: number; toLevel: number } | null = null

    for (let level = from; level < to; level++) {
      // Check for new user override at this level, or deactivate expired one
      const newOverride = stepOverrides?.get(level)
      if (newOverride) {
        activeOverride = newOverride
      } else if (activeOverride && level >= activeOverride.toLevel) {
        activeOverride = null
      }

      // Evaluate current combo with accumulated loop bonus
      let currentResult: EvalResult | null = null
      if (currentCombo) {
        const cand = candidates.find((c) => c.expedition.id === currentCombo!.expeditionId)
        if (cand) {
          currentResult = evaluateCombo(
            cand.expedition,
            cand.biome,
            currentCombo.tier,
            level,
            loopCount,
          )
        }
      }

      // Collect all fresh results for alternatives tracking
      const allFreshResults: EvalResult[] = []

      // Find the absolute best option (all combos at loop count 0)
      let bestFresh: EvalResult | null = null
      for (const { expedition, biome } of candidates) {
        const tiers = tierSelections[expedition.id] ?? allTiers
        for (const tier of tiers) {
          const result = evaluateCombo(expedition, biome, tier, level, 0)
          if (!result) continue

          allFreshResults.push(result)

          if (
            !bestFresh ||
            result.timeForLevel < bestFresh.timeForLevel ||
            (result.timeForLevel === bestFresh.timeForLevel &&
              result.xpPerMinute > bestFresh.xpPerMinute)
          ) {
            bestFresh = result
          }
        }
      }

      // Also evaluate the best fresh option WITH loop bonus if it happens to be our current combo
      if (
        bestFresh &&
        currentCombo &&
        bestFresh.expedition.id === currentCombo.expeditionId &&
        bestFresh.tier === currentCombo.tier
      ) {
        // Best fresh is same as current — just use current (which has loop bonus)
        bestFresh = currentResult
      }

      // Decide: stick with current or switch?
      let chosen: EvalResult | null

      if (activeOverride) {
        // User override active: use the overridden combo with accumulated loop bonus
        if (
          currentCombo &&
          currentCombo.expeditionId === activeOverride.expeditionId &&
          currentCombo.tier === activeOverride.tier
        ) {
          // Already running the override combo — keep it with loop bonus
          chosen = currentResult
        } else {
          // First level of override — start fresh at loop count 0
          const cand = candidates.find((c) => c.expedition.id === activeOverride!.expeditionId)
          chosen = cand
            ? evaluateCombo(cand.expedition, cand.biome, activeOverride!.tier, level, 0)
            : (bestFresh ?? currentResult)
        }
      } else if (!currentResult) {
        // No current combo — pick the best fresh option
        chosen = bestFresh
      } else if (!bestFresh) {
        chosen = currentResult
      } else if (
        bestFresh.expedition.id === currentResult.expedition.id &&
        bestFresh.tier === currentResult.tier
      ) {
        // Best is same as current — keep going
        chosen = currentResult
      } else {
        // Different combo is best fresh — only switch if significantly faster
        // or same speed but meaningfully better XP/min
        const improvement = 1 - bestFresh.timeForLevel / currentResult.timeForLevel
        const xpImprovement = bestFresh.xpPerMinute / currentResult.xpPerMinute - 1
        chosen =
          improvement > SWITCH_THRESHOLD || (improvement >= 0 && xpImprovement > SWITCH_THRESHOLD)
            ? bestFresh
            : currentResult
      }

      if (!chosen) break

      // Store alternatives for this level (excluding chosen expedition, best tier per expedition)
      const sortedFresh = allFreshResults
        .filter((r) => r.expedition.id !== chosen.expedition.id)
        .toSorted((a, b) => a.timeForLevel - b.timeForLevel || b.xpPerMinute - a.xpPerMinute)
      // Keep only the best tier per expedition
      const seenExpeditions = new Set<string>()
      const alternatives: EvalResult[] = []
      for (const r of sortedFresh) {
        if (seenExpeditions.has(r.expedition.id)) continue
        seenExpeditions.add(r.expedition.id)
        alternatives.push(r)
        if (alternatives.length >= MAX_ALTERNATIVES) break
      }
      if (alternatives.length > 0) {
        levelAlternatives.set(level, alternatives)
      }

      // Track combo switches
      const chosenCombo: ComboKey = { expeditionId: chosen.expedition.id, tier: chosen.tier }
      if (!currentCombo || comboId(chosenCombo) !== comboId(currentCombo)) {
        currentCombo = chosenCombo
        loopCount = 0
      }

      const biomeStatus = chosen.biome
        ? getBiomeStatus(creature, chosen.biome)
        : ('neutral' as const)

      rawSteps.push({
        expedition: chosen.expedition,
        tier: chosen.tier,
        fromLevel: level,
        toLevel: level + 1,
        runs: chosen.runsForLevel,
        timeSeconds: chosen.timeForLevel,
        xpPerRun: chosen.xpPerRun,
        durationPerRun: chosen.duration,
        xpPerMinute: chosen.xpPerMinute,
        startXpPerMinute: chosen.xpPerMinute,
        endXpPerMinute: chosen.xpPerMinute,
        biomeName: chosen.biome?.name ?? chosen.expedition.biome,
        traitMatch: creature.trait === chosen.expedition.trait,
        biomeStatus,
      })

      loopCount += chosen.runsForLevel
    }

    return { currentCombo, loopCount }
  }

  const rawSteps: PlanStep[] = []
  const levelAlternatives = new Map<number, EvalResult[]>()

  // Prestige: creature is at max level, re-awakening from level 1
  if (settings.isPrestige) {
    rawSteps.push(makeAwakeningStep(120))
  }

  // Effective cap: unawakened creatures must awaken at 70 before continuing
  const effectiveTarget = !isAwakened ? Math.min(targetLevel, PRE_AWAKEN_MAX) : targetLevel

  planLevelRange(startLevel, effectiveTarget, rawSteps, null, 0, levelAlternatives)

  // Insert awakening step and plan remaining levels if needed
  if (!isAwakened && targetLevel > PRE_AWAKEN_MAX && startLevel <= PRE_AWAKEN_MAX) {
    rawSteps.push(makeAwakeningStep(PRE_AWAKEN_MAX))

    // Plan from 1 → target after awakening (level resets to 1 on awaken)
    planLevelRange(1, targetLevel, rawSteps, null, 0, levelAlternatives)
  }

  // Merge consecutive steps using the same expedition+tier, aggregating alternatives
  const steps = mergeStepsWithAlternatives(rawSteps, levelAlternatives, evaluateCombo, creature)

  // Add party tips to merged steps
  for (const step of steps) {
    if (step.expedition.maxPartySize <= 1) continue

    const biome = biomeMap.get(step.expedition.biome)
    let partyTime = 0
    for (let level = step.fromLevel; level < step.toLevel; level++) {
      const rating = calculateCreatureRating(creature, step.expedition, level, biome)
      const partyScore = rating * 3
      const duration = calculateDuration(partyScore, step.expedition, step.tier)
      const xpPerRun = Math.floor(
        calculateExpeditionXp(step.expedition, step.tier, 0, 3) * swordXpMultiplier,
      )
      if (xpPerRun <= 0) continue
      const xpNeeded = xpForLevel(level + 1) - xpForLevel(level)
      partyTime += Math.ceil(xpNeeded / xpPerRun) * duration
    }

    if (partyTime > 0 && step.timeSeconds > 0) {
      const improvement = 1 - partyTime / step.timeSeconds
      if (improvement > 0.1) {
        step.partyTip = `${Math.round(improvement * 100)}% faster with full party`
      }
    }
  }

  const totalTime = steps.reduce((sum, s) => sum + s.timeSeconds, 0)
  const totalRuns = steps.reduce((sum, s) => sum + s.runs, 0)
  const xpPerMinute =
    totalTime > 0 ? steps.reduce((sum, s) => sum + s.xpPerMinute * s.timeSeconds, 0) / totalTime : 0

  return { steps, totalTimeSeconds: totalTime, totalRuns, xpPerMinute }
}

/**
 * Merge consecutive raw steps using the same expedition+tier,
 * and aggregate per-level alternatives into step-level alternatives.
 */
function mergeStepsWithAlternatives(
  steps: PlanStep[],
  levelAlternatives: Map<number, EvalResult[]>,
  evaluateCombo: EvaluateComboFn,
  creature: Creature,
): PlanStep[] {
  if (steps.length === 0) return []

  const merged: PlanStep[] = []
  let current = { ...steps[0] }
  let currentXpEarned = current.runs * current.xpPerRun
  let currentLevelRange = [current.fromLevel]

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]
    // Never merge awakening steps with adjacent steps
    if (step.isAwakeningStep || current.isAwakeningStep) {
      attachAlternatives(current, currentLevelRange, levelAlternatives, evaluateCombo, creature)
      merged.push(current)
      current = { ...step }
      currentXpEarned = current.runs * current.xpPerRun
      currentLevelRange = [current.fromLevel]
    } else if (step.expedition.id === current.expedition.id && step.tier === current.tier) {
      current.toLevel = step.toLevel
      current.runs += step.runs
      current.timeSeconds += step.timeSeconds
      currentXpEarned += step.runs * step.xpPerRun
      current.xpPerMinute =
        current.timeSeconds > 0 ? (currentXpEarned / current.timeSeconds) * 60 : 0
      current.endXpPerMinute = step.xpPerMinute
      currentLevelRange.push(step.fromLevel)
    } else {
      attachAlternatives(current, currentLevelRange, levelAlternatives, evaluateCombo, creature)
      merged.push(current)
      current = { ...step }
      currentXpEarned = current.runs * current.xpPerRun
      currentLevelRange = [current.fromLevel]
    }
  }
  attachAlternatives(current, currentLevelRange, levelAlternatives, evaluateCombo, creature)
  merged.push(current)
  return merged
}

/**
 * Aggregate per-level alternatives into a merged step's alternatives.
 * Re-evaluates each unique alternative combo across the full level range.
 */
function attachAlternatives(
  step: PlanStep,
  levelRange: number[],
  levelAlternatives: Map<number, EvalResult[]>,
  evaluateCombo: EvaluateComboFn,
  creature: Creature,
): void {
  if (step.isAwakeningStep) return

  // Collect unique alternative expeditions (best tier per expedition) across the range
  const altCombos = new Map<
    string,
    { expedition: Expedition; biome: Biome | undefined; tier: number }
  >()
  for (const level of levelRange) {
    const alts = levelAlternatives.get(level)
    if (!alts) continue
    for (const alt of alts) {
      // Key by expedition ID — first seen is the best tier (alternatives are pre-sorted)
      if (!altCombos.has(alt.expedition.id)) {
        altCombos.set(alt.expedition.id, {
          expedition: alt.expedition,
          biome: alt.biome,
          tier: alt.tier,
        })
      }
    }
  }

  if (altCombos.size === 0) return

  // Re-evaluate each alternative across the full level range, simulating loop bonus
  const alternatives: AlternativeRoute[] = []
  for (const [, combo] of altCombos) {
    let totalTime = 0
    let totalRuns = 0
    let totalXpEarned = 0
    let loopCount = 0
    let valid = true

    for (let level = step.fromLevel; level < step.toLevel; level++) {
      const result = evaluateCombo(combo.expedition, combo.biome, combo.tier, level, loopCount)
      if (!result) {
        valid = false
        break
      }
      totalTime += result.timeForLevel
      totalRuns += result.runsForLevel
      totalXpEarned += result.xpPerRun * result.runsForLevel
      loopCount += result.runsForLevel
    }

    if (!valid || totalTime <= 0) continue

    const xpPerMinute = (totalXpEarned / totalTime) * 60
    const timeDeltaPercent = step.timeSeconds > 0 ? totalTime / step.timeSeconds - 1 : 0
    const xpPerMinuteDeltaPercent = step.xpPerMinute > 0 ? xpPerMinute / step.xpPerMinute - 1 : 0

    const biomeStatus = combo.biome ? getBiomeStatus(creature, combo.biome) : ('neutral' as const)

    alternatives.push({
      expedition: combo.expedition,
      tier: combo.tier,
      biomeName: combo.biome?.name ?? combo.expedition.biome,
      traitMatch: creature.trait === combo.expedition.trait,
      biomeStatus,
      xpPerMinute,
      runs: totalRuns,
      timeSeconds: totalTime,
      timeDeltaPercent,
      xpPerMinuteDeltaPercent,
    })
  }

  if (alternatives.length > 0) {
    // Sort by total time (fastest first), keep top N
    step.alternatives = alternatives
      .toSorted((a, b) => a.timeSeconds - b.timeSeconds || b.xpPerMinute - a.xpPerMinute)
      .slice(0, MAX_ALTERNATIVES)
  }
}
