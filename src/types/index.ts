export type ElementType = 'Fire' | 'Water' | 'Wind' | 'Earth'

/** Shared stat block used by CreatureStats and ExpeditionStatWeights. */
export interface StatBlock {
  power: number
  grit: number
  agility: number
  smarts: number
  looting: number
  luck: number
}

export type CreatureStats = StatBlock

// Declared as a `type` (not `interface`) so it gains an implicit index
// signature and stays assignable to `Record<string, number>` — several skill
// utilities index jobs by a dynamic skill key.
export type Jobs = {
  chopping: number
  mining: number
  digging: number
  exploring: number
  fishing: number
  farming: number
}

export interface Creature {
  id: string
  name: string
  mainJob: string
  description: string
  image: string
  tier: number
  trait: string
  types: ElementType[]
  stats: CreatureStats
  jobs: Jobs
  summoningCost: ItemQuantity[]
}

export type ExpeditionStatWeights = StatBlock

export interface Expedition {
  id: string
  name: string
  description: string
  image: string
  baseRating: number
  baseDuration: number
  baseXP: number
  maxPartySize: number
  trait: string
  biome: string
  requiredExpeditionCompletions: number
  statWeights: ExpeditionStatWeights
  rewards: ItemReward[]
}

// Dungeon types
export type DungeonFocus = 'combat' | 'gathering'
export type DungeonGradeLetter = 'S' | 'A' | 'B' | 'C' | 'F'
export type GatheringSubFocus =
  | 'Chopping'
  | 'Mining'
  | 'Digging'
  | 'Farming'
  | 'Fishing'
  | 'Exploring'

export interface DungeonTier {
  tier: number
  baseRating: number
  xpReward: number
}

export interface DungeonGrade {
  grade: DungeonGradeLetter
  minRatio: number
  multiplier: number
}

export interface DungeonReward {
  itemId: string
  amount: number
}

export interface DungeonConfig {
  duration: number
  maxPartySize: number
  requiresItem: string
  tierLevelRequirements: Record<DungeonFocus, Record<string, number>>
  tiers: DungeonTier[]
  grades: DungeonGrade[]
  statWeights: Record<DungeonFocus, ExpeditionStatWeights>
  combatRewards: Record<string, DungeonReward[]>
  gatheringRewards: Record<GatheringSubFocus, Record<string, DungeonReward[]>>
}

export interface Biome {
  id: string
  name: string
  description: string
  image: string
  advantage: ElementType[]
  disadvantage: ElementType[]
}

export type ItemType = 'Currency' | 'Container' | 'Gathered' | 'Refined' | 'Sellable' | 'Consumable'

/** A quantity of an item referenced by `id`. Used in summoningCost, ingredients, loot tables, etc. */
export interface ItemQuantity {
  id: string
  amount: number
}

/** A quantity of an item referenced by `itemId`. Used in expedition/dungeon rewards. */
export interface ItemReward {
  itemId: string
  amount: number
}

export interface ItemRecipe {
  workstation: string
  levelRequirement: number
  ingredients: ItemQuantity[]
  outputAmount: number
  craftTime: number
  experience: number
}

export interface LootTableEntry {
  id: string
  amount: number
  chance: number
}

export interface SummoningReference {
  id: string
  name: string
}

export interface Item {
  id: string
  name: string
  type: ItemType
  sources: string[]
  description: string
  image?: string
  recipes: ItemRecipe[]
  lootTable?: LootTableEntry[]
  buyValue?: number
  sellValue?: number
}

export interface JobActivitySource {
  jobId: string
  activityName: string
  levelRequirement: number
  duration: number
  chance: number
  min: number
  max: number
}

export type PlannerMethodKind =
  | 'craft'
  | 'gather'
  | 'garden'
  | 'container'
  | 'expedition'
  | 'buy'
  | 'unknown'
  | 'cycle'
  | 'stocked'
  | 'machine'
  | 'fabrication'

export interface RecipeUsage {
  outputItemId: string
  outputItemName: string
  workstation: string
  amountNeeded: number
}

export interface ContainerSource {
  containerId: string
  containerName: string
  amount: number
  chance: number
}

export interface PlannerMethodDetail {
  label: string
  value: string
  estimated?: boolean
}

export interface PlannerMethodChild {
  itemId: string
  amount: number
  nodeId: string
}

