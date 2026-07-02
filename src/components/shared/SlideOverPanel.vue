<script setup lang="ts">
/**
 * Edge-anchored slide-over drawer. Owns the shell that CreatureDetail and the
 * debug panels each hand-rolled: the Teleport, the right/left slide transition,
 * fixed positioning, and the card surface.
 *
 * When `modal` (the default) it also handles the accessibility the old panels
 * lacked — a click-to-dismiss backdrop, body scroll lock, a Tab focus trap,
 * Escape-to-close, focus restore on close, and `role="dialog"`/`aria-modal`.
 * Non-modal drawers (dev tools that leave the page interactive) pass
 * `:modal="false"` to skip the backdrop, scroll lock, focus trap, and Escape.
 *
 * The caller owns the panel's width and inner layout via fall-through `class`
 * (e.g. `w-full max-w-[420px] overflow-y-auto`, or `... flex flex-col`).
 */
import { ref } from 'vue'

import { useOverlayA11y } from '@/composables/useOverlayA11y'

const props = withDefaults(
  defineProps<{
    open: boolean
    modal?: boolean
    ariaLabel?: string
  }>(),
  {
    modal: true,
    ariaLabel: undefined,
  },
)


const emit = defineEmits<{
  close: []
}>()


defineOptions({ inheritAttrs: false })


const panelEl = ref<HTMLElement | null>(null)


useOverlayA11y(panelEl, {
  open: () => props.open,
  modal: () => props.modal,
  onClose: () => emit('close'),
})
</script>

<template>
  <Teleport to="body">
    <!-- Dismiss backdrop (modal drawers only) -->
    <Transition name="slideover-fade">
      <div
        v-if="open && modal"
        class="fixed inset-0 z-[120] bg-background/60 backdrop-blur-sm"
        @click="emit('close')"
        @contextmenu.prevent="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="slideover">
      <div
        v-if="open"
        ref="panelEl"
        v-bind="$attrs"
        tabindex="-1"
        :role="modal ? 'dialog' : undefined"
        :aria-modal="modal ? 'true' : undefined"
        :aria-label="ariaLabel"
        class="fixed inset-y-0 right-0 z-[120] border-l border-border bg-card shadow-2xl outline-none"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slideover-fade-enter-active,
.slideover-fade-leave-active {
  transition: opacity 0.2s ease;
}
.slideover-fade-enter-from,
.slideover-fade-leave-to {
  opacity: 0;
}

.slideover-enter-active,
.slideover-leave-active {
  transition: transform 0.25s ease;
}
.slideover-enter-from,
.slideover-leave-to {
  transform: translateX(100%);
}
</style>
