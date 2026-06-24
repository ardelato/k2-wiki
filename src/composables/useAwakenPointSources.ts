import { computed, type Ref } from 'vue'

import { itemById } from '@/data/indexes'
import jobsData from '@/data/jobs.json'
import type { Creature } from '@/types'
import { PRE_AWAKEN_MAX } from '@/utils/formulas'

/** Max awaken-candidate creatures surfaced in owned/summon lists. */
const MAX_AWAKEN_CANDIDATES = 4

/** An owned creature that could be awakened (→ +1 Awaken Point, unlocks Sanctuary use). */
export interface AwakenOwnedCandidate {
  id: string
  name: string
  /** This creature's job score for the planned skill (its Sanctuary value here). */
  contribution: number
  level: number
  /** At/above the awaken level requirement, so it can be awakened right now. */
  ready: boolean
}

/** One summon ingredient the player is short on, with how much is still needed. */
export interface SummonShortfall {
  id: string
  name: string
  need: number
  have: number
  short: number
}

/** An unsummoned creature worth summoning then awakening for the point. */
export interface AwakenSummonCandidate {
  id: string
  name: string
  contribution: number
  tier: number
  /** Distinct summon ingredients the player is still short on (0 = can summon now). */
  missingTypes: number
  /** Each missing ingredient with its shortfall, for the cost popover. */
  missing: SummonShortfall[]
  affordable: boolean
  /** Every missing ingredient is obtainable at the player's current skill levels. */
  reachable: boolean
  /** When not reachable, the binding gate — the skill + level you still need. */
  blockSkill?: string
  blockLevel?: number
}

/** Ways to earn the Awaken Point an awaken node needs, prioritized cheapest-first. */
export interface AwakenPointSources {
  /** Creatures you own but haven't awakened — awaken one to earn the point. */
  owned: AwakenOwnedCandidate[]
  /** Otherwise, the closest creatures to summon then awaken. */
  summon: AwakenSummonCandidate[]
}

/**
 * Cheapest gathering gate for each item: the skill + lowest activity level that
 * drops it. (An item dropped by several activities is gatherable as soon as you
 * clear the easiest one.) E.g. Volcanic Rock → Digging 80 via the Ember Pits node.
 */
const gatheredItemGate = new Map<string, { skill: string; level: number }>()
for (const job of jobsData) {
  if (job.type !== 'skilling' || !Array.isArray(job.activities)) continue
  for (const a of job.activities) {
    for (const out of a.output ?? []) {
      const cur = gatheredItemGate.get(out.id)
      if (!cur || a.levelRequirement < cur.level)
        gatheredItemGate.set(out.id, { skill: job.id, level: a.levelRequirement })
    }
  }
}

/** Max skill level required, per skill, anywhere in an item's acquisition chain. */
type SkillGate = Record<string, number>
const itemGateMemo = new Map<string, SkillGate>()
const mergeGate = (a: SkillGate, b: SkillGate): SkillGate => {
  const out: SkillGate = { ...a }
  for (const [skill, level] of Object.entries(b)) out[skill] = Math.max(out[skill] ?? 0, level)
  return out
}
const gateBinding = (g: SkillGate) => Math.max(0, ...Object.values(g))

/**
 * The skill-level gate to obtain one unit of an item by its easiest method — gather
 * it, or craft it (workstation level + its ingredients' own gates, recursively). You
 * only need ONE method, so we keep the lowest-gated. Items with no known source
 * (e.g. shop-only charms) return an empty gate and never block a candidate.
 */
function resolveItemGate(id: string, stack = new Set<string>()): SkillGate {
  const memo = itemGateMemo.get(id)
  if (memo) return memo
  if (stack.has(id)) return {} // defensive: recipe cycles shouldn't exist
  stack.add(id)
  const methods: SkillGate[] = []
  const gathered = gatheredItemGate.get(id)
  if (gathered) methods.push({ [gathered.skill]: gathered.level })
  for (const recipe of itemById.get(id)?.recipes ?? []) {
    let gate: SkillGate = recipe.workstation
      ? { [recipe.workstation]: recipe.levelRequirement }
      : {}
    for (const ing of recipe.ingredients ?? [])
      gate = mergeGate(gate, resolveItemGate(ing.id, stack))
    methods.push(gate)
  }
  stack.delete(id)
  const chosen =
    methods.length === 0
      ? {}
      : methods.reduce((best, m) => (gateBinding(m) < gateBinding(best) ? m : best))
  itemGateMemo.set(id, chosen)
  return chosen
}

