import { Sparkles, TrendingUp, Users, Wrench } from 'lucide-vue-next'
import type { FunctionalComponent } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import type { SkillAdvisory, SkillBoost } from '@/composables/useSkillPlanner'
import { t } from '@/i18n'
import { formatNumber } from '@/utils/format/format'

type BonusAdvisory = Extract<SkillAdvisory, { kind: 'bonus' }>
type PlayerLevelAdvisory = Extract<SkillAdvisory, { kind: 'playerLevel' }>

/** Where the advisory's link goes, so the CTA reads "Open in Sanctuary" rather than
 * a bare "Open" (which page it lands on is otherwise ambiguous). Sanctuary, the
 * Awaken Tree, and Tools are frozen feature names kept in English in every locale. */
const ADVISORY_DESTINATIONS: Record<BonusAdvisory['routeName'], () => string> = {
  sanctuary: () => 'Sanctuary',
  awaken: () => 'Awaken tree',
  tools: () => 'Tools',
} as const

function advisoryDestination(adv: BonusAdvisory): string {
  return ADVISORY_DESTINATIONS[adv.routeName]()
}

/** Deep-links a bonus advisory to its destination, highlighting the node/tool. */
function advisoryLink(adv: BonusAdvisory): RouteLocationRaw {
  if (adv.routeName === 'awaken')
    return { name: 'awaken', query: { tree: adv.awakenTreeId, node: adv.awakenNodeId } }
  if (adv.routeName === 'tools') return { name: 'tools', query: { tool: adv.toolId } }
  if (adv.routeName === 'sanctuary')
    return {
      name: 'sanctuary',
      query: { job: adv.partyDiff?.target.job, target: adv.partyDiff?.target.to },
    }
  return { name: adv.routeName }
}

/** The presentational shape every advisory row renders from. */
interface AdvisoryPresentation {
  /** Real in-game asset image for the lever (sanctuary / awaken tree / the specific
   * tool). Preferred over `glyph` when present. */
  iconSrc?: string
  /** Fallback icon when there's no asset image — and the player-level row, which
   * reuses the Summary's Player Level chart icon. */
  glyph: FunctionalComponent
  headline: string
  /** The price to act, shown as the collapsed row's single muted subline. Empty when
   * the lever has no resource cost (e.g. a Sanctuary roster swap, or player level). */
  cost: string
  /** The gain this lever grants (e.g. "+40% XP · faster gathering"). Shown at the top
   * of the expanded body — not in the collapsed row, where the time-saved badge
   * already quantifies the payoff. */
  benefit: string
  /** Bonus levers carry one specific navigation CTA; playerLevel has none (it has
   * many per-skill destinations instead). */
  ctaLabel?: string
  ctaLink?: RouteLocationRaw
}

/** One benefit's gain phrase — the delta this lever grants, e.g. "+40% XP",
 * "10% faster gathering", "+2 yield". Mirrors the in-planner bonus wording. */
function benefitGain(b: SkillBoost): string {
  const diff = b.after - b.before
  if (b.kind === 'duration') return t('advisories.benefit.fasterGathering', { pct: Math.abs(diff) })
  if (b.kind === 'yield') return t('advisories.benefit.yield', { amount: diff })
  return t('advisories.benefit.xp', { pct: diff })
}

/** Up to two benefit gains, joined by " · " — the primary payoff for the subline. */
function benefitsPhrase(benefits: SkillBoost[]): string {
  return benefits.slice(0, 2).map(benefitGain).join(' · ')
}

/** The price to act on a bonus lever — the resource it spends. Empty for Sanctuary,
 * whose only "cost" is a free roster rearrange. */
function costHint(adv: BonusAdvisory): string {
  if (adv.toolCost)
    return t('advisories.cost.tool', {
      amount: formatNumber(adv.toolCost.amount),
      itemName: adv.toolCost.itemName,
    })
  if (adv.awakenPointCost)
    return t('advisories.cost.awakenPoints', { n: adv.awakenPointCost }, adv.awakenPointCost)
  return ''
}

/** In the Skill planner we're already scoped to one skill, so an awaken node's leading
 * skill word is redundant ("Fishing Yield I" → "Yield I"). Stripped only there; the
 * Summon "Ways to improve" mixes skills (job set), so it keeps the full node name. */
function stripSkillPrefix(label: string, treeId?: string): string {
  if (!treeId) return label
  const prefix = `${treeId} ` // treeId is the lowercase skill id, e.g. "fishing"
  return label.toLowerCase().startsWith(prefix) ? label.slice(prefix.length) : label
}

function bonusPresentation(adv: BonusAdvisory, job?: string): AdvisoryPresentation {
  let glyph: FunctionalComponent
  let headline: string
  if (adv.routeName === 'sanctuary') {
    glyph = Users
    // Name the gathering job being raised when known (Summon "Ways to improve" mixes
    // advisories from several skills); the Skill planner omits it (already scoped).
    // "Sanctuary" and the job name are frozen, passed through as params.
    const tier = adv.partyDiff?.target.to ?? ''
    headline = job
      ? t('advisories.sanctuary.headlineWithJob', { job, tier })
      : t('advisories.sanctuary.headline', { tier })
  } else if (adv.routeName === 'awaken') {
    glyph = Sparkles
    // The node name (e.g. "Fishing Yield I") is self-describing; the awaken icon + cost
    // line carry the rest, so we drop the old "Allocate Awaken node · " jargon prefix.
    // Scoped Skill planner also drops the redundant leading skill word.
    headline = job ? adv.label : stripSkillPrefix(adv.label, adv.awakenTreeId)
  } else {
    glyph = Wrench
    // The tool label already names the tool + target level clearly, so reuse it.
    headline = adv.label
  }

  return {
    iconSrc: adv.iconSrc,
    glyph,
    headline,
    cost: costHint(adv),
    benefit: benefitsPhrase(adv.benefits),
    ctaLabel: t('advisories.openIn', { destination: advisoryDestination(adv) }),
    ctaLink: advisoryLink(adv),
  }
}

function playerLevelPresentation(adv: PlayerLevelAdvisory): AdvisoryPresentation {
  const levels = adv.playerLevelTo - adv.playerLevelFrom
  return {
    glyph: TrendingUp,
    headline: t('advisories.playerLevel.headline', { levels }, levels),
    cost: '',
    benefit: t('advisories.playerLevel.benefit', { pct: adv.xpBonusGain }),
    // playerLevel has many per-skill destinations, so no single CTA.
  }
}

/** Maps a `SkillAdvisory` to its row presentation, keeping headline/subline grammar
 * in one place. Pure — no side effects. */
export function advisoryPresentation(adv: SkillAdvisory, job?: string): AdvisoryPresentation {
  return adv.kind === 'bonus' ? bonusPresentation(adv, job) : playerLevelPresentation(adv)
}
