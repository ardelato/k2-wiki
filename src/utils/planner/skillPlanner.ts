import { getPlayerLevelXpBonus, getSkillLevel, xpForSkillLevel } from '@/utils/formulas'

import { getJobBenefits } from './sanctuaryConstants'

// ── Bonus magnitudes (verified against recovered-source) ──────────────
// Awaken tree: each gathering skill_xp node = +10% XP, each skill_duration = -5%.
// Tool: +5% XP per level. Sanctuary + player-level come from their own helpers.
export const AWAKEN_XP_PER_TIER = 10
export const AWAKEN_DURATION_PER_TIER = 5
export const TOOL_XP_PER_LEVEL = 5
// Workstations: each workstation_xp node = +10% XP, each workstation_speed = -15%.
// In speed mode the tool's XP bonus is forfeited and converts to -2% duration/level.
export const WORKSTATION_XP_PER_TIER = 10
export const WORKSTATION_SPEED_PER_TIER = 15
export const WORKSTATION_TOOL_SPEED_PER_LEVEL = 2

export interface SkillBonusInputs {
  /** Sanctuary job tier (0–MAX_TIER) for this skill. */
  jobTier: number
  /** Count of purchased awaken `skill_xp` nodes. */
  awakenXpTier: number
  /** Count of purchased awaken `skill_duration` nodes. */
  awakenDurationTier: number
  /** Level of the tool that boosts this skill (0–10). */
  toolLevel: number
  /** Current player level (1–99) — drives the player-level XP bonus. */
  playerLevel: number
}

export interface SkillMultipliers {
  xpMultiplier: number
  durationMultiplier: number
}

export interface SkillActivity {
  id: string
  name: string
  /** Primary output item id, used to resolve the activity's icon. Falls back to `id`. */
  iconItemId?: string
  levelRequirement: number
  xpRate: number
  duration: number
}

export interface SkillSegment {
  activityId: string
  activityName: string
  /** Item id used to resolve the activity's icon (primary output for gathering, crafted item for workstations). */
  iconItemId: string
  fromLevel: number
  toLevel: number
  unlockLevel: number
  xpPerCycle: number
  effectiveDuration: number
  xpPerSec: number
  bandXp: number
  cycles: number
  timeSeconds: number
  /** Workstation only: how many of `cycles` are already in the in-game queue (in
   * progress). Drives the sky-blue "in queue" portion of the bar; ≤ `cycles`. */
  queuedCycles?: number
  /** Workstation only: the ingredient that distinguishes this recipe variant from
   * its siblings (e.g. the bar a Helmet is forged from). Lets the UI tell apart the
   * multiple "Helmet" bands a grind produces as it cascades down bar tiers. */
  variantItemId?: string
}

export interface SkillPlan {
  skillId: string
  currentLevel: number
  targetLevel: number
  totalXp: number
  totalCycles: number
  totalTimeSeconds: number
  segments: SkillSegment[]
}

/**
 * Build the XP and duration multipliers the game applies to a gathering skill.
 *
 *   xpMultiplier       = 1 + (sanctuary + awaken + playerLevel + tool)% / 100
 *   durationMultiplier = max(0.01, 1 - (sanctuary + awaken)% / 100)
 *
 * Mirrors `bonuses/helpers.ts` `getGatheringXpBonus` / `getGatheringDurationReduction`.
 */
export function getSkillMultipliers(inputs: SkillBonusInputs): SkillMultipliers {
  const benefits = getJobBenefits(inputs.jobTier)

  const xpPercent =
    benefits.xpBonus +
    inputs.awakenXpTier * AWAKEN_XP_PER_TIER +
    getPlayerLevelXpBonus(inputs.playerLevel) +
    inputs.toolLevel * TOOL_XP_PER_LEVEL

  const durationPercent =
    benefits.durationReduction + inputs.awakenDurationTier * AWAKEN_DURATION_PER_TIER

  return {
    xpMultiplier: 1 + xpPercent / 100,
    durationMultiplier: Math.max(0.01, 1 - durationPercent / 100),
  }
}

