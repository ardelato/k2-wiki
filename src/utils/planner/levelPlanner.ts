import { biomeMap, expeditions } from '@/data/entityMaps'
import type { Creature, Expedition, Biome } from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  biomeMultiplier,
  xpForLevel,
  PRE_AWAKEN_MAX,
} from '@/utils/formulas'

export interface BoosterCandidate {
  creature: Creature
  level: number
}

export interface BoosterInfo {
  creature: Creature
  level: number
  /** Rating this booster contributes to the specific expedition+biome */
  rating: number
}

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
  /** Owned max-level creatures available to boost the target via party expeditions */
  boosterCandidates?: BoosterCandidate[]
  /**
   * How much faster a different expedition must be before the plan switches to it
   * (fraction, e.g. 0.15 = 15%). Higher = stickier = fewer swaps. Defaults to the
   * standard threshold; the hands-free Awaken mode passes a large value.
   */
  swapThreshold?: number
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
  /** Boosters this alternative would bring (sampled at the first level of the range) */
  boosters?: BoosterInfo[]
  /** Effective party size for this alternative (1 = solo) */
  partySize?: number
}

/** Fields common to every plan step, regardless of kind. */
interface PlanStepBase {
  fromLevel: number
  toLevel: number
}

/** A normal expedition run step that levels the creature. */
export interface RunStep extends PlanStepBase {
  kind: 'run'
  expedition: Expedition
  tier: number
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
  alternatives?: AlternativeRoute[]
  /** Recommended booster creatures to bring along (max-level owned) */
  boosters?: BoosterInfo[]
  /** Effective party size when running with boosters (1 = solo) */
  partySize?: number
  /** Seconds saved over the level range vs running solo */
  boosterTimeSavings?: number
}

/** A marker step representing a creature awakening (no expedition is run). */
export interface AwakenStep extends PlanStepBase {
  kind: 'awaken'
}

export type PlanStep = RunStep | AwakenStep

/** Narrowing guard: true when the plan step is a normal expedition run. */
export function isRunStep(step: PlanStep): step is RunStep {
  return step.kind === 'run'
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
  partySize: number
  boosters: BoosterInfo[]
  /** Solo-equivalent timeForLevel for comparison (always present, equals timeForLevel when partySize=1) */
  soloTimeForLevel: number
}

type EvaluateComboFn = (
  expedition: Expedition,
  biome: Biome | undefined,
  tier: number,
  level: number,
  loopCount: number,
) => EvalResult | null

function makeAwakeningStep(fromLevel: number): AwakenStep {
  return {
    kind: 'awaken',
    fromLevel,
    toLevel: 1,
  }
}

/**
 * Build an optimal leveling plan. At each level:
 * 1. Evaluate continuing the current expedition+tier (with accumulated loop bonus)
 * 2. Evaluate all other options (at loop count 0, since switching resets it)
 * 3. Only switch if the new option is >15% faster (to account for loop bonus loss)
 */
