import { useLocalStorage } from '@vueuse/core'
import { computed, type Ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import type {
  CreatureLevelingSummary,
  PartyLevelingPlan,
  PartyPlanMember,
  PartyPlanStep,
} from '@/types'
import {
  planLevelingPath,
  type BoosterCandidate,
  type LevelingPlan,
} from '@/utils/planner/levelPlanner'

/**
 * Hands-free awaken planner: each queued creature gets its own "set it up once and
 * leave it for hours" plan. It reuses the single-creature planner with a high
 * stickiness so the route graduates through only a couple of expeditions (few
 * reassignments) instead of chasing the best XP/min at every level. Independent
 * per creature — no cross-creature coordination — which suits the walk-away flow.
 */
const HANDS_FREE_SWAP_THRESHOLD = 0.4

export function useAwakenHandsFree(
  queueIds: Ref<string[]>,
  targetLevel: Ref<number>,
  expeditionTierSelections?: { value: Record<string, number[]> },
  allowedBoosterIds?: { value: Set<string> },
  // Per-creature start-level overrides — used by the guided tour to stage a few demo
  // creatures at different levels so their independent plans visibly diverge.
  levelOverrides?: { value: Map<string, number> },
) {
  const { creatures } = useCreatures()
  const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
  const { expeditionToolXpBonus } = useGameConfig()

  // Start level for a queued creature: an explicit override (tour demo) wins, else owned level.
  const startLevelFor = (id: string) => levelOverrides?.value.get(id) ?? getLevel(id)

  // Boosters: owned, non-queued creatures the roster allows (when a roster is given).
  const boosterPool = computed<BoosterCandidate[]>(() => {
    const queued = new Set(queueIds.value)
    const allowed = allowedBoosterIds?.value
    const out: BoosterCandidate[] = []
    for (const c of creatures.value) {
      if (queued.has(c.id) || !ownedCreatureIds.value.has(c.id)) continue
      if (allowed && !allowed.has(c.id)) continue
      out.push({ creature: c, level: getLevel(c.id) })
    }
    return out
  })

  // Fingerprint of every input that should require re-calculating before the plan shows. The plan
  // itself is a live computed, so this only gates VISIBILITY (mirrors the previous hasCalculated
  // flag + invalidation watch).
  const calcFingerprint = computed(() => {
    const queue = queueIds.value.join(',')
    const tiers = expeditionTierSelections?.value
    const tierSig = tiers
      ? Object.keys(tiers)
          .toSorted()
          .map((k) => `${k}:${[...tiers[k]].toSorted((a, b) => a - b).join('+')}`)
          .join('|')
      : ''
    const boosters = allowedBoosterIds?.value
      ? [...allowedBoosterIds.value].toSorted().join(',')
      : ''
    const levels = levelOverrides?.value
      ? [...levelOverrides.value.entries()]
          .toSorted()
          .map(([k, v]) => `${k}:${v}`)
          .join(',')
      : ''
    return `${queue}||${targetLevel.value}||${tierSig}||${boosters}||${expeditionToolXpBonus.value}||${levels}`
  })

  // Persisted so a refresh with unchanged inputs keeps showing the plan instead of dropping back to
  // the Calculate prompt. Empty until the user calculates at least once.
  const lastCalcFingerprint = useLocalStorage<string>('awaken-hands-free-fingerprint', '')
  const hasCalculated = computed(
    () => lastCalcFingerprint.value !== '' && lastCalcFingerprint.value === calcFingerprint.value,
  )

  const plansById = computed<Map<string, LevelingPlan>>(() => {
    const map = new Map<string, LevelingPlan>()
    if (!hasCalculated.value) return map
    // Creatures run in parallel, so a booster can only help ONE of them. Allocate
    // exclusively: each creature plans against the remaining pool, then the boosters
    // it actually used are reserved so no later creature double-books them.
    let remaining = boosterPool.value
    for (const id of queueIds.value) {
      const creature = creatures.value.find((c) => c.id === id)
      if (!creature) continue
      const startLevel = startLevelFor(id)
      if (startLevel >= targetLevel.value) continue
      const plan = planLevelingPath({
        creature,
        startLevel,
        targetLevel: targetLevel.value,
        isAwakened: isAwakened(id),
        swordXpMultiplier: expeditionToolXpBonus.value,
        expeditionTierSelections: expeditionTierSelections?.value,
        boosterCandidates: remaining.length > 0 ? remaining : undefined,
        swapThreshold: HANDS_FREE_SWAP_THRESHOLD,
      })
      const used = new Set<string>()
      for (const step of plan.steps) {
        if (step.kind !== 'run') continue
        for (const b of step.boosters ?? []) used.add(b.creature.id)
      }
      if (used.size > 0) remaining = remaining.filter((b) => !used.has(b.creature.id))
      map.set(id, plan)
    }
    return map
  })

  const hasPlan = computed(() => plansById.value.size > 0)
  /** Latest finish across all creatures (they run in parallel). */
  const lastFinishSeconds = computed(() => {
    let max = 0
    for (const p of plansById.value.values()) max = Math.max(max, p.totalTimeSeconds)
    return hasPlan.value ? max : null
  })

  // Reshape the independent per-creature plans into a PartyLevelingPlan so the same
  // PartyPlannerResults UI (timeline by expedition, steps, charts) renders them.
  // Each creature runs in parallel from t=0; its steps lay out sequentially.
  const partyPlan = computed<PartyLevelingPlan | null>(() => {
    if (!hasPlan.value) return null
    const steps: PartyPlanStep[] = []
    const summaries: CreatureLevelingSummary[] = []
    let totalRuns = 0
    let makespan = 0
    for (const [id, plan] of plansById.value) {
      let cursor = 0
      const expeditionsUsed = new Set<string>()
      for (const step of plan.steps) {
        if (step.kind === 'awaken') continue
        const party: PartyPlanMember[] = [
          {
            creatureId: id,
            fromLevel: step.fromLevel,
            toLevel: step.toLevel,
            xpGained: step.xpPerRun * step.runs,
            isBooster: false,
          },
          ...(step.boosters ?? []).map((b) => ({
            creatureId: b.creature.id,
            fromLevel: b.level,
            toLevel: b.level,
            xpGained: 0,
            isBooster: true,
          })),
        ]
        steps.push({
          kind: 'run',
          expedition: step.expedition,
          tier: step.tier,
          party,
          runs: step.runs,
          timeSeconds: step.timeSeconds,
          xpPerMinute: step.xpPerMinute,
          biomeName: step.biomeName,
          loopCount: step.runs,
          loopCountStart: 0,
          loopCountEnd: step.runs,
          preservedLoopBonus: false,
          wasReconfigured: false,
          startTime: cursor,
          endTime: cursor + step.timeSeconds,
        })
        cursor += step.timeSeconds
        totalRuns += step.runs
        expeditionsUsed.add(step.expedition.id)
      }
      summaries.push({
        creatureId: id,
        startLevel: startLevelFor(id),
        endLevel: targetLevel.value,
        totalTimeSeconds: cursor,
        totalRuns: plan.totalRuns,
        expeditionsUsed: [...expeditionsUsed],
      })
      makespan = Math.max(makespan, cursor)
    }
    return {
      steps,
      summaries,
      awakenEvents: [],
      inputLevelerCount: summaries.length,
      plannedLevelerCount: summaries.length,
      isComplete: true,
      incompleteCreatureIds: [],
      totalTimeSeconds: makespan,
      totalRuns,
    }
  })

  // Stamp the current inputs as "calculated". hasCalculated stays true (and the plan stays visible
  // across refreshes) until an input changes the fingerprint.
  function calculate() {
    lastCalcFingerprint.value = calcFingerprint.value
  }

  return { plansById, partyPlan, hasPlan, hasCalculated, lastFinishSeconds, calculate }
}
