<script setup lang="ts">
import { computed } from 'vue'

import type { Creature, JobKey } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase } from '@/utils/format'
import { jobLabels, jobColors } from '@/utils/formulas'

const props = defineProps<{
  creature: Creature
  selected?: boolean
  selectable?: boolean
}>()


const emit = defineEmits<{
  click: []
  select: []
}>()


const primaryType = computed(() => props.creature.types[0] || 'Earth')
const typeColorVar = computed(() => `var(--color-${primaryType.value.toLowerCase()})`)
const creatureImage = computed(() => getCreatureImage(props.creature))


const jobEntries = computed(() =>
  (Object.keys(jobLabels) as JobKey[]).map((key) => ({
    key,
    label: jobLabels[key],
    abbr: jobLabels[key].slice(0, 3).toUpperCase(),
    level: props.creature.jobs[key],
    color: jobColors[key],
  })),
)
</script>

<template>
  <div :class="['card', selected && 'selected']" @click="emit('click')">
    <!-- Type accent bar -->
    <div class="accent-bar" :style="{ backgroundColor: typeColorVar }" />

    <!-- Checkbox -->
    <button
      v-if="selectable"
      :class="['checkbox', selected && 'checked']"
      @click.stop="emit('select')"
    >
      <svg
        v-if="selected"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        width="12"
        height="12"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>

    <!-- Hero image area -->
    <div class="hero-area" :style="{ backgroundColor: typeColorVar + '1a' }">
      <div class="tier-badge">T{{ creature.tier + 1 }}</div>
      <img
        v-if="creatureImage"
        :src="creatureImage"
        :alt="`${creature.name} artwork`"
        class="hero-image"
        loading="lazy"
      />
      <span v-else class="hero-fallback" :style="{ color: typeColorVar + '80' }">{{
        creature.name.charAt(0)
      }}</span>
    </div>

    <!-- Name -->
    <h3 class="card-name">{{ creature.name }}</h3>

    <!-- Job stats grid -->
    <div class="job-grid">
      <div v-for="job in jobEntries" :key="job.key" class="job-cell">
        <span class="job-dot" :style="{ backgroundColor: job.color }" />
        <span class="job-abbr">{{ job.abbr }}</span>
        <span class="job-level">{{ job.level }}</span>
      </div>
    </div>

    <!-- Tertiary info -->
    <div class="card-footer">
      <div class="type-tags">
        <span
          v-for="t in creature.types"
          :key="t"
          class="type-tag"
          :style="{ color: `var(--color-${t.toLowerCase()})` }"
          >{{ t }}</span
        >
      </div>
      <span class="trait-value">{{ toTitleCase(creature.trait) }}</span>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.card:hover {
  border-color: oklch(0.65 0.18 285 / 0.5);
}
.card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px oklch(0.65 0.18 285 / 0.25);
}

.accent-bar {
  height: 3px;
  width: 100%;
  flex-shrink: 0;
}

.checkbox {
  position: absolute;
  top: 10px;
  right: 8px;
  z-index: 2;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  border: 2px solid oklch(0.6 0.04 285 / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  padding: 0;
  background: oklch(0.12 0.02 285 / 0.6);
  backdrop-filter: blur(4px);
}
.checkbox:hover {
  border-color: var(--color-primary);
}
.checkbox.checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-fg);
}

.hero-area {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.tier-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  padding: 1px 8px;
  font-size: 12px;
  font-family: 'Geist Mono', monospace;
  background: oklch(0.12 0.02 285 / 0.7);
  backdrop-filter: blur(4px);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-fallback {
  font-size: 48px;
  font-weight: 700;
}

.card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  padding: 8px 10px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 4px;
  padding: 0 10px 6px;
}

.job-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  min-width: 0;
}

.job-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.job-abbr {
  color: var(--color-text-muted);
  font-family: 'Geist Mono', monospace;
  font-size: 10px;
}

.job-level {
  color: var(--color-text);
  font-family: 'Geist Mono', monospace;
  font-weight: 600;
  margin-left: auto;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 8px;
  border-top: 1px solid oklch(0.28 0.04 285 / 0.4);
  margin-top: auto;
}

.type-tags {
  display: flex;
  gap: 4px;
}

.type-tag {
  font-size: 11px;
  font-weight: 500;
}

.trait-value {
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80px;
  text-align: right;
}
</style>
