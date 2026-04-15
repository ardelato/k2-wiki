<script setup lang="ts">
import { nextTick, ref, type CSSProperties } from 'vue'

const props = defineProps<{
  text: string
  position?: 'top' | 'right' | 'bottom' | 'left'
  disabled?: boolean
}>()


const visible = ref(false)
const style = ref<CSSProperties>({})
const triggerRef = ref<HTMLElement>()
const tooltipRef = ref<HTMLElement>()


const EDGE_PADDING = 6


async function show() {
  if (props.disabled) return
  const el = triggerRef.value?.firstElementChild as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pos = props.position || 'top'
  const gap = 8


  const s: CSSProperties = { position: 'fixed' }


  if (pos === 'top') {
    s.left = `${rect.left + rect.width / 2}px`
    s.top = `${rect.top - gap}px`
    s.transform = 'translateX(-50%) translateY(-100%)'
  } else if (pos === 'right') {
    s.left = `${rect.right + gap}px`
    s.top = `${rect.top + rect.height / 2}px`
    s.transform = 'translateY(-50%)'
  } else if (pos === 'bottom') {
    s.left = `${rect.left + rect.width / 2}px`
    s.top = `${rect.bottom + gap}px`
    s.transform = 'translateX(-50%)'
  } else {
    s.left = `${rect.left - gap}px`
    s.top = `${rect.top + rect.height / 2}px`
    s.transform = 'translateX(-100%) translateY(-50%)'
  }


  style.value = s
  visible.value = true


  await nextTick()
  if (!tooltipRef.value) return
  const tipRect = tooltipRef.value.getBoundingClientRect()
  if (tipRect.left < EDGE_PADDING) {
    style.value = {
      ...style.value,
      left: `${parseFloat(s.left as string) + (EDGE_PADDING - tipRect.left)}px`,
    }
  } else if (tipRect.right > window.innerWidth - EDGE_PADDING) {
    style.value = {
      ...style.value,
      left: `${parseFloat(s.left as string) - (tipRect.right - window.innerWidth + EDGE_PADDING)}px`,
    }
  }
}


function hide() {
  visible.value = false
}
</script>

<template>
  <div
    ref="triggerRef"
    class="contents"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </div>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <span
        v-if="visible"
        ref="tooltipRef"
        :style="style"
        class="pointer-events-none z-50 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground shadow-lg"
        role="tooltip"
      >
        {{ text }}
      </span>
    </Transition>
  </Teleport>
</template>