export interface PlannerMethod {
  id: string
  nodeId: string
  kind: PlannerMethodKind
  title: string
  subtitle: string
  requiredAmount: number
  localTimeSeconds: number | null
  totalTimeSeconds: number | null
  /** B1: active hands-on time (s). Only manual gathering is active; passive/instant methods = 0; children sum. Set during selection. */
  activeTimeSeconds?: number | null
  cost: number | null
  detailRows: PlannerMethodDetail[]
  formula?: string
  notes: string[]
  children: PlannerMethodChild[]
  /** Number of gathering actions needed (gather methods only) */
  actionsNeeded?: number
  /** Skill + level needed to perform this method (gather/craft only; absent otherwise). */
  skillGate?: { skill: string; level: number }
}

/**
 * A planned node the player can't yet acquire: its active method's skill gate is above
 * the player's current level in that skill. Drives the planner's "locked resource" flag.
 */
export interface PlannerLockedGate {
  skill: string
  level: number
  current: number
}

/** Plan-level roll-up of locked gates: how many resources are blocked + the worst gate. */
export interface PlannerSkillGateSummary {
  /** Distinct resources (by itemId) the player can't yet acquire. */
  count: number
  /** The single most-blocking gate (highest required level). */
  highest: { skill: string; level: number }
}

export interface PlannerNode {
  id: string
  itemId: string
  itemName: string
  itemType: ItemType
  /** Amount still needed after inventory/queue stock was claimed. */
  requiredAmount: number
  /** Original amount before any stock was claimed (the from-scratch cost). */
  grossAmount: number
  depth: number
  defaultMethodId: string | null
  methods: PlannerMethod[]
  issues: string[]
  fulfilled: boolean
}

export interface PlannerSummaryLeaf {
  itemId: string
  itemName: string
  amount: number
  stillNeeded: number
  acquisitionKind: PlannerMethodKind
  inventoryAmount: number
}

export interface PlannerTimeBreakdown {
  gatherTimeByJob: Record<string, number> // serial within job, parallel across jobs
  craftTimeByWorkstation: Record<string, number> // serial within station, parallel across stations
  machineTimeByMachine: Record<string, number>
  gardenTimeSeconds: number // passive
  expeditionTimeSeconds: number // passive
  fabricationTimeSeconds: number
  activeTimeSeconds: number // max(max(per-job), max(per-workstation))
  passiveTimeSeconds: number // max(garden, expedition)
}

export interface PlannerSummary {
  totalTimeSeconds: number | null
  timeBreakdown: PlannerTimeBreakdown | null
  totalCost: number
  leafItems: PlannerSummaryLeaf[]
  craftStepCount: number
  branchPointCount: number
  missingTimeNodeCount: number
}

export interface ScheduledTask {
  nodeId: string
  itemId: string
  itemName: string
  resource: string
  kind: PlannerMethodKind
  startTime: number
  endTime: number
  localTime: number
  depth: number
  /** nodeIds of tasks that must complete before this task can start */
  dependencies?: string[]
  passive?: {
    kind: 'machine' | 'fabrication'
    machineName?: string
    machineId?: string
    machineLevel?: number
    baseInterval?: number
    effectiveInterval?: number
    outputAmount?: number
    produced: number
    ratePerMin: number
    fabricationPoints?: number
    /** nodeId of the tree node this passive task supplements */
    linkedNodeId?: string
  }
}

export interface PlannerSchedule {
  tasks: ScheduledTask[]
  resourceOrder: string[]
  totalTime: number
  completionTimeByNode: Record<string, number>
}

export interface CreatureCollectionEntry {
  owned: boolean
  level: number // 1-120
  awakened: boolean
}

export interface GardenFlowerEntry {
  count: number
  level: number
}

export interface GardenCell {
  flowerId: string
  level: number
}

export interface AwakenGatherUpgrade {
  yieldBonus: number // 0, 1, or 2 (Yield I = +1, Yield II = +1 more)
  durationTier: number // 0–4, each tier = -5% activity duration
  xpTier: number // 0–6, each purchased skill_xp node = +10% XP
}

export interface PartyPlanCreature {
  creature: Creature
  startLevel: number
  targetLevel: number
  isBooster: boolean
  awakened: boolean
}

export interface PartyPlannerExpeditionState {
  party: string[]
  tier: number
  loopCount: number
}

