import creaturesData from '@/data/creatures.json'
import { defaultAwakenGatherUpgrades, defaultAwakenSpeedTiers } from '@/data/defaults'
import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'

import { levelFromXp, getSkillLevel } from './formulas'

interface SaveInventoryItem {
  id: string
  amount: number
}

interface SaveFlower {
  flowerId: string
  x: number
  y: number
  level: number
}

interface SaveHelper {
  creatureId: string
  skillId: string
  activityId: string
}

interface SaveCreature {
  id: string
  species: string
  experience: number
  awakened?: boolean
}

interface SaveMachineInstance {
  id: string
  purchased: boolean
  assignedCreatureId: string | null
}

export interface SaveConfig {
  sanctuary: string[]
  helpers: string[]
  machines: string[]
  inventory: Record<string, number>
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number>
  jobTiers: Record<string, number>
  expeditionCompletions: Record<string, Record<number, number>>
  creatures: SaveCreature[]
  tools?: { sword?: number }
  toolLevels: Record<string, number>
  toolSpeedModes: Record<string, boolean>
  machineLevels: Record<string, number>
  machineRecipes: Record<string, string | null>
  fabricationAllocations: Record<string, number>
  awakenGoldLevel: number
  skillLevels: Record<string, number>
  currentExpedition: ExpeditionData
}

type ExpeditionData = {
  parties: Record<string, string[]>
  tiers: Record<string, number>
  loopCounts: Record<string, number>
  levels: Record<string, number>
}

const GATHER_JOBS = new Set(['Chopping', 'Mining', 'Digging', 'Exploring', 'Fishing', 'Farming'])
const WORKSTATIONS = new Set(['Furnace', 'Stove', 'Workbench'])

const ROMAN_TO_NUM: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 }

export function extractSaveConfig(save: Record<string, unknown>): SaveConfig {
  const sanctuary = Array.isArray(save.sanctuary) ? (save.sanctuary as string[]) : []

  const helpers = Array.isArray(save.helpers)
    ? (save.helpers as SaveHelper[]).map((h) => h.creatureId)
    : []

  const inventory = parseInventory(
    Array.isArray(save.inventory) ? (save.inventory as SaveInventoryItem[]) : [],
  )

  const garden = save.garden as { flowers?: SaveFlower[] } | undefined
  const gardenFlowers = aggregateGardenFlowers(
    Array.isArray(garden?.flowers) ? garden!.flowers : [],
  )

  const upgrades = Array.isArray(save.purchasedUpgrades) ? (save.purchasedUpgrades as string[]) : []
  const { awakenGatherUpgrades, awakenSpeedTiers, awakenGoldLevel } = parseAwakenUpgrades(upgrades)

  const creatures = Array.isArray(save.creatures) ? (save.creatures as SaveCreature[]) : []

  const machines = parseMachineCreatures(save, creatures)

  const jobTiers = parseSanctuaryJobTiers(sanctuary)

  const tools = save.tools || {}
  const toolLevels = parseToolLevels(save)
  const toolSpeedModes = parseToolSpeedModes(save)
  const expeditionCompletions = parseExpeditionCompletions(save)
  const { machineLevels, machineRecipes } = parseMachineDetails(save)
  const fabricationAllocations = parseFabricationAllocations(save)
  const skillLevels = parseSkillLevels(save)

  const currentExpedition = buildExpeditionData(save, creatures)

  return {
    sanctuary,
    helpers,
    machines,
    inventory,
    gardenFlowers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    jobTiers,
    expeditionCompletions,
    creatures,
    tools,
    toolLevels,
    toolSpeedModes,
    machineLevels,
    machineRecipes,
    fabricationAllocations,
    awakenGoldLevel,
    skillLevels,
    currentExpedition,
  }
}

function buildExpeditionData(save: Record<string, any>, creatureMap: SaveCreature[]) {
  const result: ExpeditionData = {
    parties: {},
    tiers: {},
    loopCounts: {},
    levels: {},
  }

  save.activeExpeditions.forEach((exp: any) => {
    const typeId = exp.instance.expeditionTypeId

    result.parties[typeId] = exp.creatures.map(
      (id: string) =>
        creatureMap.find((c: SaveCreature) => {
          if (c.id === id) {
            result.levels[c.species] = levelFromXp(c.experience)
            return true
          }
          return false
        })?.species,
    )

    result.tiers[typeId] = exp.instance.tier
    result.loopCounts[typeId] = exp.loopCount ?? 0
  })

  return result
}

