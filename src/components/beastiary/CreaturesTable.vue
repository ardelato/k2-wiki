<script setup lang="ts">
import { ref, computed } from 'vue'

import type { Creature, CreatureStats, Jobs } from '@/types'
import { statLabels, jobLabels } from '@/utils/formulas'

const props = defineProps<{
  creatures: Creature[]
  selectedIds: string[]
}>()


const emit = defineEmits<{
  creatureClick: [creature: Creature]
  toggleSelect: [id: string]
}>()


type SortKey =
  | 'name'
  | 'tier'
  | 'type'
  | keyof CreatureStats
  | keyof Jobs
  | 'totalStats'
  | 'totalJobs'


const sortKey = ref<SortKey>('tier')
const sortDir = ref<'asc' | 'desc'>('asc')


function handleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}


const sortedCreatures = computed(() => {
  return [...props.creatures].toSorted((a, b) => {
    let aVal: number | string, bVal: number | string
    if (sortKey.value === 'name') {
      aVal = a.name
      bVal = b.name
    } else if (sortKey.value === 'type') {
      aVal = a.types[0] || ''
      bVal = b.types[0] || ''
    } else if (sortKey.value === 'tier') {
      aVal = a.tier
      bVal = b.tier
    } else if (sortKey.value === 'totalStats') {
      aVal = Object.values(a.stats).reduce((s, v) => s + v, 0)
      bVal = Object.values(b.stats).reduce((s, v) => s + v, 0)
    } else if (sortKey.value === 'totalJobs') {
      aVal = Object.values(a.jobs).reduce((s, v) => s + v, 0)
      bVal = Object.values(b.jobs).reduce((s, v) => s + v, 0)
    } else if (sortKey.value in a.stats) {
      aVal = a.stats[sortKey.value as keyof CreatureStats]
      bVal = b.stats[sortKey.value as keyof CreatureStats]
    } else {
      aVal = a.jobs[sortKey.value as keyof Jobs]
      bVal = b.jobs[sortKey.value as keyof Jobs]
    }
    if (typeof aVal === 'string')
      return sortDir.value === 'asc'
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal)
    return sortDir.value === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
})


const typeColorMap: Record<string, string> = {
  Fire: 'var(--color-fire)',
  Water: 'var(--color-water)',
  Wind: 'var(--color-wind)',
  Earth: 'var(--color-earth)',
}
</script>

<template>
  <div class="table-wrapper">
    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th class="col-sort" @click="handleSort('name')">
            Name
            <span v-if="sortKey === 'name'" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th class="col-sort" @click="handleSort('tier')">
            Tier
            <span v-if="sortKey === 'tier'" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th class="col-sort" @click="handleSort('type')">
            Type
            <span v-if="sortKey === 'type'" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th
            v-for="(label, key) in statLabels"
            :key="key"
            class="col-sort col-stat"
            @click="handleSort(key as SortKey)"
          >
            {{ label }}
            <span v-if="sortKey === key" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th class="col-sort col-total" @click="handleSort('totalStats')">
            Total
            <span v-if="sortKey === 'totalStats'" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th
            v-for="(label, key) in jobLabels"
            :key="key"
            class="col-sort col-stat"
            @click="handleSort(key as SortKey)"
          >
            {{ label }}
            <span v-if="sortKey === key" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
          <th class="col-sort col-total" @click="handleSort('totalJobs')">
            Total
            <span v-if="sortKey === 'totalJobs'" class="sort-arrow">{{
              sortDir === 'asc' ? '↑' : '↓'
            }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in sortedCreatures"
          :key="c.id"
          :class="['data-row', selectedIds.includes(c.id) && 'selected']"
          @click="emit('creatureClick', c)"
        >
          <td class="col-check">
            <input
              type="checkbox"
              :checked="selectedIds.includes(c.id)"
              @click.stop
              @change.stop="emit('toggleSelect', c.id)"
            />
          </td>
          <td class="col-name">{{ c.name }}</td>
          <td class="font-mono">T{{ c.tier + 1 }}</td>
          <td>
            <span v-for="t in c.types" :key="t" :style="{ color: typeColorMap[t] }">{{ t }} </span>
          </td>
          <td v-for="(val, key) in c.stats" :key="key" class="col-stat font-mono">{{ val }}</td>
          <td class="col-total font-mono">
            {{ Object.values(c.stats).reduce((a, b) => a + b, 0) }}
          </td>
          <td
            v-for="(val, key) in c.jobs"
            :key="key"
            :class="['col-stat', 'font-mono', val === 0 && 'zero']"
          >
            {{ val }}
          </td>
          <td class="col-total font-mono">
            {{ Object.values(c.jobs).reduce((a, b) => a + b, 0) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrapper {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.data-table th {
  padding: 8px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}
.data-table th:hover {
  color: var(--color-text);
}
.sort-arrow {
  margin-left: 2px;
}
.col-check {
  width: 32px;
  text-align: center;
}
.col-stat {
  text-align: center;
}
.col-total {
  text-align: center;
  font-weight: 700;
  background: oklch(0.22 0.03 285 / 0.2);
}
.col-name {
  font-weight: 500;
  color: var(--color-text);
}
.data-row {
  border-bottom: 1px solid oklch(0.28 0.04 285 / 0.5);
  cursor: pointer;
  transition: background 0.15s;
}
.data-row:hover {
  background: oklch(0.22 0.03 285 / 0.3);
}
.data-row.selected {
  background: oklch(0.65 0.18 285 / 0.1);
}
.data-row td {
  padding: 8px;
}
.font-mono {
  font-family: 'Geist Mono', monospace;
}
.zero {
  color: oklch(0.6 0.04 285 / 0.5);
}
</style>
