import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { useSkillPlanner } from '@/composables/useSkillPlanner'
import { items } from '@/data/indexes'

/** Stock a huge amount of every item so inventory never constrains a workstation plan. */
function stockEverything(amount = 1e9) {
  const cfg = useGameConfig()
  for (const item of items) cfg.setInventory(item.id, amount)
}

describe('useSkillPlanner', () => {
  beforeEach(() => {
    useGameConfig().resetGameConfig()
    useCreatureCollection().resetCollection()
  })

  it('derives current level from config and starts the plan there', () => {
    useGameConfig().setSkillLevels({ Mining: 40 })
    const skillId = ref('Mining')
    const target = ref(70)
    const { plan, currentLevel } = useSkillPlanner(skillId, target)

    expect(currentLevel.value).toBe(40)
    expect(plan.value?.currentLevel).toBe(40)
    expect(plan.value?.segments[0].fromLevel).toBe(40)
  })

  it('lets a what-if override beat the live config value', () => {
    useGameConfig().setSkillLevels({ Mining: 40 })
    const { plan, currentLevel, setOverride, hasOverrides } = useSkillPlanner(
      ref('Mining'),
      ref(70),
    )

    expect(hasOverrides.value).toBe(false)
    setOverride('currentLevel', 10)
    expect(hasOverrides.value).toBe(true)
    expect(currentLevel.value).toBe(10)
    expect(plan.value?.currentLevel).toBe(10)
  })

  it('restores the config value after resetOverrides', () => {
    useGameConfig().setSkillLevels({ Mining: 40 })
    const { currentLevel, setOverride, resetOverrides, hasOverrides } = useSkillPlanner(
      ref('Mining'),
      ref(70),
    )

    setOverride('currentLevel', 10)
    resetOverrides()
    expect(hasOverrides.value).toBe(false)
    expect(currentLevel.value).toBe(40)
  })

  it('recomputes the plan when the selected skill changes', () => {
    const skillId = ref('Mining')
    const { plan } = useSkillPlanner(skillId, ref(50))
    expect(plan.value?.skillId).toBe('Mining')
    skillId.value = 'Chopping'
    expect(plan.value?.skillId).toBe('Chopping')
  })

  it('applies awaken-XP overrides to the bonus breakdown and multiplier', () => {
    const { bonusBreakdown, multipliers, setOverride } = useSkillPlanner(ref('Mining'), ref(50))
    const baseXpMult = multipliers.value.xpMultiplier

    setOverride('awakenXpTier', 6) // 6 nodes × +10%
    expect(bonusBreakdown.value.awakenXp).toBe(60)
    expect(multipliers.value.xpMultiplier).toBeCloseTo(baseXpMult + 0.6, 6)
  })

  it('exposes every gathering tier above the current level, tagged with its resource', () => {
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { targetPresets } = useSkillPlanner(ref('Mining'), ref(70))
    // All Mining tiers (1 excluded, not > current 1) plus the trailing max preset.
    expect(targetPresets.value.map((p) => p.level)).toEqual([
      5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 99,
    ])
    // Each preset names the resource the tier unlocks (L5 Mining → copper ore).
    expect(targetPresets.value[0]).toMatchObject({ level: 5, itemId: 'copper-ore' })
  })

  it('always offers a max-level (99) preset with no resource tag', () => {
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { targetPresets } = useSkillPlanner(ref('Mining'), ref(70))
    const max = targetPresets.value.at(-1)
    expect(max).toMatchObject({ level: 99, isMax: true })
    expect(max?.itemId).toBeUndefined()
  })

  it('hides preset tiers at or below the current level', () => {
    useGameConfig().setSkillLevels({ Mining: 60 })
    const { targetPresets } = useSkillPlanner(ref('Mining'), ref(90))
    expect(targetPresets.value.map((p) => p.level)).toEqual([70, 80, 90, 99])
  })

  it('omits the max preset once the skill is already at the cap', () => {
    useGameConfig().setSkillLevels({ Mining: 99 })
    const { targetPresets } = useSkillPlanner(ref('Mining'), ref(99))
    expect(targetPresets.value).toEqual([])
  })

  it('shows all workstation recipe tiers, tagged with the best-XP recipe item', () => {
    // Furnace bars/armor feed tool & machine upgrades, so every tier is shown.
    useGameConfig().setSkillLevels({ Furnace: 1 })
    const { targetPresets } = useSkillPlanner(ref('Furnace'), ref(60))
    expect(targetPresets.value.map((p) => p.level)).toEqual([5, 10, 15, 20, 25, 30, 40, 50, 60, 99])
    expect(targetPresets.value.filter((p) => !p.isMax).every((p) => p.itemId && p.itemName)).toBe(
      true,
    )

    useGameConfig().setSkillLevels({ Workbench: 1 })
    const wb = useSkillPlanner(ref('Workbench'), ref(80))
    expect(wb.targetPresets.value.map((p) => p.level)).toEqual([
      5, 10, 15, 20, 25, 30, 35, 60, 65, 80, 99,
    ])
  })

  it('ranks bonus-lever advisories by time saved on a gathering grind', () => {
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { advisories } = useSkillPlanner(ref('Mining'), ref(70))
    const levers = advisories.value.flatMap((a) => (a.kind === 'bonus' ? [a.lever] : []))
    // From a default config (no nodes/tool) the awaken + tool levers help. The
    // sanctuary lever is collection-dependent (needs owned+awakened creatures),
    // so it's absent here — covered separately below.
    expect(levers).toContain('awakenXp')
    expect(levers).toContain('toolLevel')
    expect(levers).not.toContain('sanctuaryTier')
    // Ranked by time saved, descending, and all positive.
    const times = advisories.value.map((a) => a.timeSaved)
    expect(times).toEqual([...times].toSorted((x, y) => y - x))
    expect(advisories.value.every((a) => a.timeSaved > 0)).toBe(true)
  })

  it('prices an awaken node by its full prerequisite chain, not a flat 1 point', () => {
    // Default config: no awaken nodes allocated. mining-xp-i has no prerequisites,
    // but mining-duration-i is gated behind mining-xp-ii → mining-xp-i, so unlocking
    // it really costs 3 points (the node + both XP prerequisites).
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { advisories } = useSkillPlanner(ref('Mining'), ref(70))
    const xp = advisories.value.find((a) => a.kind === 'bonus' && a.lever === 'awakenXp')
    const duration = advisories.value.find(
      (a) => a.kind === 'bonus' && a.lever === 'awakenDuration',
    )
    if (xp?.kind !== 'bonus' || duration?.kind !== 'bonus') throw new Error('no awaken advisories')
    expect(xp.awakenPointCost).toBe(1)
    expect(duration.awakenPointCost).toBe(3)
  })

  it('targets the sanctuary tier the recommended party reaches, with cumulative effects', () => {
    useGameConfig().setSkillLevels({ Mining: 1 })
    // Own + awaken three Mining-10 creatures → score 30 → reaches tier 3.
    const col = useCreatureCollection()
    for (const id of ['ivan', 'clad', 'kragg']) {
      col.setOwned(id, true)
      col.setAwakened(id, true)
    }
    const { advisories } = useSkillPlanner(ref('Mining'), ref(70))
    const sanctuary = advisories.value.find(
      (a) => a.kind === 'bonus' && a.lever === 'sanctuaryTier',
    )
    expect(sanctuary).toBeDefined()
    if (sanctuary?.kind !== 'bonus') throw new Error('expected bonus advisory')
    // Headline names the job and shows the final tier the party reaches (3, not 1).
    expect(sanctuary.label).toBe('Sanctuary - Mining Tier 3')
    // The before→after progression still rides along in the diff's target delta.
    expect(sanctuary.partyDiff?.target).toMatchObject({ job: 'Mining', from: 0, to: 3 })
    // Tier 0→3 grants cumulative XP and duration boosts (before/after for tile + popover).
    expect(sanctuary.benefits.map((b) => b.kind).toSorted()).toEqual(['duration', 'xp'])
    expect(sanctuary.benefits.find((b) => b.kind === 'xp')).toMatchObject({ before: 0, after: 120 })
    expect(sanctuary.benefits.find((b) => b.kind === 'duration')).toMatchObject({
      before: 0,
      after: 10,
    })
    expect(sanctuary.party?.length).toBe(3)
  })

  it('offers workstation levers (not sanctuary) for a workstation grind', () => {
    useGameConfig().setSkillLevels({ Furnace: 1 })
    stockEverything() // levers need a non-empty (unblocked) plan to measure against
    const { advisories } = useSkillPlanner(ref('Furnace'), ref(50))
    const levers = advisories.value.flatMap((a) => (a.kind === 'bonus' ? [a.lever] : []))
    expect(levers).toContain('workstationXp')
    expect(levers).toContain('workstationSpeed')
    expect(levers).not.toContain('sanctuaryTier')
  })

  it('prices a workstation speed node by its unowned XP prerequisite chain', () => {
    // One XP node owned (furnace-xp-i). Furnace Speed I is gated behind furnace-xp-ii,
    // so unlocking it costs 2 points (the missing XP prereq + the Speed node), and
    // the already-owned furnace-xp-i must not be re-charged.
    useGameConfig().setSkillLevels({ Furnace: 1 })
    useGameConfig().setAwakenWorkstationXpTier('Furnace', 1)
    stockEverything()
    const { advisories } = useSkillPlanner(ref('Furnace'), ref(50))
    const speed = advisories.value.find((a) => a.kind === 'bonus' && a.lever === 'workstationSpeed')
    const xp = advisories.value.find((a) => a.kind === 'bonus' && a.lever === 'workstationXp')
    if (speed?.kind !== 'bonus' || xp?.kind !== 'bonus')
      throw new Error('no workstation advisories')
    expect(speed.awakenNodeId).toBe('furnace-speed-i')
    expect(speed.awakenPointCost).toBe(2)
    // The next XP node (furnace-xp-ii) has its only prereq already owned → 1 point.
    expect(xp.awakenNodeId).toBe('furnace-xp-ii')
    expect(xp.awakenPointCost).toBe(1)
  })

  it('stops a workstation plan short when inventory cannot afford any recipe', () => {
    useGameConfig().setSkillLevels({ Furnace: 1 })
    // Default inventory is empty → nothing affordable at level 1.
    const { plan, reachedLevel } = useSkillPlanner(ref('Furnace'), ref(50))
    expect(plan.value?.segments).toEqual([])
    expect(reachedLevel.value).toBe(1)
  })

  it('recomputes the workstation plan reactively when inventory changes', () => {
    useGameConfig().setSkillLevels({ Furnace: 1 })
    const { plan } = useSkillPlanner(ref('Furnace'), ref(50))
    expect(plan.value?.segments.length).toBe(0) // empty inventory → no affordable craft

    stockEverything()
    expect(plan.value?.segments.length).toBeGreaterThan(0)
  })

  it('leaves gathering plans and reachedLevel untouched by inventory', () => {
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { plan, reachedLevel } = useSkillPlanner(ref('Mining'), ref(50))
    const cyclesBefore = plan.value?.totalCycles
    expect(reachedLevel.value).toBeNull()

    stockEverything()
    expect(plan.value?.totalCycles).toBe(cyclesBefore) // inventory is irrelevant to gathering
  })

  it('credits the workstation queue (queued crafts) toward the plan', () => {
    useGameConfig().setSkillLevels({ Furnace: 1 })
    // Empty inventory would normally stall at level 1; a big coal queue clears the
    // target on its own because queued crafts already paid their ingredients.
    useGameConfig().setQueuedAmounts({ Furnace: { coal: 5000 } })
    const { plan, reachedLevel } = useSkillPlanner(ref('Furnace'), ref(10))
    expect(plan.value?.segments.some((s) => (s.queuedCycles ?? 0) > 0)).toBe(true)
    expect(reachedLevel.value).toBe(10)
  })

  it('recomputes the workstation plan reactively when the queue changes', () => {
    useGameConfig().setSkillLevels({ Furnace: 1 })
    const { plan } = useSkillPlanner(ref('Furnace'), ref(10))
    expect(plan.value?.segments.length).toBe(0) // empty inventory + no queue → no progress

    useGameConfig().setQueuedAmounts({ Furnace: { coal: 5000 } })
    expect(plan.value?.segments.some((s) => (s.queuedCycles ?? 0) > 0)).toBe(true)
  })

  it('includes the player-level boost when lagging skills make the levels cheap', () => {
    // Mining → 99 while every other skill sits at 1: the source levels are dirt cheap
    // relative to the huge grind they speed up, so the boost passes the ROI gate.
    useGameConfig().setSkillLevels({ Mining: 1 })
    const { advisories } = useSkillPlanner(ref('Mining'), ref(99))
    expect(advisories.value.some((a) => a.kind === 'playerLevel')).toBe(true)
  })

  it('suppresses the player-level boost when the detour costs more than it saves', () => {
    // One high skill (Fishing 70) with everything else at 5: chasing +8 player levels
    // means raising seven skills 5→15, which takes longer (~6.5h) than it shaves off
    // the Digging 5→70 grind (~3h). Net-negative right now → the ROI gate drops it.
    useGameConfig().setSkillLevels({
      Chopping: 5,
      Mining: 5,
      Digging: 5,
      Exploring: 5,
      Fishing: 70,
      Farming: 5,
      Furnace: 5,
      Stove: 5,
      Workbench: 5,
    })
    const { advisories } = useSkillPlanner(ref('Digging'), ref(70))
    expect(advisories.value.some((a) => a.kind === 'playerLevel')).toBe(false)
  })

  it('suppresses the player-level boost at skill parity (poor ROI)', () => {
    // All nine skills at 35: there are no cheap "low" skills, so gaining a player
    // level costs ~30 grinds' worth of time to save a few minutes — the ROI gate
    // should drop the suggestion entirely.
    useGameConfig().setSkillLevels({
      Chopping: 35,
      Mining: 35,
      Digging: 35,
      Exploring: 35,
      Fishing: 35,
      Farming: 35,
      Furnace: 35,
      Stove: 35,
      Workbench: 35,
    })
    const { advisories } = useSkillPlanner(ref('Mining'), ref(60))
    expect(advisories.value.some((a) => a.kind === 'playerLevel')).toBe(false)
  })

  it('reports the player-level delta from raising only this skill', () => {
    // all skills default to 1 → player level 1; Mining → 99 raises the average
    const { playerLevelDelta, setOverride } = useSkillPlanner(ref('Mining'), ref(99))
    setOverride('currentLevel', 1)
    // floor((8×1 + 99) / 9) = 11, minus baseline 1 = 10
    expect(playerLevelDelta.value).toBe(10)
  })

  // The awaken-point sourcing attached to every awaken advisory. Awakening one
  // creature grants exactly 1 point, so these suggest the cheapest path to it.
  function awakenSources(skill: string) {
    useGameConfig().setSkillLevels({ [skill]: 1 })
    const { advisories } = useSkillPlanner(ref(skill), ref(70))
    const adv = advisories.value.find((a) => a.kind === 'bonus' && a.lever === 'awakenXp')
    if (adv?.kind !== 'bonus' || !adv.awakenSources) throw new Error('no awaken advisory')
    return adv.awakenSources
  }

  it('suggests owned-but-unawakened creatures, awaken-ready first', () => {
    const col = useCreatureCollection()
    // Two Mining creatures owned, not awakened: one at the awaken level, one below.
    col.setOwned('scoots', true)
    col.setLevel('scoots', 70) // ready to awaken
    col.setOwned('slick', true)
    col.setLevel('slick', 40) // needs leveling first

    const { owned } = awakenSources('Mining')
    const ids = owned.map((c) => c.id)
    expect(ids).toContain('scoots')
    expect(ids).toContain('slick')
    // Ready creatures rank ahead of ones that still need leveling.
    expect(ids.indexOf('scoots')).toBeLessThan(ids.indexOf('slick'))
    expect(owned.find((c) => c.id === 'scoots')).toMatchObject({ ready: true, level: 70 })
    expect(owned.find((c) => c.id === 'slick')).toMatchObject({ ready: false, level: 40 })
  })

  it('omits already-awakened creatures from the owned suggestions', () => {
    const col = useCreatureCollection()
    col.setOwned('scoots', true)
    col.setAwakened('scoots', true)
    expect(awakenSources('Mining').owned.map((c) => c.id)).not.toContain('scoots')
  })

  it('ranks summon candidates by how close they are to affordable', () => {
    // Fully stock scoots' summon cost; slick is left one ingredient short.
    const cfg = useGameConfig()
    cfg.setInventory('mining-charm', 5)
    cfg.setInventory('stone', 100)

    const { summon } = awakenSources('Mining')
    expect(summon[0]).toMatchObject({ id: 'scoots', affordable: true, missingTypes: 0 })
    const slick = summon.find((c) => c.id === 'slick')
    expect(slick).toMatchObject({ affordable: false })
    expect(slick!.missingTypes).toBeGreaterThan(0)
  })

  // Reachability gate: a summon candidate is only "close" if every missing material
  // is obtainable at the player's current skill levels.
  function summonCandidates(skill: string) {
    const { advisories } = useSkillPlanner(ref(skill), ref(99))
    const adv = advisories.value.find((a) => a.kind === 'bonus' && a.lever === 'awakenXp')
    if (adv?.kind !== 'bonus' || !adv.awakenSources) throw new Error('no awaken advisory')
    return adv.awakenSources.summon
  }

  // Every skill maxed except Digging, so Scruff's only unreached gate is Volcanic
  // Rock (Digging 80). Other skills cover its charms/cakes/runes chain.
  const allMaxExceptDigging = (digging: number) => ({
    Chopping: 99,
    Mining: 99,
    Digging: digging,
    Exploring: 99,
    Fishing: 99,
    Farming: 99,
    Furnace: 99,
    Stove: 99,
    Workbench: 99,
  })

  it('flags a summon candidate blocked behind a skill level it cannot reach', () => {
    const col = useCreatureCollection()
    const { creatures } = useCreatures()
    // Leave only Scruff un-owned among Digging creatures so it surfaces in the list.
    for (const c of creatures.value) {
      if ((c.jobs?.digging ?? 0) > 0 && c.id !== 'scruff') {
        col.setOwned(c.id, true)
        col.setAwakened(c.id, true)
      }
    }

    // Digging 70 < the Volcanic Rock gate of 80 → blocked, reported as the binding gate.
    useGameConfig().setSkillLevels(allMaxExceptDigging(70))
    expect(summonCandidates('Digging').find((c) => c.id === 'scruff')).toMatchObject({
      reachable: false,
      blockSkill: 'Digging',
      blockLevel: 80,
    })

    // At Digging 80 the gate is met → reachable, no blocker.
    useGameConfig().setSkillLevels(allMaxExceptDigging(80))
    const reachable = summonCandidates('Digging').find((c) => c.id === 'scruff')
    expect(reachable?.reachable).toBe(true)
    expect(reachable?.blockSkill).toBeUndefined()
  })

  it('ranks reachable summon candidates ahead of level-gated ones', () => {
    useGameConfig().setSkillLevels(allMaxExceptDigging(70))
    const summon = summonCandidates('Digging')
    // No blocked candidate appears before a reachable one.
    const firstBlocked = summon.findIndex((c) => !c.reachable)
    const lastReachable = summon.map((c) => c.reachable).lastIndexOf(true)
    if (firstBlocked !== -1 && lastReachable !== -1) {
      expect(firstBlocked).toBeGreaterThan(lastReachable)
    }
  })
})
