<script setup lang="ts">
import type { Creature, Expedition, ExpeditionStatWeights } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase } from '@/utils/format'
import { statLabels, statAbbreviations } from '@/utils/formulas'

type ExpeditionStatKey = keyof ExpeditionStatWeights


const props = defineProps<{
  creatures: { creature: Creature; rating: number; level: number }[]
  expedition: Expedition | null
  selectedCreatureId: string | null
}>()


const emit = defineEmits<{
  selectCreature: [creature: Creature]
  updateLevel: [creatureId: string, level: number]
  updateSearch: [query: string]
  updateTypeFilter: [type: string]
}>()


const typeColorMap: Record<string, string> = {
  Fire: 'var(--color-fire)',
  Water: 'var(--color-water)',
  Wind: 'var(--color-wind)',
  Earth: 'var(--color-earth)',
}


const elementTypes = ['All', 'Fire', 'Water', 'Wind', 'Earth'] as const


function weightedStats(): [ExpeditionStatKey, number][] {
  if (!props.expedition) return []
  return (Object.entries(props.expedition.statWeights) as [ExpeditionStatKey, number][]).filter(
    ([, w]) => w > 0,
  )
}


function getStatBar(creature: Creature, statKey: ExpeditionStatKey): number {
  return Math.min(100, creature.stats[statKey])
}
</script>

<template>
  <div class="selector-panel">
    <!-- Header -->
    <div class="selector-header">
      <span class="selector-title">Select Creature</span>
      <div class="search-wrap">
        <svg
          class="search-icon"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          width="14"
          height="14"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="13" y1="13" x2="17" y2="17" />
        </svg>
        <input
          class="search-input"
          type="text"
          placeholder="Search creatures..."
          @input="emit('updateSearch', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- Type filter pills -->
    <div class="filter-pills">
      <button
        v-for="t in elementTypes"
        :key="t"
        class="type-pill"
        :class="{ 'type-active': t === 'All' }"
        :style="t !== 'All' ? { '--pill-color': typeColorMap[t] } : {}"
        @click="emit('updateTypeFilter', t === 'All' ? 'all' : t)"
      >
        {{ t }}
      </button>
    </div>

    <!-- Stat sort pills (when expedition selected) -->
    <div v-if="expedition && weightedStats().length" class="stat-pills">
      <span class="stat-pills-label">Focus:</span>
      <span v-for="[key] in weightedStats()" :key="key" class="stat-pill" :title="statLabels[key]">
        {{ statAbbreviations[key] }}
      </span>
    </div>

    <!-- Creature list -->
    <div class="creature-scroll">
      <div
        v-for="{ creature, rating, level } in creatures"
        :key="creature.id"
        class="creature-row"
        :class="{ selected: creature.id === selectedCreatureId }"
        @click="emit('selectCreature', creature)"
      >
        <div class="creature-main">
          <!-- Avatar -->
          <div
            class="c-avatar"
            :style="{
              backgroundColor: typeColorMap[creature.types[0]] + '33',
              borderColor: typeColorMap[creature.types[0]] + '66',
            }"
          >
            <img
              v-if="getCreatureImage(creature)"
              :src="getCreatureImage(creature)"
              :alt="`${creature.name} artwork`"
              class="c-avatar-image"
              loading="lazy"
            />
            <span v-else>{{ creature.name.charAt(0) }}</span>
          </div>

          <!-- Name + meta -->
          <div class="c-info">
            <div class="c-name-row">
              <span class="c-name">{{ creature.name }}</span>
              <!-- Trait match star -->
              <svg
                v-if="expedition && creature.trait === expedition.trait && expedition.trait"
                class="trait-star"
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="var(--color-yellow)"
              >
                <path
                  d="M8 1l1.854 4.146L14 5.882l-3.146 2.868.854 4.25L8 10.854l-3.708 2.146.854-4.25L2 5.882l4.146-.736L8 1z"
                />
              </svg>
            </div>
            <div class="c-meta">
              <span
                v-for="t in creature.types"
                :key="t"
                :style="{ color: typeColorMap[t] }"
                class="c-type"
                >{{ t }}</span
              >
              <span v-if="creature.trait" class="c-trait">{{ toTitleCase(creature.trait) }}</span>
            </div>
          </div>

          <!-- Level + rating -->
          <div class="c-right" @click.stop>
            <input
              type="number"
              class="level-input"
              :value="level"
              min="1"
              max="100"
              title="Level"
              @input="
                emit('updateLevel', creature.id, Number(($event.target as HTMLInputElement).value))
              "
            />
            <span class="c-rating">{{ rating }}</span>
          </div>
        </div>

        <!-- Stat bars for weighted stats -->
        <div v-if="expedition && weightedStats().length" class="stat-bars">
          <div v-for="[key, weight] in weightedStats()" :key="key" class="stat-bar-row">
            <span class="stat-bar-label">{{ statAbbreviations[key] }}</span>
            <div class="stat-bar-bg">
              <div
                class="stat-bar-fill"
                :style="{ width: getStatBar(creature, key) + '%', opacity: 0.4 + weight * 0.6 }"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="creatures.length === 0" class="empty">
        <span v-if="expedition">No creatures found.</span>
        <span v-else>Select an expedition to see recommendations.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.selector-panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.selector-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.selector-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 8px 6px 28px;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 0.8125rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.filter-pills {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.type-pill {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.type-pill:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.type-pill.type-active {
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-color: var(--color-primary);
}

.stat-pills {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.stat-pills-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 2px;
}

.stat-pill {
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 600;
  background: oklch(from var(--color-primary) l c h / 0.15);
  color: var(--color-primary);
  border: 1px solid oklch(from var(--color-primary) l c h / 0.3);
}

.creature-scroll {
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  flex: 1;
}

.creature-row {
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.1s;
}

.creature-row:last-child {
  border-bottom: none;
}

.creature-row:hover {
  background: var(--color-bg-hover);
}

.creature-row.selected {
  background: oklch(from var(--color-primary) l c h / 0.15);
  border-left: 3px solid var(--color-primary);
}

.creature-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  flex-shrink: 0;
  overflow: hidden;
}

.c-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.c-info {
  flex: 1;
  min-width: 0;
}

.c-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trait-star {
  flex-shrink: 0;
}

.c-meta {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 1px;
}

.c-type {
  font-size: 0.7rem;
}

.c-trait {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.c-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.level-input {
  width: 48px;
  padding: 2px 4px;
  text-align: center;
  font-size: 0.75rem;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.level-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.c-rating {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}

.stat-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-bar-label {
  width: 28px;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  flex-shrink: 0;
}

.stat-bar-bg {
  flex: 1;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
}

.empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
</style>
