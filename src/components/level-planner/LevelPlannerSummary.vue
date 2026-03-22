<script setup lang="ts">
import { Clock3, Zap, Repeat, Layers, Flag } from 'lucide-vue-next'
import { computed } from 'vue'

import { formatDuration } from '@/utils/format'
import type { LevelingPlan } from '@/utils/levelPlanner'

const props = defineProps<{
  plan: LevelingPlan
  fromLevel: number
  toLevel: number
}>()


const segments = computed(() =>
  props.plan.steps.map((step) => ({
    percent:
      props.plan.totalTimeSeconds > 0
        ? (step.timeSeconds / props.plan.totalTimeSeconds) * 100
        : 100 / props.plan.steps.length,
    biomeStatus: step.biomeStatus,
    toLevel: step.toLevel,
  })),
)


function segmentColor(status: 'advantage' | 'disadvantage' | 'neutral'): string {
  if (status === 'advantage') return 'var(--color-green)'
  if (status === 'disadvantage') return 'var(--color-destructive)'
  return 'hsl(var(--primary))'
}
</script>

<template>
  <div class="surface-card space-y-3 px-4 py-3">
    <!-- Stats row -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
      <span class="inline-flex items-center gap-1.5" style="color: var(--color-green)">
        <Clock3 class="size-3.5" />
        {{ formatDuration(plan.totalTimeSeconds) }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-sky-400">
        <Layers class="size-3.5" />
        {{ plan.steps.length }} step{{ plan.steps.length > 1 ? 's' : '' }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-amber-400">
        <Repeat class="size-3.5" />
        {{ plan.totalRuns.toLocaleString() }} runs
      </span>
      <span class="inline-flex items-center gap-1.5 text-purple-400">
        <Zap class="size-3.5" />
        {{ Math.round(plan.xpPerMinute) }} XP/min avg
      </span>
    </div>

    <!-- Segmented progress bar -->
    <div class="space-y-1 pb-4">
      <div class="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
        <span>LVL {{ fromLevel }}</span>
        <span class="inline-flex items-center gap-1 text-foreground">
          <Flag class="size-3" />
          LVL {{ toLevel }}
        </span>
      </div>

      <div class="relative">
        <!-- Bar -->
        <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            v-for="(seg, i) in segments"
            :key="i"
            class="h-full transition-all duration-300"
            :style="{
              width: seg.percent + '%',
              backgroundColor: segmentColor(seg.biomeStatus),
              opacity: 0.8,
            }"
            :class="i > 0 ? 'border-l border-background/50' : ''"
          />
        </div>

        <!-- Level tick marks at segment boundaries -->
        <div v-if="segments.length > 1" class="absolute left-0 right-0 top-0 h-full">
          <div
            v-for="(seg, i) in segments.slice(0, -1)"
            :key="i"
            class="absolute flex flex-col items-center"
            :style="{
              left: segments.slice(0, i + 1).reduce((s, x) => s + x.percent, 0) + '%',
              transform: 'translateX(-50%)',
              top: 0,
            }"
          >
            <div class="h-2.5 w-px bg-background/70" />
            <div class="h-2 w-px bg-muted-foreground/30" />
            <span class="mt-0.5 text-[9px] font-semibold text-muted-foreground/70">
              {{ seg.toLevel }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Biome legend -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
      <span class="inline-flex items-center gap-1.5" style="color: var(--color-green)">
        <span class="size-2.5 rounded-full" style="background-color: var(--color-green)" />
        Advantage
      </span>
      <span class="inline-flex items-center gap-1.5 text-primary">
        <span class="size-2.5 rounded-full bg-primary" />
        Neutral
      </span>
      <span class="inline-flex items-center gap-1.5 text-destructive">
        <span class="size-2.5 rounded-full bg-destructive" />
        Disadvantage
      </span>
    </div>
  </div>
</template>
