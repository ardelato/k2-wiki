<script setup lang="ts">
import { Minus, Plus, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useGanttZoom, niceTimeStep } from '@/composables/useGanttZoom'
import type { PlannerNode, PlannerSchedule, ScheduledTask } from '@/types'
import { formatDuration, methodKindClasses } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

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
      <div class="flex items-end border-b border-border/60 px-3 pb-2 pl-28 pt-3">
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
          class="flex w-28 shrink-0 items-center gap-1.5 truncate px-3 py-3 text-xs font-bold text-foreground/80"
        >
          <img
            v-if="sourceIcons[resource]"
            :src="sourceIcons[resource]"
            alt=""
            class="size-3.5 shrink-0"
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
            :title="`${task.itemName} — ${formatDuration(task.localTime)} (${formatDuration(task.startTime)} → ${formatDuration(task.endTime)})`"
            @click="!zoomModifierHeld && !shiftHeld && emit('select-node', task.nodeId)"
          >
            <img
              v-if="getItemImage({ id: task.itemId })"
              :src="getItemImage({ id: task.itemId })"
              :alt="task.itemName"
              class="size-4 shrink-0 object-contain"
            />
            <span class="truncate">{{ task.itemName }}</span>
            <span v-if="nodesById[task.nodeId]" class="shrink-0 text-[10px] opacity-70"
              >x{{ Math.round(nodesById[task.nodeId].requiredAmount) }}</span
            >
            <span class="ml-auto shrink-0 pl-1 font-mono text-[10px] opacity-70">{{
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
</template>
