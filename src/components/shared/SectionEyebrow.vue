<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: 'div' | 'h3'
  }>(),
  { as: 'div' },
)
</script>

<template>
  <component :is="as" class="text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
    <slot />
  </component>
</template>
