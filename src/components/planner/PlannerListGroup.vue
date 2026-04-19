<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

defineProps<{
  label: string
  color: string
  itemCount: number
  collapsed: boolean
}>()


const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- Group header (clickable to toggle) -->
    <button
      class="flex items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/20"
      @click="emit('toggle')"
    >
      <ChevronDown
        class="size-3.5 shrink-0 text-muted-foreground/50 transition-transform"
        :class="{ '-rotate-90': collapsed }"
      />
      <div class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: color }" />
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {{ label }}
      </span>
      <span class="text-[11px] text-muted-foreground/60">{{ itemCount }}</span>
    </button>
    <!-- Rows -->
    <div v-if="!collapsed" class="ml-[14px] flex flex-col gap-1">
      <slot />
    </div>
  </div>
</template>
