import { computed } from 'vue'

import toolsData from '@/data/tools.json'
import type { Tool, ToolUpgradeCost } from '@/types'

const tools = toolsData.tools as Tool[]
const upgradeCosts = toolsData.upgradeCosts as ToolUpgradeCost[]
const maxLevel = toolsData.maxLevel
const xpBonusPerLevel = toolsData.xpBonusPerLevel

const toolById = new Map<string, Tool>()
const toolBySkillId = new Map<string, Tool>()
for (const tool of tools) {
  toolById.set(tool.id, tool)
  toolBySkillId.set(tool.skillId, tool)
}

export function useTools() {
  const gatheringTools = computed(() => tools.filter((t) => t.category === 'gathering'))
  const workstationTools = computed(() => tools.filter((t) => t.category === 'workstation'))
  const otherTools = computed(() => tools.filter((t) => t.category === 'other'))

  function getToolById(id: string): Tool | undefined {
    return toolById.get(id)
  }

  function getToolBySkillId(skillId: string): Tool | undefined {
    return toolBySkillId.get(skillId)
  }

  function getUpgradeCost(level: number): ToolUpgradeCost | undefined {
    return upgradeCosts[level]
  }

  function getXpBonus(level: number): number {
    return level * xpBonusPerLevel
  }

  return {
    tools,
    gatheringTools,
    workstationTools,
    otherTools,
    maxLevel,
    xpBonusPerLevel,
    upgradeCosts,
    getToolById,
    getToolBySkillId,
    getUpgradeCost,
    getXpBonus,
  }
}
