import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import UpgradesContent from '@/data/upgrades'
import type { AwakenGatherUpgrade } from '@/types'
import { parseAwakenUpgrades } from '@/utils/parseSave'

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

const lookup = new Map(UpgradesContent.get.map((u) => [u.id, u]))

export function useAwakenSimulation() {
  const { awakenGatherUpgrades, awakenSpeedTiers, awakenGoldLevel } = useGameConfig()

  const simAdded = useLocalStorage<string[]>('awaken-sim-added', [])
  const simRemoved = useLocalStorage<string[]>('awaken-sim-removed', [])

  const savedIds = computed<Set<string>>(() => {
    const set = new Set<string>()
    for (const [job, up] of Object.entries(awakenGatherUpgrades.value)) {
      const slug = job.toLowerCase()
      for (let i = 0; i < (up?.yieldBonus ?? 0); i++) set.add(`${slug}-yield-${ROMAN[i]}`)
      for (let i = 0; i < (up?.durationTier ?? 0); i++) set.add(`${slug}-duration-${ROMAN[i]}`)
    }
    for (const [ws, tier] of Object.entries(awakenSpeedTiers.value)) {
      const slug = ws.toLowerCase()
      for (let i = 0; i < (tier ?? 0); i++) set.add(`${slug}-speed-${ROMAN[i]}`)
    }
    for (let i = 0; i < awakenGoldLevel.value; i++) set.add(`awaken-gold-${ROMAN[i]}`)

    const queue = [...set]
    while (queue.length > 0) {
      const id = queue.pop()!
      const u = lookup.get(id)
      if (!u) continue
      for (const p of u.prerequisites) {
        if (!set.has(p)) {
          set.add(p)
          queue.push(p)
        }
      }
    }
    return set
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
