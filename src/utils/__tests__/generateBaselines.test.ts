/**
 * Baseline generation script.
 * Run with: npx vitest run src/utils/__tests__/generateBaselines.ts
 *
 * Generates baseline score snapshots by running the planner against each fixture.
 * Outputs to fixtures/baselines.json.
 */
import { writeFileSync } from 'fs'
import { resolve } from 'path'

import { describe, test } from 'vitest'

import { planPartyLevelingPath } from '@/utils/partyPlanner'
import { scorePlan } from '@/utils/planScorer'

import collectionFull from './fixtures/collection-full.json'
import collectionSmall from './fixtures/collection-small.json'
import { buildPlannerInput } from './testHelpers'

interface BaselineEntry {
  fixture: string
  strategy: string
  score: ReturnType<typeof scorePlan>
}

describe('generate baselines', () => {
  test('write baselines.json', { timeout: 60_000 }, () => {
    const baselines: BaselineEntry[] = []

    const fixtures = [
      { name: 'full', data: collectionFull },
      { name: 'small', data: collectionSmall },
    ] as const

    const strategies = ['optimal', 'hands-free'] as const

    for (const fixture of fixtures) {
      for (const strategy of strategies) {
        console.log(`Running ${fixture.name} / ${strategy}...`)
        const input = buildPlannerInput(fixture.data, { strategy, timeBudget: 'thorough' })
        const plan = planPartyLevelingPath(input)
        const score = scorePlan(plan)
        baselines.push({
          fixture: fixture.name,
          strategy,
          score,
        })
        console.log(
          `  → complete=${score.isComplete}, time=${score.totalTimeSeconds}s, runs=${score.totalRuns}`,
        )
      }
    }

    const outPath = resolve(__dirname, 'fixtures/baselines.json')
    writeFileSync(outPath, JSON.stringify(baselines, null, 2) + '\n')
    console.log(`\nBaselines written to ${outPath}`)
  })
})
