<script setup lang="ts">
/**
 * Consistent section header used across the planner: a small monospace kicker over
 * a bold title, with a bottom rule. Gives a long page one visual spine instead of a
 * stack of differently-styled boxes. Optional `aside` slot for right-aligned meta.
 */
defineProps<{ kicker: string; title: string }>()
</script>

<template>
  <div class="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-2">
    <div>
      <p class="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground/70">
        {{ kicker }}
      </p>
      <h2 class="mt-0.5 text-xl font-black tracking-tight text-foreground">{{ title }}</h2>
    </div>
    <div v-if="$slots.aside" class="shrink-0 text-xs text-muted-foreground">
      <slot name="aside" />
    </div>
  </div>
</template>
