import type {
  AwakenEvent,
  Creature,
  Expedition,
  PartyLevelingPlan,
  PartyPlanCreature,
  PartyPlanMember,
  PartyPlannerInput,
  PartyPlannerProgress,
  PartyPlanStep,
  PlannerStrategy,
  PlannerTimeBudget,
} from '@/types'
import {
  calculateDuration,
  calculateExpeditionXp,
  getLoopXpBonus,
  maxLevelForState,
  xpForLevel,
} from '@/utils/formulas'
import {
  biomeMap,
  expeditionMap,
  expeditions,
  getCreatureRating,
  getLevelTransitions,
  getPrecomputedSoloRate,
  getTopExpeditions,
} from '@/utils/precomputedTables'

const BEAM_WIDTH = 32
const INITIAL_WIDE_ITERATIONS = 3
const WIDE_BEAM_MULTIPLIER = 2
const MAX_GREEDY_EVENTS = 10_000
const MAX_WAVE_VARIANTS = 5
const MAX_WAVE_PARTIALS = 64
const ITERATION_BUDGET_MAP: Record<PlannerTimeBudget, number> = {
  quick: 40,
  thorough: 320,
}
const WALL_CLOCK_FALLBACK_MS = 120_000
const PROGRESS_REPORT_INTERVAL = 8
const PROGRESS_HEARTBEAT_MS = 100
const HUGE_TIME = 10 ** 12

interface CreatureProgress {
  level: number
  xpInLevel: number
  awakened: boolean
  targetLevel: number
  fullTargetLevel: number
}

interface ExpeditionAssignment {
  memberIds: string[]
  memberKey: string
  tier: number
}

interface ActiveRun {
  expeditionId: string
  tier: number
  memberIds: string[]
  levelerIds: string[]
  startTime: number
  endTime: number
  duration: number
  xpPerCreature: number
  loopCountStart: number
  loopCountEnd: number
  preservedLoopBonus: boolean
  wasReconfigured: boolean
  biomeName: string
  startMembers: PartyPlanMember[]
}

interface RunCandidate {
  expeditionId: string
  tier: number
  memberIds: string[]
  memberKey: string
  levelerIds: string[]
  duration: number
  xpPerCreature: number
  usefulXpPerSecond: number
  priorityScore: number
  loopCountStart: number
  loopCountEnd: number
  preservedLoopBonus: boolean
  wasReconfigured: boolean
  biomeName: string
  startMembers: PartyPlanMember[]
}

interface SearchState {
  clock: number
  rank: number
  creatures: Record<string, CreatureProgress>
  expeditionLoops: Record<string, number>
  expeditionAssignments: Record<string, ExpeditionAssignment | null>
  activeRuns: ActiveRun[]
  steps: PartyPlanStep[]
  awakenEvents: AwakenEvent[]
  totalRuns: number
  creatureTime: Record<string, number>
  creatureRuns: Record<string, number>
  creatureExpeditions: Record<string, string[]>
}

function normalizePlannerInput(value: PartyPlannerInput | PartyPlanCreature[]): PartyPlannerInput {
  if (Array.isArray(value)) {
    return { creatures: value, expeditions: {} }
  }
  return value
}

function isCreatureFinished(progress: CreatureProgress): boolean {
  return progress.level >= progress.targetLevel && progress.targetLevel === progress.fullTargetLevel
}

function remainingXpToCurrentTarget(progress: CreatureProgress): number {
  if (progress.level >= progress.targetLevel) return 0
  return xpForLevel(progress.targetLevel) - xpForLevel(progress.level) - progress.xpInLevel
}

function remainingXpToFinalTarget(progress: CreatureProgress): number {
  const currentSegment = remainingXpToCurrentTarget(progress)
  if (progress.awakened || progress.fullTargetLevel <= progress.targetLevel) return currentSegment
  return currentSegment + (xpForLevel(progress.fullTargetLevel) - xpForLevel(1))
}

function availableCreatureIds(state: SearchState): string[] {
  const busy = new Set(state.activeRuns.flatMap((run) => run.memberIds))
  return Object.keys(state.creatures).filter((creatureId) => !busy.has(creatureId))
}

function chooseBetterComplete(current: SearchState | null, candidate: SearchState): SearchState {
  if (!current) return candidate
  if (candidate.clock !== current.clock)
    return candidate.clock < current.clock ? candidate : current
  if (candidate.totalRuns !== current.totalRuns)
    return candidate.totalRuns < current.totalRuns ? candidate : current
  return candidate.steps.length < current.steps.length ? candidate : current
}

function isBetterCandidate(
  candidate: RunCandidate,
  current: RunCandidate,
  strategy: PlannerStrategy = 'optimal',
): boolean {
  if (candidate.priorityScore !== current.priorityScore) {
    return candidate.priorityScore > current.priorityScore
  }
  if (candidate.usefulXpPerSecond !== current.usefulXpPerSecond) {
    return candidate.usefulXpPerSecond > current.usefulXpPerSecond
  }
  if (candidate.levelerIds.length !== current.levelerIds.length) {
    return candidate.levelerIds.length > current.levelerIds.length
  }
  // Optimal: shorter duration wins (faster iterations)
  // Hands-free: longer duration wins (fewer interactions)
  return strategy === 'hands-free'
    ? candidate.duration > current.duration
    : candidate.duration < current.duration
}

function cloneState(state: SearchState): SearchState {
  return {
    clock: state.clock,
    rank: state.rank,
    creatures: Object.fromEntries(
      Object.entries(state.creatures).map(([creatureId, progress]) => [
        creatureId,
        { ...progress },
      ]),
    ),
    expeditionLoops: { ...state.expeditionLoops },
    expeditionAssignments: Object.fromEntries(
      Object.entries(state.expeditionAssignments).map(([expeditionId, assignment]) => [
        expeditionId,
        assignment
          ? {
              memberIds: [...assignment.memberIds],
              memberKey: assignment.memberKey,
              tier: assignment.tier,
            }
          : null,
      ]),
    ),
    activeRuns: state.activeRuns.map((run) => ({
      ...run,
      memberIds: [...run.memberIds],
      levelerIds: [...run.levelerIds],
      startMembers: run.startMembers,
    })),
    steps: [...state.steps],
    awakenEvents: [...state.awakenEvents],
    totalRuns: state.totalRuns,
    creatureTime: { ...state.creatureTime },
    creatureRuns: { ...state.creatureRuns },
    creatureExpeditions: Object.fromEntries(
      Object.entries(state.creatureExpeditions).map(([creatureId, ids]) => [creatureId, [...ids]]),
    ),
  }
}