export function parseInventory(inventory: SaveInventoryItem[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of inventory) {
    if (item.amount > 0) {
      result[item.id] = item.amount
    }
  }
  return result
}

export function aggregateGardenFlowers(flowers: SaveFlower[]): Record<string, GardenFlowerEntry[]> {
  const result: Record<string, GardenFlowerEntry[]> = {
    'fire-flower': [],
    'wind-flower': [],
    'earth-flower': [],
    'water-flower': [],
  }

  // Group by flowerId + level, count occurrences
  const groups = new Map<string, Map<number, number>>()
  for (const f of flowers) {
    if (!(f.flowerId in result)) continue
    const levelMap = groups.get(f.flowerId) ?? new Map<number, number>()
    levelMap.set(f.level, (levelMap.get(f.level) ?? 0) + 1)
    groups.set(f.flowerId, levelMap)
  }

  for (const [flowerId, levelMap] of groups) {
    result[flowerId] = [...levelMap.entries()]
      .map(([level, count]) => ({ level, count }))
      .toSorted((a, b) => a.level - b.level)
  }

  return result
}

export function parseAwakenUpgrades(upgrades: string[]): {
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number>
  awakenGoldLevel: number
} {
  const awakenGatherUpgrades = defaultAwakenGatherUpgrades()
  const awakenSpeedTiers = defaultAwakenSpeedTiers()
  let awakenGoldLevel = 0

  const pattern = /^(\w+)-(yield|duration|speed|gold)-(i{1,4}v?)$/
  for (const upgrade of upgrades) {
    const match = upgrade.match(pattern)
    if (!match) continue

    const [, rawName, type, roman] = match
    const tier = ROMAN_TO_NUM[roman] ?? 0
    if (tier === 0) continue

    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)

    if (type === 'speed' && WORKSTATIONS.has(name)) {
      awakenSpeedTiers[name] = Math.max(awakenSpeedTiers[name] ?? 0, tier)
    } else if (type === 'yield' && GATHER_JOBS.has(name)) {
      // Yield is cumulative: yield-i + yield-ii = yieldBonus 2
      awakenGatherUpgrades[name].yieldBonus += 1
    } else if (type === 'duration' && GATHER_JOBS.has(name)) {
      // Duration: highest tier found
      awakenGatherUpgrades[name].durationTier = Math.max(
        awakenGatherUpgrades[name].durationTier,
        tier,
      )
    } else if (type === 'gold' && rawName === 'awaken') {
      awakenGoldLevel = Math.max(awakenGoldLevel, tier)
    }
  }

  return { awakenGatherUpgrades, awakenSpeedTiers, awakenGoldLevel }
}

import { SCORE_DIVISOR, TIER_THRESHOLDS } from './sanctuaryConstants'

const creatureJobScoresMap: Record<string, Record<string, number>> = Object.fromEntries(
  (creaturesData as { id: string; jobs: Record<string, number> }[]).map((c) => [c.id, c.jobs]),
)

export function calculateJobTiersFromSanctuary(sanctuaryIds: string[]): Record<string, number> {
  const jobScores: Record<string, number> = {
    Chopping: 0,
    Mining: 0,
    Digging: 0,
    Exploring: 0,
    Fishing: 0,
    Farming: 0,
  }

  for (const creatureId of sanctuaryIds) {
    const scores = creatureJobScoresMap[creatureId]
    if (!scores) continue
    for (const [job, score] of Object.entries(scores)) {
      const capitalized = job.charAt(0).toUpperCase() + job.slice(1)
      if (capitalized in jobScores) {
        jobScores[capitalized] += score
      }
    }
  }

  const result: Record<string, number> = {}
  for (const job of Object.keys(jobScores)) {
    const percentage = jobScores[job] / SCORE_DIVISOR
    let tier = 0
    for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
      if (percentage >= TIER_THRESHOLDS[i]) {
        tier = i + 1
        break
      }
    }
    result[job] = Math.min(tier, TIER_THRESHOLDS.length)
  }
  return result
}

