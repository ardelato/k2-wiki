<script setup lang="ts">
import { Clock3, Layers, Minus, Play, Plus, RotateCcw, Square } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useGanttZoom, niceTimeStep, formatAxisLabel } from '@/composables/useGanttZoom'
import { activeLocale } from '@/i18n'

const { t } = useI18n()
import { itemById } from '@/data/indexes'
import type { PlannerNode, PlannerSchedule, ScheduledTask } from '@/types'
import { formatDuration, methodKindClasses, methodKindColor, methodKindLabel } from '@/utils/format'
import {
  mergePassiveTasks,
  mergeConsecutiveSameItem,
  getResourceGroupKey,
} from '@/utils/ganttHelpers'
import { machinesIcon, sourceIcons } from '@/utils/icons'

const groupIcons: Record<string, string> = {
  ...sourceIcons,
  Machines: machinesIcon,
  Refining: sourceIcons['Workbench'],
}


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
import { getItemImage } from '@/utils/itemImages'

function humanAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString(activeLocale())
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
}>()


const emit = defineEmits<{
  'select-node': [nodeId: string]
}>()


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


// Garden essence → flower display name mapping
const essenceToFlower: Record<string, string> = {
  'Raw Fire Essence': 'Fire Flower',
  'Raw Wind Essence': 'Wind Flower',
  'Raw Earth Essence': 'Earth Flower',
  'Raw Water Essence': 'Water Flower',
}


const essenceToFlowerId: Record<string, string> = {
  'raw-fire-essence': 'fire-flower',
  'raw-wind-essence': 'wind-flower',
  'raw-earth-essence': 'earth-flower',
  'raw-water-essence': 'water-flower',
}


function getSubRowLabel(resource: string, tasks: ScheduledTask[]): string {
  const stripped = resource.replace(/^(Machine|Garden|Expedition|Fabrication|Buy): /, '')
  // Garden: show flower name instead of essence
  if (resource.startsWith('Garden:')) return essenceToFlower[stripped] ?? stripped
  // Expedition: show expedition name from method title
  if (resource.startsWith('Expedition:')) {
    const task = tasks?.[0]
    if (task) {
      const node = props.nodesById[task.nodeId]
      if (node) {
        const method = node.methods.find((m) => m.kind === 'expedition')
        if (method?.title) return method.title
      }
    }
  }
  return stripped
}


function getSubRowIcon(resource: string, tasks: ScheduledTask[]): string | undefined {
  // Garden: show flower image
  if (resource.startsWith('Garden:')) {
    const itemId = tasks?.[0]?.itemId ?? ''
    const flowerId = essenceToFlowerId[itemId]
    if (flowerId) return getItemImage({ id: flowerId })
  }
  // Expedition: show the reward item image
  if (resource.startsWith('Expedition:')) {
    const itemId = tasks?.[0]?.itemId ?? ''
    if (itemId) return getItemImage({ id: itemId })
  }
  // Fabrication / Merchant: show the item image
  if (resource.startsWith('Fabrication:') || resource.startsWith('Buy:')) {
    const itemId = tasks?.[0]?.itemId ?? ''
    if (itemId) return getItemImage({ id: itemId })
  }
  // For all other sub-rows, use the source icon (job/workstation icon) not the item image
  const task = tasks?.[0]
  if (task)
    return (
      sourceIcons[task.resource.replace(/^(Machine|Garden|Expedition|Fabrication|Buy): /, '')] ??
      sourceIcons[task.resource]
    )
  return undefined
}


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
    markers.push({ seconds: t, pct: (t / total) * 100, label: formatAxisLabel(t) })
  }
  return markers
})


// Selection & popover state
const activeTask = ref<ScheduledTask | null>(null)
const popoverVisible = ref(false)
const popoverStyle = ref<Record<string, string>>({})
const popoverRef = ref<HTMLElement | null>(null)


function handleBarClick(task: ScheduledTask, event: MouseEvent) {
  if (activeTask.value?.nodeId === task.nodeId) {
    if (popoverVisible.value) {
      // Third click on same bar — deselect everything
      activeTask.value = null
      popoverVisible.value = false
    } else {
      // Second click on same bar — open popover
      activeTask.value = task
      popoverVisible.value = true
      positionPopover(event)
    }
    return
  }
  // First click on a new bar — highlight deps, no popover
  activeTask.value = task
  popoverVisible.value = false
  emit('select-node', task.nodeId)
}


function positionPopover(event: MouseEvent) {
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
  popoverVisible.value = false
}


const activeTaskNode = computed(() => {
  if (!activeTask.value) return null
  const task = activeTask.value
  return props.nodesById[task.passive?.linkedNodeId ?? task.nodeId] ?? null
})


/** Total required amount across all merged nodes (for consolidated bars), minus queued. */
const activeTaskAmount = computed(() => {
  if (!activeTask.value) return null
  const task = activeTask.value as ScheduledTask & { _mergedNodeIds?: string[] }
  const nodeIds = task._mergedNodeIds ?? [task.passive?.linkedNodeId ?? task.nodeId]
  let total = 0
  for (const id of nodeIds) {
    const node = props.nodesById[id]
    if (node) total += node.requiredAmount
  }
  const raw = total > 0 ? total : (activeTaskNode.value?.requiredAmount ?? null)
  if (raw == null) return null
  const itemId = activeTask.value.itemId
  const queued = props.queuedAmounts?.[itemId] ?? 0
  return Math.max(0, raw - queued)
})


