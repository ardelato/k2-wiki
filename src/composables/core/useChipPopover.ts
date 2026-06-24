import { ref } from 'vue'

import { usePopover } from '@/composables/core/usePopover'
import type { ModifierChip } from '@/utils/planner/modifierChips'

/**
 * Encapsulates the modifier-chip hover popover shared between PlannerTreeNode
 * and PlannerListRow. Manages the active-chip ref and the anchored FloatingPanel
 * position. Wire `chipPop` to `<ModifierChipPopover>` and `activeChip` to its prop.
 */
export function useChipPopover() {
  const activeChipIndex = ref<number | null>(null)
  const activeChip = ref<ModifierChip | null>(null)
  const chipPop = usePopover({ width: 224, gap: 8, hAlign: 'right' })

  function onChipEnter(chip: ModifierChip, index: number, event: MouseEvent) {
    activeChipIndex.value = index
    activeChip.value = chip
    const target = event.currentTarget as HTMLElement | null
    if (!target) return
    chipPop.open(target)
  }

  function onChipLeave() {
    activeChipIndex.value = null
    activeChip.value = null
    chipPop.close()
  }

  return { activeChipIndex, activeChip, chipPop, onChipEnter, onChipLeave }
}
