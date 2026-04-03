<script setup lang="ts">
import { X } from 'lucide-vue-next'

export interface ActiveFilter {
  key: string
  group: string
  label: string
  color?: string
  image?: string
}


defineProps<{
  filters: ActiveFilter[]
}>()


defineEmits<{
  remove: [key: string]
  'clear-all': []
}>()
</script>

<template>
  <div v-if="filters.length" class="flex flex-wrap items-center gap-2">
    <TransitionGroup name="chip">
      <button
        v-for="f in filters"
        :key="f.key"
        class="pill pill-active focus-ring gap-1.5 active:scale-[0.96]"
        @click="$emit('remove', f.key)"
      >
        <img v-if="f.image" :src="f.image" alt="" class="size-4" />
        <span
          v-if="f.color && !f.image"
          class="inline-block size-2 rounded-full ring-1 ring-white/60"
          :style="{ backgroundColor: f.color }"
        />
        {{ f.label }}
        <X class="size-3 opacity-60" />
      </button>
    </TransitionGroup>
    <button
      v-if="filters.length >= 2"
      class="pill focus-ring active:scale-[0.96]"
      @click="$emit('clear-all')"
    >
      Clear all
    </button>
  </div>
</template>

<style scoped>
.chip-enter-active,
.chip-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
