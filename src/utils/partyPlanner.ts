import biomesData from '@/data/biomes.json'
import expeditionsData from '@/data/expeditions.json'
/**
 * Parallel party planner — event-driven simulation where multiple parties
 * run different expeditions simultaneously. Wall-clock time = max of
 * concurrent expedition durations, not sum.
 */
import type {
  Creature,
  Expedition,
  Biome,
  PartyPlanCreature,
  PartyPlanStep,
  CreatureLevelingSummary,
  PartyLevelingPlan,
  AwakenEvent,
} from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  xpForLevel,
  getBestExpeditionsForCreature,
  maxLevelForState,
} from '@/utils/formulas'
import { planLevelingPath } from '@/utils/levelPlanner'

const MAX_CANDIDATES_PER_CREATURE = 4
const MAX_LEVELERS_PER_EXPEDITION = 4
const MAX_BOOSTERS_PER_EXPEDITION = 2
const MAX_EVENTS = 5000

interface CreatureState {
  creatureId: string
  creature: Creature
  currentLevel: number
  targetLevel: number
  fullTargetLevel: number // the user's desired target (may be > pre-awaken cap)
  isBooster: boolean
  awakened: boolean
  currentXpInLevel: number
  idle: boolean // true if not currently assigned to a running party
}

interface ActiveParty {
  id: number
  expedition: Expedition
  biome: Biome | undefined
  tier: number
  members: CreatureState[]
  partySize: number
  loopKey: string
  // Batch simulation results
  runs: number
  timeSeconds: number
  totalXpGained: number
  completionTime: number // wall-clock time when this party finishes
  stepParty: PartyPlanStep['party']
}

interface PartyConfig {
  expedition: Expedition
  biome: Biome | undefined
  tier: number
  members: CreatureState[]
  duration: number
  xpPerRun: number
  throughput: number
}

