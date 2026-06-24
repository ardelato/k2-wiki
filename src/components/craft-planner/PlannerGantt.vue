<script setup lang="ts">
import { Clock3, Layers, Play, Square } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import GanttLane from '@/components/craft-planner/GanttLane.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import GanttZoomControls from '@/components/shared/GanttZoomControls.vue'
import { usePopover } from '@/composables/core/usePopover'
import { useGanttDependencies } from '@/composables/useGanttDependencies'
import { useGanttResources } from '@/composables/useGanttResources'
import { useGanttZoom, niceTimeStep, formatAxisLabel } from '@/composables/useGanttZoom'
import { itemById } from '@/data/indexes'
import type { PlannerNode, PlannerSchedule, ScheduledTask } from '@/types'
import {
  formatDuration,
  formatNumber,
  formatNumberCompact,
  methodKindClasses,
  methodKindColor,
  methodKindLabel,
} from '@/utils/format/format'
import { machinesIcon, sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'
import { mergePassiveTasks, mergeConsecutiveSameItem } from '@/utils/planner/ganttHelpers'

const groupIcons: Record<string, string> = {
  ...sourceIcons,
  Machines: machinesIcon,
  Refining: sourceIcons['Workbench'],
}


const { t } = useI18n()


/**
 * Translate a resource-group label (from getResourceGroupKey) for display.
 * Only chrome words are translated; frozen game terms (Machines, Expeditions,
 * Garden, Fabrication) and raw resource fallbacks pass through as English.
 */
function groupLabelText(label: string): string {
  switch (label) {
    case 'Gathering':
      return t('toolsView.gathering')
    case 'Refining':
      return t('plannerComponents.gantt.categories.refining')
    case 'Merchant':
      return t('summoningPlanner.sourceGroups.merchant')
    default:
      return label
  }
}


/** Get queue offset time for a resource (workstation name like "Furnace") */
function queueOffsetFor(resource: string): number {
  return props.queueOffsets?.[resource] ?? 0
}


const props = defineProps<{
  schedule: PlannerSchedule
  nodesById: Record<string, PlannerNode>
  selectedNodeId: string | null
  /** Queue time offsets per workstation (e.g. { Furnace: 50650 }) */
  queueOffsets?: Record<string, number>
  /** Queued item amounts per itemId */
  queuedAmounts?: Record<string, number>
  /** Queued items per workstation (workstation → itemId → amount), for the queue-bar popover */
  queuedByResource?: Record<string, Record<string, number>>
}>()


const emit = defineEmits<{
  'select-node': [nodeId: string]
}>()


// B1b dual display: total hands-on (active) time = sum of manual gather tasks.
// Everything else (craft/machine/fabrication/garden/expedition/buy) runs passively or instantly.
const activeTime = computed(() =>
  props.schedule.tasks.reduce((sum, t) => (t.kind === 'gather' ? sum + t.localTime : sum), 0),
)


const tasksByResource = computed(() => {
  const map: Record<string, ScheduledTask[]> = {}
  for (const task of props.schedule.tasks) {
    ;(map[task.resource] ??= []).push(task)
  }

  for (const [resource, tasks] of Object.entries(map)) {
    // Merge passive tasks that actually overlap in time (same item, same resource).
    // Machine passives are serialized by mergeSchedules and should NOT be re-merged.
    let merged = mergePassiveTasks(tasks, resource)
    // Merge consecutive same-item tasks (e.g., buy tasks split across trees)
    merged.sort((a, b) => a.startTime - b.startTime)
    merged = mergeConsecutiveSameItem(merged)
    map[resource] = merged
  }

  return map
})


// Group resources into categories for visual grouping
interface ResourceGroup {
  label: string
  resources: string[]
}


const { getResourceGroupKey, getSubRowLabel, getSubRowIcon, isInlineGroup } = useGanttResources({
  nodesById: () => props.nodesById,
})


const groupedResources = computed<ResourceGroup[]>(() => {
  const groups = new Map<string, string[]>()
  const groupOrder: string[] = []

  for (const resource of props.schedule.resourceOrder) {
    const tasks = tasksByResource.value[resource]
    if (!tasks?.length) continue
    const groupKey = getResourceGroupKey(resource, tasks)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
      groupOrder.push(groupKey)
    }
    groups.get(groupKey)!.push(resource)
  }

  return groupOrder.map((key) => ({
    label: key,
    resources: groups.get(key)!,
  }))
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
  const step = niceTimeStep(total, zoom.value)
  const markers = []
  for (let t = 0; t <= total; t += step) {
    markers.push({
      seconds: t,
      pct: (t / total) * 100,
      label: formatAxisLabel(t),
    })
  }
  return markers
})