/** XP per second for one activity under the given multipliers (game: XP/cycle ÷ duration/cycle). */
export function getActivityXpPerSec(xpRate: number, duration: number, m: SkillMultipliers): number {
  const xpPerCycle = xpRate * m.xpMultiplier
  const effectiveDuration = Math.max(1, duration * m.durationMultiplier)
  return xpPerCycle / effectiveDuration
}

/** Highest-`levelRequirement` activity unlocked at `level` (activities sorted ascending). */
function activityForLevel(sortedAsc: SkillActivity[], level: number): SkillActivity | null {
  let best: SkillActivity | null = null
  for (const activity of sortedAsc) {
    if (activity.levelRequirement <= level) best = activity
    else break
  }
  return best
}

const clampLevel = (level: number) => Math.max(1, Math.min(99, Math.floor(level)))

/**
 * Deterministic gathering plan: grind the highest-unlocked activity, switching
 * exactly at unlock thresholds. No search — for gathering, XP/sec is monotonic
 * per tier and bonuses scale all activities uniformly, so the highest-unlocked
 * activity is always optimal. (Workstations are not built here.)
 */
export function buildGatheringPlan(
  skillId: string,
  activities: SkillActivity[],
  currentLevel: number,
  targetLevel: number,
  m: SkillMultipliers,
): SkillPlan {
  const cur = clampLevel(currentLevel)
  const tgt = clampLevel(targetLevel)
  const sorted = [...activities].sort((a, b) => a.levelRequirement - b.levelRequirement)

  const base: SkillPlan = {
    skillId,
    currentLevel: cur,
    targetLevel: tgt,
    totalXp: 0,
    totalCycles: 0,
    totalTimeSeconds: 0,
    segments: [],
  }
  if (tgt <= cur || sorted.length === 0) return base

  // Segment boundaries: current, every unlock strictly inside (cur, tgt), and target.
  const unlocks = sorted.map((a) => a.levelRequirement).filter((lvl) => lvl > cur && lvl < tgt)
  const boundaries = [...new Set([cur, ...unlocks, tgt])].sort((a, b) => a - b)

  const segments: SkillSegment[] = []
  let totalXp = 0
  let totalCycles = 0
  let totalTimeSeconds = 0

  for (let i = 0; i < boundaries.length - 1; i++) {
    const fromLevel = boundaries[i]
    const toLevel = boundaries[i + 1]
    const active = activityForLevel(sorted, fromLevel)
    if (!active) continue

    const bandXp = xpForSkillLevel(toLevel) - xpForSkillLevel(fromLevel)
    const xpPerCycle = active.xpRate * m.xpMultiplier
    const effectiveDuration = Math.max(1, active.duration * m.durationMultiplier)
    const cycles = Math.ceil(bandXp / xpPerCycle)
    const timeSeconds = cycles * effectiveDuration

    segments.push({
      activityId: active.id,
      activityName: active.name,
      iconItemId: active.iconItemId ?? active.id,
      fromLevel,
      toLevel,
      unlockLevel: active.levelRequirement,
      xpPerCycle,
      effectiveDuration,
      xpPerSec: xpPerCycle / effectiveDuration,
      bandXp,
      cycles,
      timeSeconds,
    })

    totalXp += bandXp
    totalCycles += cycles
    totalTimeSeconds += timeSeconds
  }

  return { ...base, totalXp, totalCycles, totalTimeSeconds, segments }
}

// ── Workstations (Furnace / Stove / Workbench) ────────────────────────

export interface WorkstationBonusInputs {
  /** Count of purchased workstation_xp nodes. */
  awakenXpTier: number
  /** Count of purchased workstation_speed nodes. */
  awakenSpeedTier: number
  /** Tool level (0–10) for this workstation. */
  toolLevel: number
  /** Whether the workstation tool is in speed mode (tool XP → duration). */
  speedMode: boolean
  /** Current player level (1–99). */
  playerLevel: number
}

