<script setup lang="ts">
import { Lightbulb } from 'lucide-vue-next'

defineProps<{
  text: string
}>()
</script>

<template>
  <div
    class="flex items-start gap-1.5 rounded-md border border-warning/30 px-2 py-1.5 text-xs text-warning-strong dark:border-warning/25 dark:text-warning-strong"
    style="background: rgba(245, 158, 11, 0.08)"
  >
    <Lightbulb class="mt-px size-3 shrink-0 text-warning-strong" />
    <span>{{ text }}</span>
  </div>
</template>
