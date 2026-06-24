import { computed, type ComputedRef, type Ref } from 'vue'

import type { AwakenPointSources } from '@/composables/useAwakenPointSources'
import { itemById } from '@/data/indexes'
import { awakenNodeNames, awakenPrerequisiteClosure, awakenUnlockCost } from '@/data/upgrades'
import { t } from '@/i18n'
import type { Creature } from '@/types'
import { sanctuaryIcon, toolIcons, upgradesIcon } from '@/utils/format/icons'
import {
  getJobBenefits,
  MAX_SANCTUARY_SLOTS,
  MAX_TIER,
  TIER_THRESHOLDS_RAW,
} from '@/utils/planner/sanctuaryConstants'
import {
  buildSanctuaryDiff,
  recommendPartyForJob,
  type JobPartyPick,
  type PlayerLevelBoostStep,
  type SanctuaryRosterDiff,
} from '@/utils/planner/skillAdvisories'
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
  type SkillPlan,
  type WorkstationBonusInputs,
  type WorkstationPlan,
  type WorkstationRecipe,
} from '@/utils/planner/skillPlanner'
import { calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

/** Upgrade caps for the bonus-lever advisories (mirrors the awaken/tool config). */
const AWAKEN_XP_CAP = 6
const AWAKEN_DURATION_CAP = 4
const WORKSTATION_XP_CAP = 5
const WORKSTATION_SPEED_CAP = 4
const TOOL_LEVEL_CAP = 10
/** Awaken node ids use roman numerals: index 0 = tier I, …, 5 = tier VI. */
const AWAKEN_ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi']
const TOOL_SPEED_DURATION_PER_LEVEL = WORKSTATION_TOOL_SPEED_PER_LEVEL

/**
 * One benefit dimension changed by an upgrade: the cumulative total from that
 * source before and after. The tile shows `after`; the popover shows the diff.
 */
export interface SkillBoost {
  kind: 'xp' | 'duration' | 'yield'
  before: number
  after: number
}

/** A single "worth a look" suggestion, ranked by the time it shaves off this grind. */
export type SkillAdvisory =
  | {
      kind: 'bonus'
      lever: string
      label: string
      /** Cumulative source benefit(s) before/after this upgrade (a multi-tier jump may move several). */
      benefits: SkillBoost[]
      timeSaved: number
      routeName: 'sanctuary' | 'awaken' | 'tools'
      /** In-game icon prefixing the suggestion (sanctuary / awaken / tool). */
      iconSrc?: string
      /** Awaken levers: points the node costs and how many are unallocated. */
      awakenPointCost?: number
      awakenPointsAvailable?: number
      /** Awaken levers: the tree (skill) and node to highlight when opened. */
      awakenTreeId?: string
      awakenNodeId?: string
      /** Tool lever: the bar cost of the next upgrade level + tool to highlight. */
      toolCost?: { itemId: string; itemName: string; amount: number }
      toolId?: string
      /** Sanctuary lever: full party that reaches the headline tier. */
      party?: JobPartyPick[]
      /** Sanctuary lever: how to turn the live roster into that party, with the
       * collateral tier moves on other jobs (the shared-party trade-off). */
      partyDiff?: SanctuaryRosterDiff
      /** Awaken levers: how to earn the point this node needs. */
      awakenSources?: AwakenPointSources
    }
  | {
      kind: 'playerLevel'
      timeSaved: number
      steps: PlayerLevelStepTime[]
      totalXpCost: number
      /** Estimated total time to grind the cheap source levels (≈ time to gain the player level). */
      levelUpTimeSeconds: number
      playerLevelFrom: number
      playerLevelTo: number
      xpBonusGain: number
    }

/** A boost step plus the estimated time to raise that one skill at its live bonuses. */
export type PlayerLevelStepTime = PlayerLevelBoostStep & { timeSeconds: number }

type BonusAdvisory = Extract<SkillAdvisory, { kind: 'bonus' }>

// ----- Pure helper factories (hoisted to module scope) -----

/** A one-dimension boost from `count` tiers/levels to the next, `per` units each. */
const step = (kind: SkillBoost['kind'], count: number, per: number): SkillBoost[] => [
  { kind, before: count * per, after: (count + 1) * per },
]

/** Tag the exact tree/node so "Open" can highlight it. Node ids are
 * `{skill}-{type}-{roman}` (upgrades.ts). */
const awakenNodeId = (skill: string, type: 'xp' | 'duration' | 'speed', curTier: number) =>
  `${skill.toLowerCase()}-${type}-${AWAKEN_ROMAN[curTier]}`

/** The set of awaken nodes already allocated for this skill, derived from the
 * tracked per-type tier counts (tier N ⇒ the first N nodes of that type). Used
 * to price a suggestion by its true point cost — node + unowned prerequisites. */
const allocatedAwakenNodes = (
  skill: string,
  tiers: Partial<Record<'xp' | 'duration' | 'speed', number>>,
) => {
  const lower = skill.toLowerCase()
  const set = new Set<string>()
  for (const type of ['xp', 'duration', 'speed'] as const) {
    for (let k = 0; k < (tiers[type] ?? 0); k++) set.add(`${lower}-${type}-${AWAKEN_ROMAN[k]}`)
  }
  // Owning a node implies owning its prerequisites, so close over them — a
  // branch node (e.g. Speed) already covers the XP spine gating it, and that
  // spine must not be re-charged when pricing the next node to buy.
  return awakenPrerequisiteClosure(set)
}

/** Reuse the awaken tree's real node name (e.g. "Chopping XP III") for the
 * advisory headline; fall back to a generic tier label if the id is unknown. */
const awakenNodeLabel = (skill: string, type: 'xp' | 'duration' | 'speed', curTier: number) =>
  awakenNodeNames.get(awakenNodeId(skill, type, curTier)) ??
  t('advisories.skill.awakenNodeFallback', { type, from: curTier, to: curTier + 1 })

const awakenExtra = (
  skill: string,
  type: 'xp' | 'duration' | 'speed',
  curTier: number,
  allocated: ReadonlySet<string>,
  awakenPointsAvailable: number,
  awakenSources: AwakenPointSources,
): Partial<BonusAdvisory> => ({
  iconSrc: upgradesIcon,
  // Unlocking this node may require buying its prerequisite chain too (e.g.
  // Duration I needs XP II → XP I), so the cost is the full unowned closure.
  awakenPointCost: awakenUnlockCost(awakenNodeId(skill, type, curTier), allocated),
  awakenPointsAvailable,
  awakenTreeId: skill.toLowerCase(),
  awakenNodeId: awakenNodeId(skill, type, curTier),
  awakenSources,
})

/** Next tool level's bar cost: `getUpgradeCost(currentLevel)` → cost to reach level+1. */
const toolExtra = (
  tool: { id: string; name: string } | undefined,
  cost: { barId: string; amount: number } | null | undefined,
): Partial<BonusAdvisory> => ({
  iconSrc: tool ? toolIcons[tool.id] : undefined,
  toolId: tool?.id,
  toolCost: cost
    ? {
        itemId: cost.barId,
        itemName: itemById.get(cost.barId)?.name ?? cost.barId,
        amount: cost.amount,
      }
    : undefined,
})

/** Push a bonus advisory onto `out`, deriving `timeSaved` from the `base` time. */
const pushBonus = (
  out: SkillAdvisory[],
  base: number,
  lever: string,
  label: string,
  benefits: SkillBoost[],
  newTime: number,
  routeName: 'sanctuary' | 'awaken' | 'tools',
  extra: Partial<BonusAdvisory> = {},
) =>
  out.push({
    kind: 'bonus',
    lever,
    label,
    benefits,
    timeSaved: base - newTime,
    routeName,
    ...extra,
  })

// ----- Per-route builders -----

interface AdvisoryContext {
  skillId: string
  currentLevel: number
  targetLevel: number
  inventoryAmounts: Record<string, number>
  queuedAmounts: Record<string, Record<string, number>>
  awakenPointsAvailable: number
  awakenSources: AwakenPointSources
  tool: { id: string; name: string } | undefined
  toolDisplayName: string
  upgradeCost: (level: number) => { barId: string; amount: number } | null | undefined
  // Gathering-only:
  activities: SkillActivity[]
  creatures: Creature[]
  sanctuaryCreatureIds: string[]
  isOwned: (id: string) => boolean
  isAwakened: (id: string) => boolean
  // Workstation-only:
  workstationRecipes: WorkstationRecipe[]
}

function workstationAdvisories(
  out: SkillAdvisory[],
  base: number,
  inputs: WorkstationBonusInputs,
  ctx: AdvisoryContext,
) {
  const allocated = allocatedAwakenNodes(ctx.skillId, {
    xp: inputs.awakenXpTier,
    speed: inputs.awakenSpeedTier,
  })
  const timeAt = (mods: WorkstationBonusInputs) =>
    buildWorkstationPlan(
      ctx.skillId,
      ctx.workstationRecipes,
      ctx.currentLevel,
      ctx.targetLevel,
      getWorkstationMultipliers(mods),
      ctx.inventoryAmounts,
      ctx.queuedAmounts[ctx.skillId] ?? {},
    ).totalTimeSeconds
  if (inputs.awakenXpTier < WORKSTATION_XP_CAP)
    pushBonus(
      out,
      base,
      'workstationXp',
      awakenNodeLabel(ctx.skillId, 'xp', inputs.awakenXpTier),
      step('xp', inputs.awakenXpTier, WORKSTATION_XP_PER_TIER),
      timeAt({ ...inputs, awakenXpTier: inputs.awakenXpTier + 1 }),
      'awaken',
      awakenExtra(
        ctx.skillId,
        'xp',
        inputs.awakenXpTier,
        allocated,
        ctx.awakenPointsAvailable,
        ctx.awakenSources,
      ),
    )
  if (inputs.awakenSpeedTier < WORKSTATION_SPEED_CAP)
    pushBonus(
      out,
      base,
      'workstationSpeed',
      awakenNodeLabel(ctx.skillId, 'speed', inputs.awakenSpeedTier),
      step('duration', inputs.awakenSpeedTier, WORKSTATION_SPEED_PER_TIER),
      timeAt({ ...inputs, awakenSpeedTier: inputs.awakenSpeedTier + 1 }),
      'awaken',
      awakenExtra(
        ctx.skillId,
        'speed',
        inputs.awakenSpeedTier,
        allocated,
        ctx.awakenPointsAvailable,
        ctx.awakenSources,
      ),
    )
  if (inputs.toolLevel < TOOL_LEVEL_CAP)
    pushBonus(
      out,
      base,
      'toolLevel',
      t('advisories.skill.toolLevel', {
        tool: ctx.toolDisplayName,
        from: inputs.toolLevel,
        to: inputs.toolLevel + 1,
      }),
      inputs.speedMode
        ? step('duration', inputs.toolLevel, TOOL_SPEED_DURATION_PER_LEVEL)
        : step('xp', inputs.toolLevel, TOOL_XP_PER_LEVEL),
      timeAt({ ...inputs, toolLevel: inputs.toolLevel + 1 }),
      'tools',
      toolExtra(ctx.tool, ctx.upgradeCost(inputs.toolLevel)),
    )
}

function gatheringAdvisories(
  out: SkillAdvisory[],
  base: number,
  inputs: SkillBonusInputs,
  ctx: AdvisoryContext,
) {
  const allocated = allocatedAwakenNodes(ctx.skillId, {
    xp: inputs.awakenXpTier,
    duration: inputs.awakenDurationTier,
  })
  const timeAt = (mods: SkillBonusInputs) =>
    buildGatheringPlan(
      ctx.skillId,
      ctx.activities,
      ctx.currentLevel,
      ctx.targetLevel,
      getSkillMultipliers(mods),
    ).totalTimeSeconds
  // Sanctuary advice targets the tier the recommended (full, owned+awakened)
  // party actually reaches — so the headline tier, effects, and time saved all
  // reflect the same setup the chips below show.
  if (inputs.jobTier < MAX_TIER) {
    const rec = recommendPartyForJob(
      ctx.creatures,
      ctx.skillId.toLowerCase(),
      TIER_THRESHOLDS_RAW,
      MAX_SANCTUARY_SLOTS,
      (id) => ctx.isOwned(id) && ctx.isAwakened(id),
    )
    const targetTier = rec.reachedTier
    if (targetTier > inputs.jobTier) {
      const before = getJobBenefits(inputs.jobTier)
      const after = getJobBenefits(targetTier)
      const benefits: SkillBoost[] = []
      if (after.xpBonus !== before.xpBonus)
        benefits.push({ kind: 'xp', before: before.xpBonus, after: after.xpBonus })
      if (after.durationReduction !== before.durationReduction)
        benefits.push({
          kind: 'duration',
          before: before.durationReduction,
          after: after.durationReduction,
        })
      if (after.yieldBonus !== before.yieldBonus)
        benefits.push({ kind: 'yield', before: before.yieldBonus, after: after.yieldBonus })
      const partyDiff = buildSanctuaryDiff(
        ctx.creatures,
        ctx.sanctuaryCreatureIds,
        rec.party,
        ctx.skillId.toLowerCase(),
        ctx.skillId,
        calculateJobTiersFromSanctuary,
      )
      pushBonus(
        out,
        base,
        'sanctuaryTier',
        t('advisories.skill.sanctuaryLabel', { skill: ctx.skillId, tier: targetTier }),
        benefits,
        timeAt({ ...inputs, jobTier: targetTier }),
        'sanctuary',
        { iconSrc: sanctuaryIcon, party: rec.party, partyDiff },
      )
    }
  }
  if (inputs.awakenXpTier < AWAKEN_XP_CAP)
    pushBonus(
      out,
      base,
      'awakenXp',
      awakenNodeLabel(ctx.skillId, 'xp', inputs.awakenXpTier),
      step('xp', inputs.awakenXpTier, AWAKEN_XP_PER_TIER),
      timeAt({ ...inputs, awakenXpTier: inputs.awakenXpTier + 1 }),
      'awaken',
      awakenExtra(
        ctx.skillId,
        'xp',
        inputs.awakenXpTier,
        allocated,
        ctx.awakenPointsAvailable,
        ctx.awakenSources,
      ),
    )
  if (inputs.awakenDurationTier < AWAKEN_DURATION_CAP)
    pushBonus(
      out,
      base,
      'awakenDuration',
      awakenNodeLabel(ctx.skillId, 'duration', inputs.awakenDurationTier),
      step('duration', inputs.awakenDurationTier, AWAKEN_DURATION_PER_TIER),
      timeAt({ ...inputs, awakenDurationTier: inputs.awakenDurationTier + 1 }),
      'awaken',
      awakenExtra(
        ctx.skillId,
        'duration',
        inputs.awakenDurationTier,
        allocated,
        ctx.awakenPointsAvailable,
        ctx.awakenSources,
      ),
    )
  if (inputs.toolLevel < TOOL_LEVEL_CAP)
    pushBonus(
      out,
      base,
      'toolLevel',
      t('advisories.skill.toolLevel', {
        tool: ctx.toolDisplayName,
        from: inputs.toolLevel,
        to: inputs.toolLevel + 1,
      }),
      step('xp', inputs.toolLevel, TOOL_XP_PER_LEVEL),
      timeAt({ ...inputs, toolLevel: inputs.toolLevel + 1 }),
      'tools',
      toolExtra(ctx.tool, ctx.upgradeCost(inputs.toolLevel)),
    )
}

interface SkillAdvisoriesDeps {
  skillId: Ref<string>
  isWorkstation: Ref<boolean>
  plan: Ref<SkillPlan | WorkstationPlan | null>
  currentLevel: Ref<number>
  targetLevel: Ref<number>
  gatheringInputs: Ref<SkillBonusInputs>
  workstationInputs: Ref<WorkstationBonusInputs>
  activities: Ref<SkillActivity[]>
  workstationRecipesFor: (skillId: string) => WorkstationRecipe[]
  awakenPointSources: ComputedRef<AwakenPointSources>
  inventoryAmounts: Ref<Record<string, number>>
  queuedAmounts: Ref<Record<string, Record<string, number>>>
  creatures: Ref<Creature[]>
  sanctuaryCreatureIds: Ref<string[]>
  isOwned: (id: string) => boolean
  isAwakened: (id: string) => boolean
  getToolBySkillId: (skillId: string) => { id: string; name: string } | undefined
  getUpgradeCost: (level: number) => { barId: string; amount: number } | null | undefined
}

/**
 * Bonus-lever advisories: bump one upgradeable input (sanctuary tier, awaken node,
 * tool level) by one step, recompute the plan, and report the time it saves. Pure
 * sensitivity analysis on the same `build*Plan` the planner already uses — no new
 * math. Ranked by time saved; entries that save nothing (e.g. a yield-only tier)
 * drop out. Acquisition cost is not modelled here — this answers "which lever helps
 * most," not "is it worth the materials."
 */
export function useSkillAdvisories(deps: SkillAdvisoriesDeps) {
  const bonusAdvisories = computed<SkillAdvisory[]>(() => {
    const p = deps.plan.value
    if (!p || p.segments.length === 0) return []
    const base = p.totalTimeSeconds
    const out: SkillAdvisory[] = []
    const skillId = deps.skillId.value
    const tool = deps.getToolBySkillId(skillId)
    const ctx: AdvisoryContext = {
      skillId,
      currentLevel: deps.currentLevel.value,
      targetLevel: deps.targetLevel.value,
      inventoryAmounts: deps.inventoryAmounts.value,
      queuedAmounts: deps.queuedAmounts.value,
      awakenPointsAvailable: deps.inventoryAmounts.value['awaken-points'] ?? 0,
      awakenSources: deps.awakenPointSources.value,
      tool,
      // Name the skill's actual tool (e.g. "Pickaxe"); fall back to a generic label.
      toolDisplayName: tool?.name ?? t('advisories.skill.toolFallback'),
      upgradeCost: deps.getUpgradeCost,
      activities: deps.activities.value,
      creatures: deps.creatures.value,
      sanctuaryCreatureIds: deps.sanctuaryCreatureIds.value,
      isOwned: deps.isOwned,
      isAwakened: deps.isAwakened,
      workstationRecipes: deps.workstationRecipesFor(skillId),
    }

    if (deps.isWorkstation.value) {
      workstationAdvisories(out, base, deps.workstationInputs.value, ctx)
    } else {
      gatheringAdvisories(out, base, deps.gatheringInputs.value, ctx)
    }
    return out
  })

  return { bonusAdvisories }
}