export function planLevelingPath(settings: LevelPlannerInput): LevelingPlan {
  const { creature, startLevel, targetLevel, isAwakened, expeditionTierSelections } = settings
  const swordXpMultiplier = settings.swordXpMultiplier ?? 1
  const tierSelections = expeditionTierSelections ?? {}
  const hasTierRestrictions = Object.keys(tierSelections).length > 0
  const allTiers = [1, 2, 3, 4, 5]
  const stepOverrides = settings.stepOverrides
  const boosterCandidates = settings.boosterCandidates ?? []
  const switchThreshold = settings.swapThreshold ?? SWITCH_THRESHOLD

  const candidates: ExpeditionWithBiome[] = expeditions
    .filter((exp) => !hasTierRestrictions || (tierSelections[exp.id] ?? allTiers).length > 0)
    .map((exp) => ({
      expedition: exp,
      biome: biomeMap.get(exp.biome),
    }))

  /**
   * Evaluate a single expedition+tier for a creature at a specific level (solo).
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

    return {
      expedition,
      biome,
      tier,
      xpPerRun,
      duration,
      xpPerMinute,
      runsForLevel,
      timeForLevel,
      partySize: 1,
      boosters: [],
      soloTimeForLevel: timeForLevel,
    }
  }

  /**
   * Find the highest-rated booster candidates for a given expedition+biome.
   * Excludes the target creature by ID. Returns up to maxBoosters sorted by rating desc.
   * Memoizes the full sorted candidate list per expedition (ratings depend only on
   * expedition+biome+candidates), then slices to maxBoosters at the call site — so
   * a later call with a larger maxBoosters is not capped by an earlier smaller slice.
   */
  const boosterMemo = new Map<string, BoosterInfo[]>()
  function findBestBoosters(
    expedition: Expedition,
    biome: Biome | undefined,
    maxBoosters: number,
  ): BoosterInfo[] {
    if (maxBoosters <= 0 || boosterCandidates.length === 0) return []
    let sorted = boosterMemo.get(expedition.id)
    if (!sorted) {
      const infos: BoosterInfo[] = []
      for (const cand of boosterCandidates) {
        if (cand.creature.id === creature.id) continue
        const rating = calculateCreatureRating(cand.creature, expedition, cand.level, biome)
        if (rating <= 0) continue
        infos.push({ creature: cand.creature, level: cand.level, rating })
      }
      infos.sort((a, b) => b.rating - a.rating)
      sorted = infos
      boosterMemo.set(expedition.id, sorted)
    }
    return sorted.slice(0, maxBoosters)
  }

  /**
   * Evaluate solo and all viable booster configurations; return whichever
   * minimizes timeForLevel. Boosters increase party score (shorter duration)
   * but split XP per game-accurate partySize division.
   */
  function evaluateComboWithBoosters(
    expedition: Expedition,
    biome: Biome | undefined,
    tier: number,
    level: number,
    loopCount: number,
  ): EvalResult | null {
    const solo = evaluateCombo(expedition, biome, tier, level, loopCount)
    if (!solo) return null

    const maxPartySize = expedition.maxPartySize ?? 1
    if (maxPartySize <= 1 || boosterCandidates.length === 0) return solo

    const available = findBestBoosters(expedition, biome, maxPartySize - 1)
    if (available.length === 0) return solo

    const targetRating = calculateCreatureRating(creature, expedition, level, biome)
    const xpNeeded = xpForLevel(level + 1) - xpForLevel(level)
    let best: EvalResult = solo

    for (let count = 1; count <= available.length; count++) {
      const partySize = count + 1
      const chosenBoosters = available.slice(0, count)
      const boosterRatingSum = chosenBoosters.reduce((s, b) => s + b.rating, 0)
      const combinedScore = targetRating + boosterRatingSum
      const duration = calculateDuration(combinedScore, expedition, tier)
      const xpPerRun = Math.floor(
        calculateExpeditionXp(expedition, tier, loopCount, partySize) * swordXpMultiplier,
      )
      if (xpPerRun <= 0 || duration <= 0) continue
      const runsForLevel = Math.ceil(xpNeeded / xpPerRun)
      const timeForLevel = runsForLevel * duration
      const xpPerMinute = (xpPerRun / duration) * 60

      if (
        timeForLevel < best.timeForLevel ||
        (timeForLevel === best.timeForLevel && xpPerMinute > best.xpPerMinute)
      ) {
        best = {
          expedition,
          biome,
          tier,
          xpPerRun,
          duration,
          xpPerMinute,
          runsForLevel,
          timeForLevel,
          partySize,
          boosters: chosenBoosters,
          soloTimeForLevel: solo.timeForLevel,
        }
      }
    }

    return best
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
          currentResult = evaluateComboWithBoosters(
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
          const result = evaluateComboWithBoosters(expedition, biome, tier, level, 0)
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
            ? evaluateComboWithBoosters(cand.expedition, cand.biome, activeOverride!.tier, level, 0)
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
          improvement > switchThreshold || (improvement >= 0 && xpImprovement > switchThreshold)
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

      const usingBoosters = chosen.partySize > 1 && chosen.boosters.length > 0
      rawSteps.push({
        kind: 'run',
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
        boosters: usingBoosters ? chosen.boosters : undefined,
        partySize: usingBoosters ? chosen.partySize : undefined,
        boosterTimeSavings: usingBoosters
          ? Math.max(0, chosen.soloTimeForLevel - chosen.timeForLevel)
          : undefined,
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

  // Merge consecutive steps using the same expedition+tier, aggregating alternatives.
  // Use the booster-aware evaluator so each alternative reflects the best partySize at
  // every level — otherwise a chosen route with boosters would always look unfairly fast.
  const steps = mergeStepsWithAlternatives(
    rawSteps,
    levelAlternatives,
    evaluateComboWithBoosters,
    creature,
  )

  // Add party tips to merged steps (skip when concrete boosters were already chosen)
  for (const step of steps) {
    if (step.kind !== 'run') continue
    if (step.expedition.maxPartySize <= 1) continue
    if (step.boosters && step.boosters.length > 0) continue

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

  const runSteps = steps.filter(isRunStep)
  const totalTime = runSteps.reduce((sum, s) => sum + s.timeSeconds, 0)
  const totalRuns = runSteps.reduce((sum, s) => sum + s.runs, 0)
  const xpPerMinute =
    totalTime > 0
      ? runSteps.reduce((sum, s) => sum + s.xpPerMinute * s.timeSeconds, 0) / totalTime
      : 0

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
  let current: PlanStep = { ...steps[0] }
  let currentXpEarned = current.kind === 'run' ? current.runs * current.xpPerRun : 0
  let currentLevelRange = [current.fromLevel]

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]
    // Never merge awakening steps with adjacent steps
    if (step.kind === 'awaken' || current.kind === 'awaken') {
      attachAlternatives(current, currentLevelRange, levelAlternatives, evaluateCombo, creature)
      merged.push(current)
      current = { ...step }
      currentXpEarned = current.kind === 'run' ? current.runs * current.xpPerRun : 0
      currentLevelRange = [current.fromLevel]
    } else if (step.expedition.id === current.expedition.id && step.tier === current.tier) {
      current.toLevel = step.toLevel
      current.runs += step.runs
      current.timeSeconds += step.timeSeconds
      currentXpEarned += step.runs * step.xpPerRun
      current.xpPerMinute =
        current.timeSeconds > 0 ? (currentXpEarned / current.timeSeconds) * 60 : 0
      current.endXpPerMinute = step.xpPerMinute
      // Accumulate booster time savings; preserve first step's booster lineup
      if (step.boosterTimeSavings) {
        current.boosterTimeSavings = (current.boosterTimeSavings ?? 0) + step.boosterTimeSavings
      }
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
  if (step.kind === 'awaken') return

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
    let firstBoosters: BoosterInfo[] = []
    let firstPartySize = 1

    for (let level = step.fromLevel; level < step.toLevel; level++) {
      const result = evaluateCombo(combo.expedition, combo.biome, combo.tier, level, loopCount)
      if (!result) {
        valid = false
        break
      }
      if (level === step.fromLevel) {
        firstBoosters = result.boosters
        firstPartySize = result.partySize
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

    const useBoosters = firstPartySize > 1 && firstBoosters.length > 0

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
      boosters: useBoosters ? firstBoosters : undefined,
      partySize: useBoosters ? firstPartySize : undefined,
    })
  }

  if (alternatives.length > 0) {
    // Sort by total time (fastest first), keep top N
    step.alternatives = alternatives
      .toSorted((a, b) => a.timeSeconds - b.timeSeconds || b.xpPerMinute - a.xpPerMinute)
      .slice(0, MAX_ALTERNATIVES)
  }
}