export function planPartyLevelingPath(inputs: PartyPlanCreature[]): PartyLevelingPlan {
  const levelers = inputs.filter((i) => !i.isBooster && i.startLevel < i.targetLevel)
  if (levelers.length === 0) {
    return { steps: [], summaries: [], awakenEvents: [], totalTimeSeconds: 0, totalRuns: 0 }
  }
  if (levelers.length === 1 && inputs.filter((i) => i.isBooster).length === 0) {
    return singleCreatureFallback(levelers[0])
  }

  const expeditions = expeditionsData as Expedition[]
  const biomes = biomesData as Biome[]
  const biomeMap = new Map(biomes.map((b) => [b.id, b]))

  // Initialize creature states
  const states: Map<string, CreatureState> = new Map()
  for (const input of inputs) {
    const max = maxLevelForState(input.awakened)
    const intermediateTarget = input.isBooster ? max : Math.min(input.targetLevel, max)
    states.set(input.creature.id, {
      creatureId: input.creature.id,
      creature: input.creature,
      currentLevel: input.isBooster ? max : input.startLevel,
      targetLevel: intermediateTarget,
      fullTargetLevel: input.isBooster ? max : input.targetLevel,
      isBooster: input.isBooster,
      awakened: input.awakened,
      currentXpInLevel: 0,
      idle: true,
    })
  }

  const steps: PartyPlanStep[] = []
  const awakenEvents: AwakenEvent[] = []
  const loopCounts: Map<string, number> = new Map()
  let totalRuns = 0

  // Per-creature tracking for summaries
  const creatureTime: Map<string, number> = new Map()
  const creatureRuns: Map<string, number> = new Map()
  const creatureExpeditions: Map<string, Set<string>> = new Map()
  for (const input of levelers) {
    creatureTime.set(input.creature.id, 0)
    creatureRuns.set(input.creature.id, 0)
    creatureExpeditions.set(input.creature.id, new Set())
  }

  // Pre-compute candidate expeditions per creature
  const candidateExpeditions: Map<string, Set<string>> = new Map()
  for (const input of inputs) {
    const best = getBestExpeditionsForCreature(input.creature, MAX_CANDIDATES_PER_CREATURE)
    candidateExpeditions.set(input.creature.id, new Set(best.map((b) => b.expedition.id)))
  }

  const allCandidateExpIds = new Set<string>()
  for (const ids of candidateExpeditions.values()) {
    for (const id of ids) allCandidateExpIds.add(id)
  }

  const candidateExpeditionsWithBiome = expeditions
    .filter((exp) => allCandidateExpIds.has(exp.id))
    .map((exp) => ({ expedition: exp, biome: biomeMap.get(exp.biome) }))

  // === Event-driven parallel simulation ===
  let clock = 0
  const activeParties: Map<number, ActiveParty> = new Map()
  let nextPartyId = 0

  // Initial assignment: form parties from all idle creatures
  assignIdleCreatures()

  const hasUnfinishedLevelers = () =>
    [...states.values()].some((s) => !s.isBooster && s.currentLevel < s.targetLevel)

  let eventCount = 0
  while ((activeParties.size > 0 || hasUnfinishedLevelers()) && eventCount++ < MAX_EVENTS) {
    // If no active parties but creatures still need leveling (e.g. post-awaken),
    // try to form new parties before giving up
    if (activeParties.size === 0) {
      assignIdleCreatures()
      if (activeParties.size === 0) break // truly stuck
      continue
    }
    // Find the earliest completing party
    let earliest: ActiveParty | null = null
    for (const party of activeParties.values()) {
      if (!earliest || party.completionTime < earliest.completionTime) {
        earliest = party
      }
    }
    if (!earliest) break

    // Advance clock
    clock = earliest.completionTime

    // Collect all parties completing at this time (or very close)
    const completing: ActiveParty[] = []
    for (const party of activeParties.values()) {
      if (Math.abs(party.completionTime - clock) < 0.01) {
        completing.push(party)
      }
    }

    // Process completed parties
    for (const party of completing) {
      activeParties.delete(party.id)

      // Record step
      steps.push({
        expedition: party.expedition,
        tier: party.tier,
        party: party.stepParty,
        runs: party.runs,
        timeSeconds: party.timeSeconds,
        xpPerMinute: party.timeSeconds > 0 ? (party.totalXpGained / party.timeSeconds) * 60 : 0,
        biomeName: party.biome?.name ?? party.expedition.biome,
        loopCount: loopCounts.get(party.loopKey) ?? 0,
        startTime: clock - party.timeSeconds,
      })

      totalRuns += party.runs

      // Update per-creature tracking
      for (const entry of party.stepParty) {
        creatureTime.set(
          entry.creatureId,
          (creatureTime.get(entry.creatureId) ?? 0) + party.timeSeconds,
        )
        creatureRuns.set(entry.creatureId, (creatureRuns.get(entry.creatureId) ?? 0) + party.runs)
        creatureExpeditions.get(entry.creatureId)?.add(party.expedition.id)
      }

      // Release members
      for (const member of party.members) {
        member.idle = true
      }
    }

    // Check for creatures that reached their pre-awaken cap and need awakening
    for (const state of states.values()) {
      if (
        !state.awakened &&
        !state.isBooster &&
        state.currentLevel >= state.targetLevel &&
        state.fullTargetLevel > state.targetLevel
      ) {
        // Awaken: reset to level 1, raise cap to 120
        state.awakened = true
        state.currentLevel = 1
        state.currentXpInLevel = 0
        state.targetLevel = state.fullTargetLevel
        state.isBooster = false
        awakenEvents.push({ creatureId: state.creatureId, clockTime: clock })

        // Refresh candidate expeditions for the awakened creature (level 1 may suit different expeditions)
        const best = getBestExpeditionsForCreature(state.creature, MAX_CANDIDATES_PER_CREATURE)
        const newCandIds = new Set(best.map((b) => b.expedition.id))
        candidateExpeditions.set(state.creatureId, newCandIds)
        for (const id of newCandIds) {
          if (!allCandidateExpIds.has(id)) {
            allCandidateExpIds.add(id)
            const exp = expeditions.find((e) => e.id === id)
            if (exp) {
              candidateExpeditionsWithBiome.push({
                expedition: exp,
                biome: biomeMap.get(exp.biome),
              })
            }
          }
        }

        // Ensure tracking exists for creatures that may not have been levelers initially
        if (!creatureTime.has(state.creatureId)) creatureTime.set(state.creatureId, 0)
        if (!creatureRuns.has(state.creatureId)) creatureRuns.set(state.creatureId, 0)
        if (!creatureExpeditions.has(state.creatureId))
          creatureExpeditions.set(state.creatureId, new Set())
      }
    }

    // Reassign all idle creatures to new parties
    assignIdleCreatures()
  }

  const mergedSteps = mergePartySteps(steps)

  // Insert awakening marker steps just before the creature's next post-awaken expedition
  for (const event of awakenEvents) {
    // Find the first step after awakening that includes this creature (fromLevel === 1)
    const nextStep = mergedSteps.find(
      (s) =>
        (s.startTime ?? 0) >= event.clockTime &&
        !s.isAwakeningStep &&
        s.party.some((p) => p.creatureId === event.creatureId && p.fromLevel === 1),
    )
    const insertTime = nextStep ? (nextStep.startTime ?? event.clockTime) : event.clockTime

    mergedSteps.push({
      expedition: {} as Expedition,
      tier: 0,
      party: [
        {
          creatureId: event.creatureId,
          fromLevel: 70,
          toLevel: 1,
          xpGained: 0,
        },
      ],
      runs: 0,
      timeSeconds: 0,
      xpPerMinute: 0,
      biomeName: '',
      loopCount: 0,
      startTime: insertTime - 0.001,
      isAwakeningStep: true,
    })
  }

  // Re-sort so awakening steps appear at the correct position
  mergedSteps.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))

  const summaries: CreatureLevelingSummary[] = levelers.map((input) => ({
    creatureId: input.creature.id,
    startLevel: input.startLevel,
    endLevel: states.get(input.creature.id)?.currentLevel ?? input.startLevel,
    totalTimeSeconds: creatureTime.get(input.creature.id) ?? 0,
    totalRuns: creatureRuns.get(input.creature.id) ?? 0,
    expeditionsUsed: [...(creatureExpeditions.get(input.creature.id) ?? [])],
  }))

  return {
    steps: mergedSteps,
    summaries,
    awakenEvents,
    totalTimeSeconds: clock,
    totalRuns,
  }

  // === Helper: greedily assign idle creatures to concurrent parties ===
  function assignIdleCreatures() {
    // Track which expeditions are already being used by active parties
    const usedExpeditions = new Set<string>()
    for (const party of activeParties.values()) {
      usedExpeditions.add(party.expedition.id)
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idleLevelers = [...states.values()].filter(
        (s) => s.idle && !s.isBooster && s.currentLevel < s.targetLevel,
      )
      if (idleLevelers.length === 0) break

      const idleBoosters = [...states.values()].filter((s) => s.idle && s.isBooster)

      // Find best party config from idle creatures, excluding already-used expeditions
      let bestConfig: PartyConfig | null = null

      for (const { expedition, biome } of candidateExpeditionsWithBiome) {
        // Skip expeditions that already have a running party
        if (usedExpeditions.has(expedition.id)) continue

        const relevantLevelers = idleLevelers.filter((s) =>
          candidateExpeditions.get(s.creatureId)?.has(expedition.id),
        )
        if (relevantLevelers.length === 0) continue

        const topLevelers = relevantLevelers
          .map((s) => ({
            state: s,
            rating: calculateCreatureRating(s.creature, expedition, s.currentLevel, biome),
          }))
          .toSorted((a, b) => b.rating - a.rating)
          .slice(0, MAX_LEVELERS_PER_EXPEDITION)
          .map((x) => x.state)

        const topBoosters = idleBoosters
          .map((s) => ({
            state: s,
            rating: calculateCreatureRating(s.creature, expedition, s.currentLevel, biome),
          }))
          .toSorted((a, b) => b.rating - a.rating)
          .slice(0, MAX_BOOSTERS_PER_EXPEDITION)
          .map((x) => x.state)

        const tiersToTry = selectTiers(expedition)
        for (const tier of tiersToTry) {
          const loopKey = `${expedition.id}:${tier}`
          const loopCount = loopCounts.get(loopKey) ?? 0
          const maxParty = Math.min(expedition.maxPartySize, 3)
          const combos = generatePartyCombos(topLevelers, topBoosters, maxParty)

          for (const members of combos) {
            const config = evaluatePartyConfig(members, expedition, biome, tier, loopCount)
            if (config && (!bestConfig || config.throughput > bestConfig.throughput)) {
              bestConfig = config
            }
          }
        }
      }

      if (!bestConfig) break

      // Commit this party: simulate batch and schedule
      const party = createActiveParty(bestConfig)
      if (!party) break

      activeParties.set(party.id, party)
      usedExpeditions.add(party.expedition.id)

      // Mark members as busy
      for (const member of party.members) {
        member.idle = false
      }
    }

    // === Placement pass: for each idle creature, evaluate solo expedition vs joining a party ===
    // Pick whichever yields better throughput. Even a bad expedition beats 0 XP from idling.
    const remainingIdle = [...states.values()].filter(
      (s) => s.idle && !s.isBooster && s.currentLevel < s.targetLevel,
    )

    for (const idle of remainingIdle) {
      // Option A: best solo config on any unused expedition
      let bestSoloConfig: PartyConfig | null = null
      for (const exp of expeditions) {
        if (usedExpeditions.has(exp.id)) continue
        const biome = biomeMap.get(exp.biome)
        const tiersToTry = selectTiers(exp)
        for (const tier of tiersToTry) {
          const loopKey = `${exp.id}:${tier}`
          const loopCount = loopCounts.get(loopKey) ?? 0
          const config = evaluatePartyConfig([idle], exp, biome, tier, loopCount)
          if (config && (!bestSoloConfig || config.throughput > bestSoloConfig.throughput)) {
            bestSoloConfig = config
          }
        }
      }

      // Option B: best join into an existing party with open slots
      let bestJoinPartyId: number | null = null
      let bestJoinThroughput = 0
      for (const [partyId, party] of activeParties) {
        const maxParty = Math.min(party.expedition.maxPartySize, 3)
        if (party.members.length >= maxParty) continue

        const biome = biomeMap.get(party.expedition.biome)
        const newSize = party.members.length + 1
        const xpPerRun = calculateExpeditionXp(party.expedition, party.tier, 0, newSize)
        const newPartyScore =
          party.members.reduce((sum, m) => {
            return (
              sum + calculateCreatureRating(m.creature, party.expedition, m.currentLevel, biome)
            )
          }, 0) + calculateCreatureRating(idle.creature, party.expedition, idle.currentLevel, biome)
        const duration = calculateDuration(newPartyScore, party.expedition, party.tier)
        if (duration <= 0 || xpPerRun <= 0) continue

        // Throughput for the idle creature joining this party
        const throughput = xpPerRun / duration
        if (throughput > bestJoinThroughput) {
          bestJoinThroughput = throughput
          bestJoinPartyId = partyId
        }
      }

      // Compare: solo throughput vs join throughput
      const soloThroughput = bestSoloConfig?.throughput ?? 0
      const shouldJoin = bestJoinPartyId !== null && bestJoinThroughput > soloThroughput

      if (shouldJoin && bestJoinPartyId !== null) {
        // Join existing party: rollback, reform with idle creature, re-simulate
        const party = activeParties.get(bestJoinPartyId)!
        activeParties.delete(bestJoinPartyId)

        // Undo member level mutations from the old simulation
        for (const entry of party.stepParty) {
          const state = states.get(entry.creatureId)
          if (state) {
            state.currentLevel = entry.fromLevel
            state.currentXpInLevel = 0
          }
        }

        // Roll back loop count
        const loopKey = party.loopKey
        const prevLoopCount = loopCounts.get(loopKey) ?? 0
        loopCounts.set(loopKey, Math.max(0, prevLoopCount - party.runs))

        // Reform party with idle creature
        const allMembers = [...party.members, idle]
        const biome = biomeMap.get(party.expedition.biome)
        const loopCount = loopCounts.get(loopKey) ?? 0
        const config = evaluatePartyConfig(
          allMembers,
          party.expedition,
          biome,
          party.tier,
          loopCount,
        )

        if (config) {
          const newParty = createActiveParty(config)
          if (newParty) {
            activeParties.set(newParty.id, newParty)
            idle.idle = false
            for (const member of party.members) member.idle = false
            continue
          }
        }

        // Reform failed — restore original party
        const biomeRestore = biomeMap.get(party.expedition.biome)
        const loopCountRestore = loopCounts.get(loopKey) ?? 0
        const originalConfig = evaluatePartyConfig(
          party.members,
          party.expedition,
          biomeRestore,
          party.tier,
          loopCountRestore,
        )
        if (originalConfig) {
          const restored = createActiveParty(originalConfig)
          if (restored) {
            activeParties.set(restored.id, restored)
            for (const member of party.members) member.idle = false
          }
        }
      } else if (bestSoloConfig) {
        // Solo on unused expedition
        const party = createActiveParty(bestSoloConfig)
        if (party) {
          activeParties.set(party.id, party)
          usedExpeditions.add(party.expedition.id)
          idle.idle = false
        }
      }
    }
  }

  function createActiveParty(config: PartyConfig): ActiveParty | null {
    const { expedition, biome, tier, members } = config
    const loopKey = `${expedition.id}:${tier}`
    let loopCount = loopCounts.get(loopKey) ?? 0
    const partySize = members.length

    const stepParty: PartyPlanStep['party'] = members
      .filter((m) => !m.isBooster)
      .map((m) => ({
        creatureId: m.creatureId,
        fromLevel: m.currentLevel,
        toLevel: m.currentLevel,
        xpGained: 0,
      }))

    let stepRuns = 0
    let stepTime = 0
    let stepTotalXp = 0

    const MAX_BATCH_ITERATIONS = 200
    let batchIter = 0

    while (batchIter++ < MAX_BATCH_ITERATIONS) {
      const xpPerRun = calculateExpeditionXp(expedition, tier, loopCount, partySize)
      if (xpPerRun <= 0) break

      const partyScore = members.reduce((sum, m) => {
        return sum + calculateCreatureRating(m.creature, expedition, m.currentLevel, biome)
      }, 0)
      const duration = calculateDuration(partyScore, expedition, tier)
      if (duration <= 0) break

      let minRunsToLevel = Infinity
      for (const member of members) {
        if (member.isBooster) continue
        if (member.currentLevel >= member.targetLevel) {
          minRunsToLevel = 0
          break
        }
        const xpNeeded =
          xpForLevel(member.currentLevel + 1) -
          xpForLevel(member.currentLevel) -
          member.currentXpInLevel
        const runsNeeded = Math.ceil(xpNeeded / xpPerRun)
        minRunsToLevel = Math.min(minRunsToLevel, runsNeeded)
      }

      if (minRunsToLevel <= 0) break
      const batchRuns = Math.min(minRunsToLevel, 500)

      stepRuns += batchRuns
      stepTime += batchRuns * duration
      loopCount += batchRuns

      let anyGraduated = false
      for (const member of members) {
        if (member.isBooster) continue

        const totalXpGained = batchRuns * xpPerRun
        member.currentXpInLevel += totalXpGained
        const partyEntry = stepParty.find((p) => p.creatureId === member.creatureId)
        if (partyEntry) partyEntry.xpGained += totalXpGained

        while (member.currentLevel < member.targetLevel) {
          const xpNeeded = xpForLevel(member.currentLevel + 1) - xpForLevel(member.currentLevel)
          if (member.currentXpInLevel >= xpNeeded) {
            member.currentXpInLevel -= xpNeeded
            member.currentLevel++
            if (partyEntry) partyEntry.toLevel = member.currentLevel
            stepTotalXp += xpNeeded
          } else {
            break
          }
        }

        if (member.currentLevel >= member.targetLevel) {
          anyGraduated = true
        }
      }

      if (anyGraduated) break

      // Check if any member would be significantly better off on a DIFFERENT expedition.
      // This mirrors the single planner's per-level expedition re-evaluation.
      // Only triggers when the best expedition is actually different from the current one,
      // and uses the same tier/loop context for a fair comparison.
      const currentXpPerSec = xpPerRun / duration
      let shouldReassign = false
      for (const member of members) {
        if (member.isBooster || member.currentLevel >= member.targetLevel) continue
        const best = getBestExpeditionsForCreature(member.creature, 1)
        if (best.length === 0) continue
        const bestExp = best[0].expedition
        // Skip if the best expedition is the one we're already running
        if (bestExp.id === expedition.id) continue
        const bestBiome = biomeMap.get(bestExp.biome)
        const bestRating = calculateCreatureRating(
          member.creature,
          bestExp,
          member.currentLevel,
          bestBiome,
        )
        const bestDuration = calculateDuration(bestRating, bestExp, tier)
        const bestXpPerRun = calculateExpeditionXp(bestExp, tier, 0, 1)
        if (bestDuration <= 0 || bestXpPerRun <= 0) continue
        const bestXpPerSec = bestXpPerRun / bestDuration
        // Only break if >15% improvement (matches single planner's SWITCH_THRESHOLD)
        if (bestXpPerSec / currentXpPerSec - 1 > 0.15) {
          shouldReassign = true
          break
        }
      }
      if (shouldReassign) break
    }

    if (stepRuns === 0) return null

    loopCounts.set(loopKey, loopCount)

    for (const partyEntry of stepParty) {
      const state = states.get(partyEntry.creatureId)
      if (state) partyEntry.toLevel = state.currentLevel
    }

    return {
      id: nextPartyId++,
      expedition,
      biome,
      tier,
      members,
      partySize,
      loopKey,
      runs: stepRuns,
      timeSeconds: stepTime,
      totalXpGained: stepTotalXp,
      completionTime: clock + stepTime,
      stepParty,
    }
  }
}