interface AwakenPointSourceDeps {
  skillId: Ref<string>
  creatures: Ref<Creature[]>
  skillLevels: Ref<Record<string, number>>
  inventoryAmounts: Ref<Record<string, number>>
  isOwned: (id: string) => boolean
  isAwakened: (id: string) => boolean
  getLevel: (id: string) => number
}

/**
 * How to earn the Awaken Point an awaken node needs, prioritized cheapest-first
 * (see recovered-source: awakening a creature grants exactly 1 point and is the
 * only way it becomes Sanctuary-usable, so candidates are ranked by their value
 * for *this* skill). Built once and shared by every awaken advisory.
 */
export function useAwakenPointSources(deps: AwakenPointSourceDeps) {
  const { skillId, creatures, skillLevels, inventoryAmounts, isOwned, isAwakened, getLevel } = deps

  const awakenPointSources = computed<AwakenPointSources>(() => {
    const skillKey = skillId.value.toLowerCase()
    const creatureJobScore = (creature: { jobs?: Record<string, number> }) =>
      creature.jobs?.[skillKey] ?? 0
    const relevant = creatures.value.filter((c) => creatureJobScore(c) > 0)

    const owned = relevant
      .filter((c) => isOwned(c.id) && !isAwakened(c.id))
      .map((c) => {
        const level = getLevel(c.id)
        return {
          id: c.id,
          name: c.name,
          contribution: creatureJobScore(c),
          level,
          ready: level >= PRE_AWAKEN_MAX,
        }
      })
      // Awaken-ready first, then the most valuable for this skill's Sanctuary party.
      .toSorted((a, b) => Number(b.ready) - Number(a.ready) || b.contribution - a.contribution)
      .slice(0, MAX_AWAKEN_CANDIDATES)

    const liveSkillLevel = (skill: string) => skillLevels.value[skill] ?? 1
    const summon = relevant
      .filter((c) => !isOwned(c.id))
      .map((c) => {
        const missing: SummonShortfall[] = c.summoningCost
          .map((ing) => {
            const have = inventoryAmounts.value[ing.id] ?? 0
            return {
              id: ing.id,
              name: itemById.get(ing.id)?.name ?? ing.id,
              need: ing.amount,
              have,
              short: ing.amount - have,
            }
          })
          .filter((m) => m.short > 0)
          .toSorted((a, b) => b.short - a.short)
        // Merge the gate of every missing ingredient, then find the highest tier
        // you haven't reached — that's what actually blocks the summon.
        let gate: SkillGate = {}
        for (const m of missing) gate = mergeGate(gate, resolveItemGate(m.id))
        const unmet = Object.entries(gate).filter(([skill, level]) => liveSkillLevel(skill) < level)
        const blocker = unmet.reduce<[string, number] | null>(
          (worst, g) => (!worst || g[1] > worst[1] ? g : worst),
          null,
        )
        return {
          id: c.id,
          name: c.name,
          contribution: creatureJobScore(c),
          tier: c.tier,
          missingTypes: missing.length,
          missing,
          affordable: missing.length === 0,
          reachable: blocker === null,
          blockSkill: blocker?.[0],
          blockLevel: blocker?.[1],
        }
      })
      // Summonable now first, then reachable (gatherable) before level-gated ones,
      // then fewest missing mats, best-for-skill, and cheapest tier.
      .toSorted(
        (a, b) =>
          Number(b.affordable) - Number(a.affordable) ||
          Number(b.reachable) - Number(a.reachable) ||
          a.missingTypes - b.missingTypes ||
          b.contribution - a.contribution ||
          a.tier - b.tier,
      )
      .slice(0, MAX_AWAKEN_CANDIDATES)

    return { owned, summon }
  })

  return { awakenPointSources }
}
