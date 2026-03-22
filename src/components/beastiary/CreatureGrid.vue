<script setup lang="ts">
import type { Creature } from '@/types'

import CreatureCard from './CreatureCard.vue'

defineProps<{
  creatures: Creature[]
  selectedIds: string[]
}>()


const emit = defineEmits<{
  creatureClick: [creature: Creature]
  toggleSelect: [id: string]
}>()
</script>

<template>
  <div class="grid">
    <CreatureCard
      v-for="creature in creatures"
      :key="creature.id"
      :creature="creature"
      :selected="selectedIds.includes(creature.id)"
      :selectable="true"
      @click="emit('creatureClick', creature)"
      @select="emit('toggleSelect', creature.id)"
    />
  </div>
  <div v-if="creatures.length === 0" class="empty">No creatures found matching your filters.</div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (min-width: 1280px) {
  .grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
.empty {
  text-align: center;
  padding: 48px 0;
  color: var(--color-text-muted);
}
</style>
