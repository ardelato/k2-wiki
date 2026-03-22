import creaturesData from '@/data/creatures.json'
import expeditionsData from '@/data/expeditions.json'
import itemsData from '@/data/items.json'
import jobsData from '@/data/jobs.json'
import type {
  Creature,
  ContainerSource,
  Item,
  JobActivitySource,
  RecipeUsage,
  SummoningReference,
} from '@/types'

export interface ExpeditionSource {
  expeditionId: string
  expeditionName: string
  amount: number
  baseDuration: number
}

export const items = itemsData as Item[]
const creatures = creaturesData as Creature[]

export const itemById = new Map<string, Item>()
for (const item of items) {
  itemById.set(item.id, item)
}

export const jobActivityIndex = new Map<string, JobActivitySource[]>()
for (const job of jobsData) {
  if (!job.activities) continue
  for (const activity of job.activities) {
    if (!activity.output) continue
    for (const out of activity.output) {
      const existing = jobActivityIndex.get(out.id) ?? []
      existing.push({
        jobId: job.id,
        activityName: activity.name,
        levelRequirement: activity.levelRequirement,
        duration: activity.duration,
        chance: out.chance,
        min: out.min,
        max: out.max,
      })
      jobActivityIndex.set(out.id, existing)
    }
  }
}

export const recipeUsageIndex = new Map<string, RecipeUsage[]>()
for (const item of items) {
  for (const recipe of item.recipes) {
    for (const ingredient of recipe.ingredients) {
      const existing = recipeUsageIndex.get(ingredient.id) ?? []
      existing.push({
        outputItemId: item.id,
        outputItemName: item.name,
        workstation: recipe.workstation,
        amountNeeded: ingredient.amount,
      })
      recipeUsageIndex.set(ingredient.id, existing)
    }
  }
}

export const containerSourceIndex = new Map<string, ContainerSource[]>()
for (const item of items) {
  if (!item.lootTable) continue
  for (const entry of item.lootTable) {
    const existing = containerSourceIndex.get(entry.id) ?? []
    existing.push({
      containerId: item.id,
      containerName: item.name,
      amount: entry.amount,
      chance: entry.chance,
    })
    containerSourceIndex.set(entry.id, existing)
  }
}

export const expeditionSourceIndex = new Map<string, ExpeditionSource[]>()
for (const expedition of expeditionsData) {
  for (const reward of expedition.rewards) {
    const existing = expeditionSourceIndex.get(reward.itemId) ?? []
    existing.push({
      expeditionId: expedition.id,
      expeditionName: expedition.name,
      amount: reward.amount,
      baseDuration: expedition.baseDuration,
    })
    expeditionSourceIndex.set(reward.itemId, existing)
  }
}

export const summoningIndex = new Map<string, SummoningReference[]>()
for (const creature of creatures) {
  for (const cost of creature.summoningCost) {
    const existing = summoningIndex.get(cost.id) ?? []
    existing.push({ id: creature.id, name: creature.name })
    summoningIndex.set(cost.id, existing)
  }
}
