<script setup lang="ts">
/**
 * Teleported, viewport-floating panel with the canonical popover transition.
 * Replaces the per-caller `Teleport` + byte-identical `.*-popover-*` transition
 * CSS. Owns only the shell (teleport, z-layer, enter/leave animation); callers
 * pass their own surface + width via fall-through `class`, their position via
 * `:style` (from `usePopover().style`), and wire `:el-ref` to
 * `usePopover().setPanelEl` so the vertical-flip step can measure the panel.
 */
defineProps<{
  isOpen: boolean
  /** Forwards the rendered panel element to usePopover().setPanelEl. */
  elRef?: (el: Element | null) => void
}>()


defineOptions({ inheritAttrs: false })
</script>

<template>
  <Teleport to="body">
    <Transition name="floating-panel">
      <div v-if="isOpen" :ref="(el) => elRef?.(el as Element | null)" v-bind="$attrs">
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Canonical popover transition: ease-out enter (0.15s), ease-in exit (0.1s),
   translateY(-4px) — matches AppTooltip's easing intent. */
.floating-panel-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}
.floating-panel-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}
.floating-panel-enter-from,
.floating-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