// Selection & popover state. `activeTask` (dep highlight) is decoupled from the
// popover visibility — a bar's first click only highlights, the second opens.
const activeTask = ref<ScheduledTask | null>(null)
const taskPop = usePopover({ width: 288, gap: 8, allowVerticalFlip: true })


const { prereqNodeIds, dependentNodeIds, barHighlightClasses, activeTaskAmount } =
  useGanttDependencies({
    tasks: () => props.schedule.tasks,
    nodesById: () => props.nodesById,
    queuedAmounts: () => props.queuedAmounts,
    activeTask,
  })


function handleBarClick(task: ScheduledTask, event: MouseEvent) {
  if (activeTask.value?.nodeId === task.nodeId) {
    if (taskPop.isOpen) {
      // Third click on same bar — deselect everything
      activeTask.value = null
      taskPop.close()
    } else {
      // Second click on same bar — open popover
      activeTask.value = task
      positionPopover(event)
    }
    return
  }
  // First click on a new bar — highlight deps, no popover
  activeTask.value = task
  taskPop.close()
  emit('select-node', task.nodeId)
}


function positionPopover(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  taskPop.open(target)
}


function closePopover() {
  activeTask.value = null
  taskPop.close()
}


// Queue-bar popover: what's currently queued at a workstation (mirrors the Awaken timeline
// popover). Only interactive when the consumer passes per-resource queued items.
const activeQueueResource = ref<string | null>(null)
const queuePop = usePopover({ width: 256, gap: 8, hAlign: 'left', allowVerticalFlip: true })


function queuedItemsFor(resource: string): { itemId: string; itemName: string; amount: number }[] {
  const byItem = props.queuedByResource?.[resource]
  if (!byItem) return []
  return Object.entries(byItem)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({
      itemId,
      itemName: itemById.get(itemId)?.name ?? itemId,
      amount,
    }))
    .toSorted((a, b) => a.itemName.localeCompare(b.itemName))
}


function hasQueueDetail(resource: string): boolean {
  return queuedItemsFor(resource).length > 0
}


const activeQueueItems = computed(() =>
  activeQueueResource.value ? queuedItemsFor(activeQueueResource.value) : [],
)


function toggleQueuePopover(resource: string, event: MouseEvent) {
  if (activeQueueResource.value === resource) {
    activeQueueResource.value = null
    queuePop.close()
    return
  }
  // Only one popover open at a time.
  activeTask.value = null
  taskPop.close()
  activeQueueResource.value = resource


  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  queuePop.open(target)
}


function closeQueuePopover() {
  activeQueueResource.value = null
  queuePop.close()
}


