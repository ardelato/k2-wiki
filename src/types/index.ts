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
  chance: number
  min: number
  max: number
}

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

export type CreatureStatKey = keyof CreatureStats
export type ExpeditionStatKey = keyof ExpeditionStatWeights
export type JobKey = keyof Jobs
export type SortField = CreatureStatKey | 'name' | 'tier'
