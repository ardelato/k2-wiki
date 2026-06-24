import { nextTick, reactive, ref } from 'vue'

/**
 * Shared floating-popover positioning. Consolidates the bespoke
 * `getBoundingClientRect` + `POPOVER_WIDTH`/`GAP` clamp logic that was
 * copy-pasted across the planner/gantt/chip popovers.
 *
 * Two anchoring modes cover every existing caller:
 *  - `open(anchorEl)`    — anchor below an element rect (chip + gantt-bar popovers)
 *  - `openAtPoint(x, y)` — follow the cursor (bar-segment popovers call it on mousemove)
 *
 * The controller is a `reactive` object so callers can hold two popovers side by
 * side (`chipPop`, `barPop`) without ref-name collisions and read `chipPop.isOpen`
 * in templates (plan gotcha #1). Wire `setPanelEl` to the rendered panel element
 * (FloatingPanel forwards it) so the vertical-flip step can measure real panel
 * height (gotcha #2).
 */
interface PopoverOptions {
  width: number
  gap?: number
  /** Horizontal anchoring relative to the element rect. Default 'center'. */
  hAlign?: 'center' | 'left' | 'right'
  /** Viewport edge padding for the horizontal clamp. Defaults to `gap`. */
  edgePadding?: number
  /** Flip above the anchor when the panel would overflow the viewport bottom. */
  allowVerticalFlip?: boolean
}

export interface PopoverController {
  isOpen: boolean
  style: Record<string, string>
  open: (anchorEl: HTMLElement) => void
  openAtPoint: (x: number, y: number) => void
  close: () => void
  toggle: (anchorEl: HTMLElement) => void
  setPanelEl: (el: Element | null) => void
}

export function usePopover(options: PopoverOptions): PopoverController {
  const { width } = options
  const gap = options.gap ?? 8
  const hAlign = options.hAlign ?? 'center'
  const edge = options.edgePadding ?? gap
  const allowVerticalFlip = options.allowVerticalFlip ?? false

  const isOpen = ref(false)
  const style = ref<Record<string, string>>({})
  const panelEl = ref<HTMLElement | null>(null)

  function clampLeft(left: number): number {
    const viewportWidth = document.documentElement.clientWidth
    return Math.max(edge, Math.min(left, viewportWidth - width - edge))
  }

  function open(anchorEl: HTMLElement) {
    const rect = anchorEl.getBoundingClientRect()
    let left: number
    if (hAlign === 'right') {
      // Anchor the right edge to the element; fall back to centering if that
      // would push past the left viewport edge.
      left = rect.right - width
      if (left < edge) left = rect.left + rect.width / 2 - width / 2
    } else if (hAlign === 'left') {
      left = rect.left
    } else {
      left = rect.left + rect.width / 2 - width / 2
    }
    left = clampLeft(left)
    style.value = { position: 'fixed', top: `${rect.bottom + gap}px`, left: `${left}px` }
    isOpen.value = true

    if (allowVerticalFlip) {
      // Re-measure after render: flip above the anchor if the panel would
      // overflow the viewport bottom (the analysis's vertical-flip logic).
      nextTick(() => {
        const panel = panelEl.value
        if (!panel || !isOpen.value) return
        const panelRect = panel.getBoundingClientRect()
        if (panelRect.bottom > window.innerHeight - gap) {
          style.value = {
            position: 'fixed',
            top: `${rect.top - panelRect.height - gap}px`,
            left: `${left}px`,
          }
        }
      })
    }
  }

  function openAtPoint(x: number, y: number) {
    const left = clampLeft(x - width / 2)
    style.value = { position: 'fixed', top: `${y + gap}px`, left: `${left}px` }
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle(anchorEl: HTMLElement) {
    if (isOpen.value) close()
    else open(anchorEl)
  }

  function setPanelEl(el: Element | null) {
    panelEl.value = el as HTMLElement | null
  }

  return reactive({ isOpen, style, open, openAtPoint, close, toggle, setPanelEl })
}
