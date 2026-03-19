<script setup lang="ts">
import type { Creature, CreatureStats, Jobs } from '@/types'
import { computed } from 'vue'
import { statLabels, jobLabels } from '@/utils/formulas'
import { toTitleCase } from '@/utils/format'
import { getCreatureImage } from '@/utils/creatureImages'
import { getItemImage } from '@/utils/itemImages'
import { useItems } from '@/composables/useItems'

const { getItemById } = useItems()
import StatRadarChart from './StatRadarChart.vue'
import ProficiencyRing from './ProficiencyRing.vue'

const props = defineProps<{
  creature: Creature
  closable?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const jobColors: Record<keyof Jobs, string> = {
  chopping: 'var(--color-job-chopping)',
  mining: 'var(--color-job-mining)',
  digging: 'var(--color-job-digging)',
  exploring: 'var(--color-job-exploring)',
  fishing: 'var(--color-job-fishing)',
  farming: 'var(--color-job-farming)',
}

const typeColorMap: Record<string, string> = {
  Fire: 'var(--color-fire)', Water: 'var(--color-water)',
  Wind: 'var(--color-wind)', Earth: 'var(--color-earth)',
}

function primaryTypeColor(types: string[]): string {
  return typeColorMap[types[0]] || 'var(--color-text-muted)'
}

const creatureImage = computed(() => getCreatureImage(props.creature))
</script>

<template>
  <div class="detail-panel">
    <button v-if="closable" class="close-btn" @click="emit('close')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
    <div class="detail-header">
      <div class="detail-avatar" :style="{
        backgroundColor: primaryTypeColor(creature.types) + '33',
        borderColor: primaryTypeColor(creature.types) + '66',
      }">
        <img
          v-if="creatureImage"
          :src="creatureImage"
          :alt="`${creature.name} artwork`"
          class="avatar-image"
        />
        <span v-else class="avatar-letter">{{ creature.name.charAt(0) }}</span>
      </div>

      <div class="detail-info">
        <div class="detail-title-row">
          <h2 class="detail-name">{{ creature.name }}</h2>
        </div>
        <div class="detail-meta">
          <div class="meta-item">
            <span class="meta-label">Tier</span>
            <span class="meta-value font-mono">T{{ creature.tier + 1 }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Type</span>
            <span class="meta-value">
              <span v-for="t in creature.types" :key="t" :style="{ color: typeColorMap[t] }">{{ t }} </span>
            </span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Job</span>
            <span class="meta-value">{{ toTitleCase(creature.mainJob) }}</span>
          </div>
        </div>
      </div>

    </div>

    <div class="radar-container">
      <StatRadarChart :creature="creature" :size="140" />
    </div>

    <div class="section">
      <h3 class="section-title">Trait</h3>
      <p class="trait-text font-mono">{{ toTitleCase(creature.trait) }}</p>
    </div>

    <div class="section">
      <h3 class="section-title">Description</h3>
      <p class="description">{{ creature.description }}</p>
    </div>

    <div class="section">
      <h3 class="section-title">Stats</h3>
      <div class="stat-grid">
        <div v-for="(value, key) in creature.stats" :key="key" class="stat-cell">
          <div class="stat-number font-mono">{{ value }}</div>
          <div class="stat-name">{{ statLabels[key as keyof CreatureStats] }}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">Job Levels</h3>
      <div class="prof-grid">
        <ProficiencyRing v-for="(value, key) in creature.jobs" :key="key"
          :label="jobLabels[key as keyof Jobs]" :value="value"
          :color="jobColors[key as keyof Jobs]" size="sm" />
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">Summoning Cost</h3>
      <div class="cost-list">
        <router-link v-for="(cost, i) in creature.summoningCost" :key="i" :to="{ path: '/items', query: { item: cost.id } }" class="cost-item font-mono" style="display: flex; align-items: center; gap: 6px;">
          <img v-if="getItemImage({ id: cost.id })" :src="getItemImage({ id: cost.id })" :alt="getItemById(cost.id)?.name ?? toTitleCase(cost.id)" style="width: 20px; height: 20px; object-fit: contain;" />
          {{ cost.amount }}x {{ getItemById(cost.id)?.name ?? toTitleCase(cost.id) }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px; position: relative; }
.close-btn { position: absolute; top: 10px; right: 10px; z-index: 1; padding: 6px; border-radius: var(--radius-sm); color: var(--color-text); background: var(--color-bg-hover); transition: background 0.15s, color 0.15s; }
.close-btn:hover { background: var(--color-primary); color: var(--color-primary-fg); }
.detail-header { display: flex; align-items: flex-start; gap: 16px; }
.detail-avatar { width: 80px; height: 80px; border-radius: var(--radius); border: 2px solid; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.avatar-image { width: 100%; height: 100%; object-fit: cover; }
.avatar-letter { font-size: 30px; font-weight: 700; color: oklch(0.92 0.01 285 / 0.8); }
.detail-info { flex: 1; min-width: 0; }
.detail-title-row { display: flex; align-items: center; gap: 8px; }
.detail-name { font-size: 20px; font-weight: 700; color: var(--color-text); }
.detail-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; font-size: 13px; }
.meta-label { color: var(--color-text-muted); display: block; }
.meta-value { font-weight: 500; display: block; }
.font-mono { font-family: 'Geist Mono', monospace; }
.radar-container { display: flex; justify-content: center; }
.section-title { font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 8px; }
.trait-text { font-size: 14px; color: var(--color-yellow); }
.description { font-size: 13px; color: oklch(0.92 0.01 285 / 0.8); line-height: 1.5; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (min-width: 640px) { .stat-grid { grid-template-columns: repeat(6, 1fr); } }
.stat-cell { background: oklch(0.22 0.03 285 / 0.5); border-radius: var(--radius-sm); padding: 6px 8px; text-align: center; }
.stat-number { font-size: 18px; font-weight: 700; color: var(--color-text); }
.stat-name { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; }
.prof-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
@media (min-width: 640px) { .prof-grid { gap: 16px; } }
.cost-list { display: flex; flex-wrap: wrap; gap: 8px; }
.cost-item { padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 13px; color: var(--color-text); text-decoration: none; transition: background 0.15s, border-color 0.15s; }
.cost-item:hover { background: oklch(0.22 0.03 285 / 0.5); border-color: var(--color-primary); }
</style>
