<script setup lang="ts">
/**
 * Grid/table segmented toggle shared by the page toolbars. A v-model control:
 * `v-model="viewMode"` where viewMode is 'grid' | 'table'.
 */
import { Columns3, Grid2x2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

defineProps<{
  modelValue: 'grid' | 'table'
}>()


defineEmits<{
  'update:modelValue': [value: 'grid' | 'table']
}>()


const { t } = useI18n()
</script>

<template>
  <div
    class="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1"
    role="radiogroup"
    :aria-label="t('common.viewMode')"
  >
    <button
      role="radio"
      :aria-checked="modelValue === 'grid'"
      class="focus-ring inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition"
      :class="
        modelValue === 'grid'
          ? 'bg-primary text-primary-foreground shadow-glow'
          : 'text-muted-foreground hover:text-foreground'
      "
      @click="$emit('update:modelValue', 'grid')"
    >
      <Grid2x2 class="size-3.5" />
      {{ t('common.grid') }}
    </button>
    <button
      role="radio"
      :aria-checked="modelValue === 'table'"
      class="focus-ring inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition"
      :class="
        modelValue === 'table'
          ? 'bg-primary text-primary-foreground shadow-glow'
          : 'text-muted-foreground hover:text-foreground'
      "
      @click="$emit('update:modelValue', 'table')"
    >
      <Columns3 class="size-3.5" />
      {{ t('common.table') }}
    </button>
  </div>
</template>