const activeTaskGoldCost = computed(() => {
  if (!activeTask.value || activeTask.value.kind !== 'buy') return null
  if (activeTaskAmount.value == null) return null
  const item = itemById.get(activeTask.value.itemId)
  if (!item?.buyValue) return null
  return Math.round(activeTaskAmount.value * item.buyValue)
})


// ── Dependency highlighting ──────────────────────────────────────────


const taskByNodeId = computed(() => {
  const map = new Map<string, ScheduledTask>()
  for (const task of props.schedule.tasks) map.set(task.nodeId, task)
  return map
})


const dependentsOf = computed(() => {
  const map = new Map<string, string[]>()
  for (const task of props.schedule.tasks) {
    for (const dep of task.dependencies ?? []) {
      const list = map.get(dep)
      if (list) list.push(task.nodeId)
      else map.set(dep, [task.nodeId])
    }
  }
  return map
})


/** Transitive closure walking upstream (prerequisites). */
function collectTransitive(startIds: string[], getNext: (id: string) => string[]): Set<string> {
  const visited = new Set<string>()
  const stack = [...startIds]
  while (stack.length) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const next of getNext(id)) stack.push(next)
  }
  return visited
}


const prereqNodeIds = computed<Set<string>>(() => {
  if (!activeTask.value) return new Set()
  const task = activeTask.value as ScheduledTask & { _mergedNodeIds?: string[] }
  const rootIds = task._mergedNodeIds ?? [task.nodeId]
  // Collect all direct deps of the root node(s) as starting points
  const seedDeps: string[] = []
  for (const id of rootIds) {
    const t = taskByNodeId.value.get(id)
    if (t?.dependencies) seedDeps.push(...t.dependencies)
  }
  return collectTransitive(seedDeps, (id) => taskByNodeId.value.get(id)?.dependencies ?? [])
})


const dependentNodeIds = computed<Set<string>>(() => {
  if (!activeTask.value) return new Set()
  const task = activeTask.value as ScheduledTask & { _mergedNodeIds?: string[] }
  const rootIds = task._mergedNodeIds ?? [task.nodeId]
  // Collect all direct dependents of the root node(s) as starting points
  const seedDeps: string[] = []
  for (const id of rootIds) {
    for (const dep of dependentsOf.value.get(id) ?? []) seedDeps.push(dep)
  }
  return collectTransitive(seedDeps, (id) => dependentsOf.value.get(id) ?? [])
})


