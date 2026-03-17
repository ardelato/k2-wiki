<script setup lang="ts">
import type { Creature, CreatureStats } from '@/types'
import { computed } from 'vue'
import { statAbbreviations } from '@/utils/formulas'

const props = withDefaults(defineProps<{
  creature: Creature
  size?: number
  statsOverride?: CreatureStats
}>(), { size: 120 })

const stats = computed(() => Object.entries(props.statsOverride ?? props.creature.stats) as [keyof CreatureStats, number][])
const maxStat = computed(() => {
  const values = stats.value.map(([, v]) => v)
  const peak = Math.max(...values)
  return peak > 0 ? peak : 40
})
const centerX = computed(() => props.size / 2)
const centerY = computed(() => props.size / 2)
const radius = computed(() => (props.size / 2) - 20)
const angleStep = computed(() => (2 * Math.PI) / stats.value.length)
const startAngle = -Math.PI / 2

function getPoint(index: number, value: number) {
  const angle = startAngle + index * angleStep.value
  const r = (Math.min(value, maxStat.value) / maxStat.value) * radius.value
  return { x: centerX.value + r * Math.cos(angle), y: centerY.value + r * Math.sin(angle) }
}

function getLabelPoint(index: number) {
  const angle = startAngle + index * angleStep.value
  const r = radius.value + 14
  return { x: centerX.value + r * Math.cos(angle), y: centerY.value + r * Math.sin(angle) }
}

const pathD = computed(() => {
  const points = stats.value.map(([, value], i) => getPoint(i, value))
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
})

const statPoints = computed(() => stats.value.map(([, value], i) => getPoint(i, value)))

const gridLevels = [0.25, 0.5, 0.75, 1]

function gridPolygonPoints(level: number) {
  return stats.value.map((_, i) => {
    const angle = startAngle + i * angleStep.value
    const r = level * radius.value
    return `${centerX.value + r * Math.cos(angle)},${centerY.value + r * Math.sin(angle)}`
  }).join(' ')
}

function axisEnd(index: number) {
  const angle = startAngle + index * angleStep.value
  return { x: centerX.value + radius.value * Math.cos(angle), y: centerY.value + radius.value * Math.sin(angle) }
}
</script>

<template>
  <svg :width="size" :height="size" class="radar-chart">
    <polygon v-for="level in gridLevels" :key="level" :points="gridPolygonPoints(level)"
      fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="1" />
    <line v-for="(_, i) in stats" :key="'a-' + i" :x1="centerX" :y1="centerY"
      :x2="axisEnd(i).x" :y2="axisEnd(i).y" stroke="currentColor" stroke-opacity="0.15" stroke-width="1" />
    <path :d="pathD" class="stat-fill" />
    <circle v-for="(p, i) in statPoints" :key="'p-' + i" :cx="p.x" :cy="p.y" r="3" class="stat-point" />
    <text v-for="([key], i) in stats" :key="'l-' + key" :x="getLabelPoint(i).x" :y="getLabelPoint(i).y"
      text-anchor="middle" dominant-baseline="middle" class="stat-label">
      {{ statAbbreviations[key] }}
    </text>
  </svg>
</template>

<style scoped>
.radar-chart { overflow: visible; }
.stat-fill { fill: oklch(0.65 0.18 285 / 0.3); stroke: var(--color-primary); stroke-width: 2; }
.stat-point { fill: var(--color-primary); }
.stat-label { font-size: 9px; fill: var(--color-text-muted); font-family: 'Geist Mono', monospace; text-transform: uppercase; }
</style>
