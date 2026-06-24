/**
 * 9a — Prestige-loop validation simulator (hands-free / check-in model).
 *
 * The real player constraint is ATTENTION, not raw throughput: the optimal algorithm
 * reconfigures parties ~every step (145/168 steps in optimal_plan.json), which nobody
 * wants to babysit. So this models a player who checks in every C hours:
 *   - At a check-in: prestige maxed creatures + re-form parties (one reconfiguration).
 *   - Between check-ins: parties are FROZEN and auto-repeat (the game's repeatExpedition);
 *     a creature that maxes IDLES at 120 (still boosts partners, earns nothing) until the
 *     next check-in lets the player prestige it.
 *
 * Objective: prestige tokens/hour at a given check-in cadence (+ wasted-slot %), NOT raw
 * throughput. This is what makes a stable "loop" setup worth more than constant micro-prestige.
 *
 * Strategies (what the player does AT each check-in):
 *   - BATCH      : never prestige until the whole roster is maxed, then prestige all at once.
 *   - INDIVIDUAL : prestige every maxed creature each check-in.
 *   - ROTATION(K): keep K maxed creatures as boosters (the K most-recently maxed), prestige the rest.
 *   - ANCHOR(K)  : permanently dedicate the K strongest as boosters (never prestiged), prestige the rest.
 *
 * Reuses the REAL game formulas (src/utils/formulas.ts) + real data; deterministic (no RNG).
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/sim/prestige-loop.ts
 *      NO_LOOP_BONUS=1 ... (robustness: zero the consecutive-run loop bonus)
 */
import biomesData from '../../src/data/biomes.json'
import creaturesData from '../../src/data/creatures.json'
import expeditionsData from '../../src/data/expeditions.json'
import type { Biome, Creature, Expedition } from '../../src/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  xpForLevel,
} from '../../src/utils/formulas'

// ── Constants (verified against recovered-source) ──────────────────────────
const MAX_LEVEL = 120
const MAX_XP = xpForLevel(MAX_LEVEL) // 720_000
const XP_COEF = 50
const TIERS = [1, 2, 3, 4, 5]
const MAX_PARTY = 3
const NO_LOOP_BONUS = process.env.NO_LOOP_BONUS === '1'

const allCreatures = creaturesData as Creature[]
const expeditions = expeditionsData as Expedition[]
const biomes = biomesData as Biome[]
const biomeMap = new Map(biomes.map((b) => [b.id, b]))

function strengthOf(c: Creature): number {
  let s = 0
  for (const e of expeditions) s += calculateCreatureRating(c, e, MAX_LEVEL, biomeMap.get(e.biome))
  return s / expeditions.length
}
const creaturesByStrength = allCreatures.toSorted((a, b) => strengthOf(b) - strengthOf(a))

function pct(xs: number[]): string {
  return `${(Math.min(...xs) * 100).toFixed(0)}-${(Math.max(...xs) * 100).toFixed(0)}%`
}

function bestOf(s: { batch: number; indiv: number; rot: number; anc: number }): number {
  return Math.max(s.batch, s.indiv, s.rot, s.anc)
}

// Faithful reimplementation of recovered-source getCreatureLevelFromXp.
function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  let level = Math.floor(Math.sqrt(xp / XP_COEF)) + 1
  while (level > 1 && xp < xpForLevel(level)) level--
  return Math.min(level, MAX_LEVEL)
}

// ── Runtime types ──────────────────────────────────────────────────────────
interface Unit {
  idx: number
  content: Creature
  xp: number
  isAnchor: boolean
  maxedSince: number | null // clock time this unit reached MAX_XP (for rotation ordering)
}

interface ExpState {
  content: Expedition
  biome: Biome | undefined
  loopCount: number
  run: { memberIdx: number[]; xpPerMember: number; endsAt: number } | null
}

type Mode = 'batch' | 'individual' | 'rotation' | 'anchor'
type Roster = 'weak' | 'strong'

interface SimConfig {
  workingSet: number
  roster: Roster
  mode: Mode
  K: number
  cadenceSec: number
  horizonSec: number
  warmupSec: number
}

interface SimResult {
  tokensPerHour: number
  wastedSlotFraction: number
}

function evalParty(members: Unit[], exp: ExpState, tier: number) {
  let score = 0
  for (const m of members) {
    score += calculateCreatureRating(m.content, exp.content, levelFromXp(m.xp), exp.biome)
  }
  const dur = calculateDuration(score, exp.content, tier)
  const loopCount = NO_LOOP_BONUS ? 0 : exp.loopCount
  const xpPerMember = calculateExpeditionXp(exp.content, tier, loopCount, members.length)
  return { dur, xpPerMember }
}

