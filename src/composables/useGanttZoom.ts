import { computed, ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

const DEFAULT_ZOOM_LEVELS = [1, 1.5, 2, 3, 5, 8, 12, 16, 20, 25, 30]

export function useGanttZoom(
  ganttRef: Ref<HTMLElement | null>,
  options: { zoomLevels?: number[]; defaultIndex?: number } = {},
) {
  const ZOOM_LEVELS = options.zoomLevels ?? DEFAULT_ZOOM_LEVELS
  const DEFAULT_ZOOM_INDEX = options.defaultIndex ?? 2

  const zoomIndex = ref(DEFAULT_ZOOM_INDEX)
  const zoom = computed(() => ZOOM_LEVELS[zoomIndex.value])
  const canZoomIn = computed(() => zoomIndex.value < ZOOM_LEVELS.length - 1)
  const canZoomOut = computed(() => zoomIndex.value > 0)
  const isDefaultZoom = computed(() => zoomIndex.value === DEFAULT_ZOOM_INDEX)

  function zoomIn() {
    if (canZoomIn.value) zoomIndex.value++
  }
  function zoomOut() {
    if (canZoomOut.value) zoomIndex.value--
  }
  function resetZoom() {
    zoomIndex.value = DEFAULT_ZOOM_INDEX
  }

  const laneMinWidth = computed(() => `${Math.round(400 * zoom.value)}px`)

  const zoomModifierHeld = ref(false)
  const shiftHeld = ref(false)

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) zoomModifierHeld.value = true
    if (e.shiftKey) shiftHeld.value = true
  }
  function onKeyUp(e: KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) zoomModifierHeld.value = false
    if (!e.shiftKey) shiftHeld.value = false
  }
  function onBlur() {
    zoomModifierHeld.value = false
    shiftHeld.value = false
  }
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else if (e.deltaY > 0) zoomOut()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    ganttRef.value?.addEventListener('wheel', onWheel, { passive: false })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    ganttRef.value?.removeEventListener('wheel', onWheel)
  })

  return {
    zoom,
    canZoomIn,
    canZoomOut,
    isDefaultZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    laneMinWidth,
    zoomModifierHeld,
    shiftHeld,
  }
}

export function niceTimeStep(total: number): number {
  if (total <= 0) return 1
  const rough = total / 6
  const candidates = [
    1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400,
  ]
  for (const c of candidates) {
    if (c >= rough) return c
  }
  return candidates[candidates.length - 1]
}
