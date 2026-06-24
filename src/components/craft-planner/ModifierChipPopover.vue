<script setup lang="ts">
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import type { PopoverController } from '@/composables/core/usePopover'
import type { ModifierChip } from '@/utils/planner/modifierChips'

defineOptions({ name: 'ModifierChipPopover' })


defineProps<{
  chipPop: PopoverController
  activeChip: ModifierChip | null
}>()
</script>

<template>
  <FloatingPanel
    :is-open="chipPop.isOpen"
    :el-ref="chipPop.setPanelEl"
    :style="chipPop.style"
    class="pointer-events-none z-50 w-56 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
  >
    <template v-if="activeChip">
      <div class="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
        <div
          class="flex size-7 shrink-0 items-center justify-center rounded-lg"
          :class="activeChip.color"
        >
          <img v-if="activeChip.icon" :src="activeChip.icon" alt="" class="size-4" loading="lazy" />
        </div>
        <div class="min-w-0">
          <span class="block text-sm font-bold leading-tight text-foreground">{{
            activeChip.label
          }}</span>
          <span class="block text-2xs leading-tight text-muted-foreground">{{
            activeChip.subtitle
          }}</span>
        </div>
      </div>
      <div class="mx-3.5 border-t border-border/40" />
      <div class="flex flex-col gap-1 px-3.5 pb-3 pt-2">
        <div v-for="(stat, si) in activeChip.stats" :key="si" class="flex items-center gap-1.5">
          <span
            class="shrink-0 text-3xs font-bold leading-none"
            :class="stat.trimStart().startsWith('-') ? 'text-info-strong' : 'text-success-strong'"
            >{{ stat.trimStart().startsWith('-') ? '▼' : '▲' }}</span
          >
          <span class="text-xs font-medium text-foreground/90">{{ stat }}</span>
        </div>
      </div>
    </template>
  </FloatingPanel>
</template>