function simulate(cfg: SimConfig): SimResult {
  const pool =
    cfg.roster === 'strong'
      ? creaturesByStrength.slice(0, cfg.workingSet)
      : creaturesByStrength.slice(-cfg.workingSet)
  const units: Unit[] = pool.map((content, i) => ({
    idx: i,
    content,
    xp: 0,
    isAnchor: false,
    maxedSince: null,
  }))

  if (cfg.mode === 'anchor') {
    const order = units
      .toSorted((a, b) => strengthOf(b.content) - strengthOf(a.content))
      .slice(0, cfg.K)
    for (const u of order) {
      u.isAnchor = true
      u.xp = MAX_XP
    }
  }

  const exps: ExpState[] = expeditions.map((e) => ({
    content: e,
    biome: biomeMap.get(e.biome),
    loopCount: 0,
    run: null,
  }))
  const expOrder = exps.toSorted((a, b) => b.content.baseRating - a.content.baseRating)

  let tokenCount = 0
  let measuredTokens = 0
  let clock = 0
  let climbSlotSec = 0
  let wastedSlotSec = 0

  function grantToken() {
    tokenCount++
    if (clock >= cfg.warmupSec) measuredTokens++
  }

  function prestige(u: Unit) {
    grantToken()
    u.xp = 0
    u.maxedSince = null
  }

  // Decide which maxed creatures to reset at this check-in, per policy.
  function applyCheckInPolicy() {
    const maxedNonAnchor = units.filter((u) => !u.isAnchor && u.xp >= MAX_XP)
    switch (cfg.mode) {
      case 'individual':
      case 'anchor':
        for (const u of maxedNonAnchor) prestige(u)
        break
      case 'batch':
        if (units.every((u) => u.isAnchor || u.xp >= MAX_XP)) {
          for (const u of maxedNonAnchor) prestige(u)
        }
        break
      case 'rotation': {
        // keep K most-recently-maxed as boosters; prestige the rest (oldest first)
        const ordered = maxedNonAnchor.toSorted((a, b) => (a.maxedSince ?? 0) - (b.maxedSince ?? 0))
        const toPrestige = ordered.slice(0, Math.max(0, ordered.length - cfg.K))
        for (const u of toPrestige) prestige(u)
        break
      }
    }
  }

  // Re-form all parties from the full pool (the single reconfiguration per check-in).
  function allocate() {
    for (const e of exps) e.run = null
    const reserved = new Set<number>()
    for (const exp of expOrder) {
      const climbers = units
        .filter((u) => !reserved.has(u.idx) && u.xp < MAX_XP)
        .toSorted((a, b) => a.xp - b.xp)
      if (climbers.length === 0) continue
      const boosters = units
        .filter((u) => !reserved.has(u.idx) && u.xp >= MAX_XP)
        .toSorted(
          (a, b) =>
            calculateCreatureRating(b.content, exp.content, MAX_LEVEL, exp.biome) -
            calculateCreatureRating(a.content, exp.content, MAX_LEVEL, exp.biome),
        )
      let best: {
        value: number
        members: Unit[]
        tier: number
        dur: number
        xpPerMember: number
      } | null = null
      const maxB = Math.min(2, boosters.length)
      for (let nB = 0; nB <= maxB; nB++) {
        for (let nC = 1; nC <= MAX_PARTY - nB; nC++) {
          if (climbers.length < nC) continue
          const members = [...climbers.slice(0, nC), ...boosters.slice(0, nB)]
          for (const tier of TIERS) {
            const { dur, xpPerMember } = evalParty(members, exp, tier)
            let useful = 0
            for (const c of climbers.slice(0, nC)) useful += Math.min(xpPerMember, MAX_XP - c.xp)
            const value = useful / dur
            if (best === null || value > best.value) {
              best = { value, members, tier, dur, xpPerMember }
            }
          }
        }
      }
      if (best === null) continue
      for (const m of best.members) reserved.add(m.idx)
      exp.run = {
        memberIdx: best.members.map((m) => m.idx),
        xpPerMember: best.xpPerMember,
        endsAt: clock + best.dur,
      }
    }
  }

  // Run frozen, auto-repeating parties until `target` (in-flight runs past the boundary
  // are abandoned; they restart at the next check-in's reallocation).
  function runMicro(target: number) {
    while (true) {
      let next: ExpState | null = null
      for (const exp of exps) {
        if (exp.run && (next === null || exp.run.endsAt < next.run!.endsAt)) next = exp
      }
      if (next === null) {
        clock = target
        return
      }
      if (next.run!.endsAt > target) {
        clock = target
        return
      }
      const run = next.run!
      const dur = run.endsAt - clock
      clock = run.endsAt
      for (const mi of run.memberIdx) {
        const u = units[mi]
        if (u.xp >= MAX_XP) {
          wastedSlotSec += dur
        } else {
          climbSlotSec += dur
          u.xp = Math.min(MAX_XP, u.xp + run.xpPerMember)
          if (u.xp >= MAX_XP && u.maxedSince === null) u.maxedSince = clock
        }
      }
      next.loopCount++
      // auto-repeat: same party, same expedition, recompute duration + xp for new levels/loop
      const members = run.memberIdx.map((i) => units[i])
      const tierGuess = bestTierFor(members, next)
      const { dur: nd, xpPerMember } = evalParty(members, next, tierGuess)
      next.run = { memberIdx: run.memberIdx, xpPerMember, endsAt: clock + nd }
    }
  }

  // For auto-repeat, keep using the tier that maximizes climber useful-xp/min right now.
  function bestTierFor(members: Unit[], exp: ExpState): number {
    let bestTier = 1
    let bestVal = -1
    for (const tier of TIERS) {
      const { dur, xpPerMember } = evalParty(members, exp, tier)
      let useful = 0
      for (const m of members) if (m.xp < MAX_XP) useful += Math.min(xpPerMember, MAX_XP - m.xp)
      const v = useful / dur
      if (v > bestVal) {
        bestVal = v
        bestTier = tier
      }
    }
    return bestTier
  }

  while (clock < cfg.horizonSec) {
    applyCheckInPolicy()
    allocate()
    runMicro(clock + cfg.cadenceSec)
  }

  const windowHours = (cfg.horizonSec - cfg.warmupSec) / 3600
  const totalSlot = climbSlotSec + wastedSlotSec
  return {
    tokensPerHour: measuredTokens / windowHours,
    wastedSlotFraction: totalSlot > 0 ? wastedSlotSec / totalSlot : 0,
  }
}

