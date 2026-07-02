<script setup lang="ts">
/**
 * Centered modal dialog. Owns the shell the picker modals and the items mobile
 * sheet each hand-rolled: the Teleport, the fade backdrop, click-outside
 * dismissal, and a subtle rise-in transition. Via useOverlayA11y it also adds
 * the accessibility those hand-rolled modals lacked — body scroll lock, a Tab
 * focus trap, Escape-to-close, focus restore on close, and `role="dialog"` /
 * `aria-modal`.
 *
 * The caller supplies the panel surface + size via fall-through `class`
 * (e.g. `surface-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden`).
 */
import { ref } from 'vue'

import { useOverlayA11y } from '@/composables/useOverlayA11y'

const props = withDefaults(
  defineProps<{
    open: boolean
    ariaLabel?: string
    /** Backdrop tint/blur utility classes (override e.g. for an opaque mobile sheet). */
    backdropClass?: string
  }>(),
  {
    ariaLabel: undefined,
    backdropClass: 'bg-background/70',
  },
)


const emit = defineEmits<{
  close: []
}>()


defineOptions({ inheritAttrs: false })


const panelEl = ref<HTMLElement | null>(null)


useOverlayA11y(panelEl, {
  open: () => props.open,
  onClose: () => emit('close'),
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] grid place-items-center p-4 backdrop-blur-sm"
        :class="backdropClass"
        @click.self="emit('close')"
      >
        <Transition name="modal-pop" appear>
          <div
            ref="panelEl"
            v-bind="$attrs"
            tabindex="-1"
            role="dialog"
            aria-modal="true"
            :aria-label="ariaLabel"
            class="outline-none"
          >
            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-pop-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}
.modal-pop-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in;
}
.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
