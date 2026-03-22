<script setup lang="ts">
import { Clock3, Zap, Users, ChevronRight, Repeat } from 'lucide-vue-next'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.png'
import { formatDuration } from '@/utils/format'
import { getLoopXpBonus } from '@/utils/formulas'
import { getItemImage } from '@/utils/itemImages'
import type { PlanStep } from '@/utils/levelPlanner'

defineProps<{
  step: PlanStep
  index: number
  creatureName: string
  isFirst: boolean
  isLast: boolean
  expanded: boolean
  timePercent: number
}>()


defineEmits<{
  toggle: []
}>()


function nodeColor(status: 'advantage' | 'disadvantage' | 'neutral'): string {
  if (status === 'advantage') return 'var(--color-green)'
  if (status === 'disadvantage') return 'var(--color-destructive)'
  return 'hsl(var(--primary))'
}


function barColor(status: 'advantage' | 'disadvantage' | 'neutral'): string {
  if (status === 'advantage') return 'var(--color-green)'
  if (status === 'disadvantage') return 'var(--color-destructive)'
  return 'hsl(var(--primary))'
}
</script>

<template>
  <div class="flex gap-3">
    <!-- Timeline gutter -->
    <div class="relative flex w-8 shrink-0 flex-col items-center sm:w-10">
      <!-- Top connector line -->
      <div class="w-0.5 flex-1" :class="isFirst ? 'bg-transparent' : 'bg-border/60'" />
      <!-- Node circle -->
      <div
        v-if="step.isAwakeningStep"
        class="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 text-xs font-bold sm:size-8"
        style="background-color: hsl(var(--card)); color: rgb(236 72 153)"
      >
        <img :src="awakenedSummonedIcon" alt="" class="size-4" />
      </div>
      <div
        v-else
        class="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-8"
        :style="{
          borderColor: nodeColor(step.biomeStatus),
          backgroundColor: 'hsl(var(--card))',
          color: nodeColor(step.biomeStatus),
        }"
      >
        {{ index + 1 }}
      </div>
      <!-- Bottom connector line -->
      <div class="w-0.5 flex-1" :class="isLast ? 'bg-transparent' : 'bg-border/60'" />
    </div>

    <!-- Awakening step card -->
    <div v-if="step.isAwakeningStep" class="mb-2 min-w-0 flex-1 pb-1">
      <div
        class="surface-card w-full overflow-hidden border-pink-500/30 bg-gradient-to-r from-pink-500/10 to-amber-500/10"
      >
        <div class="px-3 py-2.5 sm:px-4 sm:py-3">
          <div class="flex items-center gap-2">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <img
                :src="awakenedSummonedIcon"
                alt="Awaken"
                class="size-5 shrink-0 object-contain"
              />
              <p class="text-sm font-semibold text-pink-400">Awaken Creature</p>
            </div>
            <span
              class="shrink-0 rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-400"
            >
              LVL 70&rarr;1
            </span>
          </div>
          <p class="mt-1.5 text-xs text-muted-foreground">
            Awaken {{ creatureName }} to continue past level 70
          </p>
        </div>
      </div>
    </div>

    <!-- Step card -->
    <div v-else class="mb-2 min-w-0 flex-1 pb-1">
      <button
        class="focus-ring surface-card w-full overflow-hidden text-left transition hover:bg-muted/20"
        :aria-expanded="expanded"
        role="button"
        @click="$emit('toggle')"
      >
        <div class="px-3 py-2.5 sm:px-4 sm:py-3">
          <!-- Row 1: Name + level range -->
          <div class="flex items-center gap-2">
            <div class="flex min-w-0 flex-1 items-center gap-1.5">
              <img
                v-if="
                  step.expedition.rewards.length > 0 &&
                  getItemImage({ id: step.expedition.rewards[0].itemId })
                "
                :src="getItemImage({ id: step.expedition.rewards[0].itemId })"
                :alt="step.expedition.rewards[0].itemId"
                class="size-5 shrink-0 object-contain"
              />
              <p class="truncate text-sm font-semibold text-foreground">
                {{ step.expedition.name }}
              </p>
              <span
                class="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
              >
                T{{ step.tier }}
              </span>
              <span v-if="step.traitMatch" class="shrink-0 text-[10px] font-semibold text-primary">
                Trait Match
              </span>
            </div>

            <span
              class="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-xs font-semibold text-foreground"
            >
              LVL {{ step.fromLevel }}&rarr;{{ step.toLevel }}
            </span>

            <ChevronRight
              class="size-4 shrink-0 text-muted-foreground/50 transition-transform"
              :class="expanded ? 'rotate-90' : ''"
            />
          </div>

          <!-- Row 2: Biome + stats on right -->
          <div class="mt-1.5 flex items-center gap-2">
            <div
              class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span>{{ step.biomeName }}</span>
              <span
                v-if="step.biomeStatus === 'advantage'"
                class="font-semibold"
                style="color: var(--color-green)"
              >
                Advantage
              </span>
              <span
                v-if="step.biomeStatus === 'disadvantage'"
                class="font-semibold text-destructive"
              >
                Disadvantage
              </span>
            </div>

            <div class="ml-auto flex shrink-0 items-center gap-3">
              <span
                class="inline-flex items-center gap-1 text-xs font-semibold"
                style="color: var(--color-green)"
              >
                <Clock3 class="size-3" />
                {{ formatDuration(step.timeSeconds) }}
              </span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                <Repeat class="size-3" />
                {{ step.runs.toLocaleString() }}
              </span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-purple-400">
                <Zap class="size-3" />
                <template
                  v-if="Math.round(step.startXpPerMinute) !== Math.round(step.endXpPerMinute)"
                >
                  {{ Math.round(step.startXpPerMinute) }}&rarr;{{ Math.round(step.endXpPerMinute) }}
                </template>
                <template v-else>
                  {{ Math.round(step.xpPerMinute) }}
                </template>
                /min
              </span>
            </div>
          </div>

          <!-- Time proportion bar -->
          <div class="mt-2 flex items-center gap-2">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div
                class="h-full rounded-full transition-all duration-300"
                :style="{
                  width: Math.max(2, timePercent) + '%',
                  backgroundColor: barColor(step.biomeStatus),
                  opacity: 0.6,
                }"
              />
            </div>
            <span v-if="timePercent >= 5" class="text-[10px] font-semibold text-muted-foreground">
              {{ Math.round(timePercent) }}%
            </span>
          </div>

          <!-- Party tip -->
          <p v-if="step.partyTip" class="mt-1.5 flex items-center gap-1 text-[11px] text-sky-400">
            <Users class="size-3" />
            {{ step.partyTip }}
          </p>
        </div>
      </button>

      <!-- Expanded details -->
      <div v-if="expanded" class="surface-card mt-1 border-t-0 px-3 py-2.5 sm:px-4">
        <div class="grid grid-cols-4 gap-4 text-xs">
          <div>
            <p class="font-semibold text-muted-foreground">XP per run</p>
            <p class="mt-0.5 font-mono text-foreground">{{ step.xpPerRun.toLocaleString() }}</p>
          </div>
          <div>
            <p class="font-semibold text-muted-foreground">Duration per run</p>
            <p class="mt-0.5 font-mono text-foreground">
              {{ formatDuration(step.durationPerRun) }}
            </p>
          </div>
          <div>
            <p class="font-semibold text-muted-foreground">Levels</p>
            <p class="mt-0.5 font-mono text-foreground">{{ step.toLevel - step.fromLevel }}</p>
          </div>
          <div>
            <p class="font-semibold text-muted-foreground">Loop bonus</p>
            <p class="mt-0.5 font-mono text-foreground">
              +{{ Math.round(getLoopXpBonus(step.runs) * 100) }}%
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
