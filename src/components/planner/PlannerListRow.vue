<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PlannerMethod, PlannerNode } from '@/types'
import { itemTypeColor } from '@/utils/format'
import { upgradesIcon, sanctuaryIcon, machinesIcon, itemGridIcon, sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

import PlannerRecommendation from './PlannerRecommendation.vue'

const props = defineProps<{
  node: PlannerNode
  activeMethod: PlannerMethod | null
  inventoryAmount: number
  recommendation: { text: string } | null
  subtreeCost: number | null
}>()


type ModifierChip = {
  label: string
  value: string
  icon?: string
  color: string
  accentColor: string
  subtitle: string
  stats: string[]
}


function parseStats(value: string): string[] {
  const inner = value.match(/\(([^)]+)\)/)
  const raw = inner ? inner[1] : value
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}


const modifierChips = computed<ModifierChip[]>(() => {
  if (!props.activeMethod) return []
  const chips: ModifierChip[] = []
  for (const row of props.activeMethod.detailRows) {
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
        label: 'Fab',
        value: row.value,
        icon: itemGridIcon,
        color:
          'border-violet-600/35 bg-violet-100 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/20 dark:text-violet-100',
        accentColor: 'bg-violet-500',
        subtitle: 'Passive fabrication output',
        stats: [row.value],
      })
    }
  }
  return chips
})


const displayCost = computed<number | null>(() => {
  if (props.subtreeCost != null && props.subtreeCost > 0) return props.subtreeCost
  return props.activeMethod?.cost ?? null
})


// Popover state for modifier chips
const activeChipIndex = ref<number | null>(null)
const activeChip = ref<ModifierChip | null>(null)
const popoverStyle = ref<Record<string, string>>({})


function onChipEnter(chip: ModifierChip, index: number, event: MouseEvent) {
  activeChipIndex.value = index
  activeChip.value = chip


  const target = event.currentTarget as HTMLElement
  if (!target) return


  const rect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 224 // w-56 = 14rem = 224px
  const GAP = 8
  const viewportWidth = document.documentElement.clientWidth


  let top = rect.bottom + GAP
  // Anchor to right edge of chip when near the right side of the viewport
  let left = rect.right - POPOVER_WIDTH
  // If that pushes past the left edge, center on chip instead
  if (left < GAP) left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
  // Final clamp
  left = Math.max(GAP, Math.min(left, viewportWidth - POPOVER_WIDTH - GAP))


  popoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }
}


function onChipLeave() {
  activeChipIndex.value = null
  activeChip.value = null
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- Main row -->
    <div
      class="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border/40 px-3 py-2.5"
    >
      <!-- Item icon -->
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-md"
        :style="{
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(node.itemType)} 8%, transparent)`,
        }"
      >
        <img
          v-if="getItemImage({ id: node.itemId })"
          :src="getItemImage({ id: node.itemId })"
          :alt="node.itemName"
          class="size-5 object-contain"
          loading="lazy"
        />
        <span v-else class="text-[10px] font-bold" :style="{ color: itemTypeColor(node.itemType) }">
          {{ node.itemName.charAt(0) }}
        </span>
      </div>

      <!-- Name + modifier micro icons -->
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="min-w-0 truncate text-sm font-semibold text-foreground">{{
            node.itemName
          }}</span>
          <!-- Modifier micro icons -->
          <div v-if="activeMethod" class="flex shrink-0 items-center gap-1.5">
            <span
              v-for="(chip, i) in modifierChips"
              :key="i"
              class="inline-flex size-6 cursor-default items-center justify-center rounded-md border"
              :class="chip.color"
              @mouseenter="onChipEnter(chip, i, $event)"
              @mouseleave="onChipLeave"
            >
              <img v-if="chip.icon" :src="chip.icon" alt="" class="size-4" loading="lazy" />
            </span>
          </div>
        </div>
        <!-- Source subtitle -->
        <div v-if="activeMethod" class="flex items-center gap-1">
          <img
            v-if="sourceIcons[activeMethod.title]"
            :src="sourceIcons[activeMethod.title]"
            alt=""
            class="size-3 shrink-0"
            loading="lazy"
          />
          <span class="min-w-0 truncate text-xs text-muted-foreground">{{
            activeMethod.title
          }}</span>
        </div>
      </div>

      <!-- Right side: cost -->
      <div v-if="activeMethod && (displayCost ?? 0) > 0" class="flex shrink-0 items-center gap-3">
        <span
          class="flex items-center gap-0.5 font-mono text-xs font-semibold"
          style="color: var(--color-yellow)"
        >
          <img
            v-if="getItemImage({ id: 'gold' })"
            :src="getItemImage({ id: 'gold' })"
            alt="Gold"
            class="size-3 object-contain"
          />
          {{ Math.round(displayCost!).toLocaleString() }}
        </span>
      </div>
    </div>

    <!-- Recommendation hint -->
    <PlannerRecommendation v-if="recommendation" :text="recommendation.text" class="mx-1" />
  </div>

  <!-- Modifier chip popover -->
  <Teleport to="body">
    <Transition name="popover">
      <div
        v-if="activeChipIndex !== null && activeChip"
        class="pointer-events-none z-50 w-56 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
        :style="popoverStyle"
      >
        <div class="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
          <div
            class="flex size-7 shrink-0 items-center justify-center rounded-lg"
            :class="activeChip.color"
          >
            <img
              v-if="activeChip.icon"
              :src="activeChip.icon"
              alt=""
              class="size-4"
              loading="lazy"
            />
          </div>
          <div class="min-w-0">
            <span class="block text-sm font-bold leading-tight text-foreground">{{
              activeChip.label
            }}</span>
            <span class="block text-[11px] leading-tight text-muted-foreground">{{
              activeChip.subtitle
            }}</span>
          </div>
        </div>
        <div class="mx-3.5 border-t border-border/40" />
        <div class="flex flex-col gap-1 px-3.5 pb-3 pt-2">
          <div v-for="(stat, si) in activeChip.stats" :key="si" class="flex items-center gap-1.5">
            <span
              class="shrink-0 text-[10px] font-bold leading-none"
              :class="stat.trimStart().startsWith('-') ? 'text-sky-400' : 'text-emerald-400'"
              >{{ stat.trimStart().startsWith('-') ? '▼' : '▲' }}</span
            >
            <span class="text-xs font-medium text-foreground/90">{{ stat }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popover-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.popover-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
