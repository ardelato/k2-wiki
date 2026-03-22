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

export interface LevelPlannerInput {
  creature: Creature
  startLevel: number
  targetLevel: number
  isAwakened: boolean
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
}

export interface LevelingPlan {
  steps: PlanStep[]
  totalTimeSeconds: number
  totalRuns: number
  xpPerMinute: number
}

/** Minimum improvement required to justify switching expedition+tier (accounts for loop bonus loss) */
const SWITCH_THRESHOLD = 0.15

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

/**
 * Evaluate a single expedition+tier for a creature at a specific level.
 */
function evaluateCombo(
  creature: Creature,
  expedition: Expedition,
  biome: Biome | undefined,
  tier: number,
  level: number,
  loopCount: number,
): EvalResult | null {
  const rating = calculateCreatureRating(creature, expedition, level, biome)
  const duration = calculateDuration(rating, expedition, tier)
  const xpPerRun = calculateExpeditionXp(expedition, tier, loopCount, 1)

  if (xpPerRun <= 0 || duration <= 0) return null

  const xpPerMinute = (xpPerRun / duration) * 60
  const xpNeeded = xpForLevel(level + 1) - xpForLevel(level)
  const runsForLevel = Math.ceil(xpNeeded / xpPerRun)
  const timeForLevel = runsForLevel * duration

  return { expedition, biome, tier, xpPerRun, duration, xpPerMinute, runsForLevel, timeForLevel }
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

  const { creature, startLevel, targetLevel, isAwakened } = settings

  const candidates: ExpeditionWithBiome[] = expeditions.map((exp) => ({
    expedition: exp,
    biome: biomeMap.get(exp.biome),
  }))

  const rawSteps: PlanStep[] = []
  let currentCombo: ComboKey | null = null
  let loopCount = 0
  // Effective cap: unawakened creatures must awaken at 70 before continuing
  const effectiveTarget = !isAwakened ? Math.min(targetLevel, PRE_AWAKEN_MAX) : targetLevel

  for (let level = startLevel; level < effectiveTarget; level++) {
    // Evaluate current combo with accumulated loop bonus
    let currentResult: EvalResult | null = null
    if (currentCombo) {
      const cand = candidates.find((c) => c.expedition.id === currentCombo!.expeditionId)
      if (cand) {
        currentResult = evaluateCombo(
          creature,
          cand.expedition,
          cand.biome,
          currentCombo.tier,
          level,
          loopCount,
        )
      }
    }

    // Find the absolute best option (all combos at loop count 0)
    let bestFresh: EvalResult | null = null
    for (const { expedition, biome } of candidates) {
      for (let tier = 1; tier <= 5; tier++) {
        const result = evaluateCombo(creature, expedition, biome, tier, level, 0)
        if (
          result &&
          (!bestFresh ||
            result.timeForLevel < bestFresh.timeForLevel ||
            (result.timeForLevel === bestFresh.timeForLevel &&
              result.xpPerMinute > bestFresh.xpPerMinute))
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
    if (!currentResult) {
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

    // Track combo switches
    const chosenCombo: ComboKey = { expeditionId: chosen.expedition.id, tier: chosen.tier }
    if (!currentCombo || comboId(chosenCombo) !== comboId(currentCombo)) {
      currentCombo = chosenCombo
      loopCount = 0
    }

    const biomeStatus = chosen.biome ? getBiomeStatus(creature, chosen.biome) : ('neutral' as const)

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

  // Insert awakening step and plan remaining levels if needed
  if (!isAwakened && targetLevel > PRE_AWAKEN_MAX && startLevel <= PRE_AWAKEN_MAX) {
    rawSteps.push({
      expedition: {} as Expedition,
      tier: 0,
      fromLevel: PRE_AWAKEN_MAX,
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
    })

    // Plan from 1 → target after awakening (level resets to 1 on awaken)
    currentCombo = null
    loopCount = 0
    for (let level = 1; level < targetLevel; level++) {
      let currentResult: EvalResult | null = null
      if (currentCombo) {
        const cand = candidates.find((c) => c.expedition.id === currentCombo!.expeditionId)
        if (cand) {
          currentResult = evaluateCombo(
            creature,
            cand.expedition,
            cand.biome,
            currentCombo.tier,
            level,
            loopCount,
          )
        }
      }

      let bestFresh: EvalResult | null = null
      for (const { expedition, biome } of candidates) {
        for (let tier = 1; tier <= 5; tier++) {
          const result = evaluateCombo(creature, expedition, biome, tier, level, 0)
          if (
            result &&
            (!bestFresh ||
              result.timeForLevel < bestFresh.timeForLevel ||
              (result.timeForLevel === bestFresh.timeForLevel &&
                result.xpPerMinute > bestFresh.xpPerMinute))
          ) {
            bestFresh = result
          }
        }
      }

      if (
        bestFresh &&
        currentCombo &&
        bestFresh.expedition.id === currentCombo.expeditionId &&
        bestFresh.tier === currentCombo.tier
      ) {
        bestFresh = currentResult
      }

      let chosen: EvalResult | null
      if (!currentResult) {
        chosen = bestFresh
      } else if (!bestFresh) {
        chosen = currentResult
      } else if (
        bestFresh.expedition.id === currentResult.expedition.id &&
        bestFresh.tier === currentResult.tier
      ) {
        chosen = currentResult
      } else {
        const improvement = 1 - bestFresh.timeForLevel / currentResult.timeForLevel
        const xpImprovement = bestFresh.xpPerMinute / currentResult.xpPerMinute - 1
        chosen =
          improvement > SWITCH_THRESHOLD || (improvement >= 0 && xpImprovement > SWITCH_THRESHOLD)
            ? bestFresh
            : currentResult
      }

      if (!chosen) break

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
  }

  // Merge consecutive steps using the same expedition+tier
  const steps = mergeSteps(rawSteps)

  // Add party tips to merged steps
  for (const step of steps) {
    if (step.expedition.maxPartySize <= 1) continue

    const biome = biomeMap.get(step.expedition.biome)
    let partyTime = 0
    for (let level = step.fromLevel; level < step.toLevel; level++) {
      const rating = calculateCreatureRating(creature, step.expedition, level, biome)
      const partyScore = rating * 3
      const duration = calculateDuration(partyScore, step.expedition, step.tier)
      const xpPerRun = calculateExpeditionXp(step.expedition, step.tier, 0, 3)
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

function mergeSteps(steps: PlanStep[]): PlanStep[] {
  if (steps.length === 0) return []

  const merged: PlanStep[] = []
  let current = { ...steps[0] }
  let currentXpEarned = current.runs * current.xpPerRun

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]
    // Never merge awakening steps with adjacent steps
    if (step.isAwakeningStep || current.isAwakeningStep) {
      merged.push(current)
      current = { ...step }
      currentXpEarned = current.runs * current.xpPerRun
    } else if (step.expedition.id === current.expedition.id && step.tier === current.tier) {
      current.toLevel = step.toLevel
      current.runs += step.runs
      current.timeSeconds += step.timeSeconds
      currentXpEarned += step.runs * step.xpPerRun
      current.xpPerMinute =
        current.timeSeconds > 0 ? (currentXpEarned / current.timeSeconds) * 60 : 0
      current.endXpPerMinute = step.xpPerMinute
    } else {
      merged.push(current)
      current = { ...step }
      currentXpEarned = current.runs * current.xpPerRun
    }
  }
  merged.push(current)
  return merged
}