function selectTiers(expedition: Expedition): number[] {
  const tiers = [1, 5]
  if (expedition.maxPartySize >= 3) tiers.push(3)
  return tiers
}

function singleCreatureFallback(input: PartyPlanCreature): PartyLevelingPlan {
  const plan = planLevelingPath({
    creature: input.creature,
    startLevel: input.startLevel,
    targetLevel: input.targetLevel,
    isAwakened: input.awakened,
  })

  const steps: PartyPlanStep[] = plan.steps.map((step) => ({
    expedition: step.expedition,
    tier: step.tier,
    party: [
      {
        creatureId: input.creature.id,
        fromLevel: step.fromLevel,
        toLevel: step.toLevel,
        xpGained: step.runs * step.xpPerRun,
      },
    ],
    runs: step.runs,
    timeSeconds: step.timeSeconds,
    xpPerMinute: step.xpPerMinute,
    biomeName: step.biomeName,
    loopCount: 0,
  }))

  return {
    steps,
    summaries: [
      {
        creatureId: input.creature.id,
        startLevel: input.startLevel,
        endLevel: input.targetLevel,
        totalTimeSeconds: plan.totalTimeSeconds,
        totalRuns: plan.totalRuns,
        expeditionsUsed: [...new Set(plan.steps.map((s) => s.expedition.id))],
      },
    ],
    awakenEvents: [],
    totalTimeSeconds: plan.totalTimeSeconds,
    totalRuns: plan.totalRuns,
  }
}

