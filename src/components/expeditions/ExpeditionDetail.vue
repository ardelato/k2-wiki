<script setup lang="ts">
import type { Expedition, Creature, ExpeditionStatWeights } from '@/types'
import { computed } from 'vue'
import { statLabels } from '@/utils/formulas'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

const props = defineProps<{
  expedition: Expedition
  selectedCreature: Creature | null
  selectedCreatureStats: { rating: number; time: number; xpPerSec: number; level: number } | null
}>()

type ExpeditionStatKey = keyof ExpeditionStatWeights

const typeColorMap: Record<string, string> = {
  Fire: 'var(--color-fire)',
  Water: 'var(--color-water)',
  Wind: 'var(--color-wind)',
  Earth: 'var(--color-earth)',
}

const selectedCreatureImage = computed(() => {
  if (!props.selectedCreature) return undefined
  return getCreatureImage(props.selectedCreature)
})
</script>

<template>
  <div class="detail-panel">
    <div class="detail-top">
      <h2 class="exp-name">{{ expedition.name }}</h2>
      <p class="exp-desc">{{ expedition.description }}</p>
    </div>

    <!-- Info grid -->
    <div class="info-grid">
      <div class="info-cell">
        <span class="info-label">Rating</span>
        <span class="info-value">{{ expedition.baseRating }}</span>
      </div>
      <div class="info-cell">
        <span class="info-label">Biome</span>
        <span class="info-value">{{ toTitleCase(expedition.biome) }}</span>
      </div>
      <div class="info-cell">
        <span class="info-label">Trait</span>
        <span class="info-value trait-val">{{ expedition.trait ? toTitleCase(expedition.trait) : 'None' }}</span>
      </div>
    </div>

    <!-- Base stats -->
    <div class="section">
      <h3 class="section-title">Details</h3>
      <div class="base-grid">
        <div class="base-cell">
          <span class="base-label">Duration</span>
          <span class="base-value">{{ Math.round(expedition.baseDuration / 60) }}m</span>
        </div>
        <div class="base-cell">
          <span class="base-label">XP Multiplier</span>
          <span class="base-value">{{ expedition.baseXP }}x</span>
        </div>
        <div class="base-cell">
          <span class="base-label">Max Party</span>
          <span class="base-value">{{ expedition.maxPartySize }}</span>
        </div>
        <div class="base-cell">
          <span class="base-label">Required Clears</span>
          <span class="base-value">{{ expedition.requiredExpeditionCompletions }}</span>
        </div>
      </div>
    </div>

    <!-- Stat weights -->
    <div class="section">
      <h3 class="section-title">Stat Weights</h3>
      <div class="weights-list">
        <template v-for="[key, weight] in (Object.entries(expedition.statWeights) as [ExpeditionStatKey, number][])" :key="key">
          <div v-if="weight > 0" class="weight-row">
            <span class="weight-label">{{ statLabels[key] }}</span>
            <div class="weight-bar-bg">
              <div class="weight-bar-fill" :style="{ width: (weight * 100) + '%' }" />
            </div>
            <span class="weight-pct">{{ Math.round(weight * 100) }}%</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Rewards -->
    <div class="section">
      <h3 class="section-title">Rewards</h3>
      <div class="rewards-list">
        <span
          v-for="(reward, i) in expedition.rewards"
          :key="i"
          class="reward-tag"
        >
          <img v-if="getItemImage({ id: reward.itemId })" :src="getItemImage({ id: reward.itemId })" :alt="toTitleCase(reward.itemId)" class="size-4 object-contain" />
          {{ reward.amount }}x {{ toTitleCase(reward.itemId) }}
        </span>
        <span v-if="expedition.rewards.length === 0" class="no-rewards">None</span>
      </div>
    </div>

    <!-- Selected creature stats -->
    <div v-if="selectedCreature && selectedCreatureStats" class="section creature-stats-section">
      <h3 class="section-title">Creature Performance</h3>
      <div class="creature-card">
        <div class="creature-avatar" :style="{ backgroundColor: typeColorMap[selectedCreature.types[0]] + '33', borderColor: typeColorMap[selectedCreature.types[0]] + '66' }">
          <img
            v-if="selectedCreatureImage"
            :src="selectedCreatureImage"
            :alt="`${selectedCreature.name} artwork`"
            class="creature-avatar-image"
          />
          <span v-else>{{ selectedCreature.name.charAt(0) }}</span>
        </div>
        <div class="creature-info">
          <div class="creature-name-row">
            <span class="creature-name">{{ selectedCreature.name }}</span>
            <span v-if="selectedCreature.types.length" class="creature-type" :style="{ color: typeColorMap[selectedCreature.types[0]] }">
              {{ selectedCreature.types.join(' / ') }}
            </span>
          </div>
          <span
            v-if="selectedCreature.trait === expedition.trait && expedition.trait"
            class="trait-match-badge"
          >
            Trait Match
          </span>
        </div>
      </div>
      <div class="perf-grid">
        <div class="perf-cell">
          <span class="perf-label">Rating</span>
          <span class="perf-value">{{ selectedCreatureStats.rating }}</span>
        </div>
        <div class="perf-cell">
          <span class="perf-label">Time</span>
          <span class="perf-value">{{ selectedCreatureStats.time }}m</span>
        </div>
        <div class="perf-cell">
          <span class="perf-label">XP/Sec</span>
          <span class="perf-value">{{ selectedCreatureStats.xpPerSec.toFixed(3) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
}

.detail-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exp-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
}

.exp-desc {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.info-cell {
  background: oklch(from var(--color-bg) l c h / 0.6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}

.info-label {
  display: block;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.info-value {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.trait-val {
  color: var(--color-yellow);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.base-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.base-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: oklch(from var(--color-bg) l c h / 0.6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
}

.base-label {
  color: var(--color-text-muted);
}

.base-value {
  font-weight: 600;
  color: var(--color-text);
}

.weights-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.weight-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.weight-label {
  width: 64px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.weight-bar-bg {
  flex: 1;
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}

.weight-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.2s;
}

.weight-pct {
  width: 36px;
  text-align: right;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
  flex-shrink: 0;
}

.rewards-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.reward-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font-size: 0.75rem;
  color: var(--color-text);
  background: oklch(from var(--color-bg) l c h / 0.6);
}

.no-rewards {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.creature-stats-section {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.creature-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.creature-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
  overflow: hidden;
}

.creature-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.creature-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.creature-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.creature-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.creature-type {
  font-size: 0.75rem;
}

.trait-match-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 600;
  background: oklch(0.65 0.20 145 / 0.2);
  color: var(--color-green);
}

.perf-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.perf-cell {
  background: oklch(from var(--color-bg) l c h / 0.6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  text-align: center;
}

.perf-label {
  display: block;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.perf-value {
  display: block;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text);
}
</style>
