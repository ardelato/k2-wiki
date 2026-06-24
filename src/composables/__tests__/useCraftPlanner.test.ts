import { ref } from 'vue'

import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'

describe('useCraftPlanner — machine and fabrication methods', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('copper-bar node includes a Smelter machine method', () => {
    // A2: a processor's machine method is offered only when it's set to that recipe.
    useGameConfig().setMachineRecipes({ smelter: 'copper-bar' })
    const targetItemId = ref('copper-bar')
    const targetQuantity = ref(1)
    const { rootNode } = useCraftPlanner(targetItemId, targetQuantity)

    expect(rootNode.value).not.toBeNull()
    const methods = rootNode.value!.methods
    const machineMethod = methods.find((m) => m.kind === 'machine')
    expect(machineMethod).toBeDefined()
    expect(machineMethod!.title).toBe('Smelter')
  })

  test('stone node includes a Stone Quarry machine method', () => {
    const targetItemId = ref('stone')
    const targetQuantity = ref(1)
    const { rootNode } = useCraftPlanner(targetItemId, targetQuantity)

    expect(rootNode.value).not.toBeNull()
    const methods = rootNode.value!.methods
    const machineMethod = methods.find((m) => m.kind === 'machine')
    expect(machineMethod).toBeDefined()
    expect(machineMethod!.title).toBe('Stone Quarry')
  })

  test('machine method time decreases with higher machine level', () => {
    useGameConfig().setMachineRecipes({ smelter: 'copper-bar' })
    const targetItemId = ref('copper-bar')
    const targetQuantity = ref(10)
    const { rootNode, setMachineLevel } = useCraftPlanner(targetItemId, targetQuantity)

    const methodAtLevel0 = rootNode.value!.methods.find((m) => m.kind === 'machine')!
    const timeAtLevel0 = methodAtLevel0.localTimeSeconds!

    setMachineLevel('smelter', 5)

    const methodAtLevel5 = rootNode.value!.methods.find((m) => m.kind === 'machine')!
    const timeAtLevel5 = methodAtLevel5.localTimeSeconds!

    expect(timeAtLevel5).toBeLessThan(timeAtLevel0)
  })

  test('fabrication method appears when allocation points are set via setFabricationAllocation', () => {
    const targetItemId = ref('stone')
    const targetQuantity = ref(100)
    const { rootNode, setFabricationAllocation } = useCraftPlanner(targetItemId, targetQuantity)

    // Initially no fabrication method (no allocation)
    const beforeMethods = rootNode.value!.methods
    expect(beforeMethods.find((m) => m.kind === 'fabrication')).toBeUndefined()

    setFabricationAllocation('stone', 3)

    const afterMethods = rootNode.value!.methods
    const fabMethod = afterMethods.find((m) => m.kind === 'fabrication')
    expect(fabMethod).toBeDefined()
    expect(fabMethod!.kind).toBe('fabrication')
  })

  test('fabrication method time decreases with more points', () => {
    const targetItemId = ref('stone')
    const targetQuantity = ref(100)
    const { rootNode, setFabricationAllocation } = useCraftPlanner(targetItemId, targetQuantity)

    setFabricationAllocation('stone', 1)
    const time1pt = rootNode.value!.methods.find((m) => m.kind === 'fabrication')!.localTimeSeconds!

    setFabricationAllocation('stone', 5)
    const time5pt = rootNode.value!.methods.find((m) => m.kind === 'fabrication')!.localTimeSeconds!

    expect(time5pt).toBeLessThan(time1pt)
  })

  test('machine method has children for processor inputs', () => {
    useGameConfig().setMachineRecipes({ smelter: 'copper-bar' })
    const targetItemId = ref('copper-bar')
    const targetQuantity = ref(1)
    const { rootNode } = useCraftPlanner(targetItemId, targetQuantity)

    const smelterMethod = rootNode.value!.methods.find(
      (m) => m.kind === 'machine' && m.title === 'Smelter',
    )!
    expect(smelterMethod.children.length).toBeGreaterThan(0)
    expect(smelterMethod.children[0].itemId).toBe('copper-ore')
  })
})

describe('useCraftPlanner — skillGate on methods (#2 skill-gate surfacing)', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('craft method carries its workstation + level as skillGate', () => {
    const { rootNode } = useCraftPlanner(ref('cooked-fish'), ref(1))
    const craft = rootNode.value!.methods.find((m) => m.kind === 'craft')
    expect(craft).toBeDefined()
    expect(craft!.skillGate).toEqual({ skill: 'Stove', level: 5 })
  })

  test('gather/craft methods expose skillGate matching their Level detail; other kinds have none', () => {
    const { methodsById } = useCraftPlanner(ref('cooked-fish'), ref(20))
    const methods = Object.values(methodsById.value)

    // Sanity: this target's tree exercises both gated method kinds.
    expect(methods.some((m) => m.kind === 'gather')).toBe(true)
    expect(methods.some((m) => m.kind === 'craft')).toBe(true)

    for (const m of methods) {
      if (m.kind === 'gather' || m.kind === 'craft') {
        expect(m.skillGate).toBeDefined()
        // skill id is the method title (gather jobId / craft workstation)
        expect(m.skillGate!.skill).toBe(m.title)
        // level matches the already-rendered "Level" detail row
        const lvlRow = m.detailRows.find((d) => d.label === 'Level')
        expect(lvlRow).toBeDefined()
        expect(`Lv${m.skillGate!.level}`).toBe(lvlRow!.value)
      } else {
        expect(m.skillGate).toBeUndefined()
      }
    }
  })
})

describe('useCraftPlanner — locked-gate derivation (#2 skill-gate surfacing)', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('a plan with low skills reports locked gates and a summary; highest is the max required level', () => {
    // Default config: every skill defaults to level 1.
    const { lockedGateByNode, skillGateSummary } = useCraftPlanner(ref('cooked-fish'), ref(20))

    const locked = lockedGateByNode.value
    expect(Object.keys(locked).length).toBeGreaterThan(0)

    const summary = skillGateSummary.value
    expect(summary).not.toBeNull()
    expect(summary!.count).toBeGreaterThan(0)

    // Every locked entry is genuinely above the player's current level.
    for (const g of Object.values(locked)) expect(g.current).toBeLessThan(g.level)

    // The summary's highest gate is the maximum required level across locked nodes.
    const maxLevel = Math.max(...Object.values(locked).map((g) => g.level))
    expect(summary!.highest.level).toBe(maxLevel)
  })

  test('raising every gated skill clears the locks and nulls the summary (reactivity)', () => {
    const { lockedGateByNode, skillGateSummary } = useCraftPlanner(ref('cooked-fish'), ref(20))
    expect(Object.keys(lockedGateByNode.value).length).toBeGreaterThan(0)

    // Max exactly the skills the plan gates on.
    const maxed: Record<string, number> = {}
    for (const g of Object.values(lockedGateByNode.value)) maxed[g.skill] = 99
    const { setSkillLevels } = useGameConfig()
    setSkillLevels(maxed)

    expect(Object.keys(lockedGateByNode.value)).toHaveLength(0)
    expect(skillGateSummary.value).toBeNull()
  })
})
