import type { MemberRole, PrestigeTimelineStep } from '@/utils/planner/prestigeLoopPlanner'

/** One creature's level at a single check-in in the steady-state window. */
interface PrestigeLevelPoint {
  /** Zero-based check-in index within the captured window. */
  checkIn: number
  /** Elapsed hours since the first captured check-in (window-relative). */
  hours: number
  /** Level in the loop at this check-in (1–120). */
  level: number
  /** True when the creature was prestiged at this check-in (resets to level 1). */
  prestiged: boolean
  /** Idle hours spent at level 120 during the interval ending at this check-in (wasted XP). */
  wastedHours: number
}

/** Per-creature level trajectory across the captured check-in window. */
interface PrestigeLevelSeries {
  creatureId: string
  /** Role used for colouring — dominant role across the window, anchors overridden. */
  role: MemberRole
  /**
   * Dominant expedition the creature ran across the window. Stable for climbers under the
   * pinned/hybrid allocators (they never leave their expedition); for shared boosters that move,
   * it's the expedition they spent the most check-ins on. Empty string if never placed.
   */
  expeditionId: string
  /** Prestige tokens earned across the window. */
  tokens: number
  points: PrestigeLevelPoint[]
}

/**
 * Build per-creature level-over-time series from the steady-state timeline.
 *
 * A creature only appears in a check-in's assignment while it's slotted into a party, and the
 * captured `level` reflects state *after* that check-in's prestige resets — so a just-prestiged
 * creature reads level 1, producing the sawtooth that distinguishes climbers from held boosters.
 * When a creature sits out a check-in we carry its last known level forward (level can't change
 * while benched), and we only start a series once the creature first appears in the window.
 */
export function derivePrestigeLevelSeries(
  timeline: PrestigeTimelineStep[],
  anchorIds: string[],
): PrestigeLevelSeries[] {
  if (timeline.length === 0) return []

  const anchorSet = new Set(anchorIds)
  const baseHour = timeline[0].clockHours

  // Discover every creature that appears anywhere in the window.
  const ids = new Set<string>()
  for (const step of timeline) {
    for (const a of step.assignment) for (const m of a.members) ids.add(m.creatureId)
  }

  const series: PrestigeLevelSeries[] = []
  for (const id of ids) {
    const points: PrestigeLevelPoint[] = []
    const roleCounts: Record<MemberRole, number> = { climber: 0, booster: 0, anchor: 0 }
    const expCounts = new Map<string, number>()
    let tokens = 0
    let lastLevel: number | null = null

    timeline.forEach((step, i) => {
      let member: { role: MemberRole; level: number } | null = null
      for (const a of step.assignment) {
        const m = a.members.find((mm) => mm.creatureId === id)
        if (m) {
          member = m
          expCounts.set(a.expeditionId, (expCounts.get(a.expeditionId) ?? 0) + 1)
          break
        }
      }
      if (member) {
        roleCounts[member.role]++
        lastLevel = member.level
      }
      // Skip leading check-ins before the creature first appears.
      if (lastLevel === null) return

      const prestiged = step.prestigedCreatureIds.includes(id)
      if (prestiged) tokens++
      points.push({
        checkIn: i,
        hours: step.clockHours - baseHour,
        level: lastLevel,
        prestiged,
        wastedHours: step.wastedHoursByCreature?.[id] ?? 0,
      })
    })

    if (points.length === 0) continue

    const dominantRole = (Object.keys(roleCounts) as MemberRole[]).reduce((best, r) =>
      roleCounts[r] > roleCounts[best] ? r : best,
    )
    const role: MemberRole =
      anchorSet.has(id) || dominantRole === 'anchor' ? 'anchor' : dominantRole
    const expeditionId = [...expCounts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    series.push({ creatureId: id, role, expeditionId, tokens, points })
  }

  // Anchors first (their flat-line contrast frames the climbers), then most-productive, then id.
  const ROLE_ORDER: Record<MemberRole, number> = { anchor: 0, booster: 1, climber: 2 }
  return series.toSorted(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      b.tokens - a.tokens ||
      a.creatureId.localeCompare(b.creatureId),
  )
}
