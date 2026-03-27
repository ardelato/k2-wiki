<script setup lang="ts">
import { Clock3, Minus, Plus, Repeat, RotateCcw, Users, Zap } from 'lucide-vue-next'
import { computed, ref, nextTick } from 'vue'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.png'
import { useGanttZoom, niceTimeStep } from '@/composables/useGanttZoom'
import biomesData from '@/data/biomes.json'
import type { PartyLevelingPlan, PartyPlanStep, Creature, AwakenEvent } from '@/types'
import type { Biome } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration } from '@/utils/format'
import {
  calculateCreatureRating,
  calculateDifficultyRating,
  getLoopXpBonus,
} from '@/utils/formulas'
import { getItemImage } from '@/utils/itemImages'

const props = withDefaults(
  defineProps<{
    plan: PartyLevelingPlan
    creatures: Map<string, Creature>
    filterCreatureId?: string
  }>(),
  {
    filterCreatureId: '',
  },
)


interface GanttBar {
  step: PartyPlanStep
  startTime: number
  endTime: number
  expeditionName: string
  lane: string
  rewardItemId: string | null
  creatureNames: string[]
  creatureIds: string[]
  tier: number
  runs: number
}


const bars = computed<GanttBar[]>(() => {
  return props.plan.steps
    .filter((s) => s.startTime != null && !s.isAwakeningStep)
    .filter(
      (s) =>
        !props.filterCreatureId || s.party.some((m) => m.creatureId === props.filterCreatureId),
    )
    .map((step) => {
      const start = step.startTime ?? 0
      return {
        step,
        startTime: start,
        endTime: start + step.timeSeconds,
        expeditionName: step.expedition.name,
        lane: step.expedition.name,
        rewardItemId: step.expedition.rewards.length > 0 ? step.expedition.rewards[0].itemId : null,
        creatureNames: step.party.map((p) => {
          const c = props.creatures.get(p.creatureId)
          return c?.name ?? p.creatureId
        }),
        creatureIds: step.party.map((p) => p.creatureId),
        tier: step.tier,
        runs: step.runs,
      }
    })
    .toSorted((a, b) => a.startTime - b.startTime)
})


