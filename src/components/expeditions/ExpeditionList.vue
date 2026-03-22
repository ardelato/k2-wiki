<script setup lang="ts">
import type { Expedition } from '@/types'
import { toTitleCase } from '@/utils/format'

defineProps<{
  expeditions: Expedition[]
  selectedId: string | null
  sortField: string
  sortDirection: string
}>()


const emit = defineEmits<{
  select: [expedition: Expedition]
  sort: [field: string]
}>()
</script>

<template>
  <div class="list-panel">
    <div class="list-header">
      <span class="list-title">Expeditions</span>
      <div class="sort-btns">
        <button
          class="sort-btn"
          :class="{ active: sortField === 'rating' }"
          @click="emit('sort', 'rating')"
        >
          Rating
          <svg
            v-if="sortField === 'rating'"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="currentColor"
          >
            <path v-if="sortDirection === 'asc'" d="M8 4l4 6H4l4-6z" />
            <path v-else d="M8 12l-4-6h8l-4 6z" />
          </svg>
        </button>
        <button
          class="sort-btn"
          :class="{ active: sortField === 'time' }"
          @click="emit('sort', 'time')"
        >
          Time
          <svg
            v-if="sortField === 'time'"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="currentColor"
          >
            <path v-if="sortDirection === 'asc'" d="M8 4l4 6H4l4-6z" />
            <path v-else d="M8 12l-4-6h8l-4 6z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="list-scroll">
      <div
        v-for="exp in expeditions"
        :key="exp.id"
        class="exp-row"
        :class="{ selected: exp.id === selectedId }"
        @click="emit('select', exp)"
      >
        <div class="exp-row-top">
          <span class="exp-name">{{ exp.name }}</span>
          <span class="exp-rating">{{ exp.baseRating }}</span>
        </div>
        <div class="exp-row-bottom">
          <span class="exp-biome">{{ toTitleCase(exp.biome) }}</span>
          <span v-if="exp.trait" class="exp-trait">{{ toTitleCase(exp.trait) }}</span>
        </div>
      </div>

      <div v-if="expeditions.length === 0" class="empty">No expeditions found.</div>
    </div>
  </div>
</template>

<style scoped>
.list-panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.list-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.sort-btns {
  display: flex;
  gap: 4px;
}

.sort-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.sort-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.sort-btn.active {
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-color: var(--color-primary);
}

.list-scroll {
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  flex: 1;
}

.exp-row {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.1s;
}

.exp-row:last-child {
  border-bottom: none;
}

.exp-row:hover {
  background: var(--color-bg-hover);
}

.exp-row.selected {
  background: oklch(from var(--color-primary) l c h / 0.15);
  border-left: 3px solid var(--color-primary);
}

.exp-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.exp-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exp-rating {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-primary);
  flex-shrink: 0;
}

.exp-row-bottom {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.exp-biome {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.exp-trait {
  font-size: 0.7rem;
  color: var(--color-yellow);
}

.empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
</style>