// ── Self-tests ───────────────────────────────────────────────────────────────
function selfTest() {
  const checks: [string, boolean][] = []
  checks.push(['MAX_XP === 720000', MAX_XP === 720_000])
  checks.push(['levelFromXp(0) === 1', levelFromXp(0) === 1])
  for (const L of [2, 70, 120]) {
    checks.push([`levelFromXp(xpForLevel(${L})) === ${L}`, levelFromXp(xpForLevel(L)) === L])
  }
  checks.push(['loaded 120 creatures', allCreatures.length === 120])
  checks.push(['loaded 20 expeditions', expeditions.length === 20])

  const hardest = expeditions.toSorted((a, b) => b.baseRating - a.baseRating)[0]
  const exp: ExpState = {
    content: hardest,
    biome: biomeMap.get(hardest.biome),
    loopCount: 0,
    run: null,
  }
  const climber: Unit = {
    idx: 0,
    content: creaturesByStrength[creaturesByStrength.length - 1],
    xp: 0,
    isAnchor: false,
    maxedSince: null,
  }
  const bA: Unit = {
    idx: 1,
    content: creaturesByStrength[0],
    xp: MAX_XP,
    isAnchor: true,
    maxedSince: 0,
  }
  const bB: Unit = {
    idx: 2,
    content: creaturesByStrength[1],
    xp: MAX_XP,
    isAnchor: true,
    maxedSince: 0,
  }
  const bestRate = (members: Unit[]) => {
    let r = 0
    for (const t of TIERS) {
      const { dur, xpPerMember } = evalParty(members, exp, t)
      r = Math.max(r, (xpPerMember / dur) * 60)
    }
    return r
  }
  checks.push([
    'strong boosters beat solo for low climber',
    bestRate([climber, bA, bB]) > bestRate([climber]),
  ])
  // sanity: longer cadence => no fewer wasted slots (more idle) for INDIVIDUAL
  const short = simulate({
    workingSet: 24,
    roster: 'weak',
    mode: 'individual',
    K: 0,
    cadenceSec: 5 * 3600,
    horizonSec: 2000 * 3600,
    warmupSec: 500 * 3600,
  })
  const long = simulate({
    workingSet: 24,
    roster: 'weak',
    mode: 'individual',
    K: 0,
    cadenceSec: 24 * 3600,
    horizonSec: 2000 * 3600,
    warmupSec: 500 * 3600,
  })
  checks.push([
    `longer cadence wastes more slots (24h ${(long.wastedSlotFraction * 100).toFixed(0)}% >= 5h ${(short.wastedSlotFraction * 100).toFixed(0)}%)`,
    long.wastedSlotFraction >= short.wastedSlotFraction,
  ])

  let allPass = true
  console.log('── self-tests ──')
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) allPass = false
  }
  if (!allPass) {
    console.error('self-tests FAILED — aborting')
    process.exit(1)
  }
  console.log('')
}

