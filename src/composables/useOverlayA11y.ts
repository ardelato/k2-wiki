import { onKeyStroke, useEventListener, useScrollLock } from '@vueuse/core'
import { type MaybeRefOrGetter, nextTick, type Ref, toValue, watch } from 'vue'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface OverlayA11yOptions {
  /** Whether the overlay is currently open. */
  open: MaybeRefOrGetter<boolean>
  /** Modal overlays lock body scroll, trap focus, and close on Escape; non-modal ones don't. Defaults to true. */
  modal?: MaybeRefOrGetter<boolean>
  /** Requests a close (fired on Escape). */
  onClose: () => void
}

/**
 * Shared overlay accessibility for SlideOverPanel and ModalDialog: body scroll
 * lock, a Tab focus trap, Escape-to-close, and focus restore on close — all
 * gated on `modal`, so a non-modal panel leaves the page scrollable, keeps its
 * focus behaviour, and does not hijack Escape. The caller wires `panelEl` to the
 * panel's root element.
 */
export function useOverlayA11y(panelEl: Ref<HTMLElement | null>, options: OverlayA11yOptions) {
  const isOpen = () => toValue(options.open)
  const isModal = () => toValue(options.modal ?? true)

  // Lock the body scroll only while a modal overlay is open.
  const scrollLock = useScrollLock(typeof document !== 'undefined' ? document.body : null)
  watch(
    () => isOpen() && isModal(),
    (locked) => {
      scrollLock.value = locked
    },
    { immediate: true },
  )

  // Escape dismisses modal overlays only — a non-modal drawer (dev tool) leaves
  // the page interactive and shouldn't swallow Escape.
  onKeyStroke('Escape', (e) => {
    if (isOpen() && isModal()) {
      e.preventDefault()
      options.onClose()
    }
  })

  function focusables(): HTMLElement[] {
    if (!panelEl.value) return []
    return Array.from(panelEl.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    )
  }

  // Keep Tab within the panel. Listening on window (rather than the panel) catches
  // the case where focus has already escaped to the page or browser chrome.
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !isOpen() || !isModal() || !panelEl.value) return
    const els = focusables()
    if (els.length === 0) {
      e.preventDefault()
      panelEl.value.focus()
      return
    }
    const first = els[0]
    const last = els[els.length - 1]
    const active = document.activeElement as HTMLElement | null
    const inside = panelEl.value.contains(active)
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault()
      first.focus()
    }
  })

  // Move focus into the panel on open; restore it to the trigger on close.
  let lastActive: HTMLElement | null = null
  watch(
    () => isOpen(),
    async (open) => {
      if (!isModal()) return
      if (open) {
        lastActive = document.activeElement as HTMLElement | null
        await nextTick()
        ;(focusables()[0] ?? panelEl.value)?.focus()
      } else if (lastActive) {
        // The trigger may have been unmounted while the overlay was open (list
        // re-render, filtered out); focusing a detached node silently drops focus.
        if (document.contains(lastActive)) lastActive.focus()
        lastActive = null
      }
    },
  )
}
