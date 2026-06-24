/**
 * Single source of truth for the planner's game-specific terminology.
 *
 * Both the inline info-icon tooltips (`InfoHint.vue`) and the guided tour
 * (`usePlannerTour`) read definitions from here so wording never drifts
 * between where a term is hovered and where it is walked through.
 *
 * `short` is the one-liner shown in a hover tooltip; `long` is the optional
 * expanded copy surfaced by a "Learn more" disclosure.
 *
 * The copy itself lives in the locale files under `plannerGlossary.<key>.{term,
 * short,long}` so tooltips and tour are translatable. Each field below is a
 * getter that calls `t()` on access, so reading `PLANNER_TERMS[key].short`
 * inside a render/computed resolves to the active locale and re-runs when the
 * language changes — the same reactive trick as `i18nRecord`.
 */
import { t } from '@/i18n'

export interface GlossaryTerm {
  /** Human-readable label for the term. */
  term: string
  /** One-line definition shown in a hover tooltip. */
  short: string
  /** Optional longer explanation shown in a "Learn more" expander. */
  long?: string
}

// Every glossary key, in display order.
const TERM_KEYS = [
  'awakenPoint',
  'sanctuarySeat',
  'checkIn',
  'cadence',
  'prestige',
  'rosterRoleAnchor',
  'rosterRoleBooster',
  'rosterRoleClimber',
  'levelChart',
] as const

export type TermKey = (typeof TERM_KEYS)[number]

// Keys that carry a `long` expander. Roster-role terms are short-only.
const TERMS_WITH_LONG = new Set<TermKey>([
  'awakenPoint',
  'sanctuarySeat',
  'checkIn',
  'cadence',
  'prestige',
  'levelChart',
])

function buildTerm(key: TermKey): GlossaryTerm {
  const entry = {} as GlossaryTerm
  Object.defineProperty(entry, 'term', {
    get: () => t(`plannerGlossary.${key}.term`),
    enumerable: true,
  })
  Object.defineProperty(entry, 'short', {
    get: () => t(`plannerGlossary.${key}.short`),
    enumerable: true,
  })
  if (TERMS_WITH_LONG.has(key)) {
    Object.defineProperty(entry, 'long', {
      get: () => t(`plannerGlossary.${key}.long`),
      enumerable: true,
    })
  }
  return entry
}

export const PLANNER_TERMS = Object.fromEntries(
  TERM_KEYS.map((key) => [key, buildTerm(key)]),
) as Record<TermKey, GlossaryTerm>