function hashCacheKey(
  expeditionId: string,
  orderedMemberIds: string[],
  creatures: Record<string, CreatureProgress>,
  prevKey: string | undefined,
  prevTier: number,
  loopCount: number,
): number {
  let h = 0
  for (let i = 0; i < expeditionId.length; i++) h = (h * 31 + expeditionId.charCodeAt(i)) | 0
  for (const id of orderedMemberIds) {
    const p = creatures[id]
    h = (h * 31 + p.level) | 0
    h = (h * 31 + p.targetLevel) | 0
    h = (h * 31 + p.fullTargetLevel) | 0
    h = (h * 31 + (p.awakened ? 1 : 0)) | 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  }
  if (prevKey) for (let i = 0; i < prevKey.length; i++) h = (h * 31 + prevKey.charCodeAt(i)) | 0
  h = (h * 31 + prevTier) | 0
  h = (h * 31 + loopCount) | 0
  return h
}

export function planPartyLevelingPath(
  input: PartyPlannerInput | PartyPlanCreature[],
  onProgress?: (progress: PartyPlannerProgress) => void,
): PartyLevelingPlan {
  const normalized = normalizePlannerInput(input)
  const strategy: PlannerStrategy = normalized.strategy ?? 'optimal'
  const maxIterations = ITERATION_BUDGET_MAP[normalized.timeBudget ?? 'quick']
  const creaturesInput = normalized.creatures
  const levelers = creaturesInput.filter((entry) => entry.startLevel < entry.targetLevel)
  const startedAt = Date.now()
  let searchDeadline = startedAt + WALL_CLOCK_FALLBACK_MS
  let exploredStates = 0
  let completedIterations = 0
  let currentPhase: PartyPlannerProgress['phase'] = 'initializing'
  let currentBeamSize = 0
  let currentStateIndex = 0
  let currentStatesInIteration = 0
  let currentExpeditionsConsidered = 0
  let currentWaveVariantsEvaluated = 0
  let lastProgressAt = 0
  const orderedCreatureIds = [
    ...new Set(creaturesInput.map((entry) => entry.creature.id)),
  ].toSorted()

  function isWallClockExceeded() {
    return Date.now() >= searchDeadline
  }

  function emitProgress(bestCompleteState: SearchState | null, force = false) {
    const now = Date.now()
    if (!force && now - lastProgressAt < PROGRESS_HEARTBEAT_MS) return

    lastProgressAt = now
    onProgress?.({
      phase: currentPhase,
      iteration: completedIterations,
      maxIterations: maxIterations,
      beamSize: currentBeamSize,
      stateIndex: currentStateIndex,
      statesInIteration: currentStatesInIteration,
      exploredStates,
      expeditionsConsidered: currentExpeditionsConsidered,
      waveVariantsEvaluated: currentWaveVariantsEvaluated,
      bestCompleteTimeSeconds: bestCompleteState?.clock ?? null,
      iterationBudget: maxIterations,
      startedAtMs: startedAt,
      updatedAtMs: now,
      elapsedMs: now - startedAt,
    })
  }

  function setProgress(
    phase: PartyPlannerProgress['phase'],
    bestCompleteState: SearchState | null,
    options?: {
      force?: boolean
      beamSize?: number
      stateIndex?: number
      statesInIteration?: number
      expeditionsConsidered?: number
      waveVariantsEvaluated?: number
    },
  ) {
    currentPhase = phase
    if (options?.beamSize !== undefined) currentBeamSize = options.beamSize
    if (options?.stateIndex !== undefined) currentStateIndex = options.stateIndex
    if (options?.statesInIteration !== undefined)
      currentStatesInIteration = options.statesInIteration
    if (options?.expeditionsConsidered !== undefined) {
      currentExpeditionsConsidered = options.expeditionsConsidered
    }
    if (options?.waveVariantsEvaluated !== undefined) {
      currentWaveVariantsEvaluated = options.waveVariantsEvaluated
    }
    emitProgress(bestCompleteState, options?.force ?? false)
  }

  setProgress('initializing', null, { force: true })

  if (levelers.length === 0) {
    setProgress('finalizing', null, { force: true })
    return {
      steps: [],
      summaries: [],
      awakenEvents: [],
      inputLevelerCount: 0,
      plannedLevelerCount: 0,
      isComplete: true,
      incompleteCreatureIds: [],
      totalTimeSeconds: 0,
      totalRuns: 0,
    }
  }

  const creatureMap = new Map(creaturesInput.map((entry) => [entry.creature.id, entry.creature]))
  const trackedCreatureIds = levelers.map((entry) => entry.creature.id)
  const trackedCreatureSet = new Set(trackedCreatureIds)
  const partyCandidateCache = new Map<
    number,
    { expeditionId: string; result: RunCandidate | null }
  >()
  const orderedExpeditionIds = expeditions.map((expedition) => expedition.id)

  const initialState = createInitialState(normalized, expeditions, creatureMap)
  initialState.rank = estimateStateRank(initialState)

  let beam: SearchState[] = [initialState]
  let bestComplete: SearchState | null = allTargetsComplete(initialState) ? initialState : null
  let lastReportedBestTime = bestComplete?.clock ?? null
  let searchTimedOut = false
  setProgress('beam', bestComplete, {
    beamSize: beam.length,
    stateIndex: 0,
    statesInIteration: beam.length,
    expeditionsConsidered: 0,
    waveVariantsEvaluated: 0,
    force: true,
  })

  for (let iteration = 0; iteration < maxIterations && beam.length > 0; iteration++) {
    if (isWallClockExceeded()) {
      searchTimedOut = true
      break
    }
    completedIterations = iteration + 1
    const nextStates: SearchState[] = []
    currentBeamSize = beam.length
    currentStatesInIteration = beam.length

    for (const [stateIndex, state] of beam.entries()) {
      currentStateIndex = stateIndex + 1
      exploredStates += 1

      if (allTargetsComplete(state)) {
        bestComplete = chooseBetterComplete(bestComplete, state)
        continue
      }

      setProgress('candidates', bestComplete, {
        beamSize: beam.length,
        stateIndex: currentStateIndex,
        statesInIteration: currentStatesInIteration,
        expeditionsConsidered: 0,
        waveVariantsEvaluated: 0,
      })

      const variants = buildWaveVariants(state, bestComplete)
      if (variants.length === 0) continue

      for (const variant of variants) {
        const started = startWave(state, variant)
        if (started.activeRuns.length === 0) continue

        const advanced = resolveNextDecisionState(started)
        advanced.rank = estimateStateRank(advanced)

        if (allTargetsComplete(advanced)) {
          bestComplete = chooseBetterComplete(bestComplete, advanced)
        } else {
          nextStates.push(advanced)
        }
      }
    }

    if (searchTimedOut) {
      if (nextStates.length > 0) beam = selectBeam(nextStates)
      break
    }

    if (bestComplete) {
      const bestOpenRank = nextStates.reduce((min, state) => Math.min(min, state.rank), HUGE_TIME)
      if (bestOpenRank >= bestComplete.clock) break
    }

    const effectiveWidth =
      iteration < INITIAL_WIDE_ITERATIONS ? BEAM_WIDTH * WIDE_BEAM_MULTIPLIER : BEAM_WIDTH
    beam = selectBeam(nextStates, effectiveWidth)
    const currentBestTime = bestComplete?.clock ?? null
    if (
      completedIterations === 1 ||
      completedIterations % PROGRESS_REPORT_INTERVAL === 0 ||
      beam.length === 0 ||
      currentBestTime !== lastReportedBestTime
    ) {
      setProgress('beam', bestComplete, {
        beamSize: beam.length,
        stateIndex: 0,
        statesInIteration: currentStatesInIteration,
        expeditionsConsidered: currentExpeditionsConsidered,
        waveVariantsEvaluated: currentWaveVariantsEvaluated,
        force: true,
      })
      lastReportedBestTime = currentBestTime
    }
  }

  setProgress('finalizing', bestComplete, {
    beamSize: beam.length,
    stateIndex: currentStateIndex,
    statesInIteration: currentStatesInIteration,
    expeditionsConsidered: currentExpeditionsConsidered,
    waveVariantsEvaluated: currentWaveVariantsEvaluated,
    force: true,
  })
  // Multi-start greedy fallback: try the top beam states and take the best result
  // Disable the time budget for the greedy phase — it's bounded by MAX_GREEDY_EVENTS instead
  searchDeadline = Infinity
  let finalState: SearchState
  if (bestComplete) {
    finalState = bestComplete
  } else {
    const fallbackCandidates = beam.length > 0 ? beam.slice(0, 3) : [initialState]
    finalState = fallbackCandidates.reduce<SearchState>((best, candidate) => {
      const completed = completeGreedily(candidate)
      return chooseBetterComplete(best, completed) === completed ? completed : best
    }, completeGreedily(fallbackCandidates[0]))
  }
  const mergedSteps = mergePartySteps(finalState.steps)
  const summaries = trackedCreatureIds.map((creatureId) => ({
    creatureId,
    startLevel: creaturesInput.find((entry) => entry.creature.id === creatureId)?.startLevel ?? 1,
    endLevel: finalState.creatures[creatureId]?.level ?? 1,
    totalTimeSeconds: finalState.creatureTime[creatureId] ?? 0,
    totalRuns: finalState.creatureRuns[creatureId] ?? 0,
    expeditionsUsed: [...new Set(finalState.creatureExpeditions[creatureId] ?? [])],
  }))
  const incompleteCreatureIds = trackedCreatureIds.filter(
    (creatureId) => !isCreatureFinished(finalState.creatures[creatureId]),
  )
  const plannedLevelerCount = trackedCreatureIds.filter(
    (creatureId) => (finalState.creatureRuns[creatureId] ?? 0) > 0,
  ).length

  return {
    steps: mergedSteps,
    summaries,
    awakenEvents: finalState.awakenEvents.toSorted((a, b) => a.clockTime - b.clockTime),
    inputLevelerCount: trackedCreatureIds.length,
    plannedLevelerCount,
    isComplete: incompleteCreatureIds.length === 0,
    incompleteCreatureIds,
    totalTimeSeconds: finalState.clock,
    totalRuns: finalState.totalRuns,
  }

  function createInitialState(
    plannerInput: PartyPlannerInput,
    expeditionList: Expedition[],
    creaturesById: Map<string, Creature>,
  ): SearchState {
    const creatures: Record<string, CreatureProgress> = {}
    const expeditionLoops: Record<string, number> = {}
    const expeditionAssignments: Record<string, ExpeditionAssignment | null> = {}
    const creatureTime: Record<string, number> = {}
    const creatureRuns: Record<string, number> = {}
    const creatureExpeditions: Record<string, string[]> = {}

    for (const entry of plannerInput.creatures) {
      const maxLevel = maxLevelForState(entry.awakened)
      const cappedTarget = entry.isBooster ? maxLevel : Math.min(entry.targetLevel, maxLevel)

      creatures[entry.creature.id] = {
        level: entry.isBooster ? maxLevel : entry.startLevel,
        xpInLevel: 0,
        awakened: entry.awakened,
        targetLevel: cappedTarget,
        fullTargetLevel: entry.isBooster ? maxLevel : entry.targetLevel,
      }

      if (trackedCreatureSet.has(entry.creature.id)) {
        creatureTime[entry.creature.id] = 0
        creatureRuns[entry.creature.id] = 0
        creatureExpeditions[entry.creature.id] = []
      }
    }

    for (const expedition of expeditionList) {
      const saved = plannerInput.expeditions[expedition.id]
      expeditionLoops[expedition.id] = Math.max(0, saved?.loopCount ?? 0)

      const validParty = (saved?.party ?? []).filter((id) => creaturesById.has(id))
      expeditionAssignments[expedition.id] =
        validParty.length > 0
          ? {
              memberIds: [...validParty],
              memberKey: memberKey(validParty),
              tier: saved?.tier ?? 1,
            }
          : null
    }

    return {
      clock: 0,
      rank: HUGE_TIME,
      creatures,
      expeditionLoops,
      expeditionAssignments,
      activeRuns: [],
      steps: [],
      awakenEvents: [],
      totalRuns: 0,
      creatureTime,
      creatureRuns,
      creatureExpeditions,
    }
  }

  function allTargetsComplete(state: SearchState): boolean {
    return creaturesInput.every((entry) => isCreatureFinished(state.creatures[entry.creature.id]))
  }

  function freeExpeditionIds(state: SearchState): string[] {
    const busy = new Set(state.activeRuns.map((run) => run.expeditionId))
    return expeditions
      .map((expedition) => expedition.id)
      .filter((expeditionId) => !busy.has(expeditionId))
  }

  function estimateStateRank(state: SearchState): number {
    if (allTargetsComplete(state)) return state.clock

    let maxTime = 0
    let sumTime = 0
    let count = 0
    for (const creatureId of Object.keys(state.creatures)) {
      const progress = state.creatures[creatureId]
      if (isCreatureFinished(progress)) continue

      const bestRate = getPrecomputedSoloRate(creatureId, progress.level)
      if (bestRate <= 0) return HUGE_TIME

      const t = remainingXpToFinalTarget(progress) / bestRate
      if (t > maxTime) maxTime = t
      sumTime += t
      count++
    }

    if (count === 0) return state.clock

    // Tighter lower bound: total work / available parallel slots
    const parallelSlots = Math.min(count, expeditions.length)
    const parallelBound = sumTime / parallelSlots

    return state.clock + Math.max(maxTime, parallelBound)
  }

  function buildWaveVariants(
    state: SearchState,
    bestCompleteState: SearchState | null,
  ): RunCandidate[][] {
    const freeIds = freeExpeditionIds(state)
    const availableIds = availableCreatureIds(state)
    const unfinishedIds = availableIds.filter(
      (creatureId) => !isCreatureFinished(state.creatures[creatureId]),
    )
    const boosterIds = availableIds.filter((creatureId) =>
      isCreatureFinished(state.creatures[creatureId]),
    )
    const seedGroups: { expeditionId: string; candidates: RunCandidate[] }[] = []

    currentExpeditionsConsidered = 0
    currentWaveVariantsEvaluated = 0
    for (const expeditionId of freeIds) {
      const candidates = buildSeedCandidatesForExpedition(state, expeditionId, unfinishedIds)
      if (candidates.length === 0) continue

      seedGroups.push({ expeditionId, candidates })
      currentExpeditionsConsidered = seedGroups.length
      emitProgress(bestCompleteState)
    }

    const prioritizedGroups = seedGroups.toSorted(
      (a, b) => (b.candidates[0]?.priorityScore ?? 0) - (a.candidates[0]?.priorityScore ?? 0),
    )

    if (prioritizedGroups.length === 0) {
      return state.activeRuns.length > 0 ? [[]] : []
    }

    setProgress('waves', bestCompleteState, {
      expeditionsConsidered: prioritizedGroups.length,
      waveVariantsEvaluated: 0,
    })

    interface SeedAssignment {
      key: string
      score: number
      coverageCount: number
      selected: RunCandidate[]
      usedCreatureIds: Set<string>
    }

    const rankSeedAssignment = (assignment: SeedAssignment) =>
      assignment.coverageCount * HUGE_TIME + assignment.score

    const targetActivationCount = Math.min(prioritizedGroups.length, unfinishedIds.length)
    let partials: SeedAssignment[] = [
      {
        key: '',
        score: 0,
        coverageCount: 0,
        selected: [],
        usedCreatureIds: new Set<string>(),
      },
    ]

    for (const [groupIndex, group] of prioritizedGroups.entries()) {
      const nextPartials = new Map<string, SeedAssignment>()
      const remainingGroups = prioritizedGroups.length - groupIndex - 1

      const pushPartial = (partial: SeedAssignment) => {
        const existing = nextPartials.get(partial.key)
        if (!existing || rankSeedAssignment(partial) > rankSeedAssignment(existing)) {
          nextPartials.set(partial.key, partial)
        }
      }

      for (const partial of partials) {
        const remainingNeeded = targetActivationCount - partial.coverageCount
        if (remainingNeeded <= remainingGroups) pushPartial(partial)

        for (const candidate of group.candidates) {
          const seedCreatureId = candidate.levelerIds[0]
          if (!seedCreatureId || partial.usedCreatureIds.has(seedCreatureId)) continue

          const usedCreatureIds = new Set(partial.usedCreatureIds)
          usedCreatureIds.add(seedCreatureId)
          const selected = [...partial.selected, candidate]
          const key = selected.map((item) => candidateKey(item)).join('|')

          pushPartial({
            key,
            score: partial.score + candidate.priorityScore,
            coverageCount: partial.coverageCount + 1,
            selected,
            usedCreatureIds,
          })
          currentWaveVariantsEvaluated += 1
        }
        emitProgress(bestCompleteState)
      }

      partials = [...nextPartials.values()]
        .toSorted((a, b) => rankSeedAssignment(b) - rankSeedAssignment(a))
        .slice(0, MAX_WAVE_PARTIALS)
    }

    const bestCoverage = partials.reduce((max, partial) => Math.max(max, partial.coverageCount), 0)
    const seedAssignments = partials
      .filter((partial) => partial.coverageCount === bestCoverage && partial.coverageCount > 0)
      .toSorted((a, b) => rankSeedAssignment(b) - rankSeedAssignment(a))
      .slice(0, MAX_WAVE_VARIANTS - 1) // Reserve 1 slot for matching variant

    // Creature-first greedy matching: assigns creatures to their best available
    // expedition (vs the DP which assigns expeditions in priority order).
    // This explores a different part of the search space.
    const matchingSeeds = buildMatchingVariant(prioritizedGroups)
    if (matchingSeeds.length > 0) {
      const matchingKey = matchingSeeds.map((item) => candidateKey(item)).join('|')
      const isDuplicate = seedAssignments.some((a) => a.key === matchingKey)
      if (!isDuplicate) {
        seedAssignments.push({
          key: matchingKey,
          score: matchingSeeds.reduce((sum, c) => sum + c.priorityScore, 0),
          coverageCount: matchingSeeds.length,
          selected: matchingSeeds,
          usedCreatureIds: new Set(matchingSeeds.map((c) => c.levelerIds[0]).filter(Boolean)),
        })
      }
    }

    const variants = seedAssignments
      .map((assignment) =>
        fillWaveVariant(state, assignment.selected, unfinishedIds, boosterIds, bestCompleteState),
      )
      .filter((variant) => variant.length > 0 || state.activeRuns.length > 0)

    if (variants.length > 0) return variants
    return state.activeRuns.length > 0 ? [[]] : []
  }

  function buildMatchingVariant(
    groups: { expeditionId: string; candidates: RunCandidate[] }[],
  ): RunCandidate[] {
    // Build creature → expedition options map
    const creatureOptions = new Map<string, { groupIdx: number; candidate: RunCandidate }[]>()
    for (const [groupIdx, group] of groups.entries()) {
      for (const candidate of group.candidates) {
        const creatureId = candidate.levelerIds[0]
        if (!creatureId) continue
        let options = creatureOptions.get(creatureId)
        if (!options) {
          options = []
          creatureOptions.set(creatureId, options)
        }
        options.push({ groupIdx, candidate })
      }
    }

    // Sort each creature's options by priority descending
    for (const options of creatureOptions.values()) {
      options.sort((a, b) => b.candidate.priorityScore - a.candidate.priorityScore)
    }

    // Greedy matching: process creatures by their best priority, assign to best available expedition
    const creatureList = [...creatureOptions.entries()]
      .map(([id, opts]) => ({ id, bestScore: opts[0]?.candidate.priorityScore ?? 0 }))
      .toSorted((a, b) => b.bestScore - a.bestScore)

    const usedExpeditions = new Set<number>()
    const selected: RunCandidate[] = []

    for (const { id } of creatureList) {
      const options = creatureOptions.get(id)!
      for (const { groupIdx, candidate } of options) {
        if (usedExpeditions.has(groupIdx)) continue
        selected.push(candidate)
        usedExpeditions.add(groupIdx)
        break
      }
    }

    return selected
  }

  function buildSeedCandidatesForExpedition(
    state: SearchState,
    expeditionId: string,
    unfinishedIds: string[],
  ): RunCandidate[] {
    const expedition = expeditionMap.get(expeditionId)
    if (!expedition) return []

    // Optimal: use precomputed top-N to narrow the sort pool (reduces evals
    // from N creatures down to top-N matches). Hands-free: keep rating-based
    // sort + cap to preserve scoring quality for amortized XP calculations.
    const MAX_EVAL = strategy === 'optimal' ? 10 : 12
    let evalIds: string[]

    if (strategy === 'optimal') {
      const topIds = unfinishedIds.filter((creatureId) => {
        const tops = getTopExpeditions(creatureId, state.creatures[creatureId].level)
        if (tops?.has(expeditionId)) return true

        // Also consider creatures near a transition point (within 5 levels)
        const transitions = getLevelTransitions(creatureId)
        const level = state.creatures[creatureId].level
        return transitions.some((t) => t > level && t <= level + 5)
      })
      const sortPool = topIds.length >= MAX_EVAL ? topIds : unfinishedIds
      evalIds = [...sortPool]
        .toSorted(
          (a, b) =>
            getCreatureRating(b, expeditionId, state.creatures[b].level) -
            getCreatureRating(a, expeditionId, state.creatures[a].level),
        )
        .slice(0, MAX_EVAL)
    } else {
      evalIds = [...unfinishedIds]
        .toSorted(
          (a, b) =>
            getCreatureRating(b, expeditionId, state.creatures[b].level) -
            getCreatureRating(a, expeditionId, state.creatures[a].level),
        )
        .slice(0, MAX_EVAL)
    }

    if (evalIds.length === 0) return []

    return evalIds
      .map((creatureId) => buildBestCandidateForMembers(state, expedition, [creatureId]))
      .filter((candidate): candidate is RunCandidate => candidate !== null)
      .toSorted((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
        if (b.usefulXpPerSecond !== a.usefulXpPerSecond)
          return b.usefulXpPerSecond - a.usefulXpPerSecond
        return a.duration - b.duration
      })
  }

  function fillWaveVariant(
    state: SearchState,
    seeds: RunCandidate[],
    unfinishedIds: string[],
    boosterIds: string[],
    bestCompleteState: SearchState | null,
  ): RunCandidate[] {
    const parties = new Map(seeds.map((seed) => [seed.expeditionId, seed]))
    const assignedLevelers = new Set(seeds.flatMap((seed) => seed.levelerIds))
    const remainingLevelers = unfinishedIds.filter(
      (creatureId) => !assignedLevelers.has(creatureId),
    )
    const remainingBoosters = [...boosterIds]

    function fillCreatures(remaining: string[], requirePositiveGain: boolean) {
      while (remaining.length > 0) {
        let bestFill: {
          expeditionId: string
          creatureId: string
          candidate: RunCandidate
          gain: number
        } | null = null

        for (const current of parties.values()) {
          const expedition = expeditionMap.get(current.expeditionId)
          if (!expedition || current.memberIds.length >= expedition.maxPartySize) continue

          for (const creatureId of remaining) {
            const candidate = buildBestCandidateForMembers(state, expedition, [
              ...current.memberIds,
              creatureId,
            ])
            if (!candidate) continue

            const gain = candidate.usefulXpPerSecond - current.usefulXpPerSecond
            if (requirePositiveGain && gain <= 0) continue
            if (
              !bestFill ||
              gain > bestFill.gain ||
              (gain === bestFill.gain && isBetterCandidate(candidate, bestFill.candidate, strategy))
            ) {
              bestFill = { expeditionId: expedition.id, creatureId, candidate, gain }
            }
            currentWaveVariantsEvaluated += 1
          }
          emitProgress(bestCompleteState)
        }

        if (!bestFill) break
        parties.set(bestFill.expeditionId, bestFill.candidate)
        remaining.splice(remaining.indexOf(bestFill.creatureId), 1)
      }
    }

    fillCreatures(remainingLevelers, false)
    fillCreatures(remainingBoosters, true)

    return [...parties.values()].toSorted((a, b) => a.expeditionId.localeCompare(b.expeditionId))
  }

  function buildBestCandidateForMembers(
    state: SearchState,
    expedition: Expedition,
    inputMemberIds: string[],
  ): RunCandidate | null {
    const orderedMemberIds = orderMembersForExpedition(state, expedition, inputMemberIds)
    const previousAssignment = state.expeditionAssignments[expedition.id]
    const cacheKey = hashCacheKey(
      expedition.id,
      orderedMemberIds,
      state.creatures,
      previousAssignment?.memberKey,
      previousAssignment?.tier ?? 0,
      state.expeditionLoops[expedition.id] ?? 0,
    )
    const cached = partyCandidateCache.get(cacheKey)
    if (cached !== undefined && cached.expeditionId === expedition.id) return cached.result

    let best: RunCandidate | null = null
    for (let tier = 1; tier <= 5; tier++) {
      const candidate = buildCandidate(state, expedition, tier, orderedMemberIds)
      if (!candidate) continue
      if (!best || isBetterCandidate(candidate, best, strategy)) best = candidate
    }

    partyCandidateCache.set(cacheKey, { expeditionId: expedition.id, result: best })
    return best
  }

  function buildCandidate(
    state: SearchState,
    expedition: Expedition,
    tier: number,
    inputMemberIds: string[],
  ): RunCandidate | null {
    const memberIds = orderMembersForExpedition(state, expedition, inputMemberIds)
    const assignmentKey = memberKey(memberIds)
    const previousAssignment = state.expeditionAssignments[expedition.id]
    const preservedLoopBonus =
      previousAssignment?.tier === tier && previousAssignment.memberKey === assignmentKey
    const hadExistingAssignment = previousAssignment !== null
    const loopCountStart = preservedLoopBonus ? (state.expeditionLoops[expedition.id] ?? 0) : 0
    const loopCountEnd = loopCountStart + 1

    const levelerIds = memberIds.filter(
      (creatureId) => !isCreatureFinished(state.creatures[creatureId]),
    )
    if (levelerIds.length === 0) return null

    const partyScore = memberIds.reduce((sum, creatureId) => {
      const progress = state.creatures[creatureId]
      if (!progress) return sum
      return sum + getCreatureRating(creatureId, expedition.id, progress.level)
    }, 0)

    const duration = calculateDuration(partyScore, expedition, tier)
    const xpPerCreature = calculateExpeditionXp(expedition, tier, loopCountStart, memberIds.length)
    if (duration <= 0 || xpPerCreature <= 0) return null

    let usefulXp = 0
    let completionCount = 0
    let priorityScore: number
    let usefulXpPerSecond: number

    if (strategy === 'hands-free') {
      // Hands-free: optimize for stable, long-running assignments
      // Use full XP rate (not capped at remaining) since we care about sustained throughput
      usefulXp = xpPerCreature * levelerIds.length
      usefulXpPerSecond = usefulXp / duration

      // How many runs before ANY creature finishes or hits a transition point
      // where its best expedition changes (and reassignment would improve quality)
      let minRunsBeforeSwap = Infinity
      for (const creatureId of levelerIds) {
        const progress = state.creatures[creatureId]
        const remaining = remainingXpToFinalTarget(progress)
        const runsToFinish = Math.ceil(remaining / xpPerCreature)
        if (runsToFinish < minRunsBeforeSwap) minRunsBeforeSwap = runsToFinish

        // Transition awareness: getLevelTransitions() is available for future
        // use to detect when a creature's best expedition changes at a level-up.
        // Tightening minRunsBeforeSwap at transitions was tested but proved
        // counterproductive — it tanks the amortized XP rate, leading to worse plans.
      }
      if (!Number.isFinite(minRunsBeforeSwap)) minRunsBeforeSwap = 1

      // Amortized XP rate: bake in a fixed swap overhead so short-lived assignments are penalized.
      // A party that sustains 50 runs barely notices the overhead; one that lasts 2 runs loses ~half its effective rate.
      const SWAP_OVERHEAD_SECONDS = strategy === 'hands-free' ? 720 : 300
      const sessionSeconds = duration * minRunsBeforeSwap
      const amortizedXpPerSecond =
        (xpPerCreature * levelerIds.length * minRunsBeforeSwap) /
        (sessionSeconds + SWAP_OVERHEAD_SECONDS)
      // Stability bonus: flat 20% boost for keeping the same party on the same expedition,
      // plus loop bonus. This rewards stability even at low loop counts.
      const preserveBonus = preservedLoopBonus
        ? amortizedXpPerSecond * 0.2 + getLoopXpBonus(loopCountStart) * 0.5
        : 0

      // Creature-level reassignment penalty: penalize pulling creatures from other expeditions.
      // The per-expedition reconfiguration penalty misses the case where a creature is FREE
      // (its old expedition completed) and gets assigned to a NEW expedition with no penalty.
      let reassignedCount = 0
      for (const cid of memberIds) {
        for (const [expId, asgn] of Object.entries(state.expeditionAssignments)) {
          if (expId === expedition.id || !asgn) continue
          if (asgn.memberIds.includes(cid)) {
            reassignedCount++
            break
          }
        }
      }
      const reassignmentPenalty =
        reassignedCount > 0 ? amortizedXpPerSecond * 0.25 * (reassignedCount / memberIds.length) : 0

      // Per-expedition reconfiguration penalty (party composition changed on this expedition)
      const reconfigPenalty =
        hadExistingAssignment && !preservedLoopBonus ? amortizedXpPerSecond * 0.25 : 0

      priorityScore = amortizedXpPerSecond + preserveBonus - reconfigPenalty - reassignmentPenalty
    } else {
      // Optimal: maximize XP efficiency per run
      for (const creatureId of levelerIds) {
        const remainingXp = remainingXpToCurrentTarget(state.creatures[creatureId])
        usefulXp += Math.min(xpPerCreature, remainingXp)
        if (remainingXp > 0 && xpPerCreature >= remainingXp) completionCount += 1
      }
      if (usefulXp <= 0) return null

      usefulXpPerSecond = usefulXp / duration
      const completionBonus = completionCount / Math.max(1, levelerIds.length)
      const preserveBonus = preservedLoopBonus ? getLoopXpBonus(loopCountStart) * 0.05 : 0
      priorityScore = usefulXpPerSecond / levelerIds.length + completionBonus + preserveBonus
    }

    return {
      expeditionId: expedition.id,
      tier,
      memberIds,
      memberKey: assignmentKey,
      levelerIds,
      duration,
      xpPerCreature,
      usefulXpPerSecond,
      priorityScore,
      loopCountStart,
      loopCountEnd,
      preservedLoopBonus,
      wasReconfigured: hadExistingAssignment && !preservedLoopBonus,
      biomeName: biomeMap.get(expedition.biome)?.name ?? expedition.biome,
      startMembers: memberIds.map((creatureId) => ({
        creatureId,
        fromLevel: state.creatures[creatureId].level,
        toLevel: state.creatures[creatureId].level,
        xpGained: 0,
        isBooster: isCreatureFinished(state.creatures[creatureId]),
      })),
    }
  }

  function orderMembersForExpedition(
    state: SearchState,
    expedition: Expedition,
    memberIds: string[],
  ): string[] {
    return [...memberIds].toSorted((aId, bId) => {
      const aBooster = isCreatureFinished(state.creatures[aId])
      const bBooster = isCreatureFinished(state.creatures[bId])
      if (aBooster !== bBooster) return aBooster ? 1 : -1

      const aRating = getCreatureRating(aId, expedition.id, state.creatures[aId].level)
      const bRating = getCreatureRating(bId, expedition.id, state.creatures[bId].level)
      if (bRating !== aRating) return bRating - aRating
      return aId.localeCompare(bId)
    })
  }

  function startWave(state: SearchState, candidates: RunCandidate[]): SearchState {
    const next = cloneState(state)

    for (const candidate of candidates) {
      next.totalRuns += 1
      next.expeditionLoops[candidate.expeditionId] = candidate.loopCountEnd
      next.expeditionAssignments[candidate.expeditionId] = {
        memberIds: [...candidate.memberIds],
        memberKey: candidate.memberKey,
        tier: candidate.tier,
      }
      next.activeRuns.push({
        expeditionId: candidate.expeditionId,
        tier: candidate.tier,
        memberIds: [...candidate.memberIds],
        levelerIds: [...candidate.levelerIds],
        startTime: next.clock,
        endTime: next.clock + candidate.duration,
        duration: candidate.duration,
        xpPerCreature: candidate.xpPerCreature,
        loopCountStart: candidate.loopCountStart,
        loopCountEnd: candidate.loopCountEnd,
        preservedLoopBonus: candidate.preservedLoopBonus,
        wasReconfigured: candidate.wasReconfigured,
        biomeName: candidate.biomeName,
        startMembers: candidate.startMembers.map((member) => ({ ...member })),
      })
    }

    next.activeRuns = next.activeRuns.toSorted((a, b) => {
      if (a.expeditionId !== b.expeditionId) return a.expeditionId.localeCompare(b.expeditionId)
      if (a.tier !== b.tier) return a.tier - b.tier
      return a.endTime - b.endTime
    })

    return next
  }

  function resolveNextDecisionState(state: SearchState): SearchState {
    if (state.activeRuns.length === 0) return state

    const next = cloneState(state)

    // In hands-free mode, auto-requeue stable parties instead of triggering a full
    // reassignment evaluation after every single run.  Only surface a real decision
    // point when a creature finishes leveling (or awakens) and the party must change.
    const MAX_AUTO_REQUEUE = 10_000
    let autoRequeueCount = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (next.activeRuns.length === 0) break

      const nextTime = Math.min(...next.activeRuns.map((run) => run.endTime))
      next.clock = nextTime

      const remainingRuns: ActiveRun[] = []
      const completedRuns: ActiveRun[] = []
      for (const run of next.activeRuns) {
        if (Math.abs(run.endTime - nextTime) < 0.01) {
          completedRuns.push(run)
        } else {
          remainingRuns.push(run)
        }
      }
      next.activeRuns = remainingRuns

      for (const run of completedRuns) {
        applyCompletedRun(next, run)
      }
      applyAwakenings(next)

      // In optimal mode (or if nothing completed), break immediately — one step per iteration
      if (strategy !== 'hands-free' || completedRuns.length === 0) break
      if (autoRequeueCount >= MAX_AUTO_REQUEUE) break

      // Try to auto-requeue each completed run with the same party
      const busyCreatureIds = new Set(next.activeRuns.flatMap((r) => r.memberIds))
      let anyRequeued = false

      for (const run of completedRuns) {
        // Check all levelers are still unfinished
        const levelerIds = run.levelerIds.filter((id) => !isCreatureFinished(next.creatures[id]))
        if (levelerIds.length === 0) continue

        // Check no member is already busy on another expedition
        if (run.memberIds.some((id) => busyCreatureIds.has(id))) continue

        const expedition = expeditionMap.get(run.expeditionId)
        if (!expedition) continue

        // Recompute with updated creature levels and loop count
        const orderedIds = orderMembersForExpedition(next, expedition, run.memberIds)
        const loopCountStart = next.expeditionLoops[run.expeditionId] ?? 0
        const loopCountEnd = loopCountStart + 1
        const partyScore = orderedIds.reduce((sum, cid) => {
          const progress = next.creatures[cid]
          if (!progress) return sum
          return sum + getCreatureRating(cid, expedition.id, progress.level)
        }, 0)
        const duration = calculateDuration(partyScore, expedition, run.tier)
        const xpPerCreature = calculateExpeditionXp(
          expedition,
          run.tier,
          loopCountStart,
          orderedIds.length,
        )
        if (duration <= 0 || xpPerCreature <= 0) continue

        // Start the continuation run
        next.totalRuns += 1
        next.expeditionLoops[run.expeditionId] = loopCountEnd
        next.activeRuns.push({
          expeditionId: run.expeditionId,
          tier: run.tier,
          memberIds: [...orderedIds],
          levelerIds,
          startTime: next.clock,
          endTime: next.clock + duration,
          duration,
          xpPerCreature,
          loopCountStart,
          loopCountEnd,
          preservedLoopBonus: true,
          wasReconfigured: false,
          biomeName: run.biomeName,
          startMembers: orderedIds.map((cid) => ({
            creatureId: cid,
            fromLevel: next.creatures[cid].level,
            toLevel: next.creatures[cid].level,
            xpGained: 0,
            isBooster: isCreatureFinished(next.creatures[cid]),
          })),
        })

        for (const id of orderedIds) busyCreatureIds.add(id)
        anyRequeued = true
        autoRequeueCount += 1
      }

      // If nothing was requeued, this is a real decision point — break out
      if (!anyRequeued) break
      // Otherwise loop to advance to the next completion time
    }

    return next
  }

  function applyCompletedRun(state: SearchState, run: ActiveRun) {
    const expedition = expeditionMap.get(run.expeditionId)
    if (!expedition) return

    const updatedMembers = run.startMembers.map((member) => {
      const progress = state.creatures[member.creatureId]
      if (!progress || member.isBooster) {
        return { ...member, toLevel: member.fromLevel, xpGained: 0 }
      }

      progress.xpInLevel += run.xpPerCreature
      while (progress.level < progress.targetLevel) {
        const xpNeeded = xpForLevel(progress.level + 1) - xpForLevel(progress.level)
        if (progress.xpInLevel < xpNeeded) break
        progress.xpInLevel -= xpNeeded
        progress.level += 1
      }

      return {
        ...member,
        toLevel: progress.level,
        xpGained: run.xpPerCreature,
      }
    })

    state.steps.push({
      expedition,
      tier: run.tier,
      party: updatedMembers,
      runs: 1,
      timeSeconds: run.duration,
      xpPerMinute:
        run.duration > 0 ? (run.levelerIds.length * run.xpPerCreature * 60) / run.duration : 0,
      biomeName: run.biomeName,
      loopCount: run.loopCountEnd,
      loopCountStart: run.loopCountStart,
      loopCountEnd: run.loopCountEnd,
      preservedLoopBonus: run.preservedLoopBonus,
      wasReconfigured: run.wasReconfigured,
      startTime: run.startTime,
      endTime: run.endTime,
    })

    for (const creatureId of run.levelerIds) {
      if (!trackedCreatureSet.has(creatureId)) continue
      state.creatureTime[creatureId] = (state.creatureTime[creatureId] ?? 0) + run.duration
      state.creatureRuns[creatureId] = (state.creatureRuns[creatureId] ?? 0) + 1
      if (!state.creatureExpeditions[creatureId].includes(expedition.id)) {
        state.creatureExpeditions[creatureId].push(expedition.id)
      }
    }
  }

  function applyAwakenings(state: SearchState) {
    for (const [creatureId, progress] of Object.entries(state.creatures)) {
      if (progress.awakened) continue
      if (progress.fullTargetLevel <= progress.targetLevel) continue
      if (progress.level < progress.targetLevel) continue

      progress.awakened = true
      progress.level = 1
      progress.xpInLevel = 0
      progress.targetLevel = progress.fullTargetLevel

      state.awakenEvents.push({ creatureId, clockTime: state.clock })
      state.steps.push({
        expedition: {} as Expedition,
        tier: 0,
        party: [
          {
            creatureId,
            fromLevel: 70,
            toLevel: 1,
            xpGained: 0,
            isBooster: false,
          },
        ],
        runs: 0,
        timeSeconds: 0,
        xpPerMinute: 0,
        biomeName: '',
        loopCount: 0,
        loopCountStart: 0,
        loopCountEnd: 0,
        preservedLoopBonus: false,
        wasReconfigured: false,
        startTime: state.clock,
        endTime: state.clock,
        isAwakeningStep: true,
      })
    }
  }

  function selectBeam(states: SearchState[], beamWidth: number = BEAM_WIDTH): SearchState[] {
    const deduped = new Map<string, SearchState>()

    for (const state of states) {
      const signature = stateSignature(state)
      const existing = deduped.get(signature)
      if (
        !existing ||
        state.rank < existing.rank ||
        (state.rank === existing.rank && state.clock < existing.clock)
      ) {
        deduped.set(signature, state)
      }
    }

    const ranked = [...deduped.values()].toSorted((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.clock - b.clock
    })

    // Reserve slots for diverse strategies to prevent beam corridor collapse
    const DIVERSITY_SLOTS = Math.min(8, Math.floor(beamWidth / 4))
    const RANK_SLOTS = beamWidth - DIVERSITY_SLOTS
    const topByRank = ranked.slice(0, RANK_SLOTS)
    const selected = new Set(topByRank)

    // Fill diversity slots with states that have different creature-level profiles
    const levelProfiles = new Map<string, SearchState>()
    for (const state of ranked) {
      if (selected.has(state)) continue
      const profile = orderedCreatureIds.map((id) => state.creatures[id].level).join(',')
      if (!levelProfiles.has(profile)) {
        levelProfiles.set(profile, state)
        if (levelProfiles.size >= DIVERSITY_SLOTS) break
      }
    }
    for (const state of levelProfiles.values()) {
      selected.add(state)
    }

    return [...selected]
      .toSorted((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        return a.clock - b.clock
      })
      .slice(0, beamWidth)
  }

  function stateSignature(state: SearchState): string {
    const creatureSig = orderedCreatureIds
      .map((creatureId) => {
        const progress = state.creatures[creatureId]
        // Bucket xpInLevel to improve deduplication — near-identical XP states are effectively equivalent
        const xpBucket = Math.floor(progress.xpInLevel / 100)
        return `${progress.level}:${xpBucket}:${progress.awakened ? 1 : 0}:${progress.targetLevel}:${progress.fullTargetLevel}`
      })
      .join('|')

    const activeSig = state.activeRuns
      .map(
        (run) =>
          `${run.expeditionId}:${run.tier}:${run.memberIds.join(',')}:${run.endTime}:${run.loopCountStart}:${run.loopCountEnd}`,
      )
      .join('|')

    const loopSig = orderedExpeditionIds
      .map((expeditionId) => `${expeditionId}:${state.expeditionLoops[expeditionId] ?? 0}`)
      .join('|')

    const assignmentSig = orderedExpeditionIds
      .map((expeditionId) => {
        const assignment = state.expeditionAssignments[expeditionId]
        if (!assignment) return `${expeditionId}:-`
        return `${expeditionId}:${assignment.tier}:${assignment.memberKey}`
      })
      .join('|')

    return `${state.clock}#${creatureSig}#${activeSig}#${loopSig}#${assignmentSig}`
  }

  function completeGreedily(start: SearchState): SearchState {
    let state = cloneState(start)
    let guard = 0

    while (!allTargetsComplete(state) && guard++ < MAX_GREEDY_EVENTS) {
      const variants = buildWaveVariants(state, null)
      const bestVariant = variants[0]
      if (!bestVariant) break

      state = startWave(state, bestVariant)
      if (state.activeRuns.length === 0) break
      state = resolveNextDecisionState(state)
    }

    return state
  }
}

