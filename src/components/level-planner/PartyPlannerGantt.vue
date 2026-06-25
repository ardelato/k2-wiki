<script setup lang="ts">
import { Clock3, Repeat } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.webp'
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import GanttZoomControls from '@/components/shared/GanttZoomControls.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { usePopover } from '@/composables/core/usePopover'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useGanttZoom, niceTimeStep } from '@/composables/useGanttZoom'
import { isRunPartyStep } from '@/types'
import type { PartyLevelingPlan, RunPartyStep, Creature, AwakenEvent } from '@/types'
import { formatDuration, formatNumber } from '@/utils/format/format'
import { expeditionTierIcons } from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


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


const {
  selectedCreature: ganttInspectedCreature,
  drawerOpen: ganttDrawerOpen,
  toggleCreature: ganttToggleCreature,
  closeDrawer: ganttCloseDrawer,
} = useCreatureDrawer()


interface GanttBar {
  step: RunPartyStep
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
    .filter(isRunPartyStep)
    .filter((s) => s.startTime != null)
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
  const laneExp = new Map<string, RunPartyStep['expedition']>()
  for (const bar of bars.value) {
    if (!laneExp.has(bar.lane)) {
      laneExp.set(bar.lane, bar.step.expedition)
    }
  }
  return [...laneExp.entries()]
    .toSorted(([, a], [, b]) => {
      const completionDiff = a.requiredExpeditionCompletions - b.requiredExpeditionCompletions
      if (completionDiff !== 0) return completionDiff
      return a.baseRating - b.baseRating
    })
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
const barPop = usePopover({ width: 288, gap: 8, allowVerticalFlip: true })


function togglePopover(bar: GanttBar, event: MouseEvent) {
  activeAwakenMarker.value = null
  markerPop.close()
  if (activeBar.value === bar) {
    activeBar.value = null
    barPop.close()
    return
  }
  activeBar.value = bar
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  barPop.open(target)
}


function closePopover() {
  activeBar.value = null
  barPop.close()
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
const markerPop = usePopover({ width: 240, gap: 8, allowVerticalFlip: true })


function toggleAwakenPopover(marker: AwakenMarker, event: MouseEvent) {
  activeBar.value = null
  barPop.close()
  if (activeAwakenMarker.value === marker) {
    activeAwakenMarker.value = null
    markerPop.close()
    return
  }
  activeAwakenMarker.value = marker
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  markerPop.open(target)
}


function closeAwakenPopover() {
  activeAwakenMarker.value = null
  markerPop.close()
}
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
        <GanttZoomControls
          :zoom="zoom"
          :can-zoom-in="canZoomIn"
          :can-zoom-out="canZoomOut"
          :is-default-zoom="isDefaultZoom"
          :reset-label="t('levelPlannerComponents.partyGantt.resetZoom')"
          :zoom-out-label="t('levelPlannerComponents.partyGantt.zoomOut')"
          :zoom-in-label="t('levelPlannerComponents.partyGantt.zoomIn')"
          @reset-zoom="resetZoom"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
        />
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
              class="size-7 overflow-hidden rounded-full border-2 border-awakened bg-card shadow-md shadow-awakened/20 transition-transform hover:scale-110"
              :class="activeAwakenMarker === marker ? 'ring-2 ring-awakened/60' : ''"
            >
              <RightClickHint
                v-if="marker.creature"
                @contextmenu="ganttToggleCreature(marker.creature)"
              >
                <img
                  :src="getCreatureImage(marker.creature)"
                  :alt="marker.creature.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
              </RightClickHint>
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
            loading="lazy"
          />
          <span class="text-sm font-bold leading-tight text-foreground/80">{{ lane }}</span>
        </div>
        <!-- Bars + per-lane awakening lines -->
        <div class="relative flex-1 py-2" :style="{ minWidth: laneMinWidth, minHeight: '56px' }">
          <!-- Awakening vertical lines within this lane -->
          <div
            v-for="(marker, mi) in awakenMarkers"
            :key="`awaken-${mi}`"
            class="pointer-events-none absolute inset-y-0 w-0.5 bg-awakened/40"
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
              <RightClickHint
                v-for="cId in bar.creatureIds.slice(0, 3)"
                :key="cId"
                @contextmenu="ganttToggleCreature(creatures.get(cId)!)"
              >
                <img
                  :src="getCreatureImage(creatures.get(cId)!)"
                  :alt="creatures.get(cId)?.name"
                  class="size-8 rounded-full border-2 border-background object-cover"
                  loading="lazy"
                />
              </RightClickHint>
            </div>
            <img
              :src="expeditionTierIcons[bar.tier]"
              :alt="`Tier ${bar.tier}`"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="ml-auto shrink-0 pl-1 font-mono text-2xs opacity-70">{{
              formatDuration(bar.step.timeSeconds)
            }}</span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="bars.length === 0" class="px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">
          {{ t('levelPlannerComponents.partyGantt.noData') }}
        </p>
      </div>
    </div>

    <!-- Popover -->
    <Teleport to="body">
      <div v-if="barPop.isOpen && activeBar" class="fixed inset-0 z-40" @click="closePopover" />
    </Teleport>
    <FloatingPanel
      :is-open="barPop.isOpen"
      :el-ref="barPop.setPanelEl"
      :style="barPop.style"
      class="z-50 w-72 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
      @click.stop
    >
      <template v-if="activeBar">
        <!-- Header -->
        <div class="border-b border-border/40 px-4 py-3">
          <div class="flex items-center gap-2">
            <img
              v-if="activeBar.rewardItemId"
              :src="getItemImage({ id: activeBar.rewardItemId })"
              :alt="activeBar.expeditionName"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <p class="truncate text-sm font-bold text-foreground">
              {{ activeBar.expeditionName }}
            </p>
            <img
              :src="expeditionTierIcons[activeBar.tier]"
              :alt="`Tier ${activeBar.tier}`"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ activeBar.step.biomeName }}</p>
        </div>

        <!-- Stats: one per row so long durations never wrap/squish -->
        <div class="flex flex-col gap-2 border-b border-border/40 px-4 py-3">
          <div class="flex items-center gap-2 text-sm">
            <Clock3 class="size-4 shrink-0" style="color: var(--color-green)" />
            <span class="text-muted-foreground">{{
              t('levelPlannerComponents.partyGantt.duration')
            }}</span>
            <span class="ml-auto whitespace-nowrap font-mono font-semibold text-foreground">{{
              formatDuration(activeBar.step.timeSeconds)
            }}</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Repeat class="size-4 shrink-0 text-warning-strong" />
            <span class="text-muted-foreground">{{
              t('levelPlannerComponents.partyGantt.runs')
            }}</span>
            <span class="ml-auto whitespace-nowrap font-mono font-semibold text-foreground">{{
              formatNumber(activeBar.runs)
            }}</span>
          </div>
        </div>

        <!-- Party members -->
        <div class="px-4 py-3">
          <p class="mb-2 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            {{ t('levelPlannerComponents.partyGantt.creatures') }}
          </p>
          <div class="space-y-2">
            <div
              v-for="member in activeBar.step.party"
              :key="member.creatureId"
              class="flex items-center gap-2"
            >
              <RightClickHint
                v-if="creatures.get(member.creatureId)"
                @contextmenu="ganttToggleCreature(creatures.get(member.creatureId)!)"
              >
                <img
                  :src="getCreatureImage(creatures.get(member.creatureId)!)"
                  :alt="creatures.get(member.creatureId)?.name"
                  class="size-7 shrink-0 rounded-full border border-border object-cover transition hover:ring-1 hover:ring-accent/40"
                  loading="lazy"
                />
              </RightClickHint>
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold text-foreground">
                  {{ creatures.get(member.creatureId)?.name ?? member.creatureId }}
                </p>
                <p class="text-3xs text-muted-foreground">
                  <template v-if="member.isBooster">
                    {{
                      t('levelPlannerComponents.partyGantt.boosterAt', { from: member.fromLevel })
                    }}
                  </template>
                  <template v-else>
                    {{
                      t('levelPlannerComponents.partyGantt.levelRange', {
                        from: member.fromLevel,
                        to: member.toLevel,
                        xp: formatNumber(member.xpGained),
                      })
                    }}
                  </template>
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </FloatingPanel>

    <!-- Awaken marker popover -->
    <Teleport to="body">
      <div
        v-if="markerPop.isOpen && activeAwakenMarker"
        class="fixed inset-0 z-40"
        @click="closeAwakenPopover"
      />
    </Teleport>
    <FloatingPanel
      :is-open="markerPop.isOpen"
      :el-ref="markerPop.setPanelEl"
      :style="markerPop.style"
      class="z-50 w-60 rounded-xl border border-awakened/30 bg-card shadow-xl shadow-black/30"
      @click.stop
    >
      <template v-if="activeAwakenMarker">
        <div class="px-4 py-3">
          <div class="flex items-center gap-3">
            <RightClickHint
              v-if="activeAwakenMarker.creature"
              @contextmenu="ganttToggleCreature(activeAwakenMarker.creature)"
            >
              <div
                class="size-10 shrink-0 overflow-hidden rounded-full border-2 border-awakened bg-card transition hover:ring-1 hover:ring-awakened/50"
              >
                <img
                  :src="getCreatureImage(activeAwakenMarker.creature)"
                  :alt="activeAwakenMarker.creature.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
              </div>
            </RightClickHint>
            <div
              v-else
              class="size-10 shrink-0 overflow-hidden rounded-full border-2 border-awakened bg-card"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <img
                  :src="awakenedSummonedIcon"
                  alt="Awaken"
                  class="size-4 shrink-0 object-contain"
                  loading="lazy"
                />
                <p class="text-sm font-bold text-awakened-strong">
                  {{ t('levelPlannerComponents.partyGantt.manuallyAwaken') }}
                </p>
              </div>
              <p class="mt-0.5 truncate text-xs text-foreground">
                {{ activeAwakenMarker.creature?.name ?? activeAwakenMarker.event.creatureId }}
              </p>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            {{ t('levelPlannerComponents.partyGantt.awakenHint') }}
          </p>
        </div>
      </template>
    </FloatingPanel>

    <!-- Footer -->
    <div
      v-if="bars.length > 0"
      class="flex items-center justify-end border-t border-border/40 px-4 py-3"
    >
      <span class="text-sm font-bold text-foreground/80">
        {{ t('levelPlannerComponents.partyGantt.total') }}
        <span class="font-mono" style="color: var(--color-green)">{{
          formatDuration(totalTime)
        }}</span>
      </span>
    </div>
  </div>
  <CreatureDetail
    :creature="ganttInspectedCreature"
    :open="ganttDrawerOpen"
    @close="ganttCloseDrawer"
  />
</template>
