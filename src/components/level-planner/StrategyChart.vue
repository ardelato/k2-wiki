<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ChartPoint } from '@/utils/strategyChartData'

const props = withDefaults(
  defineProps<{
    title: string
    yLabel: string
    primarySeries: ChartPoint[]
    secondarySeries: ChartPoint[] | null
    primaryLabel: string
    secondaryLabel: string
    primaryColor: string
    secondaryColor: string
    stepMode?: boolean
    formatValue?: (v: number) => string
    secondaryLoading?: boolean
  }>(),
  {
    stepMode: false,
    formatValue: undefined,
    secondaryLoading: false,
  },
)


const SVG_W = 700
const SVG_H = 240
const PAD = { top: 24, right: 20, bottom: 35, left: 65 }
const plotW = SVG_W - PAD.left - PAD.right
const plotH = SVG_H - PAD.top - PAD.bottom


const fmt = computed(() => props.formatValue ?? ((v: number) => v.toFixed(1)))


const maxX = computed(() => {
  let mx = 0
  for (const p of props.primarySeries) mx = Math.max(mx, p.time)
  if (props.secondarySeries) {
    for (const p of props.secondarySeries) mx = Math.max(mx, p.time)
  }
  return mx || 1
})


const maxY = computed(() => {
  let my = 0
  for (const p of props.primarySeries) my = Math.max(my, p.value)
  if (props.secondarySeries) {
    for (const p of props.secondarySeries) my = Math.max(my, p.value)
  }
  return (my || 1) * 1.1
})


function x(time: number): number {
  return PAD.left + (time / maxX.value) * plotW
}


function y(val: number): number {
  return PAD.top + plotH - (val / maxY.value) * plotH
}


