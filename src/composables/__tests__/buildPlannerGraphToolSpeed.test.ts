import { buildPlannerGraph, type PlannerModifiers } from '@/composables/useCraftPlanner'

/**
 * Tests the exact craft time formulas in buildPlannerGraph for tool speed mode.
 *
 * knife: Workbench, craftTime = 4, outputAmount = 1, no machine source
 * With machineLevels={} and fabricationAllocations={}, passive.rate = 0
 * So localTimeSeconds = craftsNeeded * effectiveCraftTime exactly.
 *
 * Formula:
 *   awakenReduction    = awakenSpeedTiers[ws] * 0.15
 *   toolSpeedBonus     = toolSpeedBonuses[ws]  (fraction, e.g. 0.10)
 *   speedReduction     = awakenReduction + toolSpeedBonus
 *   effectiveCraftTime = max(craftTime * 0.01, craftTime * (1 - speedReduction))
 *   localTimeSeconds   = craftsNeeded * effectiveCraftTime  (when passive.rate = 0)
 */

function emptyModifiers(overrides: Partial<PlannerModifiers> = {}): PlannerModifiers {
  return {
    gardenFlowers: {},
    awakenGatherUpgrades: {},
    awakenSpeedTiers: {},
    toolSpeedBonuses: {},
    jobTiers: {},
    goldPerMinute: 0,
    machineLevels: {},
    fabricationAllocations: {},
    expeditionTier: 1,
    ...overrides,
  }
}

function getCraftMethod(graph: ReturnType<typeof buildPlannerGraph>, workstation: string) {
  const methods = Object.values(graph.methodsById)
  const rootId = graph.root?.id
  return methods.find((m) => m.nodeId === rootId && m.kind === 'craft' && m.title === workstation)!
}

describe('buildPlannerGraph — tool speed exact formulas', () => {
  // knife: Workbench, craftTime=4, outputAmount=1, no machine → passive.rate=0

  test('baseline: no speed bonuses, localTimeSeconds = craftTime', () => {
    const graph = buildPlannerGraph('knife', 1, {}, emptyModifiers())
    const method = getCraftMethod(graph, 'Workbench')

    // effectiveCraftTime = max(4 * 0.01, 4 * 1.0) = max(0.04, 4) = 4
    // localTimeSeconds = 1 * 4 = 4
    expect(method.localTimeSeconds).toBe(4)
  })

  test('tool speed 10% reduction (level 5 × 2%)', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ toolSpeedBonuses: { Workbench: 0.1 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // effectiveCraftTime = max(0.04, 4 * 0.90) = max(0.04, 3.6) = 3.6
    expect(method.localTimeSeconds).toBeCloseTo(3.6, 10)
  })

  test('tool speed 20% reduction (level 10 × 2%)', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ toolSpeedBonuses: { Workbench: 0.2 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // effectiveCraftTime = max(0.04, 4 * 0.80) = max(0.04, 3.2) = 3.2
    expect(method.localTimeSeconds).toBeCloseTo(3.2, 10)
  })

  test('awaken speed only: tier 2 = 30% reduction', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ awakenSpeedTiers: { Workbench: 2 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // speedReduction = 2 * 0.15 = 0.30
    // effectiveCraftTime = max(0.04, 4 * 0.70) = max(0.04, 2.8) = 2.8
    expect(method.localTimeSeconds).toBeCloseTo(2.8, 10)
  })

  test('additive stacking: awaken tier 2 (30%) + tool speed 20% = 50%', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({
        awakenSpeedTiers: { Workbench: 2 },
        toolSpeedBonuses: { Workbench: 0.2 },
      }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // speedReduction = 0.30 + 0.20 = 0.50
    // effectiveCraftTime = max(0.04, 4 * 0.50) = max(0.04, 2) = 2
    expect(method.localTimeSeconds).toBe(2)
  })

  test('additive stacking: awaken tier 4 (60%) + tool speed 20% = 80%', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({
        awakenSpeedTiers: { Workbench: 4 },
        toolSpeedBonuses: { Workbench: 0.2 },
      }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // speedReduction = 0.60 + 0.20 = 0.80
    // effectiveCraftTime = max(0.04, 4 * 0.20) = max(0.04, 0.8) = 0.8
    expect(method.localTimeSeconds).toBeCloseTo(0.8, 10)
  })

  test('minimum floor clamps extreme reductions', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({
        awakenSpeedTiers: { Workbench: 4 },
        // 60% + 42% = 102% → would go negative without floor
        toolSpeedBonuses: { Workbench: 0.42 },
      }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    // speedReduction = 0.60 + 0.42 = 1.02
    // craftTime * (1 - 1.02) = 4 * (-0.02) = -0.08
    // Floor = 4 * 0.01 = 0.04
    // effectiveCraftTime = max(0.04, -0.08) = 0.04
    expect(method.localTimeSeconds).toBeCloseTo(0.04, 10)
  })

  test('quantity scales linearly', () => {
    const modifiers = emptyModifiers({ toolSpeedBonuses: { Workbench: 0.1 } })

    const graph1 = buildPlannerGraph('knife', 1, {}, modifiers)
    const time1 = getCraftMethod(graph1, 'Workbench').localTimeSeconds!

    const graph5 = buildPlannerGraph('knife', 5, {}, modifiers)
    const time5 = getCraftMethod(graph5, 'Workbench').localTimeSeconds!

    expect(time1).toBeCloseTo(3.6, 10)
    expect(time5).toBeCloseTo(18, 10)
    expect(time5).toBeCloseTo(time1 * 5, 10)
  })

  test('tool speed bonus for wrong workstation has no effect', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ toolSpeedBonuses: { Furnace: 0.2, Stove: 0.2 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')

    expect(method.localTimeSeconds).toBe(4)
  })
})

describe('buildPlannerGraph — tool speed detail rows', () => {
  test('Speed Tier row shows correct value with Speed unit', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ awakenSpeedTiers: { Workbench: 3 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')
    const row = method.detailRows.find((r) => r.label === 'Speed Tier')

    expect(row).toBeDefined()
    expect(row!.value).toBe('+45% Speed')
  })

  test('Tool Speed row shows correct value with Speed unit', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({ toolSpeedBonuses: { Workbench: 0.14 } }),
    )
    const method = getCraftMethod(graph, 'Workbench')
    const row = method.detailRows.find((r) => r.label === 'Tool Speed')

    expect(row).toBeDefined()
    expect(row!.value).toBe('+14% Speed')
  })

  test('both rows present when both bonuses active', () => {
    const graph = buildPlannerGraph(
      'knife',
      1,
      {},
      emptyModifiers({
        awakenSpeedTiers: { Workbench: 1 },
        toolSpeedBonuses: { Workbench: 0.06 },
      }),
    )
    const method = getCraftMethod(graph, 'Workbench')
    const rows = method.detailRows

    expect(rows.find((r) => r.label === 'Speed Tier')!.value).toBe('+15% Speed')
    expect(rows.find((r) => r.label === 'Tool Speed')!.value).toBe('+6% Speed')
  })

  test('no speed rows when no bonuses', () => {
    const graph = buildPlannerGraph('knife', 1, {}, emptyModifiers())
    const method = getCraftMethod(graph, 'Workbench')

    expect(method.detailRows.find((r) => r.label === 'Speed Tier')).toBeUndefined()
    expect(method.detailRows.find((r) => r.label === 'Tool Speed')).toBeUndefined()
  })
})
