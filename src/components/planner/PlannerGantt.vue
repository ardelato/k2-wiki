<script setup lang="ts">
import { Clock3, Minus, Plus, RotateCcw } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'

import { useGanttZoom, niceTimeStep } from '@/composables/useGanttZoom'
import type { PlannerNode, PlannerSchedule, ScheduledTask } from '@/types'
import { formatDuration, methodKindClasses, methodKindLabel } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

function humanAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}


const props = defineProps<{
  schedule: PlannerSchedule
  nodesById: Record<string, PlannerNode>
  selectedNodeId: string | null
}>()


const emit = defineEmits<{
  'select-node': [nodeId: string]
}>()


const tasksByResource = computed(() => {
  const map: Record<string, ScheduledTask[]> = {}
  for (const task of props.schedule.tasks) {
    ;(map[task.resource] ??= []).push(task)
  }
  for (const tasks of Object.values(map)) {
    tasks.sort((a, b) => a.startTime - b.startTime)
  }
  return map
})


const ganttRef = ref<HTMLElement | null>(null)
const {
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
} = useGanttZoom(ganttRef)


const timeMarkers = computed(() => {
  const total = props.schedule.totalTime
  if (total <= 0) return []
  const step = niceTimeStep(total)
  const markers = []
  for (let t = 0; t <= total; t += step) {
    markers.push({ seconds: t, pct: (t / total) * 100, label: formatDuration(t) })
  }
  return markers
})


// Popover state
const activeTask = ref<ScheduledTask | null>(null)
const popoverStyle = ref<Record<string, string>>({})
const popoverRef = ref<HTMLElement | null>(null)


function togglePopover(task: ScheduledTask, event: MouseEvent) {
  if (activeTask.value === task) {
    activeTask.value = null
    return
  }
  activeTask.value = task
  emit('select-node', task.nodeId)


  const target = event.currentTarget as HTMLElement
  if (!target) return


  const barRect = target.getBoundingClientRect()
  const POPOVER_WIDTH = 288
  const GAP = 8


  let top = barRect.bottom + GAP
  let left = barRect.left + barRect.width / 2 - POPOVER_WIDTH / 2


  if (left + POPOVER_WIDTH > window.innerWidth - GAP) {
    left = window.innerWidth - POPOVER_WIDTH - GAP
  }
  if (left < GAP) left = GAP


  popoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }


  nextTick(() => {
    if (!popoverRef.value) return
    const popRect = popoverRef.value.getBoundingClientRect()
    if (popRect.bottom > window.innerHeight - GAP) {
      popoverStyle.value = {
        position: 'fixed',
        top: `${barRect.top - popRect.height - GAP}px`,
        left: `${left}px`,
      }
    }
  })
}


function closePopover() {
  activeTask.value = null
}


const activeTaskNode = computed(() => {
  if (!activeTask.value) return null
  return props.nodesById[activeTask.value.nodeId] ?? null
})
</script>

