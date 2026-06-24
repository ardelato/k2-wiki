import { Sparkles, TrendingUp, Users, Wrench } from 'lucide-vue-next'

import { advisoryPresentation } from '@/components/skill-planner/advisoryPresentation'
import type { SkillAdvisory } from '@/composables/useSkillPlanner'

function sanctuaryAdv(
  over: Partial<Extract<SkillAdvisory, { kind: 'bonus' }>> = {},
): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'sanctuary:mining',
    label: 'Sanctuary - Mining Tier 3',
    benefits: [
      { kind: 'xp', before: 0, after: 40 },
      { kind: 'duration', before: 0, after: 10 },
    ],
    timeSaved: 3600,
    routeName: 'sanctuary',
    partyDiff: {
      target: { job: 'Mining', from: 0, to: 3 },
      sideEffects: [],
      swapIn: [],
      swapOut: [],
      keep: [],
    } as never,
    ...over,
  }
}

function awakenAdv(over: Partial<Extract<SkillAdvisory, { kind: 'bonus' }>> = {}): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'awaken:mining:0',
    label: 'Mining XP III',
    benefits: [{ kind: 'xp', before: 0, after: 10 }],
    timeSaved: 1800,
    routeName: 'awaken',
    awakenPointCost: 1,
    awakenPointsAvailable: 0,
    awakenTreeId: 'mining',
    awakenNodeId: '0',
    ...over,
  }
}

function toolAdv(over: Partial<Extract<SkillAdvisory, { kind: 'bonus' }>> = {}): SkillAdvisory {
  return {
    kind: 'bonus',
    lever: 'tools:mining',
    label: 'Mining Pickaxe Level 1 → 2',
    benefits: [{ kind: 'xp', before: 0, after: 5 }],
    timeSaved: 900,
    routeName: 'tools',
    toolId: 'mining-pickaxe',
    toolCost: { itemId: 'bar', itemName: 'Copper Bar', amount: 50 },
    ...over,
  }
}

function playerLevelAdv(): SkillAdvisory {
  return {
    kind: 'playerLevel',
    timeSaved: 7200,
    steps: [],
    totalXpCost: 1000,
    levelUpTimeSeconds: 3600,
    playerLevelFrom: 10,
    playerLevelTo: 12,
    xpBonusGain: 2,
  }
}

describe('advisoryPresentation', () => {
  test('sanctuary: target-state headline, no cost, benefit phrase, CTA to Sanctuary', () => {
    const p = advisoryPresentation(sanctuaryAdv())
    expect(p.glyph).toBe(Users)
    expect(p.headline).toBe('Sanctuary → Tier 3')
    expect(p.cost).toBe('')
    expect(p.benefit).toBe('+40% XP · 10% faster gathering')
    expect(p.ctaLabel).toBe('Open in Sanctuary')
    expect(p.ctaLink).toEqual({ name: 'sanctuary', query: { job: 'Mining', target: 3 } })
  })

  test('awaken: scoped Skill planner drops the redundant skill word from the node name', () => {
    const p = advisoryPresentation(awakenAdv())
    expect(p.glyph).toBe(Sparkles)
    expect(p.headline).toBe('XP III')
    expect(p.cost).toBe('1 Awaken Point')
    expect(p.benefit).toBe('+10% XP')
    expect(p.ctaLabel).toBe('Open in Awaken tree')
    expect(p.ctaLink).toEqual({ name: 'awaken', query: { tree: 'mining', node: '0' } })
  })

  test('awaken: Summon context (job set) keeps the full node name', () => {
    // Summon "Ways to improve" mixes skills, so the skill word stays for disambiguation.
    expect(advisoryPresentation(awakenAdv(), 'Mining').headline).toBe('Mining XP III')
  })

  test('awaken: plural Awaken Points cost', () => {
    const p = advisoryPresentation(awakenAdv({ awakenPointCost: 2 }))
    expect(p.cost).toBe('2 Awaken Points')
  })

  test('tool: reuses the tool label as headline, item cost, benefit, CTA to Tools', () => {
    const p = advisoryPresentation(toolAdv())
    expect(p.glyph).toBe(Wrench)
    expect(p.headline).toBe('Mining Pickaxe Level 1 → 2')
    expect(p.cost).toBe('50 Copper Bar')
    expect(p.benefit).toBe('+5% XP')
    expect(p.ctaLabel).toBe('Open in Tools')
    expect(p.ctaLink).toEqual({ name: 'tools', query: { tool: 'mining-pickaxe' } })
  })

  test('playerLevel: no cost, on-every-skill benefit, singular/plural levels, NO CTA', () => {
    const p = advisoryPresentation(playerLevelAdv())
    expect(p.glyph).toBe(TrendingUp)
    expect(p.headline).toBe('Raise low skills → +2 player levels')
    expect(p.cost).toBe('')
    expect(p.benefit).toBe('+2% XP on every skill')
    expect(p.ctaLabel).toBeUndefined()
    expect(p.ctaLink).toBeUndefined()
  })
})
