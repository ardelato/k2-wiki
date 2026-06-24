<script setup lang="ts">
import Badge from '@/components/shared/Badge.vue'

defineProps<{
  color?: string
  title?: string
}>()
</script>

<template>
  <Badge variant="neutral" size="md" :style="color ? { color } : undefined" :title="title">
    <slot />
  </Badge>
</template>
