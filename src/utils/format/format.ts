import { itemById, machineById, toolById } from '@/data/indexes'
import { activeLocale, t } from '@/i18n'
import type { ElementType, ItemType, PlannerMethodKind } from '@/types'

// Constructing an Intl.NumberFormat is ~36× slower than reusing one (measured),
// and these formatters run per-node across large craft trees. Cache by
// locale + fraction-digit options so each variant is built once per language.
const numberFormatCache = new Map<string, Intl.NumberFormat>()
function numberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = activeLocale()
  const key = options
    ? `${locale}|${options.minimumFractionDigits ?? ''}|${options.maximumFractionDigits ?? ''}`
    : locale
  let fmt = numberFormatCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options)
    numberFormatCache.set(key, fmt)
  }
  return fmt
}

/** Locale-aware number formatting via a cached Intl.NumberFormat. Prefer this
 *  over `n.toLocaleString(activeLocale())`, which rebuilds the formatter per call. */
export function formatNumber(value: number): string {
  return numberFormat().format(value)
}

/** Compact magnitude label for tight UI (gantt bars, inventory chips): `1500 → "1.5K"`,
 *  `2_000_000 → "2M"`. A trailing `.0` is dropped; values below 1000 fall through to the
 *  locale-aware {@link formatNumber}. Canonical replacement for the per-component K/M helpers. */
export function formatNumberCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return formatNumber(value)
}

export function typeColor(type: ElementType): string {
  if (type === 'Fire') return 'hsl(var(--type-fire))'
  if (type === 'Water') return 'hsl(var(--type-water))'
  if (type === 'Wind') return 'hsl(var(--type-wind))'
  return 'hsl(var(--type-earth))'
}

export function typeColorVar(type: ElementType): string {
  if (type === 'Fire') return 'var(--type-fire)'
  if (type === 'Water') return 'var(--type-water)'
  if (type === 'Wind') return 'var(--type-wind)'
  return 'var(--type-earth)'
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  if (safeSeconds < 60) return t('duration.seconds', { n: safeSeconds })

  const days = Math.floor(safeSeconds / 86400)
  const hours = Math.floor((safeSeconds % 86400) / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(t('duration.days', { n: days }))
  if (hours > 0) parts.push(t('duration.hours', { n: hours }))
  if (minutes > 0 || parts.length === 0) parts.push(t('duration.minutes', { n: minutes }))
  if (seconds > 0 && days === 0 && hours === 0) parts.push(t('duration.seconds', { n: seconds }))

  return parts.join(' ')
}

const itemTypeColorMap: Record<ItemType, string> = {
  Currency: 'var(--color-item-currency)',
  Container: 'var(--color-item-container)',
  Gathered: 'var(--color-item-gathered)',
  Refined: 'var(--color-item-refined)',
  Sellable: 'var(--color-item-sellable)',
  Consumable: 'var(--color-item-consumable)',
}

export function itemTypeColor(type: ItemType): string {
  return itemTypeColorMap[type] ?? 'var(--color-text-muted)'
}

export function sourceLabel(source: string): string {
  if (source.startsWith('crafting_')) return toTitleCase(source.replace('crafting_', ''))
  if (source.startsWith('expedition_') || source === 'completing expeditions')
    return t('methods.expedition')
  return toTitleCase(source)
}

const METHOD_KIND_KEYS: Record<PlannerMethodKind, string> = {
  craft: 'methods.craft',
  gather: 'methods.gather',
  garden: 'methods.garden',
  container: 'methods.container',
  expedition: 'methods.expedition',
  buy: 'methods.buy',
  cycle: 'methods.cycle',
  stocked: 'methods.stocked',
  machine: 'methods.machine',
  fabrication: 'methods.fabrication',
  unknown: 'methods.unknown',
}

export function methodKindLabel(kind: PlannerMethodKind): string {
  return t(METHOD_KIND_KEYS[kind])
}

export function methodKindClasses(kind: PlannerMethodKind): string {
  if (kind === 'craft') return 'border-primary/35 bg-primary/12 text-primary'
  if (kind === 'gather')
    return 'border-success/35 bg-success/10 text-success-strong dark:border-success/40 dark:bg-success/20 dark:text-success-strong'
  if (kind === 'garden')
    return 'border-garden/35 bg-garden/10 text-garden-strong dark:border-garden/40 dark:bg-garden/20 dark:text-garden-strong'
  if (kind === 'container')
    return 'border-gold/35 bg-gold/10 text-gold-strong dark:border-gold/40 dark:bg-gold/20 dark:text-gold-strong'
  if (kind === 'expedition')
    return 'border-info/35 bg-info/10 text-info-strong dark:border-info/40 dark:bg-info/20 dark:text-info-strong'
  if (kind === 'buy')
    return 'border-buy/35 bg-buy/10 text-buy-strong dark:border-buy/40 dark:bg-buy/20 dark:text-buy-strong'
  if (kind === 'machine')
    return 'border-machine/35 bg-machine/10 text-machine-strong dark:border-machine/40 dark:bg-machine/20 dark:text-machine-strong'
  if (kind === 'fabrication')
    return 'border-reserved/35 bg-reserved/10 text-reserved-strong dark:border-reserved/40 dark:bg-reserved/20 dark:text-reserved-strong'
  return 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
}

// Returns a CSS color for inline `:style` bindings (e.g. gantt bar borders).
// Inline styles resolve `var()`, so these track the theme automatically — no
// canvas/getComputedStyle plumbing needed.
export function methodKindColor(kind: PlannerMethodKind): string {
  if (kind === 'craft') return 'hsl(var(--primary))'
  if (kind === 'gather') return 'oklch(var(--success))'
  if (kind === 'garden') return 'oklch(var(--garden))'
  if (kind === 'container') return 'oklch(var(--gold))'
  if (kind === 'expedition') return 'oklch(var(--info))'
  if (kind === 'buy') return 'oklch(var(--buy))'
  if (kind === 'cycle') return 'hsl(var(--destructive))'
  if (kind === 'stocked') return 'oklch(var(--success))'
  if (kind === 'machine') return 'oklch(var(--machine))'
  if (kind === 'fabrication') return 'oklch(var(--reserved))'
  return 'hsl(var(--muted-foreground))'
}

function percentValue(fraction: number): string {
  const digits = fraction < 0.01 ? 2 : 1
  return numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    fraction * 100,
  )
}

export function formatChance(chance: number): string {
  if (chance === 1) return '100%'
  if (chance > 1) return `2x ${percentValue(chance - 1)}%`
  return `${percentValue(chance)}%`
}

export function formatDecimal(value: number, fractionDigits = 2): string {
  return numberFormat({
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function itemName(id: string): string {
  return itemById.get(id)?.name ?? toTitleCase(id.replace(/-/g, ' '))
}

export function toolName(id: string): string {
  return toolById.get(id)?.name ?? toTitleCase(id.replace(/-/g, ' '))
}

export function machineName(id: string): string {
  return machineById.get(id)?.name ?? toTitleCase(id.replace(/-/g, ' '))
}

export function toTitleCase(str: string): string {
  const normalized = str.trim().replace(/[_-]+/g, ' ')
  if (!normalized) return ''

  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
