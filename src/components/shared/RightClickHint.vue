<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  label?: string
}>()


const { t } = useI18n()


const emit = defineEmits<{
  contextmenu: [event: MouseEvent]
}>()


const hint = ref({ visible: false, x: 0, y: 0 })


function onMouseMove(e: MouseEvent) {
  hint.value.x = e.clientX
  hint.value.y = e.clientY
}


function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  hint.value.visible = false
  emit('contextmenu', e)
}
</script>

<template>
  <div
    class="contents"
    @mouseenter="hint.visible = true"
    @mouseleave="hint.visible = false"
    @mousemove="onMouseMove"
    @contextmenu="onContextMenu"
  >
    <slot />
  </div>

  <Teleport to="body">
    <div
      v-if="hint.visible"
      class="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 shadow-lg"
      :style="{ top: `${hint.y + 16}px`, left: `${hint.x + 12}px` }"
    >
      <svg
        class="size-3.5 text-muted-foreground"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M12 2v8h6a6 6 0 0 0-6-6Z" fill="currentColor" opacity="0.5" />
        <rect x="4" y="2" width="16" height="20" rx="8" stroke="currentColor" stroke-width="2" />
        <line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" stroke-width="2" />
      </svg>
      <span class="text-[10px] font-medium text-muted-foreground">{{
        label ?? t('shared.rightClickHint.label')
      }}</span>
    </div>
  </Teleport>
</template>