const activeTaskGoldCost = computed(() => {
  if (!activeTask.value || activeTask.value.kind !== 'buy') return null
  if (activeTaskAmount.value == null) return null
  const item = itemById.get(activeTask.value.itemId)
  if (!item?.buyValue) return null
  return Math.round(activeTaskAmount.value * item.buyValue)
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
      <GanttZoomControls
        :zoom="zoom"
        :can-zoom-in="canZoomIn"
        :can-zoom-out="canZoomOut"
        :is-default-zoom="isDefaultZoom"
        :reset-label="t('plannerComponents.gantt.resetZoom')"
        :zoom-out-label="t('plannerComponents.gantt.zoomOut')"
        :zoom-in-label="t('plannerComponents.gantt.zoomIn')"
        @reset-zoom="resetZoom"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
      />
    </div>

    <!-- Scrollable timeline area -->
    <div class="flex flex-col gap-0 overflow-x-auto">
      <!-- Time axis header -->
      <div class="flex items-end border-b border-border/60 px-3 pb-2 pl-36 pt-3">
        <div class="relative h-5 flex-1" :style="{ minWidth: laneMinWidth }">
          <span
            v-for="marker in timeMarkers"
            :key="marker.seconds"
            class="absolute font-mono text-2xs font-semibold text-foreground/70"
            :style="{ left: `${marker.pct}%` }"
          >
            {{ marker.label }}
          </span>
        </div>
      </div>

      <!-- Grouped resource lanes -->
      <template v-for="group in groupedResources" :key="group.label">
        <!-- Single-resource group that is NOT a known multi-group — inline bar in header row -->
        <template v-if="group.resources.length === 1 && !isInlineGroup(group.label)">
          <div class="flex items-center border-b border-border/40">
            <div
              class="flex w-36 shrink-0 items-center gap-1.5 px-3 py-3 text-xs font-bold text-foreground/80"
            >
              <img
                v-if="groupIcons[group.label]"
                :src="groupIcons[group.label]"
                alt=""
                class="size-4 shrink-0"
                loading="lazy"
              />
              {{ groupLabelText(group.label) }}
            </div>
            <!-- Lane with individually positioned task segments -->
            <div
              class="relative flex-1 py-2"
              :style="{ minWidth: laneMinWidth, minHeight: '44px' }"
              @click.self="closePopover"
            >
              <GanttLane
                :resource="group.resources[0]"
                :tasks="tasksByResource[group.resources[0]]"
                :total-time="schedule.totalTime"
                :queue-offset="queueOffsetFor(group.resources[0])"
                :has-queue-detail="hasQueueDetail(group.resources[0])"
                :queue-active="activeQueueResource === group.resources[0]"
                :selected-node-id="selectedNodeId"
                :zoom-modifier-held="zoomModifierHeld"
                :shift-held="shiftHeld"
                :bar-highlight-classes="barHighlightClasses"
                @toggle-queue="toggleQueuePopover"
                @bar-click="handleBarClick"
              />
            </div>
          </div>
        </template>

        <!-- Multi-resource group — header + sub-rows -->
        <template v-else>
          <!-- Group header -->
          <div class="flex items-center border-b border-border/40 bg-card/40">
            <div class="flex w-36 shrink-0 items-center gap-1.5 px-3 py-2">
              <img
                v-if="groupIcons[group.label]"
                :src="groupIcons[group.label]"
                alt=""
                class="size-4 shrink-0"
                loading="lazy"
              />
              <span class="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                {{ groupLabelText(group.label) }}
              </span>
              <span class="text-3xs text-muted-foreground/40">
                ({{ group.resources.length }})
              </span>
            </div>
            <div class="flex-1" :style="{ minWidth: laneMinWidth }" />
          </div>

          <!-- Resource lanes within group -->
          <div
            v-for="resource in group.resources"
            :key="resource"
            class="flex items-center border-b border-border/40"
          >
            <!-- Resource label (indented) -->
            <div
              class="flex w-36 shrink-0 items-center gap-1.5 py-3 pl-6 pr-3 text-xs font-semibold leading-tight text-foreground/70"
            >
              <img
                v-if="getSubRowIcon(resource, tasksByResource[resource])"
                :src="getSubRowIcon(resource, tasksByResource[resource])"
                alt=""
                class="size-3.5 shrink-0 object-contain"
                loading="lazy"
              />
              {{ getSubRowLabel(resource, tasksByResource[resource]) }}
            </div>

            <!-- Buy lane: dashed line for gold generation + marker at buy point -->
            <div
              v-if="resource.startsWith('Buy:')"
              class="relative flex-1 py-2"
              :style="{ minWidth: laneMinWidth, minHeight: '44px' }"
              @click.self="closePopover"
            >
              <template v-for="task in tasksByResource[resource]" :key="task.nodeId">
                <!-- Dashed line: gold generation period -->
                <div
                  class="absolute top-1/2 h-px -translate-y-1/2 border-t-2 border-dashed opacity-50 transition-opacity"
                  :class="barHighlightClasses(task)"
                  :style="{
                    left: `${(task.startTime / schedule.totalTime) * 100}%`,
                    width: `${(task.localTime / schedule.totalTime) * 100}%`,
                    borderColor: methodKindColor(task.kind),
                  }"
                />
                <!-- Marker at buy point -->
                <button
                  class="absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-[opacity,box-shadow]"
                  :class="[
                    task.nodeId === selectedNodeId ? 'ring-2 ring-foreground/60' : '',
                    zoomModifierHeld
                      ? 'cursor-zoom-in'
                      : shiftHeld
                        ? 'cursor-ew-resize'
                        : 'cursor-pointer',
                    barHighlightClasses(task),
                  ]"
                  :style="{
                    left: `${(task.endTime / schedule.totalTime) * 100}%`,
                    borderColor: methodKindColor(task.kind),
                    backgroundColor: 'hsl(var(--card))',
                  }"
                  :aria-label="`${task.itemName} — ${t('plannerComponents.gantt.buyAtTitle')} ${formatDuration(task.endTime)}`"
                  @click="!zoomModifierHeld && !shiftHeld && handleBarClick(task, $event)"
                >
                  <img
                    v-if="getItemImage({ id: task.itemId })"
                    :src="getItemImage({ id: task.itemId })"
                    :alt="task.itemName"
                    class="size-3.5 shrink-0 object-contain"
                    loading="lazy"
                  />
                </button>
              </template>
            </div>

            <!-- Standard lane: individually positioned task segments -->
            <div
              v-else
              class="relative flex-1 py-2"
              :style="{ minWidth: laneMinWidth, minHeight: '44px' }"
              @click.self="closePopover"
            >
              <GanttLane
                :resource="resource"
                :tasks="tasksByResource[resource]"
                :total-time="schedule.totalTime"
                :queue-offset="queueOffsetFor(resource)"
                :has-queue-detail="hasQueueDetail(resource)"
                :queue-active="activeQueueResource === resource"
                :selected-node-id="selectedNodeId"
                :zoom-modifier-held="zoomModifierHeld"
                :shift-held="shiftHeld"
                :bar-highlight-classes="barHighlightClasses"
                @toggle-queue="toggleQueuePopover"
                @bar-click="handleBarClick"
              />
            </div>
          </div>
        </template>
      </template>

      <!-- Empty state -->
      <div v-if="schedule.tasks.length === 0" class="px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">
          {{ t('plannerComponents.gantt.noTasks') }}
        </p>
      </div>
    </div>

    <!-- Total time footer (outside scroll area, stays pinned) -->
    <div
      v-if="schedule.tasks.length > 0"
      class="flex items-center justify-end border-t border-border/40 px-4 pb-3 pt-3"
    >
      <span class="text-xs font-bold text-foreground/80">
        {{ t('plannerComponents.gantt.total') }}
        <span class="font-mono" style="color: var(--color-green)">{{
          formatDuration(activeTime)
        }}</span>
        <span class="font-normal text-muted-foreground/60">
          {{ t('plannerComponents.gantt.active') }} ·
          <span class="font-mono">{{ formatDuration(schedule.totalTime) }}</span>
          {{ t('plannerComponents.gantt.elapsed') }}
        </span>
      </span>
    </div>
  </div>

  <!-- Popover -->
  <Teleport to="body">
    <div v-if="taskPop.isOpen && activeTask" class="fixed inset-0 z-40" @click="closePopover" />
  </Teleport>
  <FloatingPanel
    :is-open="taskPop.isOpen"
    :el-ref="taskPop.setPanelEl"
    :style="taskPop.style"
    class="z-50 w-72 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
    @click.stop
  >
    <template v-if="activeTask">
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
            class="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-3xs font-bold"
            :class="methodKindClasses(activeTask.kind)"
          >
            {{ methodKindLabel(activeTask.kind) }}
          </span>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ activeTask.resource }}
        </p>
      </div>

      <!-- Stats -->
      <div class="flex flex-col gap-2 px-4 py-3">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5">
            <Clock3 class="size-3 shrink-0" style="color: var(--color-green)" />
            <span class="text-muted-foreground">{{ t('plannerComponents.gantt.duration') }}</span>
          </div>
          <span class="font-mono font-semibold text-foreground">{{
            formatDuration(activeTask.localTime)
          }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5">
            <Layers class="size-3 shrink-0 text-primary" />
            <span class="text-muted-foreground">{{ t('plannerComponents.gantt.amount') }}</span>
          </div>
          <span class="font-mono font-semibold text-foreground">
            {{
              activeTaskAmount != null
                ? `×${formatNumberCompact(Math.round(activeTaskAmount))}`
                : '—'
            }}
          </span>
        </div>
        <div v-if="activeTaskGoldCost != null" class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5">
            <img
              v-if="getItemImage({ id: 'gold' })"
              :src="getItemImage({ id: 'gold' })"
              alt="Gold"
              class="size-3 shrink-0 object-contain"
            />
            <span class="text-muted-foreground">{{ t('plannerComponents.gantt.gold') }}</span>
          </div>
          <span class="font-mono font-semibold" style="color: var(--color-yellow)">
            {{ formatNumber(activeTaskGoldCost) }}
          </span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5">
            <Play class="size-3 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{{ t('plannerComponents.gantt.start') }}</span>
          </div>
          <span class="font-mono font-semibold text-foreground">{{
            formatDuration(activeTask.startTime)
          }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5">
            <Square class="size-3 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{{ t('plannerComponents.gantt.end') }}</span>
          </div>
          <span class="font-mono font-semibold text-foreground">{{
            formatDuration(activeTask.endTime)
          }}</span>
        </div>
      </div>
      <!-- Dependency legend -->
      <div
        v-if="prereqNodeIds.size > 0 || dependentNodeIds.size > 0"
        class="flex items-center gap-3 border-t border-border/40 px-4 py-2"
      >
        <div
          v-if="prereqNodeIds.size > 0"
          class="flex items-center gap-1.5 text-3xs text-muted-foreground"
        >
          <span class="inline-block size-2 rounded-full bg-warning/80" />
          {{ prereqNodeIds.size }} {{ t('plannerComponents.gantt.prereqs') }}
        </div>
        <div
          v-if="dependentNodeIds.size > 0"
          class="flex items-center gap-1.5 text-3xs text-muted-foreground"
        >
          <span class="inline-block size-2 rounded-full bg-info/80" />
          {{ dependentNodeIds.size }} {{ t('plannerComponents.gantt.dependents') }}
        </div>
      </div>
    </template>
  </FloatingPanel>

  <!-- Queue-bar popover: what's currently queued at a workstation -->
  <Teleport to="body">
    <div
      v-if="queuePop.isOpen && activeQueueResource"
      class="fixed inset-0 z-40"
      @click="closeQueuePopover"
    />
  </Teleport>
  <FloatingPanel
    :is-open="queuePop.isOpen"
    :el-ref="queuePop.setPanelEl"
    :style="queuePop.style"
    class="z-50 w-64 rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
    @click.stop
  >
    <template v-if="activeQueueResource">
      <!-- Header -->
      <div class="border-b border-border/40 px-4 py-3">
        <div class="flex items-center gap-2">
          <Clock3 class="size-4 shrink-0 text-info-strong" />
          <p class="truncate text-sm font-bold text-foreground">
            {{ t('plannerComponents.gantt.resourceQueue', { resource: activeQueueResource }) }}
          </p>
          <span class="ml-auto whitespace-nowrap font-mono text-xs font-semibold text-info-strong">
            {{ formatDuration(queueOffsetFor(activeQueueResource)) }}
          </span>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ t('plannerComponents.gantt.alreadyQueued') }}
        </p>
      </div>

      <!-- Queued items -->
      <div class="px-4 py-3">
        <div v-if="activeQueueItems.length > 0" class="space-y-2">
          <div v-for="item in activeQueueItems" :key="item.itemId" class="flex items-center gap-2">
            <img
              v-if="getItemImage({ id: item.itemId })"
              :src="getItemImage({ id: item.itemId })"
              :alt="item.itemName"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{{
              item.itemName
            }}</span>
            <span class="shrink-0 font-mono text-xs font-semibold text-foreground"
              >&times;{{ formatNumber(item.amount) }}</span
            >
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground">
          {{ t('plannerComponents.gantt.noQueuedItems') }}
        </p>
      </div>
    </template>
  </FloatingPanel>
</template>

<style scoped>
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
