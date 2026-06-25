<script setup lang="ts">
import { Anchor } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'
import { derivePrestigeLevelSeries } from '@/utils/planner/prestigeLevelSeries'
import type { PrestigeTimelineStep } from '@/utils/planner/prestigeLoopPlanner'
import { MAX_LEVEL } from '@/utils/planner/prestigeLoopPlanner'

// A level-trajectory chart scoped to ONE expedition's party. The roster lives in a static
// legend of creature chips below the chart; the hover popover maps each line's colour to a
// name + level at a check-in. Keeping the chips in normal HTML flow means resizing only
// rescales the lines — the legend never shifts or clips.
const props = defineProps<{
  timeline: PrestigeTimelineStep[]
  creatures: Map<string, Creature>
  memberIds: string[]
  anchorIds: string[]
}>()


const { t } = useI18n()


const PALETTE = [
  'text-info-strong',
  'text-reserved-strong',
  'text-success-strong',
  'text-warning-strong',
  'text-danger-strong',
  'text-tool-strong',
]


const W = 300
const H = 200
const PAD = { top: 10, right: 12, bottom: 16, left: 22 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom


const baseHour = computed(() => props.timeline[0]?.clockHours ?? 0)
const checkInCount = computed(() => props.timeline.length)
function x(ci: number): number {
  const d = Math.max(1, checkInCount.value - 1)
  return PAD.left + (ci / d) * plotW
}
function y(level: number): number {
  return PAD.top + plotH - (level / MAX_LEVEL) * plotH
}


const memberSet = computed(() => new Set(props.memberIds))
const scoped = computed(() =>
  derivePrestigeLevelSeries(props.timeline, props.anchorIds).filter((s) =>
    memberSet.value.has(s.creatureId),
  ),
)


interface Line {
  id: string
  name: string
  image: string
  creature: Creature
  color: string
  tokens: number
  path: string
  /** Flat-at-120 spans where the creature was maxed but not yet prestiged (wasted XP). */
  wastedSegments: { x1: number; x2: number; y: number }[]
  points: {
    checkIn: number
    hours: number
    px: number
    py: number
    level: number
    prestiged: boolean
    wastedHours: number
  }[]
}


const climberSeries = computed(() => scoped.value.filter((s) => s.role === 'climber'))
const heldEntries = computed(() =>
  scoped.value
    .filter((s) => s.role !== 'climber')
    .flatMap((s) => {
      const creature = props.creatures.get(s.creatureId)
      if (!creature) return []
      return [
        {
          id: s.creatureId,
          name: creature.name,
          image: getCreatureImage(creature) || '',
          creature,
        },
      ]
    }),
)


const yMax = y(MAX_LEVEL)


const lines = computed<Line[]>(() =>
  climberSeries.value.flatMap((s, i) => {
    const creature = props.creatures.get(s.creatureId)
    if (!creature) return []
    const points = s.points.map((p) => ({
      checkIn: p.checkIn,
      hours: p.hours,
      px: x(p.checkIn),
      py: y(p.level),
      level: p.level,
      prestiged: p.prestiged,
      wastedHours: p.wastedHours,
    }))

    // Build the trajectory. When a creature maxed mid-interval, redirect that segment to
    // climb up to 120, sit flat (the wasted span), then drop/continue at the check-in.
    let path = ''
    const wastedSegments: Line['wastedSegments'] = []
    points.forEach((p, idx) => {
      if (idx === 0) {
        path += `M${p.px},${p.py}`
        return
      }
      const prev = points[idx - 1]
      const cadence = p.hours - prev.hours
      if (p.wastedHours > 0 && cadence > 0) {
        const climbFraction = Math.min(1, Math.max(0, (cadence - p.wastedHours) / cadence))
        const peakPx = prev.px + climbFraction * (p.px - prev.px)
        path += ` L${peakPx},${yMax} L${p.px},${yMax} L${p.px},${p.py}`
        wastedSegments.push({ x1: peakPx, x2: p.px, y: yMax })
      } else {
        path += ` L${p.px},${p.py}`
      }
    })

    return [
      {
        id: s.creatureId,
        name: creature.name,
        image: getCreatureImage(creature) || '',
        creature,
        color: PALETTE[i % PALETTE.length],
        tokens: s.tokens,
        path,
        wastedSegments,
        points,
      },
    ]
  }),
)


const hasWaste = computed(() => lines.value.some((l) => l.wastedSegments.length > 0))


// The real prestige-token asset, shown beside each legend token count.
const prestigeTokenIcon = getItemImage({ id: 'prestige-points' })


// Inspect a legend chip to open that creature in the shared drawer.
const { selectedCreature, drawerOpen, toggleCreature, closeDrawer } = useCreatureDrawer()


// Hovering a legend chip focuses that creature's line and dims the rest.
const hoveredId = ref<string | null>(null)
function isDimmed(id: string): boolean {
  return hoveredId.value !== null && hoveredId.value !== id
}


const yTicks = [0, 60, 120]
// X labels: cumulative cadence hours per check-in (thinned to ~8 so they don't overlap).
const xLabels = computed(() => {
  const n = checkInCount.value
  if (n === 0) return []
  const every = n <= 8 ? 1 : Math.ceil(n / 7)
  const idx = new Set<number>()
  for (let i = 0; i < n; i += every) idx.add(i)
  idx.add(n - 1)
  return [...idx]
    .toSorted((a, b) => a - b)
    .map((i) => ({
      i,
      hours: props.timeline[i].clockHours - baseHour.value,
      cx: x(i),
      anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
    }))
})


// ===== Shared crosshair (snaps to the nearest check-in column) =====
const crosshair = ref<number | null>(null)
function onMove(evt: MouseEvent) {
  const svg = evt.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  if (!rect.width) return
  const svgX = ((evt.clientX - rect.left) / rect.width) * W
  const d = Math.max(1, checkInCount.value - 1)
  crosshair.value = Math.max(
    0,
    Math.min(checkInCount.value - 1, Math.round(((svgX - PAD.left) / plotW) * d)),
  )
}
function onLeave() {
  crosshair.value = null
}
const crosshairX = computed(() => (crosshair.value != null ? x(crosshair.value) : 0))
const crosshairHours = computed(() => {
  if (crosshair.value == null) return ''
  const step = props.timeline[crosshair.value]
  return step ? step.clockHours - baseHour.value : ''
})
const crosshairEntries = computed(() => {
  const ci = crosshair.value
  if (ci == null) return []
  return lines.value.flatMap((l) => {
    const p = l.points.find((pt) => pt.checkIn === ci)
    return p
      ? [
          {
            id: l.id,
            name: l.name,
            color: l.color,
            level: p.level,
            py: p.py,
            wastedHours: p.wastedHours,
          },
        ]
      : []
  })
})
const tooltipRows = computed(() =>
  [...crosshairEntries.value].toSorted((a, b) => b.level - a.level),
)


// Compact hours for the popover: one decimal under 10h, whole hours above.
function fmtHours(h: number): string {
  return h < 10 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h)}h`
}
const tooltipStyle = computed(() => {
  const ci = crosshair.value
  if (ci == null) return {}
  const leftPct = (x(ci) / W) * 100
  const style: Record<string, string> = { top: '2%' }
  if (ci > (checkInCount.value - 1) / 2) style.right = `${100 - leftPct + 2}%`
  else style.left = `${leftPct + 2}%`
  return style
})
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="lines.length === 0"
      class="flex min-h-[8rem] items-center justify-center px-2 text-center text-2xs leading-relaxed text-muted-foreground/70"
    >
      {{ t('levelPlanner.prestigeLoop.chart.allHeld') }}
    </div>

    <template v-else>
      <div class="relative">
        <svg
          :viewBox="`0 0 ${W} ${H}`"
          class="block w-full cursor-crosshair"
          @mousemove="onMove"
          @mouseleave="onLeave"
        >
          <!-- Y grid + labels (top/bottom only to save space) -->
          <g v-for="tick in yTicks" :key="'y' + tick">
            <line
              :x1="PAD.left"
              :y1="y(tick)"
              :x2="W - PAD.right"
              :y2="y(tick)"
              stroke="currentColor"
              class="text-border/30"
              stroke-width="1"
            />
            <text
              v-if="tick !== 60"
              :x="PAD.left - 4"
              :y="y(tick) + 3"
              text-anchor="end"
              class="fill-muted-foreground text-3xs"
            >
              {{ tick }}
            </text>
          </g>

          <!-- X labels: cumulative cadence hours per check-in -->
          <text
            v-for="lbl in xLabels"
            :key="'x' + lbl.i"
            :x="lbl.cx"
            :y="H - 4"
            :text-anchor="lbl.anchor"
            class="fill-muted-foreground text-3xs"
          >
            {{ t('levelPlanner.prestigeLoop.timeline.plusHours', { h: lbl.hours }) }}
          </text>

          <!-- Climber lines (one colour per member; mapped to the legend below) -->
          <path
            v-for="l in lines"
            :key="'line' + l.id"
            :d="l.path"
            fill="none"
            stroke="currentColor"
            :class="l.color"
            :stroke-width="hoveredId === l.id ? 3 : 2"
            :stroke-opacity="isDimmed(l.id) ? 0.12 : 0.9"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="pointer-events-none transition-[stroke-opacity,stroke-width]"
          />

          <!-- Wasted XP: time spent pinned at 120 before the next check-in could prestige.
               Drawn thick in amber over the flat top of the line so it reads at a glance. -->
          <template v-for="l in lines" :key="'ws' + l.id">
            <line
              v-for="(w, i) in l.wastedSegments"
              :key="i"
              :x1="w.x1"
              :y1="w.y"
              :x2="w.x2"
              :y2="w.y"
              stroke="currentColor"
              class="pointer-events-none text-warning-strong transition-[stroke-opacity]"
              stroke-width="5"
              stroke-linecap="round"
              :stroke-opacity="isDimmed(l.id) ? 0.1 : 0.85"
            />
          </template>

          <!-- Prestige reset markers -->
          <template v-for="l in lines" :key="'rm' + l.id">
            <circle
              v-for="(p, i) in l.points"
              v-show="p.prestiged"
              :key="i"
              :cx="p.px"
              :cy="p.py"
              r="2.5"
              fill="currentColor"
              :class="l.color"
              :fill-opacity="isDimmed(l.id) ? 0.1 : 0.7"
              class="pointer-events-none transition-[fill-opacity]"
            />
          </template>

          <!-- Crosshair: vertical guide + a dot per line at the hovered column -->
          <template v-if="crosshair != null">
            <line
              :x1="crosshairX"
              :y1="PAD.top"
              :x2="crosshairX"
              :y2="PAD.top + plotH"
              stroke="currentColor"
              class="pointer-events-none text-foreground/25"
              stroke-width="1"
              stroke-dasharray="3 3"
            />
            <circle
              v-for="e in crosshairEntries"
              :key="'cd' + e.id"
              :cx="crosshairX"
              :cy="e.py"
              r="3"
              fill="currentColor"
              :class="e.color"
              class="pointer-events-none"
            />
          </template>
        </svg>

        <!-- Per-check-in popover: each line's level at the hovered column. Identity comes
             from the legend, so rows here are just a colour dot + name + level. -->
        <div
          v-if="crosshair != null && tooltipRows.length"
          class="pointer-events-none absolute z-10 w-max max-w-[13rem] rounded-md border border-border bg-card/95 px-1.5 py-1 text-3xs shadow-lg backdrop-blur"
          :style="tooltipStyle"
        >
          <p class="mb-0.5 font-semibold text-muted-foreground">
            {{ t('levelPlanner.prestigeLoop.timeline.plusHours', { h: crosshairHours }) }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="r in tooltipRows" :key="r.id" class="flex items-center gap-1.5">
              <span
                class="inline-block size-1.5 shrink-0 rounded-full"
                :class="r.color"
                style="background-color: currentColor"
              />
              <span class="min-w-0 flex-1 truncate text-foreground">{{ r.name }}</span>
              <span class="shrink-0 font-mono tabular-nums text-muted-foreground">{{
                t('levelPlanner.prestigeLoop.chart.lvl', { n: r.level })
              }}</span>
              <span
                v-if="r.wastedHours > 0"
                class="inline-flex shrink-0 items-center gap-0.5 font-mono tabular-nums text-warning-strong"
                :title="t('levelPlanner.prestigeLoop.chart.wastedXp')"
              >
                <span class="inline-block h-1 w-1.5 shrink-0 rounded-full bg-warning" />
                {{ fmtHours(r.wastedHours) }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <p v-if="hasWaste" class="mt-1.5 flex items-center gap-1.5 text-3xs text-muted-foreground/70">
        <span class="inline-block h-1 w-4 shrink-0 rounded-full bg-warning" />
        {{ t('levelPlanner.prestigeLoop.chart.wastedXp') }}
      </p>

      <!-- Legend: the same creature chip used by the Booster Roster / Expeditions page, with
           the prestige tokens it earns. Plain HTML flow, so it stays crisp as the chart rescales. -->
      <div class="mt-3 flex shrink-0 flex-wrap content-start items-center gap-x-1.5 gap-y-2">
        <RightClickHint
          v-for="l in lines"
          :key="'lg' + l.id"
          @contextmenu="toggleCreature(l.creature)"
        >
          <span
            class="inline-flex items-center gap-1.5 rounded-lg border-2 bg-muted/35 py-0.5 pl-2 pr-3 transition-opacity"
            :class="[l.color, isDimmed(l.id) ? 'opacity-40' : 'opacity-100']"
            :style="{ borderColor: 'currentColor' }"
            :title="
              l.tokens > 0
                ? t(
                    'levelPlanner.prestigeLoop.chart.legendTokens',
                    { name: l.name, n: l.tokens },
                    l.tokens,
                  )
                : l.name
            "
            @mouseenter="hoveredId = l.id"
            @mouseleave="hoveredId = null"
          >
            <span class="block size-6 shrink-0 overflow-hidden rounded-full bg-card">
              <img
                v-if="l.image"
                :src="l.image"
                :alt="l.name"
                class="size-full object-cover"
                loading="lazy"
              />
            </span>
            <span class="max-w-[8rem] truncate text-xs font-semibold text-foreground">{{
              l.name
            }}</span>
            <span
              v-if="l.tokens > 0"
              class="inline-flex items-center gap-0.5 font-mono text-3xs font-bold tabular-nums text-info-strong"
            >
              <img
                v-if="prestigeTokenIcon"
                :src="prestigeTokenIcon"
                :alt="t('levelPlanner.prestigeLoop.chart.prestigeTokensAlt')"
                class="size-3.5 shrink-0 object-contain"
                loading="lazy"
              />
              {{ l.tokens }}
            </span>
          </span>
        </RightClickHint>
      </div>

      <!-- Held at 120: anchors/boosters pinned at max. Shown as chips (not a text callout)
           to match the climbers, with a 120 badge instead of a token count. -->
      <div v-if="heldEntries.length" class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <span
          class="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-wide text-muted-foreground/70"
        >
          <Anchor class="size-3" />
          {{ t('levelPlanner.prestigeLoop.chart.heldAt120') }}
        </span>
        <RightClickHint
          v-for="h in heldEntries"
          :key="'held' + h.id"
          @contextmenu="toggleCreature(h.creature)"
        >
          <span
            class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-2 pr-3"
          >
            <span class="block size-6 shrink-0 overflow-hidden rounded-full bg-card">
              <img
                v-if="h.image"
                :src="h.image"
                :alt="h.name"
                class="size-full object-cover"
                loading="lazy"
              />
            </span>
            <span class="max-w-[8rem] truncate text-xs font-semibold">{{ h.name }}</span>
            <span class="font-mono text-3xs font-bold text-muted-foreground">120</span>
          </span>
        </RightClickHint>
      </div>
    </template>

    <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
  </div>
</template>
