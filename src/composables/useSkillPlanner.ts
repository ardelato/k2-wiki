import { computed, type Ref } from 'vue'

import { useAwakenPointSources } from '@/composables/useAwakenPointSources'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { useSkillAdvisories, type SkillAdvisory } from '@/composables/useSkillAdvisories'
import { useSkillOverrides } from '@/composables/useSkillOverrides'
import { pick } from '@/composables/useSkillOverrides'
import { useTools } from '@/composables/useTools'
import { items, itemById } from '@/data/indexes'
import jobsData from '@/data/jobs.json'
import { getPlayerLevel, getPlayerLevelXpBonus } from '@/utils/formulas'
import { getJobBenefits } from '@/utils/planner/sanctuaryConstants'
import { planPlayerLevelBoost, valueBoostOnGrind } from '@/utils/planner/skillAdvisories'
import {
  AWAKEN_DURATION_PER_TIER,
  AWAKEN_XP_PER_TIER,
  buildGatheringPlan,
  buildWorkstationPlan,
  getSkillMultipliers,
  getWorkstationMultipliers,
  TOOL_XP_PER_LEVEL,
  WORKSTATION_SPEED_PER_TIER,
  WORKSTATION_TOOL_SPEED_PER_LEVEL,
  WORKSTATION_XP_PER_TIER,
  type SkillActivity,
  type SkillBonusInputs,
  type SkillMultipliers,
  type SkillPlan,
  type WorkstationBonusInputs,
  type WorkstationPlan,
  type WorkstationRecipe,
} from '@/utils/planner/skillPlanner'

// Re-export the public types/values consumers import from this module so the
// decomposition stays invisible to callers (SkillPlanner, components, tests).
export type {
  AwakenOwnedCandidate,
  AwakenPointSources,
  AwakenSummonCandidate,
  SummonShortfall,
} from '@/composables/useAwakenPointSources'
export type {
  PlayerLevelStepTime,
  SkillAdvisory,
  SkillBoost,
} from '@/composables/useSkillAdvisories'
export type { SkillBonusOverrides } from '@/composables/useSkillOverrides'

export const WORKSTATION_IDS = ['Furnace', 'Stove', 'Workbench']

/** Player-level booster advisory: how many levels to chase, and the "cheap" budget
 * (fraction of the active grind's XP) the source levels must stay within to qualify. */
const PLAYER_BOOST_MAX_DELTA = 8
const PLAYER_BOOST_COST_FRACTION = 0.05
/** ROI gate for the player-level boost: only suggest it if the time to grind the
 * cheap source levels pays back within this many grinds of the current size. We hold
 * it to 1 — the detour must save at least as much time on the grind in front of you
 * as it costs. The permanent +XP also helps future grinds, but that value is
 * speculative, so we never recommend a detour that's net-negative right now. */
const PLAYER_BOOST_MAX_PAYBACK_GRINDS = 1

/** Gathering activities by skill id (canonical ids: Chopping, Mining, …). */
const gatheringActivities = new Map<string, SkillActivity[]>()
for (const job of jobsData) {
  if (job.type !== 'skilling' || !Array.isArray(job.activities)) continue
  gatheringActivities.set(
    job.id,
    job.activities.map((a) => ({
      id: a.id,
      name: a.name,
      // Primary output (first drop, chance 1) is the resource this node yields — use its icon.
      iconItemId: a.output?.[0]?.id ?? a.id,
      levelRequirement: a.levelRequirement,
      xpRate: a.xpRate,
      duration: a.duration,
    })),
  )
}

/** Crafting recipes by workstation (Furnace / Stove / Workbench). */
const workstationRecipes = new Map<string, WorkstationRecipe[]>()
for (const item of items) {
  for (const recipe of item.recipes ?? []) {
    const ws = recipe.workstation
    if (!ws) continue
    const list = workstationRecipes.get(ws) ?? []
    list.push({
      itemId: item.id,
      itemName: item.name,
      levelRequirement: recipe.levelRequirement,
      experience: recipe.experience,
      craftTime: recipe.craftTime,
      ingredients: recipe.ingredients.map((ing) => ({ id: ing.id, amount: ing.amount })),
    })
    workstationRecipes.set(ws, list)
  }
}

