<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    maxValue?: number
    color: string
    size?: 'sm' | 'md'
  }>(),
  { maxValue: 10, size: 'md' },
)


const radius = computed(() => (props.size === 'sm' ? 20 : 28))
const strokeWidth = computed(() => (props.size === 'sm' ? 3 : 4))
const circumference = computed(() => 2 * Math.PI * radius.value)
const progress = computed(() => Math.min(props.value / props.maxValue, 1))
const dashOffset = computed(() => circumference.value * (1 - progress.value))
const svgSize = computed(() => (radius.value + strokeWidth.value) * 2)
</script>

<template>
  <div class="ring-wrapper">
    <span :class="['ring-label', size === 'sm' ? 'label-sm' : 'label-md']">{{ label }}</span>
    <div class="ring-container" :style="{ width: svgSize + 'px', height: svgSize + 'px' }">
      <svg :width="svgSize" :height="svgSize" class="ring-svg">
        <circle
          :cx="radius + strokeWidth"
          :cy="radius + strokeWidth"
          :r="radius"
          fill="none"
          stroke="currentColor"
          stroke-opacity="0.1"
          :stroke-width="strokeWidth"
          :stroke-dasharray="`${circumference * 0.15} ${circumference * 0.05}`"
        />
        <circle
          v-if="value > 0"
          :cx="radius + strokeWidth"
          :cy="radius + strokeWidth"
          :r="radius"
          fill="none"
          :stroke="color"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
          class="progress-ring"
        />
      </svg>
      <div class="ring-value">
        <span
          :class="[
            'value-text',
            size === 'sm' ? 'value-sm' : 'value-md',
            value === 0 ? 'value-zero' : '',
          ]"
        >
          {{ value }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ring-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ring-label {
  color: var(--color-text-muted);
  font-weight: 500;
}
.label-sm {
  font-size: 10px;
}
.label-md {
  font-size: 12px;
}
.ring-container {
  position: relative;
}
.ring-svg {
  transform: rotate(-90deg);
}
.progress-ring {
  transition: stroke-dashoffset 0.5s ease;
}
.ring-value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.value-text {
  font-family: 'Geist Mono', monospace;
  font-weight: 700;
  color: var(--color-text);
}
.value-sm {
  font-size: 14px;
}
.value-md {
  font-size: 18px;
}
.value-zero {
  color: var(--color-text-muted);
  opacity: 0.5;
}
</style>
