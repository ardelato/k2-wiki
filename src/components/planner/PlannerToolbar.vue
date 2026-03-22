<script setup lang="ts">
defineProps<{
  pickerLabel?: string
}>()
</script>

<template>
  <section class="surface-card relative z-20">
    <div
      v-if="$slots.picker"
      class="group flex flex-wrap items-center gap-4 border-b border-border/40 px-4 py-4"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span
          v-if="pickerLabel"
          class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
          >{{ pickerLabel }}</span
        >
        <slot name="picker" />
      </div>
    </div>

    <div class="flex min-h-[56px] flex-wrap items-center gap-4 px-4 py-3">
      <slot name="controls" />

      <div v-if="$slots.summary" class="ml-auto flex items-center gap-4">
        <slot name="summary" />
      </div>
    </div>
  </section>
</template>