function buildPath(series: ChartPoint[]): string {
  if (series.length === 0) return ''
  if (props.stepMode) {
    let d = `M${x(series[0].time)},${y(series[0].value)}`
    for (let i = 1; i < series.length; i++) {
      d += ` H${x(series[i].time)} V${y(series[i].value)}`
    }
    return d
  }
  return series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time)},${y(p.value)}`).join(' ')
}


const primaryPath = computed(() => buildPath(props.primarySeries))
const secondaryPath = computed(() =>
  props.secondarySeries ? buildPath(props.secondarySeries) : '',
)


const yTicks = computed(() => {
  if (maxY.value <= 0) return []
  const step = Math.pow(10, Math.floor(Math.log10(maxY.value))) / 2
  const ticks: number[] = []
  for (let v = 0; v <= maxY.value; v += step) {
    ticks.push(v)
  }
  return ticks
})


const xTicks = computed(() => {
  if (maxX.value <= 0) return []
  const count = 6
  const rawStep = maxX.value / count
  // Round to nice step values in seconds
  const niceSteps = [
    60, 300, 600, 1800, 3600, 7200, 14400, 28800, 43200, 86400, 172800, 345600, 604800,
  ]
  let step = niceSteps.find((s) => s >= rawStep) ?? rawStep
  if (step > maxX.value) step = maxX.value / 2
  const ticks: number[] = []
  for (let v = 0; v <= maxX.value; v += step) {
    ticks.push(v)
  }
  return ticks
})


function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60)
    return m > 0 ? `${h}h${m}m` : `${h}h`
  }
  const d = Math.floor(seconds / 86400)
  const h = Math.round((seconds % 86400) / 3600)
  return h > 0 ? `${d}d${h}h` : `${d}d`
}


const hover = ref<{
  px: number
  py: number
  label: string
  value: string
  color: string
  series: string
} | null>(null)


function onPointEnter(point: ChartPoint, color: string, series: string) {
  hover.value = {
    px: x(point.time),
    py: y(point.value),
    label: formatTime(point.time),
    value: fmt.value(point.value),
    color,
    series,
  }
}


function onPointLeave() {
  hover.value = null
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border/40 bg-background/50 p-3">
    <p class="mb-2 text-xs font-semibold text-muted-foreground">{{ title }}</p>
    <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="w-full" style="min-width: 500px">
      <!-- Grid lines -->
      <line
        v-for="tick in yTicks"
        :key="'yg' + tick"
        :x1="PAD.left"
        :y1="y(tick)"
        :x2="SVG_W - PAD.right"
        :y2="y(tick)"
        stroke="currentColor"
        class="text-border/30"
        stroke-width="1"
      />

      <!-- Axes -->
      <line
        :x1="PAD.left"
        :y1="PAD.top"
        :x2="PAD.left"
        :y2="PAD.top + plotH"
        stroke="currentColor"
        class="text-border/60"
        stroke-width="1"
      />
      <line
        :x1="PAD.left"
        :y1="PAD.top + plotH"
        :x2="SVG_W - PAD.right"
        :y2="PAD.top + plotH"
        stroke="currentColor"
        class="text-border/60"
        stroke-width="1"
      />

      <!-- Y-axis labels -->
      <text
        v-for="tick in yTicks"
        :key="'yl' + tick"
        :x="PAD.left - 6"
        :y="y(tick) + 3"
        text-anchor="end"
        class="fill-muted-foreground text-[10px]"
      >
        {{ fmt(tick) }}
      </text>

      <!-- X-axis labels -->
      <text
        v-for="tick in xTicks"
        :key="'xl' + tick"
        :x="x(tick)"
        :y="PAD.top + plotH + 16"
        text-anchor="middle"
        class="fill-muted-foreground text-[10px]"
      >
        {{ formatTime(tick) }}
      </text>

      <!-- Y-axis label -->
      <text
        :x="12"
        :y="SVG_H / 2"
        text-anchor="middle"
        :transform="`rotate(-90, 12, ${SVG_H / 2})`"
        class="fill-muted-foreground text-[11px] font-semibold"
      >
        {{ yLabel }}
      </text>

      <!-- Secondary line (dashed) -->
      <path
        v-if="secondaryPath"
        :d="secondaryPath"
        fill="none"
        :stroke="secondaryColor"
        stroke-width="2"
        stroke-dasharray="6,4"
      />

      <!-- Primary line (solid) -->
      <path
        v-if="primaryPath"
        :d="primaryPath"
        fill="none"
        :stroke="primaryColor"
        stroke-width="2"
      />

      <!-- Secondary data points -->
      <circle
        v-for="(point, i) in secondarySeries ?? []"
        :key="'sd' + i"
        :cx="x(point.time)"
        :cy="y(point.value)"
        r="3"
        :fill="secondaryColor"
        class="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
        @mouseenter="onPointEnter(point, secondaryColor, secondaryLabel)"
        @mouseleave="onPointLeave"
      />

      <!-- Primary data points -->
      <circle
        v-for="(point, i) in primarySeries"
        :key="'pd' + i"
        :cx="x(point.time)"
        :cy="y(point.value)"
        r="3"
        :fill="primaryColor"
        class="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
        @mouseenter="onPointEnter(point, primaryColor, primaryLabel)"
        @mouseleave="onPointLeave"
      />

      <!-- Hover tooltip -->
      <g
        v-if="hover"
        :transform="`translate(${hover.px}, ${hover.py})`"
        class="pointer-events-none"
      >
        <rect
          :x="-42"
          :y="-50"
          width="84"
          height="42"
          rx="4"
          class="fill-popover stroke-border"
          stroke-width="1"
        />
        <circle cx="-28" cy="-38" r="3" :fill="hover.color" />
        <text x="-22" y="-35" text-anchor="start" class="fill-foreground text-[9px] font-semibold">
          {{ hover.series }}
        </text>
        <text x="0" y="-23" text-anchor="middle" class="fill-foreground text-[10px] font-semibold">
          {{ hover.value }}
        </text>
        <text x="0" y="-13" text-anchor="middle" class="fill-muted-foreground text-[9px]">
          {{ hover.label }}
        </text>
      </g>
    </svg>

    <!-- Legend -->
    <div class="mt-2 flex flex-wrap items-center gap-4 text-xs">
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 rounded" :style="{ backgroundColor: primaryColor }" />
        {{ primaryLabel }}
      </span>
      <template v-if="secondaryLoading">
        <span class="animate-pulse text-muted-foreground">Computing...</span>
      </template>
      <template v-else-if="secondarySeries">
        <span class="flex items-center gap-1.5">
          <span
            class="inline-block h-0.5 w-4 rounded border-t-2 border-dashed"
            :style="{ borderColor: secondaryColor }"
          />
          {{ secondaryLabel }}
        </span>
      </template>
    </div>
  </div>
</template>
