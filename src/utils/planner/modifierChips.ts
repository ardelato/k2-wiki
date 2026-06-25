import { t } from '@/i18n'
import {
  upgradesIcon,
  sanctuaryIcon,
  machinesIcon,
  itemGridIcon,
  sourceIcons,
  toolIcons,
} from '@/utils/format/icons'

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

/**
 * Localizes the hardcoded English effect-descriptor fragments emitted by
 * useCraftPlanner's solve (e.g. "yield", "duration", "Speed", "/min").
 *
 * The solve does not re-run on locale change, so it intentionally emits English
 * sentinels. This helper translates them at render time — it runs inside the
 * consuming components' computeds, where `t()` re-evaluates on locale change,
 * keeping chip values locale-reactive. Job/stat names, "T{n}" tier notation,
 * and numbers are preserved verbatim (game vocabulary / data).
 */
function localizeModifierValue(value: string): string {
  return value
    .replace(/\/min\b/g, t('common.perMin'))
    .replace(/\byield\b/g, t('awakenView.kinds.yield'))
    .replace(/\bduration\b/g, t('awakenView.kinds.duration'))
    .replace(/\bSpeed\b/g, t('awakenView.kinds.speed'))
}

function parseStats(value: string): string[] {
  const inner = value.match(/\(([^)]+)\)/)
  const raw = inner ? inner[1] : value
  return raw
    .split(',')
    .map((s) => localizeModifierValue(s.trim()))
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
          'border-info/35 bg-info/10 text-info-strong dark:border-info/40 dark:bg-info/20 dark:text-info-strong',
        accentColor: 'bg-info',
        subtitle: t('modifiers.skillTreeBonuses'),
        stats: parseStats(row.value),
      })
    } else if (row.label === 'Sanctuary') {
      const tierMatch = row.value.match(/^T(\d+)/)
      chips.push({
        label: row.label,
        value: row.value,
        icon: sanctuaryIcon,
        color:
          'border-warning/35 bg-warning/10 text-warning-strong dark:border-warning/40 dark:bg-warning/20 dark:text-warning-strong',
        accentColor: 'bg-warning',
        subtitle: tierMatch
          ? t('modifiers.tierJobBonus', { n: tierMatch[1] })
          : t('modifiers.jobTierBonus'),
        stats: parseStats(row.value),
      })
    } else if (row.label.startsWith('Machine')) {
      const machineName = row.label.replace('Machine — ', '')
      chips.push({
        label: machineName,
        value: row.value,
        icon: sourceIcons[machineName] ?? machinesIcon,
        color:
          'border-machine/35 bg-machine/10 text-machine-strong dark:border-machine/40 dark:bg-machine/20 dark:text-machine-strong',
        accentColor: 'bg-machine',
        subtitle: t('modifiers.passiveMachineProduction'),
        stats: [localizeModifierValue(row.value)],
      })
    } else if (row.label.startsWith('Fabrication')) {
      chips.push({
        label: t(options?.compact ? 'modifiers.fabricationShort' : 'modifiers.fabrication'),
        value: row.value,
        icon: itemGridIcon,
        color:
          'border-reserved/35 bg-reserved/10 text-reserved-strong dark:border-reserved/40 dark:bg-reserved/20 dark:text-reserved-strong',
        accentColor: 'bg-reserved',
        subtitle: t('modifiers.passiveFabricationOutput'),
        stats: [localizeModifierValue(row.value)],
      })
    } else if (row.label === 'Speed Tier') {
      chips.push({
        label: t('modifiers.speedTier'),
        value: row.value,
        icon: upgradesIcon,
        color:
          'border-success/35 bg-success/10 text-success-strong dark:border-success/40 dark:bg-success/20 dark:text-success-strong',
        accentColor: 'bg-success',
        subtitle: t('modifiers.awakenSpeedUpgrade'),
        stats: [localizeModifierValue(row.value)],
      })
    } else if (row.label === 'Tool Speed') {
      const toolId = methodTitle ? workstationToolId[methodTitle] : undefined
      chips.push({
        label: t('modifiers.toolSpeed'),
        value: row.value,
        icon: toolId ? toolIcons[toolId] : upgradesIcon,
        color:
          'border-tool/35 bg-tool/10 text-tool-strong dark:border-tool/40 dark:bg-tool/20 dark:text-tool-strong',
        accentColor: 'bg-tool',
        subtitle: t('modifiers.toolSpeedModeBonus'),
        stats: [localizeModifierValue(row.value)],
      })
    }
  }
  return chips
}
