<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
}>()
</script>

<template>
  <div class="surface-card px-6 py-12 text-center">
    <p class="text-lg font-bold text-foreground">{{ title }}</p>
    <p class="mt-2 text-sm text-muted-foreground">{{ subtitle }}</p>
    <div v-if="$slots.action" class="mt-5 flex justify-center">
      <slot name="action" />
    </div>
  </div>
</template>
