<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { ScheduledTask } from '@/types'
import { formatDuration, methodKindColor } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


defineProps<{
  /** Workstation/resource key for this lane (e.g. "Furnace") */
  resource: string
  /** Scheduled task segments for this resource */
  tasks: ScheduledTask[]
  /** Total schedule time (denominator for positioning) */
  totalTime: number
  /** Queue offset time for this resource (seconds) */
  queueOffset: number
  /** Whether the queue bar has per-item detail (drives interactivity) */
  hasQueueDetail: boolean
  /** Whether this resource's queue popover is currently open */
  queueActive: boolean
  /** Currently selected node id (drives selection ring) */
  selectedNodeId: string | null
  /** Zoom modifier held (drives cursor + click guard) */
  zoomModifierHeld: boolean
  /** Shift held (drives cursor + click guard) */
  shiftHeld: boolean
  /** Per-task dependency-highlight class resolver */
  barHighlightClasses: (task: ScheduledTask) => string
}>()


const emit = defineEmits<{
  'toggle-queue': [resource: string, event: MouseEvent]
  'bar-click': [task: ScheduledTask, event: MouseEvent]
}>()
</script>

<template>
  <!-- Queue offset bar -->
  <button
    v-if="queueOffset > 0"
    type="button"
    class="gantt-queue-bar absolute bottom-2 top-2 rounded-lg border border-info/40 bg-transparent transition"
    :class="hasQueueDetail ? 'cursor-pointer hover:border-info/70' : 'cursor-default'"
    :style="{
      left: '0%',
      width: `${Math.max(0.3, (queueOffset / totalTime) * 100)}%`,
      boxShadow: queueActive ? 'inset 0 0 0 2px rgb(14 165 233 / 0.7)' : undefined,
    }"
    :disabled="!hasQueueDetail"
    :title="`${t('plannerComponents.gantt.queueTitle')} ${formatDuration(queueOffset)}`"
    @click.stop="emit('toggle-queue', resource, $event)"
  >
    <span
      class="absolute inset-0 flex items-center justify-center text-3xs font-semibold text-info-strong"
    >
      {{ t('plannerComponents.gantt.queue') }}
    </span>
  </button>
  <button
    v-for="task in tasks"
    :key="task.nodeId"
    class="absolute bottom-2 top-2 flex items-center justify-center overflow-hidden rounded-lg border bg-transparent transition-[opacity,box-shadow]"
    :class="[
      task.nodeId === selectedNodeId ? 'ring-2 ring-inset ring-foreground/60' : '',
      zoomModifierHeld ? 'cursor-zoom-in' : shiftHeld ? 'cursor-ew-resize' : 'cursor-pointer',
      barHighlightClasses(task),
    ]"
    :style="{
      left: `${(task.startTime / totalTime) * 100}%`,
      width: `${Math.max(0.3, (task.localTime / totalTime) * 100)}%`,
      borderColor: methodKindColor(task.kind),
    }"
    :title="`${task.itemName} — ${formatDuration(task.localTime)}`"
    @click="!zoomModifierHeld && !shiftHeld && emit('bar-click', task, $event)"
  >
    <img
      v-if="getItemImage({ id: task.itemId })"
      :src="getItemImage({ id: task.itemId })"
      :alt="task.itemName"
      class="size-3.5 shrink-0 object-contain opacity-80"
      loading="lazy"
    />
  </button>
</template>

<style scoped>
/* Queue offset bar — diagonal stripe pattern */
.gantt-queue-bar {
  background: repeating-linear-gradient(
    -45deg,
    rgb(56 189 248 / 0.08),
    rgb(56 189 248 / 0.08) 4px,
    rgb(56 189 248 / 0.18) 4px,
    rgb(56 189 248 / 0.18) 8px
  );
}

/* Dependency highlighting */
.gantt-dimmed {
  opacity: 0.2;
}
.gantt-prereq {
  box-shadow: 0 0 0 2px rgb(251 191 36 / 0.7);
  animation: gantt-pulse 1.5s ease-in-out infinite;
}
.gantt-dependent {
  box-shadow: 0 0 0 2px rgb(56 189 248 / 0.7);
  animation: gantt-pulse 1.5s ease-in-out infinite;
}
@keyframes gantt-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