/** Skill level cap — always offered as a "max out" target preset. */
export const MAX_SKILL_LEVEL = 99

/** A target preset: a tier-unlock level plus the resource it unlocks (none for max). */
export interface SkillTierPreset {
  level: number
  itemId?: string
  itemName?: string
  isMax?: boolean
}

/**
 * Per-skill target presets: every level that unlocks a new tier, tagged with the
 * resource it yields. Gathering tiers use the activity's primary output; for
 * workstations each level uses the highest-XP/sec recipe unlocked there (what the
 * planner actually crafts). Each item feeds summons, tool/machine upgrades, or
 * both — so all major tiers are shown, not just the ones that directly summon.
 */
const skillTierPresets = new Map<string, SkillTierPreset[]>()
for (const [skill, list] of gatheringActivities) {
  const byLevel = new Map<number, SkillTierPreset>()
  for (const a of list) {
    if (byLevel.has(a.levelRequirement)) continue
    const itemId = a.iconItemId ?? a.id
    byLevel.set(a.levelRequirement, {
      level: a.levelRequirement,
      itemId,
      itemName: itemById.get(itemId)?.name ?? a.name,
    })
  }
  skillTierPresets.set(
    skill,
    [...byLevel.values()].toSorted((x, y) => x.level - y.level),
  )
}
for (const [ws, recipes] of workstationRecipes) {
  const best = new Map<number, { preset: SkillTierPreset; rate: number }>()
  for (const r of recipes) {
    if (r.craftTime <= 0) continue
    const rate = r.experience / r.craftTime
    const cur = best.get(r.levelRequirement)
    if (!cur || rate > cur.rate) {
      best.set(r.levelRequirement, {
        rate,
        preset: { level: r.levelRequirement, itemId: r.itemId, itemName: r.itemName },
      })
    }
  }
  skillTierPresets.set(
    ws,
    [...best.values()].map((b) => b.preset).toSorted((x, y) => x.level - y.level),
  )
}

export interface SkillBonusBreakdown {
  sanctuaryXp: number
  awakenXp: number
  playerLevelXp: number
  toolXp: number
  sanctuaryDuration: number
  awakenDuration: number
}

/**
 * Reactive planner for a single gathering skill. Reads live state from
 * `useGameConfig` / `useTools`, applies session-only what-if overrides, and
 * recomputes the plan when the skill, target, or any override changes.
 */