function generatePartyCombos(
  levelers: CreatureState[],
  boosters: CreatureState[],
  maxSize: number,
): CreatureState[][] {
  const combos: CreatureState[][] = []
  const maxLevelers = Math.min(levelers.length, maxSize)

  for (let size = 1; size <= maxLevelers; size++) {
    for (const levelerCombo of combinations(levelers, size)) {
      const remaining = maxSize - size
      combos.push(levelerCombo)
      if (remaining > 0 && boosters.length > 0) {
        const maxBoosters = Math.min(boosters.length, remaining)
        for (let bSize = 1; bSize <= maxBoosters; bSize++) {
          for (const boosterCombo of combinations(boosters, bSize)) {
            combos.push([...levelerCombo, ...boosterCombo])
          }
        }
      }
    }
  }
  return combos
}

function* combinations<T>(arr: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  if (size > arr.length) return
  for (let i = 0; i <= arr.length - size; i++) {
    for (const rest of combinations(arr.slice(i + 1), size - 1)) {
      yield [arr[i], ...rest]
    }
  }
}

function evaluatePartyConfig(
  members: CreatureState[],
  expedition: Expedition,
  biome: Biome | undefined,
  tier: number,
  loopCount: number,
): PartyConfig | null {
  const partySize = members.length
  if (partySize === 0) return null

  const partyScore = members.reduce((sum, m) => {
    return sum + calculateCreatureRating(m.creature, expedition, m.currentLevel, biome)
  }, 0)

  const duration = calculateDuration(partyScore, expedition, tier)
  const xpPerRun = calculateExpeditionXp(expedition, tier, loopCount, partySize)
  if (xpPerRun <= 0 || duration <= 0) return null

  let throughput = 0
  const activeLevelers = members.filter((m) => !m.isBooster && m.currentLevel < m.targetLevel)
  if (activeLevelers.length === 0) return null

  for (const member of activeLevelers) {
    const xpRemaining =
      xpForLevel(member.targetLevel) - xpForLevel(member.currentLevel) - member.currentXpInLevel
    if (xpRemaining > 0) {
      throughput += xpPerRun / xpRemaining
    }
  }
  throughput /= duration

  const boosterCount = members.filter((m) => m.isBooster).length
  if (boosterCount > 0) {
    const withoutBoosters = members.filter((m) => !m.isBooster)
    const scoreWithout = withoutBoosters.reduce((sum, m) => {
      return sum + calculateCreatureRating(m.creature, expedition, m.currentLevel, biome)
    }, 0)
    const durationWithout = calculateDuration(scoreWithout, expedition, tier)
    const xpWithout = calculateExpeditionXp(expedition, tier, loopCount, withoutBoosters.length)

    if (xpWithout > 0 && durationWithout > 0) {
      let throughputWithout = 0
      for (const member of withoutBoosters.filter((m) => m.currentLevel < m.targetLevel)) {
        const xpRemaining =
          xpForLevel(member.targetLevel) - xpForLevel(member.currentLevel) - member.currentXpInLevel
        if (xpRemaining > 0) {
          throughputWithout += xpWithout / xpRemaining
        }
      }
      throughputWithout /= durationWithout
      if (throughputWithout >= throughput) return null
    }
  }

  return { expedition, biome, tier, members, duration, xpPerRun, throughput }
}

