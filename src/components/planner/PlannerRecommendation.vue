<script setup lang="ts">
import { Lightbulb } from 'lucide-vue-next'

defineProps<{
  text: string
}>()
</script>

<template>
  <div
    class="flex items-start gap-1.5 rounded-md border border-amber-400/30 px-2 py-1.5 text-xs text-amber-700 dark:border-amber-400/25 dark:text-amber-300"
    style="background: rgba(245, 158, 11, 0.08)"
  >
    <Lightbulb class="mt-px size-3 shrink-0 text-amber-500" />
    <span>{{ text }}</span>
  </div>
</template>
