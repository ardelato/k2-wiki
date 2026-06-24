import creaturesData from '@/data/creatures.json'
import dungeonsData from '@/data/dungeons.json'
import expeditionsData from '@/data/expeditions.json'
import itemsData from '@/data/items.json'
import jobsData from '@/data/jobs.json'
import machinesData from '@/data/machines.json'
import toolsData from '@/data/tools.json'
import type {
  Creature,
  ContainerSource,
  Item,
  JobActivitySource,
  Machine,
  RecipeUsage,
  SummoningReference,
  Tool,
} from '@/types'

interface ExpeditionSource {
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

export const toolById = new Map<string, Tool>()
for (const tool of toolsData.tools as Tool[]) {
  toolById.set(tool.id, tool)
}

export const machineById = new Map<string, Machine>()
for (const machine of machinesData.machines as Machine[]) {
  machineById.set(machine.id, machine)
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

interface MachineRecipeSource {
  machineId: string
  machineName: string
  baseInterval: number
  inputItemId: string | null
  inputAmount: number
  secondaryInputItemId?: string
  secondaryInputAmount?: number
  outputAmount: number
}

export const machineRecipeIndex = new Map<string, MachineRecipeSource[]>()
for (const machine of machinesData.machines) {
  if (machine.recipes.length > 0) {
    // Processor — index each recipe by output item
    for (const recipe of machine.recipes) {
      const outputId = recipe.outputItemId
      const existing = machineRecipeIndex.get(outputId) ?? []
      existing.push({
        machineId: machine.id,
        machineName: machine.name,
        baseInterval: machine.baseInterval,
        inputItemId: recipe.inputItemId,
        inputAmount: recipe.inputAmount,
        ...('secondaryInputItemId' in recipe && recipe.secondaryInputItemId
          ? {
              secondaryInputItemId: recipe.secondaryInputItemId,
              secondaryInputAmount: recipe.secondaryInputAmount,
            }
          : {}),
        outputAmount: recipe.outputAmount,
      })
      machineRecipeIndex.set(outputId, existing)
    }
  } else if (machine.outputItemId) {
    // Generator — outputs 1 item per cycle with no input
    const existing = machineRecipeIndex.get(machine.outputItemId) ?? []
    existing.push({
      machineId: machine.id,
      machineName: machine.name,
      baseInterval: machine.baseInterval,
      inputItemId: null,
      inputAmount: 0,
      outputAmount: 1,
    })
    machineRecipeIndex.set(machine.outputItemId, existing)
  }
}

export const machineSpeedMultipliers = machinesData.speedMultipliers

/**
 * Items that drop as dungeon *combat* rewards (Chronicle Rune, Hide, Meat, Egg). Used by the
 * planner to surface an "Also obtainable from the Dungeon" callout — these are the items where
 * a dungeon run is a meaningful alternative source. Gathering rewards are intentionally excluded
 * (nearly every gathered material drops in a dungeon, so flagging them all would be noise).
 */
export const dungeonCombatRewardIds = new Set<string>()
for (const rewards of Object.values(dungeonsData.combatRewards)) {
  for (const reward of rewards) {
    dungeonCombatRewardIds.add(reward.itemId)
  }
}