<template>
  <div
    ref="ganttRef"
    class="surface-card overflow-hidden"
    :class="zoomModifierHeld ? 'cursor-zoom-in' : shiftHeld ? 'cursor-ew-resize' : ''"
  >
    <!-- Zoom controls -->
    <div class="flex items-center justify-end gap-2 border-b border-border/40 px-4 py-2">
      <button
        class="focus-ring flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        :class="isDefaultZoom ? 'invisible' : ''"
        title="Reset zoom"
        @click="resetZoom"
      >
        <RotateCcw class="size-3" />
        Reset
      </button>
      <span class="text-[11px] font-semibold text-muted-foreground">{{ zoom }}x</span>
      <div class="inline-flex items-center overflow-hidden rounded-lg border border-border/60">
        <button
          class="focus-ring flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          :disabled="!canZoomOut"
          title="Zoom out"
          @click="zoomOut"
        >
          <Minus class="size-3.5" />
        </button>
        <button
          class="focus-ring flex h-7 w-7 items-center justify-center border-l border-border/60 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          :disabled="!canZoomIn"
          title="Zoom in"
          @click="zoomIn"
        >
          <Plus class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Scrollable timeline area -->
    <div class="flex flex-col gap-0 overflow-x-auto">
      <!-- Time axis header -->
      <div class="flex items-end border-b border-border/60 px-3 pb-2 pl-36 pt-3">
        <div class="relative h-5 flex-1" :style="{ minWidth: laneMinWidth }">
          <span
            v-for="marker in timeMarkers"
            :key="marker.seconds"
            class="absolute font-mono text-[11px] font-semibold text-foreground/70"
            :style="{ left: `${marker.pct}%` }"
          >
            {{ marker.label }}
          </span>
        </div>
      </div>

      <!-- Resource lanes -->
      <div
        v-for="resource in schedule.resourceOrder"
        :key="resource"
        class="flex items-center border-b border-border/40"
      >
        <!-- Resource label -->
        <div
          class="flex w-36 shrink-0 items-center gap-1.5 truncate px-3 py-3 text-xs font-bold text-foreground/80"
        >
          <img
            v-if="sourceIcons[resource]"
            :src="sourceIcons[resource]"
            alt=""
            class="size-3.5 shrink-0"
            loading="lazy"
          />
          <img
            v-else-if="getItemImage({ id: tasksByResource[resource]?.[0]?.itemId ?? '' })"
            :src="getItemImage({ id: tasksByResource[resource]?.[0]?.itemId ?? '' })"
            alt=""
            class="size-3.5 shrink-0 object-contain"
            loading="lazy"
          />
          {{ resource }}
        </div>
        <!-- Lane with task bars -->
        <div class="relative flex-1 py-2" :style="{ minWidth: laneMinWidth, minHeight: '44px' }">
          <button
            v-for="task in tasksByResource[resource]"
            :key="task.nodeId"
            class="absolute bottom-2 top-2 flex items-center gap-1.5 truncate rounded border px-2 text-[11px] font-bold transition-colors"
            :class="[
              task.nodeId === selectedNodeId ? 'ring-2 ring-primary' : '',
              methodKindClasses(task.kind),
              zoomModifierHeld
                ? 'cursor-zoom-in'
                : shiftHeld
                  ? 'cursor-ew-resize'
                  : 'cursor-pointer',
            ]"
            :style="{
              left: `${(task.startTime / schedule.totalTime) * 100}%`,
              width: `${(task.localTime / schedule.totalTime) * 100}%`,
            }"
            :title="`${task.itemName} — ${formatDuration(task.localTime)}`"
            @click="!zoomModifierHeld && !shiftHeld && togglePopover(task, $event)"
          >
            <img
              v-if="getItemImage({ id: task.itemId })"
              :src="getItemImage({ id: task.itemId })"
              :alt="task.itemName"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="truncate">{{ task.itemName }}</span>
            <span
              v-if="(nodesById[task.nodeId]?.requiredAmount ?? task.passive?.produced ?? 0) > 0"
              class="shrink-0 font-mono text-[10px] opacity-70"
              >×{{
                humanAmount(
                  Math.round(nodesById[task.nodeId]?.requiredAmount ?? task.passive?.produced ?? 0),
                )
              }}</span
            >
            <span class="ml-auto shrink-0 pl-1 font-mono text-[10px] opacity-80">{{
              formatDuration(task.localTime)
            }}</span>
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="schedule.tasks.length === 0" class="px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">No scheduled tasks to display.</p>
      </div>
    </div>

    <!-- Total time footer (outside scroll area, stays pinned) -->
    <div
      v-if="schedule.tasks.length > 0"
      class="flex items-center justify-end border-t border-border/40 px-4 pb-3 pt-3"
    >
      <span class="text-xs font-bold text-foreground/80">
        Total:
        <span class="font-mono" style="color: var(--color-green)">{{
          formatDuration(schedule.totalTime)
        }}</span>
      </span>
    </div>
  </div>

  <!-- Popover -->
  <Teleport to="body">
    <div v-if="activeTask" class="fixed inset-0 z-40" @click="closePopover" />
    <Transition name="popover">
      <div
        v-if="activeTask"
        ref="popoverRef"
        class="z-50 w-72 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
        :style="popoverStyle"
        @click.stop
      >
        <!-- Header -->
        <div class="border-b border-border/40 px-4 py-3">
          <div class="flex items-center gap-2">
            <img
              v-if="getItemImage({ id: activeTask.itemId })"
              :src="getItemImage({ id: activeTask.itemId })"
              :alt="activeTask.itemName"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <p class="truncate text-sm font-bold text-foreground">
              {{ activeTask.itemName }}
            </p>
            <span
              class="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold"
              :class="methodKindClasses(activeTask.kind)"
            >
              {{ methodKindLabel(activeTask.kind) }}
            </span>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ activeTask.resource }}</p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3">
          <div class="flex items-center gap-1.5 text-xs">
            <Clock3 class="size-3 shrink-0" style="color: var(--color-green)" />
            <span class="text-muted-foreground">Duration</span>
            <span class="ml-auto font-mono font-semibold text-foreground">{{
              formatDuration(activeTask.localTime)
            }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="size-3 shrink-0 text-center text-[10px] font-black text-primary">#</span>
            <span class="text-muted-foreground">Amount</span>
            <span class="ml-auto font-mono font-semibold text-foreground">
              {{
                activeTaskNode ? `×${humanAmount(Math.round(activeTaskNode.requiredAmount))}` : '—'
              }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="size-3 shrink-0 text-center text-[10px] font-black text-muted-foreground"
              >▶</span
            >
            <span class="text-muted-foreground">Start</span>
            <span class="ml-auto font-mono font-semibold text-foreground">{{
              formatDuration(activeTask.startTime)
            }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="size-3 shrink-0 text-center text-[10px] font-black text-muted-foreground"
              >■</span
            >
            <span class="text-muted-foreground">End</span>
            <span class="ml-auto font-mono font-semibold text-foreground">{{
              formatDuration(activeTask.endTime)
            }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popover-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.popover-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
