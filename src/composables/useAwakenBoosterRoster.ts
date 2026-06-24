import { useLocalStorage } from '@vueuse/core'
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { useGameConfig } from '@/composables/useGameConfig'
import { getCreatureImage } from '@/utils/images/creatureImages'

/**
 * Awaken-rush booster roster: which owned, already-awakened creatures may escort the awaken
 * queue. Pure derivation over the shared game state plus the user's persisted exclude/include
 * overrides. Extracted from LevelPlanner to shrink that view; the side-effecting watch that
 * projects `awakenAllowedBoosterIds` onto the party-planner override sets intentionally stays in
 * the view (it writes shared planner state, so it is kept where that state lives).
 *
 * The shared composables it reads (useCreatures / useCreatureCollection / useGameConfig) are
 * module-level singletons, so calling them here returns the same reactive sources as the view.
 */
export function useAwakenBoosterRoster(opts: {
  awakenQueue: Ref<string[]>
  awakenQueueSet: ComputedRef<Set<string>>
}) {
  const { awakenQueue, awakenQueueSet } = opts
  const { creatures } = useCreatures()
  const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()
  const { excludedCreatureIds } = useGameConfig()
  const { t } = useI18n()

  const awakenBoosterPickerOpen = ref(false)
  const awakenBoosterExcluded = useLocalStorage<string[]>('awaken-planner-boosters-excluded', [])
  const awakenBoosterIncluded = useLocalStorage<string[]>('awaken-planner-boosters-included', [])

  const awakenBoosterCandidates = computed(() =>
    creatures.value
      .filter(
        (c) =>
          ownedCreatureIds.value.has(c.id) && isAwakened(c.id) && !awakenQueueSet.value.has(c.id),
      )
      .toSorted((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
  )
  const awakenBoosterCap = computed(() => Math.max(3, awakenQueue.value.length * 2))
  // Auto-selected default: the strongest `cap` candidates (level, then tier), skipping
  // any globally-excluded creatures.
  const awakenBoosterAutoIds = computed(() => {
    const ranked = awakenBoosterCandidates.value
      .filter((c) => !excludedCreatureIds.value.has(c.id))
      .toSorted((a, b) => getLevel(b.id) - getLevel(a.id) || b.tier - a.tier)
    return new Set(ranked.slice(0, awakenBoosterCap.value).map((c) => c.id))
  })
  // Resolved booster set = auto-default with the user's roster overrides applied.
  const awakenAllowedBoosterIds = computed<Set<string>>(() => {
    const exc = new Set(awakenBoosterExcluded.value)
    const inc = new Set(awakenBoosterIncluded.value)
    const out = new Set<string>()
    for (const c of awakenBoosterCandidates.value) {
      const on = inc.has(c.id) ? true : exc.has(c.id) ? false : awakenBoosterAutoIds.value.has(c.id)
      if (on) out.add(c.id)
    }
    return out
  })

  function toggleAwakenBooster(id: string) {
    const exc = new Set(awakenBoosterExcluded.value)
    const inc = new Set(awakenBoosterIncluded.value)
    if (awakenAllowedBoosterIds.value.has(id)) {
      inc.delete(id)
      exc.add(id)
    } else {
      exc.delete(id)
      inc.add(id)
    }
    awakenBoosterExcluded.value = [...exc]
    awakenBoosterIncluded.value = [...inc]
  }
  function toggleAwakenBoosterTier(ids: string[], select: boolean) {
    const exc = new Set(awakenBoosterExcluded.value)
    const inc = new Set(awakenBoosterIncluded.value)
    for (const id of ids) {
      if (select) {
        exc.delete(id)
        inc.add(id)
      } else {
        inc.delete(id)
        exc.add(id)
      }
    }
    awakenBoosterExcluded.value = [...exc]
    awakenBoosterIncluded.value = [...inc]
  }
  function resetAwakenBoosters() {
    awakenBoosterExcluded.value = []
    awakenBoosterIncluded.value = []
  }

  const awakenBoosterHint = computed(() =>
    t('levelPlanner.awaken.boosterHint', { n: awakenBoosterCap.value }),
  )

  // Chip preview of the boosters currently in the pool (strongest first), with level.
  const awakenBoosterChips = computed(() =>
    awakenBoosterCandidates.value
      .filter((c) => awakenAllowedBoosterIds.value.has(c.id))
      .toSorted((a, b) => getLevel(b.id) - getLevel(a.id) || b.tier - a.tier)
      .map((c) => ({
        id: c.id,
        name: c.name,
        image: getCreatureImage(c) ?? null,
        level: getLevel(c.id),
      })),
  )

  // Exposes only what the view consumes; cap/autoIds and the raw exclude/include refs stay
  // internal (they feed the allowed-set, hint and toggles).
  return {
    awakenBoosterPickerOpen,
    awakenBoosterCandidates,
    awakenAllowedBoosterIds,
    toggleAwakenBooster,
    toggleAwakenBoosterTier,
    resetAwakenBoosters,
    awakenBoosterHint,
    awakenBoosterChips,
  }
}
