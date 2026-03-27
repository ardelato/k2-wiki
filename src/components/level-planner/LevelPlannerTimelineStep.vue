<script setup lang="ts">
import { Clock3, Zap, Users, ChevronRight, Repeat, ExternalLink } from 'lucide-vue-next'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.png'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration } from '@/utils/format'
import { getLoopXpBonus } from '@/utils/formulas'
import { getItemImage } from '@/utils/itemImages'
import type { PlanStep } from '@/utils/levelPlanner'

interface PartyMember {
  creatureId: string
  creature?: Creature
  fromLevel: number
  toLevel: number
  xpGained: number
  isBooster?: boolean
}


defineProps<{
  step: PlanStep
  index: number
  creatureName: string
  isFirst: boolean
  isLast: boolean
  expanded: boolean
  timePercent: number
  partyMembers?: PartyMember[]
  hideNode?: boolean
  hideGutter?: boolean
  scoreRatioMet?: boolean
  highlightCreatureId?: string
}>()


defineEmits<{
  toggle: []
  viewInExpeditions: []
}>()


function nodeColor(status: 'advantage' | 'disadvantage' | 'neutral'): string {
  if (status === 'advantage') return 'var(--color-green)'
  if (status === 'disadvantage') return 'var(--color-destructive)'
  return 'hsl(var(--primary))'
}
</script>

<template>
  <div class="flex gap-3">
    <!-- Timeline gutter (hidden when parent provides a shared gutter) -->
    <div v-if="!hideGutter" class="relative w-8 shrink-0 sm:w-10">
      <!-- Connector line (absolute, spans full gutter height) -->
      <div
        v-if="!(isFirst && isLast)"
        class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-border/60"
        :class="[isFirst ? 'top-[1.1rem]' : 'top-0', isLast ? 'bottom-[1.1rem]' : 'bottom-0']"
      />
      <!-- Node circle (sticky while scrolling, hidden for parallel steps sharing same wave) -->
      <template v-if="!hideNode">
        <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-10 flex justify-center">
          <div
            v-if="step.isAwakeningStep"
            class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 text-xs font-bold sm:size-8"
            style="background-color: hsl(var(--card)); color: rgb(236 72 153)"
          >
            <img :src="awakenedSummonedIcon" alt="" class="size-4" />
          </div>
          <div
            v-else
            class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-8"
            :style="{
              borderColor: nodeColor(step.biomeStatus),
              backgroundColor: 'hsl(var(--card))',
              color: nodeColor(step.biomeStatus),
            }"
          >
            {{ index + 1 }}
          </div>
        </div>
      </template>
    </div>

    <!-- Awakening step card -->
    <div v-if="step.isAwakeningStep" class="mb-2 min-w-0 flex-1 pb-1">
      <div
        class="surface-card w-full overflow-hidden border-pink-500/30 bg-gradient-to-r from-pink-500/10 to-amber-500/10"
      >
        <div class="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <img
            v-if="partyMembers?.[0]?.creature"
            :src="getCreatureImage(partyMembers[0].creature)"
            :alt="creatureName"
            class="size-10 shrink-0 rounded-lg border border-pink-500/30 object-cover sm:size-12"
          />
          <div class="min-w-0 flex-1">
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
    </div>

    <!-- Step card -->
    <div v-else class="mb-2 min-w-0 flex-1 pb-1">
      <div class="surface-card overflow-hidden">
        <button
          class="focus-ring w-full text-left transition hover:bg-muted/20"
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
                <span
                  v-if="step.traitMatch"
                  class="shrink-0 text-[10px] font-semibold text-primary"
                >
                  Trait Match
                </span>
              </div>

              <span
                v-if="!partyMembers"
                class="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-xs font-semibold text-foreground"
              >
                LVL {{ step.fromLevel }}&rarr;{{ step.toLevel }}
              </span>

              <ChevronRight
                class="size-4 shrink-0 text-muted-foreground/50 transition-transform"
                :class="expanded ? 'rotate-90' : ''"
              />
            </div>

            <!-- Party member slots (party mode) -->
            <div v-if="partyMembers && partyMembers.length > 0" class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="member in partyMembers"
                :key="member.creatureId"
                class="flex flex-col items-center gap-1"
              >
                <div
                  class="relative size-16 overflow-hidden rounded-lg border bg-card/50 sm:size-20"
                  :class="
                    highlightCreatureId && member.creatureId === highlightCreatureId
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-border'
                  "
                >
                  <img
                    v-if="member.creature"
                    :src="getCreatureImage(member.creature)"
                    :alt="member.creature?.name ?? member.creatureId"
                    class="size-full object-cover"
                  />
                  <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-0.5">
                    <p
                      class="truncate text-center text-[10px] font-semibold"
                      :class="
                        highlightCreatureId && member.creatureId === highlightCreatureId
                          ? 'text-primary'
                          : 'text-white'
                      "
                    >
                      {{ member.creature?.name ?? member.creatureId }}
                    </p>
                  </div>
                </div>
                <span
                  class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                >
                  <template v-if="member.isBooster">Booster</template>
                  <template v-else>LVL {{ member.fromLevel }}&rarr;{{ member.toLevel }}</template>
                </span>
              </div>
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
                <span
                  class="inline-flex items-center gap-1 text-xs font-semibold"
                  :class="
                    scoreRatioMet === undefined
                      ? 'text-purple-400'
                      : scoreRatioMet
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                  "
                >
                  <Zap class="size-3" />
                  <template
                    v-if="
                      (step.startXpPerMinute / 60).toFixed(2) !==
                      (step.endXpPerMinute / 60).toFixed(2)
                    "
                  >
                    {{
                      (step.startXpPerMinute / 60).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}&rarr;{{
                      (step.endXpPerMinute / 60).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}
                  </template>
                  <template v-else>
                    {{
                      (step.xpPerMinute / 60).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}
                  </template>
                  XP/s
                </span>
                <span
                  v-if="partyMembers"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-sky-400"
                >
                  <Users class="size-3" />
                  {{ partyMembers.length }}
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
                    backgroundColor: nodeColor(step.biomeStatus),
                    opacity: 0.6,
                  }"
                />
              </div>
              <span v-if="timePercent >= 5" class="text-[10px] font-semibold text-muted-foreground">
                {{ Math.round(timePercent) }}%
              </span>
            </div>

            <!-- Party tip -->
            <p
              v-if="step.partyTip && !partyMembers"
              class="mt-1.5 flex items-center gap-1 text-[11px] text-sky-400"
            >
              <Users class="size-3" />
              {{ step.partyTip }}
            </p>
          </div>
        </button>

        <!-- View in Expeditions (party mode, always visible) -->
        <div v-if="partyMembers" class="border-t border-border/40 px-3 py-2 sm:px-4">
          <button
            class="focus-ring flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            @click="$emit('viewInExpeditions')"
          >
            <ExternalLink class="size-3" />
            View in Expeditions
          </button>
        </div>

        <!-- Expanded details -->
        <div v-if="expanded" class="border-t border-border/40 px-3 py-2.5 sm:px-4">
          <div class="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
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
  </div>
</template>
