import { ref } from 'vue'

import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'

describe('useCraftPlanner — machine and fabrication methods', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
  })

  test('copper-bar node includes a Smelter machine method', () => {
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