function barHighlightClasses(task: ScheduledTask): string {
  if (!activeTask.value) return ''
  const t = task as ScheduledTask & { _mergedNodeIds?: string[] }
  const ids = t._mergedNodeIds ?? [task.nodeId]
  // Check if this IS the active bar
  const activeIds = (activeTask.value as ScheduledTask & { _mergedNodeIds?: string[] })
    ._mergedNodeIds ?? [activeTask.value.nodeId]
  if (ids.some((id) => activeIds.includes(id))) return ''
  // Prereq
  if (ids.some((id) => prereqNodeIds.value.has(id))) return 'gantt-prereq'
  // Dependent
  if (ids.some((id) => dependentNodeIds.value.has(id))) return 'gantt-dependent'
  // Unrelated
  return 'gantt-dimmed'
}
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
        :title="t('plannerComponents.gantt.resetZoom')"
        @click="resetZoom"
      >
        <RotateCcw class="size-3" />
        {{ t('plannerComponents.gantt.resetZoom') }}
      </button>
      <span class="text-[11px] font-semibold text-muted-foreground">{{ zoom }}x</span>
      <div class="inline-flex items-center overflow-hidden rounded-lg border border-border/60">
        <button
          class="focus-ring flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          :disabled="!canZoomOut"
          :title="t('plannerComponents.gantt.zoomOut')"
          @click="zoomOut"
        >
          <Minus class="size-3.5" />
        </button>
        <button
          class="focus-ring flex h-7 w-7 items-center justify-center border-l border-border/60 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          :disabled="!canZoomIn"
          :title="t('plannerComponents.gantt.zoomIn')"
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

      <!-- Grouped resource lanes -->
      <template v-for="group in groupedResources" :key="group.label">
        <!-- Single-resource group that is NOT a known multi-group — inline bar in header row -->
        <template
          v-if="
            group.resources.length === 1 &&
            ![
              'Gathering',
              'Refining',
              'Machines',
              'Expeditions',
              'Garden',
              'Fabrication',
              'Merchant',
            ].includes(group.label)
          "
        >
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
              <!-- Queue offset bar -->
              <div
                v-if="queueOffsetFor(group.resources[0]) > 0"
                class="gantt-queue-bar absolute bottom-2 top-2 rounded-lg border border-sky-500/40"
                :style="{
                  left: '0%',
                  width: `${Math.max(0.3, (queueOffsetFor(group.resources[0]) / schedule.totalTime) * 100)}%`,
                }"
                :title="`${t('plannerComponents.gantt.queueTitle')} ${formatDuration(queueOffsetFor(group.resources[0]))}`"
              >
                <span
                  class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-sky-600 dark:text-sky-400"
                >
                  {{ t('plannerComponents.gantt.queue') }}
                </span>
              </div>
              <button
                v-for="task in tasksByResource[group.resources[0]]"
                :key="task.nodeId"
                class="absolute bottom-2 top-2 flex items-center justify-center overflow-hidden rounded-lg border bg-transparent transition-[opacity,box-shadow]"
                :class="[
                  task.nodeId === selectedNodeId ? 'ring-2 ring-inset ring-foreground/60' : '',
                  zoomModifierHeld
                    ? 'cursor-zoom-in'
                    : shiftHeld
                      ? 'cursor-ew-resize'
                      : 'cursor-pointer',
                  barHighlightClasses(task),
                ]"
                :style="{
                  left: `${(task.startTime / schedule.totalTime) * 100}%`,
                  width: `${Math.max(0.3, (task.localTime / schedule.totalTime) * 100)}%`,
                  borderColor: methodKindColor(task.kind),
                }"
                :title="`${task.itemName} — ${formatDuration(task.localTime)}`"
                @click="!zoomModifierHeld && !shiftHeld && handleBarClick(task, $event)"
              >
                <img
                  v-if="getItemImage({ id: task.itemId })"
                  :src="getItemImage({ id: task.itemId })"
                  :alt="task.itemName"
                  class="size-3.5 shrink-0 object-contain opacity-80"
                  loading="lazy"
                />
              </button>
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
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {{ groupLabelText(group.label) }}
              </span>
              <span class="text-[10px] text-muted-foreground/40">
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
                  :title="`${task.itemName} — ${t('plannerComponents.gantt.buyAtTitle')} ${formatDuration(task.endTime)}`"
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
              <!-- Queue offset bar -->
              <div
                v-if="queueOffsetFor(resource) > 0"
                class="gantt-queue-bar absolute bottom-2 top-2 rounded-lg border border-sky-500/40"
                :style="{
                  left: '0%',
                  width: `${Math.max(0.3, (queueOffsetFor(resource) / schedule.totalTime) * 100)}%`,
                }"
                :title="`${t('plannerComponents.gantt.queueTitle')} ${formatDuration(queueOffsetFor(resource))}`"
              >
                <span
                  class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-sky-600 dark:text-sky-400"
                >
                  {{ t('plannerComponents.gantt.queue') }}
                </span>
              </div>
              <button
                v-for="task in tasksByResource[resource]"
                :key="task.nodeId"
                class="absolute bottom-2 top-2 flex items-center justify-center overflow-hidden rounded-lg border bg-transparent transition-[opacity,box-shadow]"
                :class="[
                  task.nodeId === selectedNodeId ? 'ring-2 ring-inset ring-foreground/60' : '',
                  zoomModifierHeld
                    ? 'cursor-zoom-in'
                    : shiftHeld
                      ? 'cursor-ew-resize'
                      : 'cursor-pointer',
                  barHighlightClasses(task),
                ]"
                :style="{
                  left: `${(task.startTime / schedule.totalTime) * 100}%`,
                  width: `${Math.max(0.3, (task.localTime / schedule.totalTime) * 100)}%`,
                  borderColor: methodKindColor(task.kind),
                }"
                :title="`${task.itemName} — ${formatDuration(task.localTime)}`"
                @click="!zoomModifierHeld && !shiftHeld && handleBarClick(task, $event)"
              >
                <img
                  v-if="getItemImage({ id: task.itemId })"
                  :src="getItemImage({ id: task.itemId })"
                  :alt="task.itemName"
                  class="size-3.5 shrink-0 object-contain opacity-80"
                  loading="lazy"
                />
              </button>
            </div>
          </div>
        </template>
      </template>

      <!-- Empty state -->
      <div v-if="schedule.tasks.length === 0" class="px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">{{ t('plannerComponents.gantt.noTasks') }}</p>
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
          formatDuration(schedule.totalTime)
        }}</span>
      </span>
    </div>
  </div>

  <!-- Popover -->
  <Teleport to="body">
    <div v-if="popoverVisible && activeTask" class="fixed inset-0 z-40" @click="closePopover" />
    <Transition name="popover">
      <div
        v-if="popoverVisible && activeTask"
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
              {{ activeTaskAmount != null ? `×${humanAmount(Math.round(activeTaskAmount))}` : '—' }}
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
              {{ activeTaskGoldCost.toLocaleString(activeLocale()) }}
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
            class="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span class="inline-block size-2 rounded-full bg-amber-400/80" />
            {{ prereqNodeIds.size }} {{ t('plannerComponents.gantt.prereqs') }}
          </div>
          <div
            v-if="dependentNodeIds.size > 0"
            class="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span class="inline-block size-2 rounded-full bg-sky-400/80" />
            {{ dependentNodeIds.size }} {{ t('plannerComponents.gantt.dependents') }}
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