function candidateKey(candidate: RunCandidate): string {
  return `${candidate.expeditionId}:${candidate.tier}:${candidate.memberKey}:${candidate.preservedLoopBonus ? 1 : 0}`
}

function memberKey(memberIds: string[]): string {
  return [...memberIds].toSorted().join(',')
}

function mergePartySteps(steps: PartyPlanStep[]): PartyPlanStep[] {
  if (steps.length === 0) return []

  const merged: PartyPlanStep[] = []
  const sorted = [...steps].toSorted((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))

  // Track last merged step per expedition lane for merging across interleaved parallel steps
  const laneLastStep = new Map<string, PartyPlanStep>()

  for (const step of sorted) {
    if (step.isAwakeningStep) {
      merged.push(deepCloneStep(step))
      // Clear lane entries involving the awakened creature so post-awakening
      // steps don't merge with pre-awakening steps
      const awakenedId = step.party[0]?.creatureId
      if (awakenedId) {
        for (const key of laneLastStep.keys()) {
          if (key.includes(awakenedId)) {
            laneLastStep.delete(key)
          }
        }
      }
      continue
    }

    const laneKey = `${step.expedition.id}:${step.tier}:${step.party.map((m) => m.creatureId).join(',')}`
    const previous = laneLastStep.get(laneKey)
    const canMerge =
      previous &&
      !previous.isAwakeningStep &&
      Math.abs((previous.endTime ?? 0) - (step.startTime ?? 0)) < 0.01

    if (canMerge && previous) {
      previous.runs += step.runs
      previous.timeSeconds += step.timeSeconds
      previous.loopCount = step.loopCount
      previous.loopCountEnd = step.loopCountEnd
      previous.endTime = step.endTime

      for (const member of step.party) {
        const existing = previous.party.find((entry) => entry.creatureId === member.creatureId)
        if (!existing) continue
        existing.toLevel = member.toLevel
        existing.xpGained += member.xpGained
      }

      const totalXp = previous.party.reduce((sum, member) => sum + member.xpGained, 0)
      previous.xpPerMinute = previous.timeSeconds > 0 ? (totalXp * 60) / previous.timeSeconds : 0
    } else {
      const cloned = deepCloneStep(step)
      merged.push(cloned)
      laneLastStep.set(laneKey, cloned)
    }
  }

  return merged
}

function deepCloneStep(step: PartyPlanStep): PartyPlanStep {
  return {
    ...step,
    party: step.party.map((member) => ({ ...member })),
  }
}