export interface WorkstationRecipe {
  itemId: string
  itemName: string
  levelRequirement: number
  experience: number
  craftTime: number
  ingredients: { id: string; amount: number }[]
}

export interface WorkstationPlan extends SkillPlan {
  /** Total ingredients actually consumed by this plan (sum across segments). */
  ingredientCost: Record<string, number>
  /** Level the affordable path reaches; equals targetLevel when inventory suffices. */
  reachedLevel: number
}

/**
 * Workstation XP/duration multipliers. Mirrors `bonuses/helpers.ts`
 * `getWorkstationXpBonus` / `getWorkstationDurationReduction`: no sanctuary
 * bonus, and the tool bonus is XP unless speed mode (then it is duration).
 */
export function getWorkstationMultipliers(i: WorkstationBonusInputs): SkillMultipliers {
  const xpPercent =
    i.awakenXpTier * WORKSTATION_XP_PER_TIER +
    getPlayerLevelXpBonus(i.playerLevel) +
    (i.speedMode ? 0 : i.toolLevel * TOOL_XP_PER_LEVEL)

  const durationPercent =
    i.awakenSpeedTier * WORKSTATION_SPEED_PER_TIER +
    (i.speedMode ? i.toolLevel * WORKSTATION_TOOL_SPEED_PER_LEVEL : 0)

  return {
    xpMultiplier: 1 + xpPercent / 100,
    durationMultiplier: Math.max(0.01, 1 - durationPercent / 100),
  }
}

/** Recipes unlocked at `level` with a positive craft time. */
function unlockedRecipes(recipes: WorkstationRecipe[], level: number): WorkstationRecipe[] {
  return recipes.filter((r) => r.levelRequirement <= level && r.craftTime > 0)
}

/** Inventory fully covers one cycle of every ingredient (everything is consumed). */
function isAffordable(recipe: WorkstationRecipe, inv: Record<string, number>): boolean {
  return recipe.ingredients.every((ing) => (inv[ing.id] ?? 0) >= ing.amount)
}

/** Highest XP/sec recipe in `pool` (ties: first, i.e. lowest level requirement). */
function bestByRate(pool: WorkstationRecipe[]): WorkstationRecipe | null {
  let best: WorkstationRecipe | null = null
  let bestRate = -1
  for (const r of pool) {
    const rate = r.experience / r.craftTime
    if (rate > bestRate) {
      bestRate = rate
      best = r
    }
  }
  return best
}

/** Smallest recipe level requirement strictly above `level`, or Infinity if none. */
function nextUnlockLevel(recipes: WorkstationRecipe[], level: number): number {
  let next = Infinity
  for (const r of recipes) {
    if (r.craftTime <= 0) continue
    if (r.levelRequirement > level && r.levelRequirement < next) next = r.levelRequirement
  }
  return next
}

/** A workstation recipe producing `itemId` (for queued items). Picks the highest-XP
 * variant when an item has several recipes; null if none crafts it here. */
function recipeForItem(recipes: WorkstationRecipe[], itemId: string): WorkstationRecipe | null {
  let best: WorkstationRecipe | null = null
  for (const r of recipes) {
    if (r.itemId !== itemId || r.craftTime <= 0) continue
    if (!best || r.experience > best.experience) best = r
  }
  return best
}

/**
 * The ingredient that distinguishes `recipe` from its sibling variants (same item,
 * same workstation) — the one not shared by all of them, e.g. the bar a Helmet is
 * forged from. Undefined when the item has a single recipe (nothing to disambiguate).
 */
function variantIngredientId(
  recipe: WorkstationRecipe,
  recipes: WorkstationRecipe[],
): string | undefined {
  const siblings = recipes.filter((r) => r.itemId === recipe.itemId && r.craftTime > 0)
  if (siblings.length <= 1) return undefined
  // Ingredient ids present in every sibling — these don't tell variants apart.
  let common = new Set(siblings[0].ingredients.map((i) => i.id))
  for (const s of siblings.slice(1)) {
    const ids = new Set(s.ingredients.map((i) => i.id))
    common = new Set([...common].filter((id) => ids.has(id)))
  }
  return recipe.ingredients.find((i) => !common.has(i.id))?.id
}

