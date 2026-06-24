import { computed, type Ref } from 'vue'

import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import expeditionsData from '@/data/expeditions.json'
import type { Expedition } from '@/types'
import {
  getTotalCompletedExpeditions,
  getMaxUnlockedTier,
  TIER_UNLOCK_REQUIREMENTS,
} from '@/utils/planner/expeditionUnlocks'
import type { SaveConfig } from '@/utils/save/parseSave'

const allExpeditions = (expeditionsData as Expedition[]).toSorted((a, b) => {
  const diff = a.requiredExpeditionCompletions - b.requiredExpeditionCompletions
  if (diff !== 0) return diff
  return a.baseRating - b.baseRating
})

// --- Expedition ladder: compact per-row data for the mockup-faithful list ---
interface ExpeditionLadderRow {
  id: string
  name: string
  rewardItemId: string | undefined
  requiredExpeditionCompletions: number
  tiers: { tier: number; cleared: boolean; unlocked: boolean; completions: number }[]
  maxTier: number
  nextTier: number
  pct: number
  have: number
  need: number
  remaining: number
  runs: number
  locked: boolean
  maxed: boolean
}

// Expeditions × creatures-on-party — for the Assignments card row.
// Mirrors /expeditions' resolution pattern (creatures.find by id) so the same
// localStorage state renders identically here.
interface AssignmentExpeditionSlot {
  id: string
  name: string
  image: string
  tier: number
}