export type PlannerStrategy = 'optimal' | 'hands-free'

export type PlannerTimeBudget = 'quick' | 'thorough'

export interface PartyPlannerInput {
  creatures: PartyPlanCreature[]
  expeditions: Record<string, PartyPlannerExpeditionState>
  expeditionTierSelections?: Record<string, number[]>
  strategy?: PlannerStrategy
  timeBudget?: PlannerTimeBudget
  wallClockLimitMs?: number
  swordXpMultiplier?: number
  /**
   * Cap on how many leveling creatures may share one expedition party. Set to 1
   * for the Awaken queue so each creature runs solo with boosters only; left
   * undefined (unlimited) for the Custom party planner's shared-XP grouping.
   */
  maxLevelersPerParty?: number
}

export interface PartyPlannerProgress {
  phase: 'initializing' | 'candidates' | 'waves' | 'beam' | 'finalizing'
  iteration: number
  maxIterations: number
  beamSize: number
  stateIndex: number
  statesInIteration: number
  exploredStates: number
  expeditionsConsidered: number
  waveVariantsEvaluated: number
  bestCompleteTimeSeconds: number | null
  iterationBudget: number
  startedAtMs: number
  updatedAtMs: number
  elapsedMs: number
}

export type PartyPlannerWorkerMessage =
  | { type: 'progress'; progress: PartyPlannerProgress }
  | { type: 'result'; result: PartyLevelingPlan }

export interface PartyPlanMember {
  creatureId: string
  fromLevel: number
  toLevel: number
  xpGained: number
  isBooster: boolean
}

/** Fields common to every party plan step, regardless of kind. */
interface PartyPlanStepBase {
  party: PartyPlanMember[]
  runs: number
  timeSeconds: number
  xpPerMinute: number
  /** True when this step represents a reconfiguration of an active assignment. */
  wasReconfigured: boolean
  startTime?: number
  endTime?: number
}

/** A normal expedition run step that advances party members' levels. */
export interface RunPartyStep extends PartyPlanStepBase {
  kind: 'run'
  expedition: Expedition
  tier: number
  biomeName: string
  loopCount: number
  loopCountStart: number
  loopCountEnd: number
  preservedLoopBonus: boolean
}

/** A marker step representing a creature awakening (no expedition is run). */
export interface AwakenPartyStep extends PartyPlanStepBase {
  kind: 'awaken'
}

export type PartyPlanStep = RunPartyStep | AwakenPartyStep

/** Narrowing guard: true when the party step is a normal expedition run. */
export function isRunPartyStep(step: PartyPlanStep): step is RunPartyStep {
  return step.kind === 'run'
}

export interface CreatureLevelingSummary {
  creatureId: string
  startLevel: number
  endLevel: number
  totalTimeSeconds: number
  totalRuns: number
  expeditionsUsed: string[]
}

export interface AwakenEvent {
  creatureId: string
  clockTime: number
}

export interface PartyLevelingPlan {
  steps: PartyPlanStep[]
  summaries: CreatureLevelingSummary[]
  awakenEvents: AwakenEvent[]
  inputLevelerCount: number
  plannedLevelerCount: number
  isComplete: boolean
  incompleteCreatureIds: string[]
  totalTimeSeconds: number
  totalRuns: number
}

export type ExpeditionStatKey = keyof ExpeditionStatWeights
export type JobKey = keyof Jobs

// Machine types
export type MachineType = 'generator' | 'processor'

export interface MachineRecipe {
  inputItemId: string
  inputAmount: number
  outputItemId: string
  outputAmount: number
  secondaryInputItemId?: string
  secondaryInputAmount?: number
}

export interface MachineUpgradeCost {
  barId: string
  barAmount: number
  planksAmount: number
}

export interface Machine {
  id: string
  name: string
  description: string
  image?: string
  cost: number
  machineType: MachineType
  outputItemId: string | null
  baseInterval: number
  requiresCreature: boolean
  creatureTypeRequired: ElementType[] | null
  recipes: MachineRecipe[]
}

// Tool types
export type ToolCategory = 'gathering' | 'other' | 'workstation'

export interface ToolUpgradeCost {
  barId: string
  amount: number
}

export interface Tool {
  id: string
  name: string
  description: string
  image: string
  skillId: string
  category: ToolCategory
}
