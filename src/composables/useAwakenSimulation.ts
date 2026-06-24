import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import { awakenPrerequisiteClosure } from '@/data/upgrades'
import type { AwakenGatherUpgrade } from '@/types'
import { parseAwakenUpgrades } from '@/utils/save/parseSave'

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

export function useAwakenSimulation() {
  const { awakenGatherUpgrades, awakenSpeedTiers, awakenWorkstationXpTiers, awakenGoldLevel } =
    useGameConfig()

  const simAdded = useLocalStorage<string[]>('awaken-sim-added', [])
  const simRemoved = useLocalStorage<string[]>('awaken-sim-removed', [])

  const savedIds = computed<Set<string>>(() => {
    const seed = new Set<string>()
    for (const [job, up] of Object.entries(awakenGatherUpgrades.value)) {
      const slug = job.toLowerCase()
      for (let i = 0; i < (up?.yieldBonus ?? 0); i++) seed.add(`${slug}-yield-${ROMAN[i]}`)
      for (let i = 0; i < (up?.durationTier ?? 0); i++) seed.add(`${slug}-duration-${ROMAN[i]}`)
      for (let i = 0; i < (up?.xpTier ?? 0); i++) seed.add(`${slug}-xp-${ROMAN[i]}`)
    }
    for (const [ws, tier] of Object.entries(awakenSpeedTiers.value)) {
      const slug = ws.toLowerCase()
      for (let i = 0; i < (tier ?? 0); i++) seed.add(`${slug}-speed-${ROMAN[i]}`)
    }
    for (const [ws, count] of Object.entries(awakenWorkstationXpTiers.value)) {
      const slug = ws.toLowerCase()
      for (let i = 0; i < (count ?? 0); i++) seed.add(`${slug}-xp-${ROMAN[i]}`)
    }
    for (let i = 0; i < awakenGoldLevel.value; i++) seed.add(`awaken-gold-${ROMAN[i]}`)

    // Owning a node implies owning its prerequisites, so the real saved set is the
    // prerequisite closure of the seeds (e.g. a Speed node pulls in its XP spine).
    return awakenPrerequisiteClosure(seed)
  })

  const effectiveIds = computed<Set<string>>(() => {
    const set = new Set(savedIds.value)
    for (const id of simAdded.value) set.add(id)
    for (const id of simRemoved.value) set.delete(id)
    return set
  })

  const effectiveParsed = computed(() => parseAwakenUpgrades([...effectiveIds.value]))

  const effectiveAwakenGoldLevel = computed(() => effectiveParsed.value.awakenGoldLevel)
  const effectiveAwakenSpeedTiers = computed<Record<string, number>>(
    () => effectiveParsed.value.awakenSpeedTiers,
  )
  const effectiveAwakenGatherUpgrades = computed<Record<string, AwakenGatherUpgrade>>(
    () => effectiveParsed.value.awakenGatherUpgrades,
  )

  return {
    simAdded,
    simRemoved,
    savedIds,
    effectiveIds,
    effectiveAwakenGoldLevel,
    effectiveAwakenSpeedTiers,
    effectiveAwakenGatherUpgrades,
  }
}