function stepGroupKey(s: PartyPlanStep) {
  const ids = s.party
    .map((p) => p.creatureId)
    .toSorted()
    .join(',')
  return `${s.expedition.id}:${s.tier}:${ids}`
}

function mergePartySteps(steps: PartyPlanStep[]): PartyPlanStep[] {
  if (steps.length === 0) return []

  const groups = new Map<string, PartyPlanStep>()
  const groupOrder: string[] = []

  // Sort by start time so the earliest occurrence defines group order
  const sorted = [...steps].toSorted((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))

  for (const step of sorted) {
    const key = stepGroupKey(step)
    const existing = groups.get(key)

    if (existing) {
      existing.runs += step.runs
      existing.timeSeconds += step.timeSeconds
      existing.loopCount = step.loopCount
      for (const member of step.party) {
        const entry = existing.party.find((p) => p.creatureId === member.creatureId)
        if (entry) {
          entry.toLevel = member.toLevel
          entry.xpGained += member.xpGained
        }
      }
      const totalXp = existing.party.reduce((sum, p) => sum + p.xpGained, 0)
      existing.xpPerMinute = existing.timeSeconds > 0 ? (totalXp / existing.timeSeconds) * 60 : 0
    } else {
      const cloned = deepCloneStep(step)
      groups.set(key, cloned)
      groupOrder.push(key)
    }
  }

  return groupOrder.map((key) => groups.get(key)!)
}

function deepCloneStep(step: PartyPlanStep): PartyPlanStep {
  return { ...step, party: step.party.map((p) => ({ ...p })) }
}