/** Merge adjacent segments that craft the same recipe variant (e.g. across an unlock
 * that didn't change the pick), summing cycles/queued/time/xp and extending the band.
 * Different variants of one item (e.g. Solarite vs Gold Helmet) never merge — they
 * have different XP rates and consume different materials. */
function mergeSegments(segments: SkillSegment[]): SkillSegment[] {
  const out: SkillSegment[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (prev && prev.activityId === seg.activityId && prev.variantItemId === seg.variantItemId) {
      prev.toLevel = seg.toLevel
      prev.bandXp += seg.bandXp
      prev.cycles += seg.cycles
      prev.queuedCycles = (prev.queuedCycles ?? 0) + (seg.queuedCycles ?? 0)
      prev.timeSeconds += seg.timeSeconds
    } else {
      out.push({ ...seg })
    }
  }
  return out
}

/**
 * Inventory-aware workstation leveling plan. Unlike gathering, recipes don't
 * share a progression, so the planner greedily crafts the best XP/sec recipe it
 * can *afford* from the running inventory, switching recipes at the earliest of:
 * target reached, a better recipe unlocking, or the active recipe's materials
 * running out. When nothing is affordable it stops and reports the blocker.
 * Every listed ingredient is treated as consumed per craft.
 *
 * The in-game workstation `queued` amounts (itemId → output count) feed the plan:
 * within each band the queue covers some of the crafts for free — those already
 * paid their ingredients (so they don't draw on `inventory`, which parseSave keeps
 * net of queue reservations) yet still grant XP. The covered count is recorded as
 * `queuedCycles` on the segment (the sky-blue "in queue" portion of its bar) and
 * its time is excluded from the segment (it's already in progress). Buy-only items
 * (no workstation recipe) can never be queued, so they never contribute.
 */
