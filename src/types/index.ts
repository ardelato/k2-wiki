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
  image: string
  recipes: ItemRecipe[]
  summoning?: SummoningReference[]
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
  gardenTimeSeconds: number // passive
  expeditionTimeSeconds: number // passive
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

export type CreatureStatKey = keyof CreatureStats
export type ExpeditionStatKey = keyof ExpeditionStatWeights
export type JobKey = keyof Jobs
export type SortField = CreatureStatKey | 'name' | 'tier'