export function useSkillPlanner(skillId: Ref<string>, targetLevel: Ref<number>) {
  const {
    skillLevels,
    jobTiers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    awakenWorkstationXpTiers,
    toolLevels,
    toolSpeedModes,
    playerLevel,
    inventoryAmounts,
    queuedAmounts,
    sanctuaryCreatureIds,
  } = useGameConfig()
  const { getToolBySkillId, getUpgradeCost, xpBonusPerLevel } = useTools()
  const { creatures } = useCreatures()
  const { isOwned, isAwakened, getLevel } = useCreatureCollection()

  const { overrides, readonlyOverrides, setOverride, resetOverrides, hasOverrides } =
    useSkillOverrides()

  const isWorkstation = computed(() => WORKSTATION_IDS.includes(skillId.value))

  const liveCurrentLevel = computed(() => skillLevels.value[skillId.value] ?? 1)
  const currentLevel = computed(() => pick(overrides.currentLevel, liveCurrentLevel.value))

  const liveToolLevel = computed(() => {
    const tool = getToolBySkillId(skillId.value)
    return tool ? (toolLevels.value[tool.id] ?? 0) : 0
  })
  const toolLevel = computed(() => pick(overrides.toolLevel, liveToolLevel.value))
  const effPlayerLevel = computed(() => pick(overrides.playerLevel, playerLevel.value))

  const gatheringInputs = computed<SkillBonusInputs>(() => {
    const awaken = awakenGatherUpgrades.value[skillId.value]
    return {
      jobTier: pick(overrides.jobTier, jobTiers.value[skillId.value] ?? 0),
      awakenXpTier: pick(overrides.awakenXpTier, awaken?.xpTier ?? 0),
      awakenDurationTier: pick(overrides.awakenDurationTier, awaken?.durationTier ?? 0),
      toolLevel: toolLevel.value,
      playerLevel: effPlayerLevel.value,
    }
  })

  const workstationInputs = computed<WorkstationBonusInputs>(() => ({
    awakenXpTier: pick(overrides.awakenXpTier, awakenWorkstationXpTiers.value[skillId.value] ?? 0),
    awakenSpeedTier: pick(overrides.awakenDurationTier, awakenSpeedTiers.value[skillId.value] ?? 0),
    toolLevel: toolLevel.value,
    speedMode: toolSpeedModes.value[skillId.value] ?? false,
    playerLevel: effPlayerLevel.value,
  }))

  const multipliers = computed<SkillMultipliers>(() =>
    isWorkstation.value
      ? getWorkstationMultipliers(workstationInputs.value)
      : getSkillMultipliers(gatheringInputs.value),
  )

  const bonusBreakdown = computed<SkillBonusBreakdown>(() => {
    if (isWorkstation.value) {
      const i = workstationInputs.value
      return {
        sanctuaryXp: 0,
        awakenXp: i.awakenXpTier * WORKSTATION_XP_PER_TIER,
        playerLevelXp: getPlayerLevelXpBonus(i.playerLevel),
        toolXp: i.speedMode ? 0 : i.toolLevel * TOOL_XP_PER_LEVEL,
        sanctuaryDuration: 0,
        awakenDuration:
          i.awakenSpeedTier * WORKSTATION_SPEED_PER_TIER +
          (i.speedMode ? i.toolLevel * WORKSTATION_TOOL_SPEED_PER_LEVEL : 0),
      }
    }
    const i = gatheringInputs.value
    const benefits = getJobBenefits(i.jobTier)
    return {
      sanctuaryXp: benefits.xpBonus,
      awakenXp: i.awakenXpTier * AWAKEN_XP_PER_TIER,
      playerLevelXp: getPlayerLevelXpBonus(i.playerLevel),
      toolXp: i.toolLevel * xpBonusPerLevel,
      sanctuaryDuration: benefits.durationReduction,
      awakenDuration: i.awakenDurationTier * AWAKEN_DURATION_PER_TIER,
    }
  })

  const activities = computed<SkillActivity[]>(() =>
    isWorkstation.value ? [] : (gatheringActivities.get(skillId.value) ?? []),
  )

  const isMaxLevel = computed(
    () => currentLevel.value >= MAX_SKILL_LEVEL || targetLevel.value <= currentLevel.value,
  )

  /**
   * Tier-unlock target presets for this skill, above the current level, plus a
   * trailing max-level (99) preset so players can always target a full grind.
   */
  const targetPresets = computed<SkillTierPreset[]>(() => {
    const tiers = (skillTierPresets.get(skillId.value) ?? []).filter(
      (p) => p.level > currentLevel.value,
    )
    if (MAX_SKILL_LEVEL > currentLevel.value) {
      tiers.push({ level: MAX_SKILL_LEVEL, isMax: true })
    }
    return tiers
  })

  /**
   * Estimated time to raise one skill from `fromLevel` → `toLevel` using the same
   * plan builders the headline planner uses. Shared by the reactive `plan` (active
   * skill, its overridden multipliers) and `estimateSkillTime` (other skills, their
   * live multipliers). Returns 0 if the skill has no plannable data.
   */
  function planTimeFor(
    id: string,
    fromLevel: number,
    toLevel: number,
    mults: SkillMultipliers,
  ): number {
    if (toLevel <= fromLevel) return 0
    if (WORKSTATION_IDS.includes(id)) {
      const recipes = workstationRecipes.get(id) ?? []
      if (recipes.length === 0) return 0
      return buildWorkstationPlan(
        id,
        recipes,
        fromLevel,
        toLevel,
        mults,
        inventoryAmounts.value,
        queuedAmounts.value[id] ?? {},
      ).totalTimeSeconds
    }
    const acts = gatheringActivities.get(id) ?? []
    if (acts.length === 0) return 0
    return buildGatheringPlan(id, acts, fromLevel, toLevel, mults).totalTimeSeconds
  }

  const plan = computed<SkillPlan | WorkstationPlan | null>(() => {
    if (isWorkstation.value) {
      const recipes = workstationRecipes.get(skillId.value) ?? []
      if (recipes.length === 0) return null
      return buildWorkstationPlan(
        skillId.value,
        recipes,
        currentLevel.value,
        targetLevel.value,
        multipliers.value,
        inventoryAmounts.value,
        queuedAmounts.value[skillId.value] ?? {},
      )
    }
    if (activities.value.length === 0) return null
    return buildGatheringPlan(
      skillId.value,
      activities.value,
      currentLevel.value,
      targetLevel.value,
      multipliers.value,
    )
  })

  /** Flat aggregated ingredient cost (workstation plans only; empty otherwise). */
  const ingredientCost = computed<Record<string, number>>(() => {
    const p = plan.value
    return p && 'ingredientCost' in p ? p.ingredientCost : {}
  })

  /** Level the affordable workstation plan reaches (null for gathering plans). */
  const reachedLevel = computed<number | null>(() => {
    const p = plan.value
    return p && 'reachedLevel' in p ? p.reachedLevel : null
  })

  /** Player-level change from raising only this skill current → target, plus the
   * global XP bonus that level change grants (applies to every skill, not just this one). */
  const playerLevelGain = computed(() => {
    const id = skillId.value
    const base = skillLevels.value
    const cur = currentLevel.value
    const tgt = Math.max(cur, Math.min(99, Math.floor(targetLevel.value)))
    const before = getPlayerLevel({ ...base, [id]: cur })
    const after = getPlayerLevel({ ...base, [id]: tgt })
    return {
      delta: after - before,
      levelFrom: before,
      levelTo: after,
      xpBonusGain: getPlayerLevelXpBonus(after) - getPlayerLevelXpBonus(before),
      xpBonusFrom: getPlayerLevelXpBonus(before),
      xpBonusTo: getPlayerLevelXpBonus(after),
    }
  })
  const playerLevelDelta = computed(() => playerLevelGain.value.delta)
  const playerLevelXpBonusGain = computed(() => playerLevelGain.value.xpBonusGain)

  /**
   * Estimated time to raise one (other) skill from `fromLevel` → `toLevel` at that
   * skill's *live* bonuses (overrides apply only to the active skill, which is never
   * a boost step). Reuses the same plan builders the planner uses, so the estimate is
   * consistent with the headline numbers. Returns 0 if the skill has no plannable data.
   */
  function estimateSkillTime(id: string, fromLevel: number, toLevel: number): number {
    if (toLevel <= fromLevel) return 0
    const tool = getToolBySkillId(id)
    const toolLvl = tool ? (toolLevels.value[tool.id] ?? 0) : 0
    if (WORKSTATION_IDS.includes(id)) {
      return planTimeFor(
        id,
        fromLevel,
        toLevel,
        getWorkstationMultipliers({
          awakenXpTier: awakenWorkstationXpTiers.value[id] ?? 0,
          awakenSpeedTier: awakenSpeedTiers.value[id] ?? 0,
          toolLevel: toolLvl,
          speedMode: toolSpeedModes.value[id] ?? false,
          playerLevel: playerLevel.value,
        }),
      )
    }
    const awaken = awakenGatherUpgrades.value[id]
    return planTimeFor(
      id,
      fromLevel,
      toLevel,
      getSkillMultipliers({
        jobTier: jobTiers.value[id] ?? 0,
        awakenXpTier: awaken?.xpTier ?? 0,
        awakenDurationTier: awaken?.durationTier ?? 0,
        toolLevel: toolLvl,
        playerLevel: playerLevel.value,
      }),
    )
  }

  /**
   * "Worth a look" player-level booster: the largest set of cheap low-skill raises
   * (other than the one being grinded) whose XP cost stays within a small fraction
   * of the active grind, valued by the time it shaves off that grind. Null when the
   * player level is capped or no cheap levels exist. See [[skillAdvisories]].
   */
  const playerLevelBoost = computed(() => {
    const p = plan.value
    if (!p || p.segments.length === 0) return null
    const budget = p.totalXp * PLAYER_BOOST_COST_FRACTION

    // Harvest the largest boost whose source XP stays within the cheap budget.
    let best = null
    for (let delta = 1; delta <= PLAYER_BOOST_MAX_DELTA; delta++) {
      const boost = planPlayerLevelBoost(skillLevels.value, delta, skillId.value)
      if (!boost || boost.totalXpCost > budget) break
      best = boost
    }
    if (!best) return null

    // Estimate the grind time of each cheap source raise; the total ≈ time to gain the level.
    const steps = best.steps.map((s) => ({
      ...s,
      timeSeconds: estimateSkillTime(s.skillId, s.fromLevel, s.toLevel),
    }))
    const levelUpTimeSeconds = steps.reduce((sum, s) => sum + s.timeSeconds, 0)

    return {
      ...best,
      steps,
      levelUpTimeSeconds,
      ...valueBoostOnGrind(best, multipliers.value.xpMultiplier, p.totalTimeSeconds),
    }
  })

  const { awakenPointSources } = useAwakenPointSources({
    skillId,
    creatures,
    skillLevels,
    inventoryAmounts,
    isOwned,
    isAwakened,
    getLevel,
  })

  const { bonusAdvisories } = useSkillAdvisories({
    skillId,
    isWorkstation,
    plan,
    currentLevel,
    targetLevel,
    gatheringInputs,
    workstationInputs,
    activities,
    workstationRecipesFor: (id) => workstationRecipes.get(id) ?? [],
    awakenPointSources,
    inventoryAmounts,
    queuedAmounts,
    creatures,
    sanctuaryCreatureIds,
    isOwned,
    isAwakened,
    getToolBySkillId,
    getUpgradeCost,
  })

  /** Unified, ranked "worth a look" list: bonus levers + the player-level boost. */
  const advisories = computed<SkillAdvisory[]>(() => {
    const list = [...bonusAdvisories.value]
    const boost = playerLevelBoost.value
    // ROI gate: the boost helps this grind and every future one, but at skill parity
    // its grind cost dwarfs the per-grind saving (~30 grinds to break even). Only
    // surface it when the cheap source levels pay back within a few grinds — i.e. when
    // a genuinely lagging skill makes the levels cheap relative to the time they save.
    if (
      boost &&
      boost.timeSaved > 0 &&
      boost.levelUpTimeSeconds <= boost.timeSaved * PLAYER_BOOST_MAX_PAYBACK_GRINDS
    ) {
      list.push({
        kind: 'playerLevel',
        timeSaved: boost.timeSaved,
        steps: boost.steps,
        totalXpCost: boost.totalXpCost,
        levelUpTimeSeconds: boost.levelUpTimeSeconds,
        playerLevelFrom: boost.playerLevelFrom,
        playerLevelTo: boost.playerLevelTo,
        xpBonusGain: boost.xpBonusGain,
      })
    }
    return list.filter((a) => a.timeSaved > 0.5).toSorted((a, b) => b.timeSaved - a.timeSaved)
  })

  return {
    plan,
    currentLevel,
    isWorkstation,
    isMaxLevel,
    targetPresets,
    multipliers,
    bonusBreakdown,
    ingredientCost,
    reachedLevel,
    playerLevelDelta,
    playerLevelXpBonusGain,
    playerLevelGain,
    advisories,
    overrides: readonlyOverrides,
    hasOverrides,
    setOverride,
    resetOverrides,
  }
}
