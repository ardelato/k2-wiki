import type { PartyLevelingPlan } from '@/types'

export interface ChartPoint {
  time: number
  value: number
}

export interface StrategyTimeSeries {
  xpRate: ChartPoint[] // XP/sec
  swapRate: ChartPoint[] // swaps/hr
  levelingProgress: ChartPoint[]
}

export function deriveTimeSeries(
  plan: PartyLevelingPlan,
  targetLevel: number,
  filterCreatureId?: string,
): StrategyTimeSeries {
  const steps = plan.steps
    .filter((s) => !s.isAwakeningStep)
    .filter((s) => !filterCreatureId || s.party.some((m) => m.creatureId === filterCreatureId))

  // Collect all unique time boundaries
  const boundarySet = new Set<number>()
  boundarySet.add(0)
  for (const step of steps) {
    if (step.startTime != null) boundarySet.add(step.startTime)
    if (step.endTime != null) boundarySet.add(step.endTime)
  }
  const boundaries = [...boundarySet].toSorted((a, b) => a - b)

  // Plan end time — don't emit data points beyond it
  const planEnd = plan.totalTimeSeconds

  const xpRate: ChartPoint[] = []
  const swapRate: ChartPoint[] = []
  const levelingProgress: ChartPoint[] = []

  // Track each creature's latest toLevel for progress calculation
  const creatureStartLevels = new Map<string, number>()
  const creatureLatestLevels = new Map<string, number>()
  for (const step of steps) {
    for (const member of step.party) {
      if (!member.isBooster) {
        if (!creatureStartLevels.has(member.creatureId)) {
          creatureStartLevels.set(member.creatureId, member.fromLevel)
        }
      }
    }
  }

  for (const t of boundaries) {
    if (t > planEnd) break

    // XP Rate: per-creature XP/sec summed across all active runs at this time
    // step.xpPerMinute is total across all levelers, so divide by leveler count for per-creature rate
    let totalXpPerSec = 0
    for (const step of steps) {
      const start = step.startTime ?? 0
      const end = step.endTime ?? start + step.timeSeconds
      if (t >= start && t < end) {
        const levelerCount = step.party.filter((m) => !m.isBooster).length || 1
        totalXpPerSec += step.xpPerMinute / 60 / levelerCount
      }
    }
    xpRate.push({ time: t, value: totalXpPerSec })

    // Swap rate: reconfigurations per hour using a rolling 1-hour window
    const windowSec = 3600
    let swapsInWindow = 0
    for (const step of steps) {
      const start = step.startTime ?? 0
      if (step.wasReconfigured && start <= t && start > t - windowSec) {
        swapsInWindow++
      }
    }
    swapRate.push({ time: t, value: swapsInWindow })

    // Leveling progress: update creature levels from completed steps
    for (const step of steps) {
      const end = step.endTime ?? (step.startTime ?? 0) + step.timeSeconds
      if (end <= t) {
        for (const member of step.party) {
          if (!member.isBooster) {
            const prev = creatureLatestLevels.get(member.creatureId) ?? member.fromLevel
            if (member.toLevel > prev) {
              creatureLatestLevels.set(member.creatureId, member.toLevel)
            }
          }
        }
      }
    }

    // Compute avg progress across all levelers
    let totalProgress = 0
    let levelerCount = 0
    for (const [id, startLvl] of creatureStartLevels) {
      const currentLvl = creatureLatestLevels.get(id) ?? startLvl
      const range = targetLevel - startLvl
      if (range > 0) {
        totalProgress += Math.min(1, Math.max(0, (currentLvl - startLvl) / range))
      }
      levelerCount++
    }
    levelingProgress.push({
      time: t,
      value: levelerCount > 0 ? totalProgress / levelerCount : 0,
    })
  }

  return { xpRate, swapRate, levelingProgress }
}
