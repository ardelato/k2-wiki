<script setup lang="ts">
import { Minus, Plus, RotateCcw } from 'lucide-vue-next'

defineProps<{
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  isDefaultZoom: boolean
  resetLabel: string
  zoomOutLabel: string
  zoomInLabel: string
}>()


const emit = defineEmits<{
  'reset-zoom': []
  'zoom-in': []
  'zoom-out': []
}>()
</script>

<template>
  <button
    class="focus-ring flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
    :class="isDefaultZoom ? 'invisible' : ''"
    :title="resetLabel"
    @click="emit('reset-zoom')"
  >
    <RotateCcw class="size-3" />
    {{ resetLabel }}
  </button>
  <span class="text-2xs font-semibold text-muted-foreground">{{ zoom }}x</span>
  <div class="inline-flex items-center overflow-hidden rounded-lg border border-border/60">
    <button
      class="focus-ring flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      :disabled="!canZoomOut"
      :title="zoomOutLabel"
      @click="emit('zoom-out')"
    >
      <Minus class="size-3.5" />
    </button>
    <button
      class="focus-ring flex h-7 w-7 items-center justify-center border-l border-border/60 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      :disabled="!canZoomIn"
      :title="zoomInLabel"
      @click="emit('zoom-in')"
    >
      <Plus class="size-3.5" />
    </button>
  </div>
</template>
