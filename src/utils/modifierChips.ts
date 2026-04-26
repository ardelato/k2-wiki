import {
  upgradesIcon,
  sanctuaryIcon,
  machinesIcon,
  itemGridIcon,
  sourceIcons,
  toolIcons,
} from '@/utils/icons'

export interface ModifierChip {
  label: string
  value: string
  icon?: string
  color: string
  accentColor: string
  subtitle: string
  stats: string[]
}

const workstationToolId: Record<string, string> = {
  Furnace: 'hammer',
  Workbench: 'saw',
  Stove: 'knife',
}

function parseStats(value: string): string[] {
  const inner = value.match(/\(([^)]+)\)/)
  const raw = inner ? inner[1] : value
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function extractModifierChips(
  detailRows: { label: string; value: string }[],
  methodTitle?: string,
  options?: { compact?: boolean },
): ModifierChip[] {
  const chips: ModifierChip[] = []
  for (const row of detailRows) {
    if (row.label === 'Awaken Tree') {
      chips.push({
        label: row.label,
        value: row.value,
        icon: upgradesIcon,
        color:
          'border-cyan-600/35 bg-cyan-100 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-400/20 dark:text-cyan-100',
        accentColor: 'bg-cyan-500',
        subtitle: 'Skill tree bonuses',
        stats: parseStats(row.value),
      })
    } else if (row.label === 'Sanctuary') {
      const tierMatch = row.value.match(/^T(\d+)/)
      chips.push({
        label: row.label,
        value: row.value,
        icon: sanctuaryIcon,
        color:
          'border-amber-600/35 bg-amber-100 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100',
        accentColor: 'bg-amber-500',
        subtitle: tierMatch ? `Tier ${tierMatch[1]} job bonus` : 'Job tier bonus',
        stats: parseStats(row.value),
      })
    } else if (row.label.startsWith('Machine')) {
      const machineName = row.label.replace('Machine — ', '')
      chips.push({
        label: machineName,
        value: row.value,
        icon: sourceIcons[machineName] ?? machinesIcon,
        color:
          'border-orange-600/35 bg-orange-100 text-orange-800 dark:border-orange-400/40 dark:bg-orange-400/20 dark:text-orange-100',
        accentColor: 'bg-orange-500',
        subtitle: 'Passive machine production',
        stats: [row.value],
      })
    } else if (row.label.startsWith('Fabrication')) {
      chips.push({
        label: options?.compact ? 'Fab' : 'Fabrication',
        value: row.value,
        icon: itemGridIcon,
        color:
          'border-violet-600/35 bg-violet-100 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/20 dark:text-violet-100',
        accentColor: 'bg-violet-500',
        subtitle: 'Passive fabrication output',
        stats: [row.value],
      })
    } else if (row.label === 'Speed Tier') {
      chips.push({
        label: 'Speed Tier',
        value: row.value,
        icon: upgradesIcon,
        color:
          'border-emerald-600/35 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/20 dark:text-emerald-100',
        accentColor: 'bg-emerald-500',
        subtitle: 'Awaken speed upgrade',
        stats: [row.value],
      })
    } else if (row.label === 'Tool Speed') {
      const toolId = methodTitle ? workstationToolId[methodTitle] : undefined
      chips.push({
        label: 'Tool Speed',
        value: row.value,
        icon: toolId ? toolIcons[toolId] : upgradesIcon,
        color:
          'border-teal-600/35 bg-teal-100 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/20 dark:text-teal-100',
        accentColor: 'bg-teal-500',
        subtitle: 'Tool speed mode bonus',
        stats: [row.value],
      })
    }
  }
  return chips
}