export function buildWorkstationPlan(
  workstation: string,
  recipes: WorkstationRecipe[],
  currentLevel: number,
  targetLevel: number,
  m: SkillMultipliers,
  inventory: Record<string, number>,
  queued: Record<string, number> = {},
): WorkstationPlan {
  const cur = clampLevel(currentLevel)
  const tgt = clampLevel(targetLevel)

  const base: WorkstationPlan = {
    skillId: workstation,
    currentLevel: cur,
    targetLevel: tgt,
    totalXp: 0,
    totalCycles: 0,
    totalTimeSeconds: 0,
    segments: [],
    ingredientCost: {},
    reachedLevel: cur,
  }
  if (tgt <= cur || recipes.length === 0) return base

  const inv: Record<string, number> = { ...inventory }
  // Per-item queue pool, drawn down as bands consume it. Buy-only items (no recipe
  // at this workstation) can't be queued, so drop them up front.
  const queuePool: Record<string, number> = {}
  for (const [itemId, count] of Object.entries(queued)) {
    if (count > 0 && recipeForItem(recipes, itemId)) queuePool[itemId] = count
  }
  const goal = xpForSkillLevel(tgt)
  const startXp = xpForSkillLevel(cur)

  const rawSegments: SkillSegment[] = []
  const ingredientCost: Record<string, number> = {}
  let xp = startXp

  // Phase 1 — queue head start. The in-game queue is already crafting, so it leads
  // the grind path. Queued crafts are free (mats already paid) and grant XP, raising
  // the level before the affordability grind handles the remainder. Ordered by unlock
  // level so the level rises sensibly; queued items are all unlocked at `cur` already.
  const queuedItems = Object.keys(queuePool)
    .map((itemId) => ({ itemId, recipe: recipeForItem(recipes, itemId)! }))
    .sort((a, b) => a.recipe.levelRequirement - b.recipe.levelRequirement)

  for (const { itemId, recipe } of queuedItems) {
    if (xp >= goal) break
    const xpPerCycle = recipe.experience * m.xpMultiplier
    const effectiveDuration = Math.max(1, recipe.craftTime * m.durationMultiplier)
    const cycles = Math.min(queuePool[itemId], Math.ceil((goal - xp) / xpPerCycle))
    if (cycles <= 0) continue
    queuePool[itemId] -= cycles

    const fromLevel = getSkillLevel(xp)
    const xpEnd = xp + cycles * xpPerCycle
    rawSegments.push({
      activityId: itemId,
      activityName: recipe.itemName,
      iconItemId: itemId,
      fromLevel,
      toLevel: Math.min(tgt, getSkillLevel(xpEnd)),
      unlockLevel: recipe.levelRequirement,
      xpPerCycle,
      effectiveDuration,
      xpPerSec: xpPerCycle / effectiveDuration,
      bandXp: cycles * xpPerCycle,
      cycles,
      // Queued crafts are already in progress, not remaining work → no added time.
      timeSeconds: 0,
      queuedCycles: cycles,
      variantItemId: variantIngredientId(recipe, recipes),
    })
    xp = xpEnd
  }

  // Phase 2 — affordability grind for whatever the queue didn't cover, from the
  // post-queue level using current (queue-net) inventory. A queued item that's still
  // the best pick merges with its Phase-1 segment (mergeSegments), so its card shows
  // a partial queued bar rather than two separate cards.
  while (xp < goal) {
    const level = getSkillLevel(xp)
    const unlocked = unlockedRecipes(recipes, level)
    const affordable = unlocked.filter((r) => isAffordable(r, inv))

    // Nothing affordable at this level — the grind can't progress, so stop here.
    if (affordable.length === 0) break

    const recipe = bestByRate(affordable)!
    const xpPerCycle = recipe.experience * m.xpMultiplier
    const effectiveDuration = Math.max(1, recipe.craftTime * m.durationMultiplier)

    const cyclesToTarget = Math.ceil((goal - xp) / xpPerCycle)
    const unlock = nextUnlockLevel(recipes, level)
    const cyclesToUnlock =
      unlock === Infinity ? Infinity : Math.ceil((xpForSkillLevel(unlock) - xp) / xpPerCycle)
    const cyclesByInventory = Math.min(
      ...recipe.ingredients.map((ing) => Math.floor((inv[ing.id] ?? 0) / ing.amount)),
    )
    const cycles = Math.min(cyclesToTarget, cyclesToUnlock, cyclesByInventory)

    const fromLevel = level
    const xpEnd = xp + cycles * xpPerCycle
    for (const ing of recipe.ingredients) {
      inv[ing.id] = (inv[ing.id] ?? 0) - ing.amount * cycles
      ingredientCost[ing.id] = (ingredientCost[ing.id] ?? 0) + ing.amount * cycles
    }
    rawSegments.push({
      activityId: recipe.itemId,
      activityName: recipe.itemName,
      iconItemId: recipe.itemId,
      fromLevel,
      toLevel: Math.min(tgt, getSkillLevel(xpEnd)),
      unlockLevel: recipe.levelRequirement,
      xpPerCycle,
      effectiveDuration,
      xpPerSec: xpPerCycle / effectiveDuration,
      bandXp: cycles * xpPerCycle,
      cycles,
      timeSeconds: cycles * effectiveDuration,
      queuedCycles: 0,
      variantItemId: variantIngredientId(recipe, recipes),
    })

    xp = xpEnd
  }

  const segments = mergeSegments(rawSegments)
  // Where the grind stopped: the target when inventory sufficed, otherwise the
  // level the affordable path got to before it ran out of materials.
  const reachedLevel = Math.min(tgt, getSkillLevel(xp))
  const totalCycles = segments.reduce((sum, s) => sum + s.cycles, 0)
  const totalTimeSeconds = segments.reduce((sum, s) => sum + s.timeSeconds, 0)
  const totalXp = xpForSkillLevel(reachedLevel) - startXp

  return {
    ...base,
    totalXp,
    totalCycles,
    totalTimeSeconds,
    segments,
    ingredientCost,
    reachedLevel,
  }
}