// ── Experiment harness ───────────────────────────────────────────────────────
function main() {
  selfTest()

  const HORIZON = 4000 * 3600
  const WARMUP = 1000 * 3600
  const WS = 36
  const cadences: [string, number][] = [
    ['5h', 5 * 3600],
    ['12h', 12 * 3600],
    ['24h', 24 * 3600],
  ]
  const rosters: Roster[] = ['weak', 'strong']
  const Ks = [1, 2, 3]

  console.log(
    `── prestige tokens/hour by check-in cadence ── ws=${WS}, horizon=${HORIZON / 3600}h, warmup=${WARMUP / 3600}h`,
  )
  console.log(
    '   (ANC/ROT show best-K; "waste%" = expedition-slot time spent on maxed/idle creatures)\n',
  )

  const header = ['roster', 'cadence', 'BATCH', 'INDIV', 'ROT(K)', 'ANC(K)', 'INDIV waste%']
  const rows: string[][] = []
  const summary: {
    roster: Roster
    cad: string
    batch: number
    indiv: number
    rot: number
    anc: number
    waste: number
  }[] = []

  for (const roster of rosters) {
    for (const [cadName, cadSec] of cadences) {
      const base = {
        workingSet: WS,
        roster,
        cadenceSec: cadSec,
        horizonSec: HORIZON,
        warmupSec: WARMUP,
      }
      const batch = simulate({ ...base, mode: 'batch', K: 0 })
      const indiv = simulate({ ...base, mode: 'individual', K: 0 })
      let rot = 0,
        rotK = 0,
        anc = 0,
        ancK = 0
      for (const K of Ks) {
        const r = simulate({ ...base, mode: 'rotation', K }).tokensPerHour
        if (r > rot) {
          rot = r
          rotK = K
        }
        const a = simulate({ ...base, mode: 'anchor', K }).tokensPerHour
        if (a > anc) {
          anc = a
          ancK = K
        }
      }
      rows.push([
        roster,
        cadName,
        batch.tokensPerHour.toFixed(2),
        indiv.tokensPerHour.toFixed(2),
        `${rot.toFixed(2)}(${rotK})`,
        `${anc.toFixed(2)}(${ancK})`,
        `${(indiv.wastedSlotFraction * 100).toFixed(0)}%`,
      ])
      summary.push({
        roster,
        cad: cadName,
        batch: batch.tokensPerHour,
        indiv: indiv.tokensPerHour,
        rot,
        anc,
        waste: indiv.wastedSlotFraction,
      })
    }
  }

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(fmt(header))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const r of rows) console.log(fmt(r))
  console.log('')

  console.log(
    '── how much does throughput drop as you check in less often? (per roster, 5h -> 24h) ──',
  )
  for (const roster of rosters) {
    const at = (c: string) => summary.find((s) => s.roster === roster && s.cad === c)!
    const drop = (1 - bestOf(at('24h')) / bestOf(at('5h'))) * 100
    console.log(
      `  ${roster}: best ${bestOf(at('5h')).toFixed(2)}/h at 5h -> ${bestOf(at('24h')).toFixed(2)}/h at 24h  (${drop.toFixed(0)}% drop)`,
    )
  }
  console.log('')

  console.log('── which strategy wins at each cadence (best of all four) ──')
  for (const s of summary) {
    const opts: [string, number][] = [
      ['BATCH', s.batch],
      ['INDIV', s.indiv],
      ['ROT', s.rot],
      ['ANC', s.anc],
    ]
    const win = opts.toSorted((a, b) => b[1] - a[1])[0]
    const indivGap = s.indiv > 0 ? (win[1] / s.indiv - 1) * 100 : 0
    console.log(
      `  ${s.roster}/${s.cad}: winner=${win[0]} (${win[1].toFixed(2)}/h)  vs INDIV ${s.indiv.toFixed(2)} (+${indivGap.toFixed(0)}%)  | idle waste ${(s.waste * 100).toFixed(0)}%`,
    )
  }
}

main()
