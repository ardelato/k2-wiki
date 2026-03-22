import creaturesData from '@/data/creatures.json'
import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/types'

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
  creatures: SaveCreature[]
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
  const { awakenGatherUpgrades, awakenSpeedTiers } = parseAwakenUpgrades(upgrades)

  const creatures = Array.isArray(save.creatures) ? (save.creatures as SaveCreature[]) : []

  const machines = parseMachineCreatures(save, creatures)

  const jobTiers = parseSanctuaryJobTiers(sanctuary)

  return {
    sanctuary,
    helpers,
    machines,
    inventory,
    gardenFlowers,
    awakenGatherUpgrades,
    awakenSpeedTiers,
    jobTiers,
    creatures,
  }
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
} {
  const awakenGatherUpgrades: Record<string, AwakenGatherUpgrade> = {
    Chopping: { yieldBonus: 0, durationTier: 0 },
    Mining: { yieldBonus: 0, durationTier: 0 },
    Digging: { yieldBonus: 0, durationTier: 0 },
    Exploring: { yieldBonus: 0, durationTier: 0 },
    Fishing: { yieldBonus: 0, durationTier: 0 },
    Farming: { yieldBonus: 0, durationTier: 0 },
  }

  const awakenSpeedTiers: Record<string, number> = {
    Furnace: 0,
    Stove: 0,
    Workbench: 0,
  }

  const pattern = /^(\w+)-(yield|duration|speed)-(i{1,4}v?)$/
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
    }
  }

  return { awakenGatherUpgrades, awakenSpeedTiers }
}

const SCORE_DIVISOR = 60
const TIER_THRESHOLDS = [0.1, 0.3, 0.5, 0.7, 0.9]

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

function parseSanctuaryJobTiers(sanctuary: string[]): Record<string, number> {
  return calculateJobTiersFromSanctuary(sanctuary)
}
