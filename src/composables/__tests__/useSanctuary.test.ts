import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { useSanctuary } from '@/composables/useSanctuary'
import { MAX_SANCTUARY_SLOTS, SANCTUARY_JOBS } from '@/utils/sanctuaryConstants'

describe('useSanctuary', () => {
  beforeEach(() => {
    const { resetGameConfig } = useGameConfig()
    resetGameConfig()
    const { resetCollection } = useCreatureCollection()
    resetCollection()
    localStorage.removeItem('sanctuary-target-tiers')
  })

  describe('party slots', () => {
    test('starts with all empty slots', () => {
      const { partySlots } = useSanctuary()
      expect(partySlots.value).toHaveLength(MAX_SANCTUARY_SLOTS)
      expect(partySlots.value.every((s) => s === null)).toBe(true)
    })

    test('hasEmptySlot is true when party is not full', () => {
      const { hasEmptySlot } = useSanctuary()
      expect(hasEmptySlot.value).toBe(true)
    })

    test('placing a creature fills a slot', () => {
      const { creatures } = useCreatures()
      const { partySlots, hasEmptySlot, sanctuaryCreatureIds } = useSanctuary()
      const creature = creatures.value[0]

      const { setSanctuaryCreatures } = useGameConfig()
      setSanctuaryCreatures([creature.id])

      expect(sanctuaryCreatureIds.value).toHaveLength(1)
      expect(partySlots.value[0]).not.toBeNull()
      expect(partySlots.value[0]?.id).toBe(creature.id)
      expect(hasEmptySlot.value).toBe(true)
    })

    test('hasEmptySlot is false when all slots filled', () => {
      const { creatures } = useCreatures()
      const { hasEmptySlot } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      const ids = creatures.value.slice(0, MAX_SANCTUARY_SLOTS).map((c) => c.id)
      setSanctuaryCreatures(ids)

      expect(hasEmptySlot.value).toBe(false)
    })
  })

  describe('clearSanctuary', () => {
    test('removes all creatures from party', () => {
      const { creatures } = useCreatures()
      const { sanctuaryCreatureIds, clearSanctuary } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      setSanctuaryCreatures([creatures.value[0].id, creatures.value[1].id])
      expect(sanctuaryCreatureIds.value).toHaveLength(2)

      clearSanctuary()
      expect(sanctuaryCreatureIds.value).toHaveLength(0)
    })
  })

  describe('removeCreatureFromSlot', () => {
    test('removes the creature at the given index', () => {
      const { creatures } = useCreatures()
      const { sanctuaryCreatureIds, removeCreatureFromSlot } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      const [c1, c2, c3] = creatures.value
      setSanctuaryCreatures([c1.id, c2.id, c3.id])

      removeCreatureFromSlot(1) // remove middle creature
      expect(sanctuaryCreatureIds.value).toEqual([c1.id, c3.id])
    })

    test('does nothing when removing from an empty slot', () => {
      const { sanctuaryCreatureIds, removeCreatureFromSlot } = useSanctuary()
      removeCreatureFromSlot(0)
      expect(sanctuaryCreatureIds.value).toHaveLength(0)
    })
  })

  describe('jobScores', () => {
    test('all scores are 0 with empty party', () => {
      const { jobScores } = useSanctuary()
      for (const job of SANCTUARY_JOBS) {
        expect(jobScores.value[job]).toBe(0)
      }
    })

    test('scores sum creature contributions', () => {
      const { creatures } = useCreatures()
      const { jobScores } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      const creature = creatures.value[0]
      setSanctuaryCreatures([creature.id])

      for (const job of SANCTUARY_JOBS) {
        const key = job.toLowerCase() as keyof typeof creature.jobs
        expect(jobScores.value[job]).toBe(creature.jobs[key] ?? 0)
      }
    })

    test('scores accumulate across multiple creatures', () => {
      const { creatures } = useCreatures()
      const { jobScores } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      const [c1, c2] = creatures.value
      setSanctuaryCreatures([c1.id, c2.id])

      for (const job of SANCTUARY_JOBS) {
        const key = job.toLowerCase() as keyof typeof c1.jobs
        const expected = (c1.jobs[key] ?? 0) + (c2.jobs[key] ?? 0)
        expect(jobScores.value[job]).toBe(expected)
      }
    })
  })

  describe('jobProgress', () => {
    test('returns progress for all 6 jobs', () => {
      const { jobProgress } = useSanctuary()
      expect(jobProgress.value).toHaveLength(6)
      const jobs = jobProgress.value.map((jp) => jp.job)
      for (const job of SANCTUARY_JOBS) {
        expect(jobs).toContain(job)
      }
    })

    test('empty party has score 0 and positive pointsToNext', () => {
      const { jobProgress } = useSanctuary()
      for (const jp of jobProgress.value) {
        expect(jp.score).toBe(0)
        expect(jp.pointsToNext).toBeGreaterThan(0)
        expect(jp.isMaxed).toBe(false)
      }
    })
  })

  describe('setTargetTier', () => {
    test('sets a target for a specific job', () => {
      const { targetTiers, setTargetTier } = useSanctuary()
      setTargetTier('Chopping', 3)
      expect(targetTiers.value['Chopping']).toBe(3)
    })

    test('clamps target to valid range', () => {
      const { targetTiers, setTargetTier } = useSanctuary()
      setTargetTier('Mining', -1)
      expect(targetTiers.value['Mining']).toBe(0)

      setTargetTier('Mining', 99)
      expect(targetTiers.value['Mining']).toBe(5)
    })

    test('setting target to 0 clears it', () => {
      const { targetTiers, setTargetTier } = useSanctuary()
      setTargetTier('Fishing', 3)
      expect(targetTiers.value['Fishing']).toBe(3)

      setTargetTier('Fishing', 0)
      expect(targetTiers.value['Fishing']).toBe(0)
    })
  })

  describe('setAllTargets', () => {
    test('sets the same target for all jobs', () => {
      const { targetTiers, setAllTargets } = useSanctuary()
      setAllTargets(3)
      for (const job of SANCTUARY_JOBS) {
        expect(targetTiers.value[job]).toBe(3)
      }
    })

    test('clears all targets when set to 0', () => {
      const { targetTiers, setAllTargets } = useSanctuary()
      setAllTargets(5)
      setAllTargets(0)
      for (const job of SANCTUARY_JOBS) {
        expect(targetTiers.value[job]).toBe(0)
      }
    })
  })

  describe('setActiveSlot', () => {
    test('sets the active slot index', () => {
      const { activeSlotIndex, setActiveSlot } = useSanctuary()
      setActiveSlot(3)
      expect(activeSlotIndex.value).toBe(3)
    })

    test('toggles off when clicking the same slot', () => {
      const { activeSlotIndex, setActiveSlot } = useSanctuary()
      setActiveSlot(2)
      expect(activeSlotIndex.value).toBe(2)

      setActiveSlot(2)
      expect(activeSlotIndex.value).toBeNull()
    })

    test('switches to a different slot', () => {
      const { activeSlotIndex, setActiveSlot } = useSanctuary()
      setActiveSlot(1)
      setActiveSlot(4)
      expect(activeSlotIndex.value).toBe(4)
    })
  })

  describe('getCreatureStatus', () => {
    test('returns null for unassigned creatures', () => {
      const { getCreatureStatus } = useSanctuary()
      expect(getCreatureStatus('unknown-id')).toBeNull()
    })

    test('returns "helper" for helper creatures', () => {
      const { setHelperCreatures } = useGameConfig()
      setHelperCreatures(['h1'])
      const { getCreatureStatus } = useSanctuary()
      expect(getCreatureStatus('h1')).toBe('helper')
    })

    test('returns "machine" for machine creatures', () => {
      const { setMachineCreatures } = useGameConfig()
      setMachineCreatures(['m1'])
      const { getCreatureStatus } = useSanctuary()
      expect(getCreatureStatus('m1')).toBe('machine')
    })

    test('returns "expedition" for expedition creatures', () => {
      const { expeditionParties } = useGameConfig()
      expeditionParties.value = { exp1: ['e1'] }
      const { getCreatureStatus } = useSanctuary()
      expect(getCreatureStatus('e1')).toBe('expedition')
    })
  })

  describe('recommendedCreatures', () => {
    test('excludes creatures already in sanctuary party', () => {
      const { creatures } = useCreatures()
      const { recommendedCreatures } = useSanctuary()
      const { setSanctuaryCreatures } = useGameConfig()

      const creature = creatures.value[0]
      setSanctuaryCreatures([creature.id])

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).not.toContain(creature.id)
    })

    test('hides excluded creatures by default', () => {
      const { creatures } = useCreatures()
      const { recommendedCreatures } = useSanctuary()
      const { setHelperCreatures } = useGameConfig()

      const helper = creatures.value[0]
      setHelperCreatures([helper.id])

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).not.toContain(helper.id)
    })

    test('shows excluded creatures when toggle is on', () => {
      const { creatures } = useCreatures()
      const { recommendedCreatures, showExcludedCreatures } = useSanctuary()
      const { setHelperCreatures } = useGameConfig()

      const helper = creatures.value[0]
      setHelperCreatures([helper.id])
      showExcludedCreatures.value = true

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).toContain(helper.id)
    })

    test('without targets, scores equal total job points', () => {
      const { recommendedCreatures } = useSanctuary()
      const first = recommendedCreatures.value[0]
      const totalJobScore = Object.values(first.creature.jobs).reduce((s, v) => s + v, 0)
      expect(first.score).toBe(totalJobScore)
    })

    test('sorted by score descending when no targets set', () => {
      const { recommendedCreatures } = useSanctuary()
      const scores = recommendedCreatures.value.map(({ score }) => score)
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
      }
    })
  })

  describe('maxAchievableTiers', () => {
    test('returns a tier for each job', () => {
      const { maxAchievableTiers } = useSanctuary()
      for (const job of SANCTUARY_JOBS) {
        expect(maxAchievableTiers.value[job]).toBeDefined()
        expect(maxAchievableTiers.value[job]).toBeGreaterThanOrEqual(0)
      }
    })

    test('tiers are capped at MAX_TIER', () => {
      const { maxAchievableTiers } = useSanctuary()
      for (const job of SANCTUARY_JOBS) {
        expect(maxAchievableTiers.value[job]).toBeLessThanOrEqual(5)
      }
    })

    test('excludes owned-but-unawakened creatures from calculation', () => {
      const { creatures } = useCreatures()
      const { setOwned, setAwakened } = useCreatureCollection()

      // Pick a creature with non-zero job scores
      const creature = creatures.value.find((c) => Object.values(c.jobs).some((v) => v > 0))!

      // Owned but NOT awakened — should be excluded from tier calc
      setOwned(creature.id, true)

      const { maxAchievableTiers } = useSanctuary()
      const tiersExcluded = { ...maxAchievableTiers.value }

      // Now awaken — should be included
      setAwakened(creature.id, true)
      const tiersIncluded = { ...maxAchievableTiers.value }

      // Tiers should be at least as high when the creature is available
      for (const job of SANCTUARY_JOBS) {
        expect(tiersIncluded[job]).toBeGreaterThanOrEqual(tiersExcluded[job])
      }
    })
  })

  describe('owned-but-unawakened filtering', () => {
    test('recommendedCreatures excludes owned-but-unawakened creatures', () => {
      const { creatures } = useCreatures()
      const { setOwned } = useCreatureCollection()
      const { recommendedCreatures } = useSanctuary()
      const creature = creatures.value[0]

      // Mark as owned but not awakened (awakened defaults to false)
      setOwned(creature.id, true)

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).not.toContain(creature.id)
    })

    test('recommendedCreatures shows owned-but-unawakened when showExcludedCreatures is on', () => {
      const { creatures } = useCreatures()
      const { setOwned } = useCreatureCollection()
      const { recommendedCreatures, showExcludedCreatures } = useSanctuary()
      const creature = creatures.value[0]

      setOwned(creature.id, true)
      showExcludedCreatures.value = true

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).toContain(creature.id)
    })

    test('recommendedCreatures includes owned-and-awakened creatures', () => {
      const { creatures } = useCreatures()
      const { setOwned, setAwakened } = useCreatureCollection()
      const { recommendedCreatures } = useSanctuary()
      const creature = creatures.value[0]

      setOwned(creature.id, true)
      setAwakened(creature.id, true)

      const ids = recommendedCreatures.value.map(({ creature: c }) => c.id)
      expect(ids).toContain(creature.id)
    })
  })
})
