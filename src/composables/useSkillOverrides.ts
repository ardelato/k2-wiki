import { computed, reactive, readonly } from 'vue'

/** Session-only what-if overrides; null means "use the live config value". */
export interface SkillBonusOverrides {
  currentLevel: number | null
  jobTier: number | null
  awakenXpTier: number | null
  awakenDurationTier: number | null
  toolLevel: number | null
  playerLevel: number | null
}

function emptyOverrides(): SkillBonusOverrides {
  return {
    currentLevel: null,
    jobTier: null,
    awakenXpTier: null,
    awakenDurationTier: null,
    toolLevel: null,
    playerLevel: null,
  }
}

/** Override value wins unless null (0 is a valid override, so check === null). */
export function pick<T>(override: T | null, live: T): T {
  return override === null ? live : override
}

/**
 * Session-only what-if overrides for the skill planner: the raw reactive store plus
 * the mutators and the `hasOverrides` flag. Reads of override values inside the
 * planner go through the raw `overrides` reactive (so `pick` sees individual keys);
 * consumers outside get the `readonly` view.
 */
export function useSkillOverrides() {
  const overrides = reactive<SkillBonusOverrides>(emptyOverrides())

  function setOverride<K extends keyof SkillBonusOverrides>(key: K, value: SkillBonusOverrides[K]) {
    overrides[key] = value
  }

  function resetOverrides() {
    Object.assign(overrides, emptyOverrides())
  }

  const hasOverrides = computed(() =>
    (Object.keys(overrides) as (keyof SkillBonusOverrides)[]).some((k) => overrides[k] !== null),
  )

  return {
    overrides,
    readonlyOverrides: readonly(overrides),
    setOverride,
    resetOverrides,
    hasOverrides,
  }
}
