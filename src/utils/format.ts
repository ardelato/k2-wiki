import { itemById, machineById, toolById } from '@/data/indexes'
import { activeLocale, t } from '@/i18n'
import type { ElementType, ItemType, PlannerMethodKind } from '@/types'

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
    return 'border-emerald-600/35 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/20 dark:text-emerald-200'
  if (kind === 'garden')
    return 'border-lime-600/35 bg-lime-100 text-lime-800 dark:border-lime-400/40 dark:bg-lime-400/20 dark:text-lime-100'
  if (kind === 'container')
    return 'border-yellow-600/35 bg-yellow-100 text-yellow-800 dark:border-yellow-400/40 dark:bg-yellow-400/20 dark:text-yellow-100'
  if (kind === 'expedition')
    return 'border-sky-600/35 bg-sky-100 text-sky-800 dark:border-sky-400/40 dark:bg-sky-400/20 dark:text-sky-100'
  if (kind === 'buy')
    return 'border-fuchsia-600/35 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-400/20 dark:text-fuchsia-100'
  if (kind === 'machine')
    return 'border-orange-600/35 bg-orange-100 text-orange-800 dark:border-orange-400/40 dark:bg-orange-400/20 dark:text-orange-100'
  if (kind === 'fabrication')
    return 'border-violet-600/35 bg-violet-100 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/20 dark:text-violet-100'
  return 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
}

export function methodKindColor(kind: PlannerMethodKind): string {
  if (kind === 'craft') return 'hsl(var(--primary))'
  if (kind === 'gather') return 'rgb(52, 211, 153)'
  if (kind === 'garden') return 'rgb(163, 230, 53)'
  if (kind === 'container') return 'rgb(250, 204, 21)'
  if (kind === 'expedition') return 'rgb(56, 189, 248)'
  if (kind === 'buy') return 'rgb(232, 121, 249)'
  if (kind === 'cycle') return 'hsl(var(--destructive))'
  if (kind === 'stocked') return 'rgb(52, 211, 153)'
  if (kind === 'machine') return 'rgb(251, 146, 60)'
  if (kind === 'fabrication') return 'rgb(167, 139, 250)'
  return 'hsl(var(--muted-foreground))'
}

function percentValue(fraction: number): string {
  const digits = fraction < 0.01 ? 2 : 1
  return (fraction * 100).toLocaleString(activeLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatChance(chance: number): string {
  if (chance === 1) return '100%'
  if (chance > 1) return `2x ${percentValue(chance - 1)}%`
  return `${percentValue(chance)}%`
}

export function formatDecimal(value: number, fractionDigits = 2): string {
  return value.toLocaleString(activeLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
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