const lanes = computed(() => {
  const laneExpId = new Map<string, string>()
  for (const bar of bars.value) {
    if (!laneExpId.has(bar.lane)) {
      laneExpId.set(bar.lane, bar.step.expedition.id)
    }
  }
  return [...laneExpId.entries()]
    .toSorted(([, a], [, b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([lane]) => lane)
})


const laneRewardId = computed(() => {
  const map: Record<string, string | null> = {}
  for (const bar of bars.value) {
    if (!(bar.lane in map)) map[bar.lane] = bar.rewardItemId
  }
  return map
})


const barsByLane = computed(() => {
  const map: Record<string, GanttBar[]> = {}
  for (const bar of bars.value) {
    ;(map[bar.lane] ??= []).push(bar)
  }
  return map
})


const totalTime = computed(() => {
  if (bars.value.length === 0) return 1
  return Math.max(1, ...bars.value.map((b) => b.endTime))
})


// Zoom
const ganttRef = ref<HTMLElement | null>(null)
const {
  zoom,
  canZoomIn,
  canZoomOut,
  isDefaultZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  laneMinWidth,
  zoomModifierHeld,
  shiftHeld,
} = useGanttZoom(ganttRef, {
  zoomLevels: [1, 1.5, 2, 3, 5, 8, 12, 16, 24, 36, 50, 75, 100],
})


const timeMarkers = computed(() => {
  const total = totalTime.value
  if (total <= 0) return []
  // Use visible duration (total / zoom) to pick appropriate step granularity
  const visibleDuration = total / zoom.value
  const step = niceTimeStep(visibleDuration)
  const markers = []
  for (let t = 0; t <= total; t += step) {
    markers.push({ seconds: t, pct: (t / total) * 100, label: formatDuration(t) })
  }
  return markers
})


function barLeft(bar: GanttBar): string {
  return `${(bar.startTime / totalTime.value) * 100}%`
}
function barWidth(bar: GanttBar): string {
  return `${(bar.step.timeSeconds / totalTime.value) * 100}%`
}


// Tooltip state
const hoveredBar = ref<GanttBar | null>(null)


// Popover state
const activeBar = ref<GanttBar | null>(null)
const popoverStyle = ref<Record<string, string>>({})
const popoverRef = ref<HTMLElement | null>(null)


function togglePopover(bar: GanttBar, event: MouseEvent) {
  activeAwakenMarker.value = null
  if (activeBar.value === bar) {
    activeBar.value = null
    return
  }
  activeBar.value = bar


  const target = event.currentTarget as HTMLElement
  if (!target) return


  const barRect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 288 // w-72 = 18rem = 288px
  const GAP = 8


  // Position below the bar, centered horizontally (using fixed/viewport coords)
  let top = barRect.bottom + GAP
  let left = barRect.left + barRect.width / 2 - POPOVER_WIDTH / 2


  // Clamp to viewport edges
  if (left + POPOVER_WIDTH > window.innerWidth - GAP) {
    left = window.innerWidth - POPOVER_WIDTH - GAP
  }
  if (left < GAP) {
    left = GAP
  }


  // If not enough room below, position above
  popoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }


  nextTick(() => {
    if (!popoverRef.value) return
    const popRect = popoverRef.value.getBoundingClientRect()
    if (popRect.bottom > window.innerHeight - GAP) {
      popoverStyle.value = {
        position: 'fixed',
        top: `${barRect.top - popRect.height - GAP}px`,
        left: `${left}px`,
      }
    }
  })
}


function closePopover() {
  activeBar.value = null
}


// Awakening markers — vertical pins on the timeline
interface AwakenMarker {
  event: AwakenEvent
  creature: Creature | undefined
  pct: number
}


const awakenMarkers = computed<AwakenMarker[]>(() => {
  if (!props.plan.awakenEvents || props.plan.awakenEvents.length === 0) return []
  const total = totalTime.value
  if (total <= 0) return []
  return props.plan.awakenEvents
    .filter((e) => !props.filterCreatureId || e.creatureId === props.filterCreatureId)
    .map((e) => ({
      event: e,
      creature: props.creatures.get(e.creatureId),
      pct: (e.clockTime / total) * 100,
    }))
})


// Awaken marker popover state
const activeAwakenMarker = ref<AwakenMarker | null>(null)
const awakenPopoverStyle = ref<Record<string, string>>({})
const awakenPopoverRef = ref<HTMLElement | null>(null)


function toggleAwakenPopover(marker: AwakenMarker, event: MouseEvent) {
  activeBar.value = null
  if (activeAwakenMarker.value === marker) {
    activeAwakenMarker.value = null
    return
  }
  activeAwakenMarker.value = marker


  const target = event.currentTarget as HTMLElement
  if (!target) return


  const rect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 240
  const GAP = 8


  let top = rect.bottom + GAP
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2


  if (left + POPOVER_WIDTH > window.innerWidth - GAP) {
    left = window.innerWidth - POPOVER_WIDTH - GAP
  }
  if (left < GAP) left = GAP


  awakenPopoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }


  nextTick(() => {
    if (!awakenPopoverRef.value) return
    const popRect = awakenPopoverRef.value.getBoundingClientRect()
    if (popRect.bottom > window.innerHeight - GAP) {
      awakenPopoverStyle.value = {
        position: 'fixed',
        top: `${rect.top - popRect.height - GAP}px`,
        left: `${left}px`,
      }
    }
  })
}


function closeAwakenPopover() {
  activeAwakenMarker.value = null
}


