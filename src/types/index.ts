export type ElementType = 'Fire' | 'Water' | 'Wind' | 'Earth'

export interface CreatureStats {
  power: number
  grit: number
  agility: number
  smarts: number
  looting: number
  luck: number
}

export interface Jobs {
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
  summoningCost: { id: string; amount: number }[]
}

export interface ExpeditionStatWeights {
  power: number
  grit: number
  agility: number
  smarts: number
  looting: number
  luck: number
}

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
  rewards: { itemId: string; amount: number }[]
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

export interface ItemRecipe {
  workstation: string
  levelRequirement: number
  ingredients: { id: string; amount: number }[]
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
  cost: number | null
  detailRows: PlannerMethodDetail[]
  formula?: string
  notes: string[]
  children: PlannerMethodChild[]
}

export interface PlannerNode {
  id: string
  itemId: string
  itemName: string
  itemType: ItemType
  requiredAmount: number
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

export interface AwakenGatherUpgrade {
  yieldBonus: number // 0, 1, or 2 (Yield I = +1, Yield II = +1 more)
  durationTier: number // 0–4, each tier = -5% activity duration
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
  expeditionMaxTiers?: Record<string, number>
  strategy?: PlannerStrategy
  timeBudget?: PlannerTimeBudget
  wallClockLimitMs?: number
  swordXpMultiplier?: number
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

export interface PartyPlanStep {
  expedition: Expedition
  tier: number
  party: PartyPlanMember[]
  runs: number
  timeSeconds: number
  xpPerMinute: number
  biomeName: string
  loopCount: number
  loopCountStart: number
  loopCountEnd: number
  preservedLoopBonus: boolean
  wasReconfigured: boolean
  startTime?: number
  endTime?: number
  isAwakeningStep?: boolean
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

export type CreatureStatKey = keyof CreatureStats
export type ExpeditionStatKey = keyof ExpeditionStatWeights
export type JobKey = keyof Jobs
export type SortField = CreatureStatKey | 'name' | 'tier'

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
