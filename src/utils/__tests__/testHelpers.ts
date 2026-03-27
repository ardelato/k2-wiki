import creaturesData from '@/data/creatures.json'
import type {
  Creature,
  PartyPlanCreature,
  PartyPlannerInput,
  PlannerStrategy,
  PlannerTimeBudget,
} from '@/types'

interface FixtureCreature {
  creatureId: string
  startLevel: number
  targetLevel: number
  awakened: boolean
}

interface FixtureData {
  description: string
  creatures: FixtureCreature[]
  expeditions: Record<string, { party: string[]; tier: number; loopCount: number }>
}

const creatureMap = new Map((creaturesData as Creature[]).map((c) => [c.id, c]))

export function buildPlannerInput(
  fixture: FixtureData,
  options: { strategy?: PlannerStrategy; timeBudget?: PlannerTimeBudget } = {},
): PartyPlannerInput {
  const creatures: PartyPlanCreature[] = fixture.creatures.map((fc) => {
    const creature = creatureMap.get(fc.creatureId)
    if (!creature) throw new Error(`Unknown creature: ${fc.creatureId}`)
    const atMax = fc.startLevel >= fc.targetLevel
    return {
      creature,
      startLevel: fc.startLevel,
      targetLevel: fc.targetLevel,
      isBooster: atMax,
      awakened: fc.awakened,
    }
  })

  const expeditions: Record<string, { party: string[]; tier: number; loopCount: number }> = {}
  for (const [id, state] of Object.entries(fixture.expeditions)) {
    expeditions[id] = { ...state }
  }

  return {
    creatures,
    expeditions,
    strategy: options.strategy,
    timeBudget: options.timeBudget,
  }
}