function parseMachineCreatures(save: Record<string, unknown>, creatures: SaveCreature[]): string[] {
  const machinesState = save.machines as
    | { machines?: Record<string, SaveMachineInstance> }
    | undefined
  if (!machinesState?.machines) return []

  // Build instance ID → species lookup
  const instanceToSpecies = new Map<string, string>()
  for (const c of creatures) {
    if (c.id) instanceToSpecies.set(c.id, c.species)
  }

  const result: string[] = []
  for (const machine of Object.values(machinesState.machines)) {
    if (machine.purchased && machine.assignedCreatureId) {
      const species = instanceToSpecies.get(machine.assignedCreatureId)
      if (species) result.push(species)
    }
  }

  return result
}

function parseExpeditionCompletions(
  save: Record<string, unknown>,
): Record<string, Record<number, number>> {
  const raw = save.expeditionCompletions
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, Record<number, number>> = {}
  for (const [expId, tiers] of Object.entries(raw as Record<string, unknown>)) {
    if (!tiers || typeof tiers !== 'object') continue
    const tierCounts: Record<number, number> = {}
    for (const [tier, count] of Object.entries(tiers as Record<string, unknown>)) {
      if (typeof count === 'number' && count > 0) {
        tierCounts[Number(tier)] = count
      }
    }
    if (Object.keys(tierCounts).length > 0) {
      result[expId] = tierCounts
    }
  }
  return result
}

function parseSanctuaryJobTiers(sanctuary: string[]): Record<string, number> {
  return calculateJobTiersFromSanctuary(sanctuary)
}

function parseToolLevels(save: Record<string, unknown>): Record<string, number> {
  const tools = save.tools
  if (!tools || typeof tools !== 'object') return {}
  const result: Record<string, number> = {}
  for (const [toolId, level] of Object.entries(tools as Record<string, unknown>)) {
    if (typeof level === 'number' && level > 0) {
      result[toolId] = level
    }
  }
  return result
}

function parseToolSpeedModes(save: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const ws of ['furnace', 'stove', 'workbench']) {
    const wsState = save[ws]
    if (wsState && typeof wsState === 'object' && 'speedMode' in wsState) {
      result[ws.charAt(0).toUpperCase() + ws.slice(1)] = !!(wsState as any).speedMode
    }
  }
  return result
}

function parseMachineDetails(save: Record<string, unknown>): {
  machineLevels: Record<string, number>
  machineRecipes: Record<string, string | null>
} {
  const machinesState = save.machines as
    | {
        machines?: Record<
          string,
          { id: string; purchased: boolean; level?: number; selectedRecipeId?: string | null }
        >
      }
    | undefined
  if (!machinesState?.machines) return { machineLevels: {}, machineRecipes: {} }

  const machineLevels: Record<string, number> = {}
  const machineRecipes: Record<string, string | null> = {}

  for (const machine of Object.values(machinesState.machines)) {
    if (machine.purchased) {
      if (typeof machine.level === 'number') {
        machineLevels[machine.id] = machine.level
      }
      if (machine.selectedRecipeId !== undefined) {
        machineRecipes[machine.id] = machine.selectedRecipeId
      }
    }
  }

  return { machineLevels, machineRecipes }
}

function parseFabricationAllocations(save: Record<string, unknown>): Record<string, number> {
  const fabrication = save.fabrication as { allocations?: Record<string, number> } | undefined
  if (!fabrication?.allocations) return {}

  const result: Record<string, number> = {}
  for (const [itemId, amount] of Object.entries(fabrication.allocations)) {
    if (typeof amount === 'number' && amount > 0) {
      result[itemId] = amount
    }
  }
  return result
}

function parseSkillLevels(save: Record<string, unknown>): Record<string, number> {
  const skills = save.skills
  if (!Array.isArray(skills)) return {}
  const result: Record<string, number> = {}
  for (const skill of skills as Array<{ id?: string; xp?: number }>) {
    if (typeof skill.id === 'string' && typeof skill.xp === 'number') {
      result[skill.id] = getSkillLevel(skill.xp)
    }
  }
  return result
}