const activeBarScoreRatio = computed(() => {
  if (!activeBar.value) return null
  const step = activeBar.value.step
  const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
  const partyScore = step.party.reduce((sum, p) => {
    const creature = props.creatures.get(p.creatureId)
    if (!creature) return sum
    return sum + calculateCreatureRating(creature, step.expedition, p.fromLevel, biome)
  }, 0)
  const diff = calculateDifficultyRating(step.expedition, step.tier)
  return diff > 0 ? partyScore / diff : null
})
</script>

<template>
  <div
    ref="ganttRef"
    class="surface-card overflow-hidden"
    :class="zoomModifierHeld ? 'cursor-zoom-in' : shiftHeld ? 'cursor-ew-resize' : ''"
  >
    <!-- Header -->
    <div class="flex items-center justify-end border-b border-border/40 px-4 py-2">
      <div class="flex items-center gap-2">
        <button
          class="focus-ring flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          :class="isDefaultZoom ? 'invisible' : ''"
          title="Reset zoom"
          @click="resetZoom"
        >
          <RotateCcw class="size-3" />
          Reset
        </button>
        <span class="text-[11px] font-semibold text-muted-foreground">{{ zoom }}x</span>
        <div class="inline-flex items-center overflow-hidden rounded-lg border border-border/60">
          <button
            class="focus-ring flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            :disabled="!canZoomOut"
            title="Zoom out"
            @click="zoomOut"
          >
            <Minus class="size-3.5" />
          </button>
          <button
            class="focus-ring flex h-7 w-7 items-center justify-center border-l border-border/60 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            :disabled="!canZoomIn"
            title="Zoom in"
            @click="zoomIn"
          >
            <Plus class="size-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Scrollable timeline -->
    <div class="flex flex-col gap-0 overflow-x-auto">
      <!-- Time axis -->
      <div class="flex items-end border-b border-border/60 px-3 pb-2 pl-36 pt-3 sm:pl-44">
        <div class="relative h-5 flex-1" :style="{ minWidth: laneMinWidth }">
          <span
            v-for="marker in timeMarkers"
            :key="marker.seconds"
            class="absolute font-mono text-xs font-semibold text-foreground/70"
            :style="{ left: `${marker.pct}%` }"
          >
            {{ marker.label }}
          </span>
          <!-- Awakening creature pins in the time axis -->
          <button
            v-for="(marker, mi) in awakenMarkers"
            :key="`pin-${mi}`"
            class="absolute bottom-0 flex flex-col items-center"
            :style="{ left: `${marker.pct}%`, transform: 'translateX(-50%)' }"
            @click.stop="toggleAwakenPopover(marker, $event)"
          >
            <div
              class="size-7 overflow-hidden rounded-full border-2 border-pink-500 bg-card shadow-md shadow-pink-500/20 transition-transform hover:scale-110"
              :class="activeAwakenMarker === marker ? 'ring-2 ring-pink-400/60' : ''"
            >
              <img
                v-if="marker.creature"
                :src="getCreatureImage(marker.creature)"
                :alt="marker.creature.name"
                class="size-full object-cover"
              />
            </div>
          </button>
        </div>
      </div>

      <!-- Expedition lanes -->
      <div v-for="lane in lanes" :key="lane" class="flex items-center border-b border-border/40">
        <!-- Lane label -->
        <div class="flex w-36 shrink-0 items-center gap-2 px-3 py-3 sm:w-44">
          <img
            v-if="laneRewardId[lane]"
            :src="getItemImage({ id: laneRewardId[lane]! })"
            :alt="lane"
            class="size-6 shrink-0 object-contain"
          />
          <span class="text-sm font-bold leading-tight text-foreground/80">{{ lane }}</span>
        </div>
        <!-- Bars + per-lane awakening lines -->
        <div class="relative flex-1 py-2" :style="{ minWidth: laneMinWidth, minHeight: '56px' }">
          <!-- Awakening vertical lines within this lane -->
          <div
            v-for="(marker, mi) in awakenMarkers"
            :key="`awaken-${mi}`"
            class="pointer-events-none absolute inset-y-0 w-0.5 bg-pink-500/40"
            :style="{ left: `${marker.pct}%`, transform: 'translateX(-50%)' }"
          />
          <div
            v-for="(bar, i) in barsByLane[lane]"
            :key="i"
            class="bg-primary/12 absolute bottom-2 top-2 flex cursor-pointer items-center gap-1.5 truncate rounded-lg border border-primary/35 px-2 text-xs font-bold text-primary transition-all"
            :class="[
              hoveredBar === bar || activeBar === bar
                ? 'opacity-100 ring-1 ring-primary/60'
                : 'opacity-85 hover:opacity-100',
              activeBar === bar ? 'ring-2 ring-primary/80' : '',
            ]"
            :style="{ left: barLeft(bar), width: barWidth(bar), minWidth: '2px' }"
            @mouseenter="hoveredBar = bar"
            @mouseleave="hoveredBar = null"
            @click.stop="togglePopover(bar, $event)"
          >
            <!-- Creature avatars -->
            <div class="flex shrink-0 -space-x-2">
              <img
                v-for="cId in bar.creatureIds.slice(0, 3)"
                :key="cId"
                :src="getCreatureImage(creatures.get(cId)!)"
                :alt="creatures.get(cId)?.name"
                class="size-8 rounded-full border-2 border-background object-cover"
              />
            </div>
            <span class="truncate">T{{ bar.tier }}</span>
            <span class="ml-auto shrink-0 pl-1 font-mono text-[11px] opacity-70">{{
              formatDuration(bar.step.timeSeconds)
            }}</span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="bars.length === 0" class="px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">No timeline data available.</p>
      </div>
    </div>

    <!-- Popover -->
    <Teleport to="body">
      <div v-if="activeBar" class="fixed inset-0 z-40" @click="closePopover" />
      <Transition name="popover">
        <div
          v-if="activeBar"
          ref="popoverRef"
          class="z-50 w-72 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
          :style="popoverStyle"
          @click.stop
        >
          <!-- Header -->
          <div class="border-b border-border/40 px-4 py-3">
            <div class="flex items-center gap-2">
              <img
                v-if="activeBar.rewardItemId"
                :src="getItemImage({ id: activeBar.rewardItemId })"
                :alt="activeBar.expeditionName"
                class="size-5 shrink-0 object-contain"
              />
              <p class="truncate text-sm font-bold text-foreground">
                {{ activeBar.expeditionName }}
              </p>
              <span
                class="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
              >
                T{{ activeBar.tier }}
              </span>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">{{ activeBar.step.biomeName }}</p>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border/40 px-4 py-3">
            <div class="flex items-center gap-1.5 text-xs">
              <Clock3 class="size-3 shrink-0" style="color: var(--color-green)" />
              <span class="text-muted-foreground">Duration</span>
              <span class="ml-auto font-mono font-semibold text-foreground">{{
                formatDuration(activeBar.step.timeSeconds)
              }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <Repeat class="size-3 shrink-0 text-amber-400" />
              <span class="text-muted-foreground">Runs</span>
              <span class="ml-auto font-mono font-semibold text-foreground">{{
                activeBar.runs.toLocaleString()
              }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <Zap class="size-3 shrink-0 text-purple-400" />
              <span class="text-muted-foreground">Loop bonus</span>
              <span class="ml-auto font-mono font-semibold text-foreground">
                +{{ Math.round(getLoopXpBonus(activeBar.step.loopCountStart) * 100) }}%&rarr;+{{
                  Math.round(getLoopXpBonus(activeBar.step.loopCountEnd) * 100)
                }}%
              </span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <Users class="size-3 shrink-0 text-sky-400" />
              <span class="text-muted-foreground">Party</span>
              <span class="ml-auto font-mono font-semibold text-foreground">{{
                activeBar.step.party.length
              }}</span>
            </div>
            <div class="col-span-2 flex items-center gap-1.5 text-xs">
              <Repeat class="size-3 shrink-0 text-amber-400" />
              <span class="text-muted-foreground">Loop streak</span>
              <span class="ml-auto font-mono font-semibold text-foreground">
                {{ activeBar.step.loopCountStart }}&rarr;{{ activeBar.step.loopCountEnd }}
              </span>
            </div>
            <div class="col-span-2 flex items-center gap-1.5 text-xs">
              <RotateCcw class="size-3 shrink-0 text-muted-foreground" />
              <span class="text-muted-foreground">Route state</span>
              <span class="ml-auto font-mono font-semibold text-foreground">
                {{
                  activeBar.step.preservedLoopBonus
                    ? 'Preserved'
                    : activeBar.step.wasReconfigured
                      ? 'Reset'
                      : 'Fresh'
                }}
              </span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <span
                class="size-3 shrink-0 text-center text-[10px] font-black"
                :class="
                  activeBarScoreRatio && activeBarScoreRatio >= 1
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                "
                >%</span
              >
              <span class="text-muted-foreground">Score Ratio</span>
              <span
                class="ml-auto font-mono font-semibold"
                :class="
                  activeBarScoreRatio && activeBarScoreRatio >= 1
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                "
              >
                {{ activeBarScoreRatio ? activeBarScoreRatio.toFixed(2) : '—' }}
              </span>
            </div>
          </div>

          <!-- Party members -->
          <div class="px-4 py-3">
            <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Creatures
            </p>
            <div class="space-y-2">
              <div
                v-for="member in activeBar.step.party"
                :key="member.creatureId"
                class="flex items-center gap-2"
              >
                <img
                  v-if="creatures.get(member.creatureId)"
                  :src="getCreatureImage(creatures.get(member.creatureId)!)"
                  :alt="creatures.get(member.creatureId)?.name"
                  class="size-7 shrink-0 rounded-full border border-border object-cover"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-semibold text-foreground">
                    {{ creatures.get(member.creatureId)?.name ?? member.creatureId }}
                  </p>
                  <p class="text-[10px] text-muted-foreground">
                    <template v-if="member.isBooster">
                      Booster at LVL {{ member.fromLevel }}
                    </template>
                    <template v-else>
                      LVL {{ member.fromLevel }}&rarr;{{ member.toLevel }}
                      <span class="ml-1 text-primary"
                        >+{{ member.xpGained.toLocaleString() }} XP</span
                      >
                    </template>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Awaken marker popover -->
    <Teleport to="body">
      <div v-if="activeAwakenMarker" class="fixed inset-0 z-40" @click="closeAwakenPopover" />
      <Transition name="popover">
        <div
          v-if="activeAwakenMarker"
          ref="awakenPopoverRef"
          class="z-50 w-60 rounded-xl border border-pink-500/30 bg-card shadow-xl shadow-black/30"
          :style="awakenPopoverStyle"
          @click.stop
        >
          <div class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div
                class="size-10 shrink-0 overflow-hidden rounded-full border-2 border-pink-500 bg-card"
              >
                <img
                  v-if="activeAwakenMarker.creature"
                  :src="getCreatureImage(activeAwakenMarker.creature)"
                  :alt="activeAwakenMarker.creature.name"
                  class="size-full object-cover"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <img
                    :src="awakenedSummonedIcon"
                    alt="Awaken"
                    class="size-4 shrink-0 object-contain"
                  />
                  <p class="text-sm font-bold text-pink-400">Manually Awaken</p>
                </div>
                <p class="mt-0.5 truncate text-xs text-foreground">
                  {{ activeAwakenMarker.creature?.name ?? activeAwakenMarker.event.creatureId }}
                </p>
              </div>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Awaken this creature to continue leveling past 70
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Footer -->
    <div
      v-if="bars.length > 0"
      class="flex items-center justify-end border-t border-border/40 px-4 py-3"
    >
      <span class="text-sm font-bold text-foreground/80">
        Total:
        <span class="font-mono" style="color: var(--color-green)">{{
          formatDuration(totalTime)
        }}</span>
      </span>
    </div>
  </div>
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