export function useExpeditionLadder(saveConfig: Ref<SaveConfig | null>) {
  const { creatures } = useCreatures()
  const { expeditionCompletions, expeditionParties } = useGameConfig()

  // Single source-selection: when a save is loaded, the ladder/frontier/display
  // computeds read the save's completions; otherwise the persisted config.
  const completionsSource = computed(() =>
    saveConfig.value ? saveConfig.value.expeditionCompletions : expeditionCompletions.value,
  )

  // --- Expedition frontiers: what to unlock next ---
  const expeditionFrontiers = computed(() => {
    const items = expeditionDisplay.value.items

    // Next expedition to unlock (first locked one in the sorted list)
    const nextExpItem = items.find((it) => !it.unlocked)
    const completions = completionsSource.value
    const totalRunsCompleted = getTotalCompletedExpeditions(completions)
    const nextExp = nextExpItem
      ? {
          name: nextExpItem.expedition.name,
          rewardItemId: nextExpItem.expedition.rewards[0]?.itemId,
          have: totalRunsCompleted,
          need: nextExpItem.expedition.requiredExpeditionCompletions,
          remaining: Math.max(
            0,
            nextExpItem.expedition.requiredExpeditionCompletions - totalRunsCompleted,
          ),
          pct: Math.min(
            100,
            Math.round(
              (totalRunsCompleted / nextExpItem.expedition.requiredExpeditionCompletions) * 100,
            ),
          ),
        }
      : null

    // Tier-up frontiers: unlocked expeditions with a locked next tier, closest to ready
    const tierUps = items
      .filter((it) => it.unlocked)
      .map((it) => {
        const lockedTier = it.tiers.find((t) => !t.unlocked)
        if (!lockedTier) return null
        const required = TIER_UNLOCK_REQUIREMENTS[lockedTier.tier] ?? 0
        const prevTierCompletions = completions[it.expedition.id]?.[lockedTier.tier - 1] ?? 0
        const have = prevTierCompletions
        const need = required
        const remaining = lockedTier.remaining
        const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0
        return {
          name: it.expedition.name,
          rewardItemId: it.expedition.rewards[0]?.itemId,
          fromTier: lockedTier.tier - 1,
          toTier: lockedTier.tier,
          have,
          need,
          remaining,
          pct,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .toSorted((a, b) => b.pct - a.pct)
      .slice(0, 2)

    return { nextExp, tierUps }
  })

  const expeditionLadder = computed<ExpeditionLadderRow[]>(() => {
    const completions = completionsSource.value
    const totalRuns = getTotalCompletedExpeditions(completions)
    return allExpeditions.map((e) => {
      const unlocked = totalRuns >= e.requiredExpeditionCompletions
      const expCompletions = completions[e.id] ?? {}
      const tierEntries = [1, 2, 3, 4, 5].map((t) => {
        const cleared = (expCompletions[t] ?? 0) > 0
        const prevCompletions = expCompletions[t - 1] ?? 0
        const tierUnlocked =
          unlocked && (t === 1 || prevCompletions >= (TIER_UNLOCK_REQUIREMENTS[t] ?? 0))
        return {
          tier: t,
          completions: expCompletions[t] ?? 0,
          cleared,
          unlocked: tierUnlocked,
        }
      })
      // maxTier is the highest *unlocked* tier (not necessarily run yet) — once
      // the threshold for the next tier is met, we conceptually move to it even
      // before the player has done a single run there.
      const maxTier = unlocked
        ? Math.max(0, ...tierEntries.filter((t) => t.unlocked).map((t) => t.tier))
        : 0
      const nextTier = Math.min(5, maxTier + 1)
      const need = maxTier > 0 && maxTier < 5 ? (TIER_UNLOCK_REQUIREMENTS[nextTier] ?? 0) : 0
      const have = maxTier > 0 ? (expCompletions[maxTier] ?? 0) : 0
      const remaining = Math.max(0, need - have)
      const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0
      const runs = tierEntries.reduce((s, t) => s + t.completions, 0)
      const locked = !unlocked
      const maxed = maxTier === 5
      return {
        id: e.id,
        name: e.name,
        rewardItemId: e.rewards[0]?.itemId,
        requiredExpeditionCompletions: e.requiredExpeditionCompletions,
        tiers: tierEntries,
        maxTier,
        nextTier,
        pct,
        have,
        need,
        remaining,
        runs,
        locked,
        maxed,
      }
    })
  })

  const expeditionLadderColumns = computed(() => {
    const rows = expeditionLadder.value
    const mid = Math.ceil(rows.length / 2)
    return [rows.slice(0, mid), rows.slice(mid)]
  })

  const expeditionPartiesList = computed(() => {
    // Mirror the Sanctuary/Helpers/Machines swap: when a save is loaded and the
    // expedition setup hasn't been applied yet, preview the save's party data so
    // the user can see what `Apply` would set. Otherwise show the persisted ids.
    const saveParties = saveConfig.value?.currentExpedition?.parties
    const showSavePreview =
      !!saveConfig.value && !!saveParties && Object.keys(saveParties).length > 0
    const parties = showSavePreview ? saveParties : (expeditionParties.value ?? {})
    return allExpeditions.map((e) => {
      const partyIds = (parties[e.id] ?? []) as string[]
      const maxSlots = Math.max(3, e.maxPartySize ?? 3)
      const slots: (AssignmentExpeditionSlot | null)[] = []
      for (let i = 0; i < maxSlots; i++) {
        const id = partyIds[i]
        if (!id) {
          slots.push(null)
          continue
        }
        const meta = creatures.value.find((c) => c.id === id)
        slots.push(
          meta
            ? { id: meta.id, name: meta.name, image: meta.image, tier: meta.tier }
            : { id, name: id, image: '', tier: 0 },
        )
      }
      return {
        id: e.id,
        name: e.name,
        rewardItemId: e.rewards[0]?.itemId,
        slots,
      }
    })
  })

  const expeditionPartiesAssigned = computed(() => {
    // Match the source used by expeditionPartiesList so the slot counter stays
    // in sync with the preview-vs-persisted behaviour.
    let count = 0
    for (const exp of expeditionPartiesList.value) {
      for (const slot of exp.slots) {
        if (slot) count += 1
      }
    }
    return count
  })

  const expeditionDisplay = computed(() => {
    const completions = completionsSource.value
    const totalCompletions = getTotalCompletedExpeditions(completions)
    const unlockedCount = allExpeditions.filter(
      (e) => totalCompletions >= e.requiredExpeditionCompletions,
    ).length

    const items = allExpeditions.map((expedition) => {
      const unlocked = totalCompletions >= expedition.requiredExpeditionCompletions
      const maxTier = unlocked ? getMaxUnlockedTier(expedition.id, completions) : 0
      const expCompletions = completions[expedition.id]
      const tiers = [1, 2, 3, 4, 5].map((t) => {
        const isUnlocked = t <= maxTier
        const prevTierCount = expCompletions?.[t - 1] ?? 0
        const required = TIER_UNLOCK_REQUIREMENTS[t] ?? 0
        const remaining = isUnlocked || t === 1 ? 0 : Math.max(0, required - prevTierCount)
        return { tier: t, unlocked: isUnlocked || t === 1, remaining }
      })
      return { expedition, unlocked, tiers }
    })

    const totalTiersUnlocked = items.reduce(
      (sum, item) => sum + (item.unlocked ? item.tiers.filter((t) => t.unlocked).length : 0),
      0,
    )

    return { items, unlockedCount, totalTiersUnlocked }
  })

  return {
    allExpeditions,
    expeditionFrontiers,
    expeditionLadder,
    expeditionLadderColumns,
    expeditionDisplay,
    expeditionPartiesList,
    expeditionPartiesAssigned,
  }
}
