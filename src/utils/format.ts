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
  if (safeSeconds < 60) return `${safeSeconds}s`

  const days = Math.floor(safeSeconds / 86400)
  const hours = Math.floor((safeSeconds % 86400) / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds}s`)

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
  if (source.startsWith('expedition_') || source === 'completing expeditions') return 'Expedition'
  return toTitleCase(source)
}

export function methodKindLabel(kind: PlannerMethodKind): string {
  if (kind === 'craft') return 'Craft'
  if (kind === 'gather') return 'Gather'
  if (kind === 'garden') return 'Garden'
  if (kind === 'container') return 'Container'
  if (kind === 'expedition') return 'Expedition'
  if (kind === 'buy') return 'Buy'
  if (kind === 'cycle') return 'Cycle'
  if (kind === 'stocked') return 'In Stock'
  return 'Unknown'
}

export function methodKindClasses(kind: PlannerMethodKind): string {
  if (kind === 'craft') return 'border-primary/35 bg-primary/12 text-primary'
  if (kind === 'gather') return 'border-emerald-400/35 bg-emerald-400/12 text-emerald-300'
  if (kind === 'garden') return 'border-lime-400/35 bg-lime-400/10 text-lime-200'
  if (kind === 'container') return 'border-yellow-400/35 bg-yellow-400/10 text-yellow-200'
  if (kind === 'expedition') return 'border-sky-400/35 bg-sky-400/10 text-sky-200'
  if (kind === 'buy') return 'border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-200'
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
  return 'hsl(var(--muted-foreground))'
}

export function toTitleCase(str: string): string {
  const normalized = str.trim().replace(/[_-]+/g, ' ')
  if (!normalized) return ''

  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
