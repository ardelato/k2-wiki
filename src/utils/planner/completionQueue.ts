/**
 * Completion queue with shared-inventory depletion (Action plan).
 * Spec: docs/superpowers/specs/2026-06-14-acquisition-sequencing-spec.md
 *
 * Per-creature readiness naively credits the SAME inventory to every creature — but
 * summoning one consumes it. With 20K rainbow-fish, Zorb AND Blorp both look "ready",
 * yet summoning Zorb leaves Blorp needing a fresh 20K. This walks creatures in
 * completion order (most-ready-first, blocked last) against a SHARED pool, depleting
 * it as each is summoned, so later creatures show their true remaining need.
 *
 * Pure + unit-tested.
 */

export interface QueueRequirement {
  itemId: string
  itemName: string
  need: number
  /** Globally-available amount (inventory + queued) for this item — same across creatures. */
  have: number
  sourceLabel: string
  sourceIcon: string | null
}

export interface QueueInputCreature {
  id: string
  name: string
  image: string | null
  blocked: boolean
  requirements: QueueRequirement[]
}

export interface QueueOutputCreature {
  id: string
  name: string
  image: string | null
  blocked: boolean
  /** 0–100, against the pool remaining when this creature is reached. */
  readiness: number
  fulfilled: number
  total: number
  /** Every requirement, with `have` rewritten to the amount the shared pool can supply
   * THIS creature (depleted by earlier creatures). Superset of `remaining`. */
  requirements: QueueRequirement[]
  /** Ingredients still short after the shared pool is depleted to here. */
  remaining: QueueRequirement[]
}

export function buildCompletionQueue(creatures: QueueInputCreature[]): QueueOutputCreature[] {
  // Shared pool: each item's globally-available amount, once.
  const pool = new Map<string, number>()
  for (const c of creatures) {
    for (const r of c.requirements) if (!pool.has(r.itemId)) pool.set(r.itemId, r.have)
  }

  const readinessAgainstPool = (c: QueueInputCreature): number => {
    let need = 0
    let have = 0
    for (const r of c.requirements) {
      need += r.need
      have += Math.min(r.need, pool.get(r.itemId) ?? 0)
    }
    return need > 0 ? have / need : 1
  }

  const remaining = [...creatures]
  const out: QueueOutputCreature[] = []
  while (remaining.length) {
    // Pick the next to complete: non-blocked first, then highest readiness vs the pool now.
    let bestIdx = 0
    let bestKey = [-1, -1]
    remaining.forEach((c, i) => {
      const key = [c.blocked ? 0 : 1, readinessAgainstPool(c)]
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        bestKey = key
        bestIdx = i
      }
    })
    const c = remaining.splice(bestIdx, 1)[0]

    // Consume what the pool can cover; the rest is genuinely still needed. `have` on each
    // requirement is rewritten to what the pool can supply this creature (its remaining
    // amount when reached) — so excess survives for fulfilled items and shortfalls show true.
    let needSum = 0
    let haveSum = 0
    let fulfilled = 0
    const reqs: QueueRequirement[] = []
    for (const r of c.requirements) {
      const avail = pool.get(r.itemId) ?? 0
      const covered = Math.min(r.need, avail)
      pool.set(r.itemId, avail - covered)
      needSum += r.need
      haveSum += covered
      if (covered >= r.need) fulfilled++
      reqs.push({ ...r, have: avail })
    }
    out.push({
      id: c.id,
      name: c.name,
      image: c.image,
      blocked: c.blocked,
      total: c.requirements.length,
      fulfilled,
      readiness: needSum > 0 ? Math.round((haveSum / needSum) * 100) : 100,
      requirements: reqs,
      remaining: reqs.filter((r) => r.have < r.need),
    })
  }
  return out
}
