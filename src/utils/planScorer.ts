import type { PartyLevelingPlan, PartyPlanStep } from '@/types'

export interface PlanScore {
  // Completion
  isComplete: boolean
  incompleteCount: number

  // Time efficiency
  totalTimeSeconds: number
  totalRuns: number

  // XP efficiency
  avgXpPerMinute: number
  avgCreatureXpPerSecond: number

  // Stability (hands-free quality)
  totalReconfigurations: number
  swapsPerHour: number
  avgRunsPerAssignment: number
  shortStepCount: number
  earlySwapCount: number

  // Creature coverage
  avgCreatureTimeSeconds: number
  maxCreatureTimeSeconds: number
  creaturesFullyLeveled: number
}

export function scorePlan(plan: PartyLevelingPlan): PlanScore {
  const { steps, summaries } = plan

  // Completion
  const isComplete = plan.isComplete
  const incompleteCount = plan.incompleteCreatureIds.length

  // Time efficiency
  const totalTimeSeconds = plan.totalTimeSeconds
  const totalRuns = plan.totalRuns

  // XP efficiency
  const totalXpMinuteWeighted = steps.reduce(
    (sum, s) => sum + s.xpPerMinute * (s.timeSeconds / 60),
    0,
  )
  const totalMinutes = steps.reduce((sum, s) => sum + s.timeSeconds / 60, 0)
  const avgXpPerMinute = totalMinutes > 0 ? totalXpMinuteWeighted / totalMinutes : 0

  const totalUsefulXp = steps.reduce(
    (sum, s) => sum + s.party.filter((m) => !m.isBooster).reduce((xs, m) => xs + m.xpGained, 0),
    0,
  )
  const avgCreatureXpPerSecond = totalTimeSeconds > 0 ? totalUsefulXp / totalTimeSeconds : 0

  // Stability
  const totalReconfigurations = steps.filter((s) => s.wasReconfigured).length
  const swapsPerHour = totalTimeSeconds > 0 ? totalReconfigurations / (totalTimeSeconds / 3600) : 0

  const assignmentCount = totalReconfigurations + countInitialAssignments(steps)
  const avgRunsPerAssignment = assignmentCount > 0 ? totalRuns / assignmentCount : totalRuns

  const shortStepCount = steps.filter((s) => s.runs <= 2).length

  const twoHours = 2 * 3600
  const earlySwapCount = steps.filter(
    (s) => s.wasReconfigured && s.startTime !== undefined && s.startTime < twoHours,
  ).length

  // Creature coverage
  const creatureTimes = summaries.map((s) => s.totalTimeSeconds)
  const avgCreatureTimeSeconds =
    creatureTimes.length > 0 ? creatureTimes.reduce((a, b) => a + b, 0) / creatureTimes.length : 0
  const maxCreatureTimeSeconds = creatureTimes.length > 0 ? Math.max(...creatureTimes) : 0

  const creaturesFullyLeveled = summaries.filter((s) => s.endLevel >= 120).length

  return {
    isComplete,
    incompleteCount,
    totalTimeSeconds,
    totalRuns,
    avgXpPerMinute,
    avgCreatureXpPerSecond,
    totalReconfigurations,
    swapsPerHour,
    avgRunsPerAssignment,
    shortStepCount,
    earlySwapCount,
    avgCreatureTimeSeconds,
    maxCreatureTimeSeconds,
    creaturesFullyLeveled,
  }
}

function countInitialAssignments(steps: PartyPlanStep[]): number {
  // Count steps that are NOT reconfigurations (i.e., initial assignments)
  return steps.filter((s) => !s.wasReconfigured).length
}
