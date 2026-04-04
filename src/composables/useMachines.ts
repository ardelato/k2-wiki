import { computed } from 'vue'

import machinesData from '@/data/machines.json'
import type { Machine, MachineUpgradeCost } from '@/types'

const machines = machinesData.machines as Machine[]
const upgradeCosts = machinesData.upgradeCosts as MachineUpgradeCost[]
const speedMultipliers = machinesData.speedMultipliers
const maxLevel = machinesData.maxLevel

const machineById = new Map<string, Machine>()
for (const machine of machines) {
  machineById.set(machine.id, machine)
}

export function useMachines() {
  const generators = computed(() => machines.filter((m) => m.machineType === 'generator'))
  const processors = computed(() => machines.filter((m) => m.machineType === 'processor'))

  function getMachineById(id: string): Machine | undefined {
    return machineById.get(id)
  }

  function getUpgradeCost(level: number): MachineUpgradeCost | undefined {
    return upgradeCosts[level]
  }

  function getSpeedMultiplier(level: number): number {
    return speedMultipliers[Math.min(level, speedMultipliers.length - 1)]
  }

  function getInterval(machineId: string, level: number): number {
    const machine = machineById.get(machineId)
    if (!machine) return 60
    const multiplier = getSpeedMultiplier(level)
    return Math.max(1, Math.floor(machine.baseInterval * multiplier))
  }

  return {
    machines,
    generators,
    processors,
    maxLevel,
    upgradeCosts,
    speedMultipliers,
    getMachineById,
    getUpgradeCost,
    getSpeedMultiplier,
    getInterval,
  }
}
