<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, GitBranch, Info, PackageSearch, Pin } from 'lucide-vue-next'
import type { PlannerMethod, PlannerNode, PlannerSchedule } from '@/types'
import { getItemImage } from '@/utils/itemImages'
import { formatDuration, itemTypeColor, methodKindColor, methodKindLabel } from '@/utils/format'

const props = defineProps<{
  focusNode: PlannerNode | null
  focusMethod: PlannerMethod | null
  activeMethod: PlannerMethod | null
  nodesById: Record<string, PlannerNode>
  schedule: PlannerSchedule | null
  getActiveMethodForNode: (nodeId: string) => PlannerMethod | null
  formatAmount: (value: number) => string
  isRootNode?: boolean
}>()

const emit = defineEmits<{
  'pin-method': [nodeId: string, methodId: string]
  'select-method': [methodId: string]
  'select-node': [nodeId: string]
  'open-item-planner': [itemId: string, quantity: number]
}>()

const displayNode = computed(() => {
  if (props.focusMethod) return props.nodesById[props.focusMethod.nodeId] ?? props.focusNode
  return props.focusNode
})

const methodOptions = computed(() => displayNode.value?.methods ?? [])

// For the active method, derive total time from the schedule (accurate).
// For non-active methods, fall back to the stale method.totalTimeSeconds.
function getMethodTotalTime(method: PlannerMethod): number | null {
  const node = displayNode.value
  if (!node) return method.totalTimeSeconds
  if (props.activeMethod?.id === method.id && props.schedule?.completionTimeByNode[node.id] != null) {
    return props.schedule.completionTimeByNode[node.id]
  }
  return method.totalTimeSeconds
}

const nodeSubtreeSummary = computed(() => {
  const node = displayNode.value
  if (!node) return null

  const leafAmounts = new Map<string, { itemName: string; amount: number }>()
  let totalCost = 0
  let craftStepCount = 0
  let branchPointCount = 0
  let missingTime = false

  // Time buckets for descendants only (excluding root node)
  const childGatherByJob: Record<string, number> = {}
  const childCraftByWs: Record<string, number> = {}
  let childGardenTime = 0
  let childExpeditionTime = 0

  function bucketTime(method: PlannerMethod) {
    if (method.localTimeSeconds == null) return
    const t = method.localTimeSeconds
    switch (method.kind) {
      case 'craft':
        childCraftByWs[method.title] = (childCraftByWs[method.title] ?? 0) + t
        break
      case 'gather':
        childGatherByJob[method.title] = (childGatherByJob[method.title] ?? 0) + t
        break
      case 'garden':
        childGardenTime = Math.max(childGardenTime, t)
        break
      case 'expedition':
        childExpeditionTime = Math.max(childExpeditionTime, t)
        break
    }
  }

  function walk(n: PlannerNode, isRoot: boolean) {
    if (n.methods.length > 1) branchPointCount += 1

    const method = props.getActiveMethodForNode(n.id)

    if (!method) {
      const existing = leafAmounts.get(n.itemId)
      if (existing) existing.amount += n.requiredAmount
      else leafAmounts.set(n.itemId, { itemName: n.itemName, amount: n.requiredAmount })
      missingTime = true
      return
    }

    if (method.kind === 'craft') craftStepCount += 1
    if (method.cost != null) totalCost += method.cost
    if (method.localTimeSeconds == null) {
      missingTime = true
    } else if (!isRoot) {
      bucketTime(method)
    }

    if (method.children.length === 0) {
      const existing = leafAmounts.get(n.itemId)
      if (existing) existing.amount += n.requiredAmount
      else leafAmounts.set(n.itemId, { itemName: n.itemName, amount: n.requiredAmount })
      return
    }

    for (const child of method.children) {
      const childNode = props.nodesById[child.nodeId]
      if (childNode) walk(childNode, false)
    }
  }

  walk(node, true)

  function maxBucket(...buckets: Record<string, number>[]) {
    return buckets.reduce((max, b) => Math.max(max, ...Object.values(b)), 0)
  }

  const rootMethod = node.defaultMethodId
    ? node.methods.find(m => m.id === node.defaultMethodId) ?? null
    : null
  const stepTimeSeconds = rootMethod?.localTimeSeconds ?? null

  // Use schedule-based completion time when available (accounts for resource contention + dependency ordering)
  const scheduleCompletion = props.schedule?.completionTimeByNode[node.id] ?? null
  const scheduledStep = props.schedule?.tasks.find(t => t.nodeId === node.id)

  let totalTimeSeconds: number | null
  let depsTimeSeconds: number | null

  if (scheduleCompletion != null && scheduledStep) {
    // Schedule knows exact start time, so deps time = startTime
    depsTimeSeconds = scheduledStep.startTime > 0 ? scheduledStep.startTime : null
    totalTimeSeconds = missingTime ? null : scheduleCompletion
  } else if (scheduleCompletion != null && stepTimeSeconds == null) {
    // Node has no direct task (buy/container) but has a schedule completion time
    depsTimeSeconds = scheduleCompletion > 0 ? scheduleCompletion : null
    totalTimeSeconds = missingTime ? null : scheduleCompletion
  } else {
    // Fallback to bucket-based estimate
    depsTimeSeconds = Math.max(
      maxBucket(childGatherByJob, childCraftByWs),
      Math.max(childGardenTime, childExpeditionTime),
    ) || null
    const computedTotal = (stepTimeSeconds ?? 0) + (depsTimeSeconds ?? 0)
    totalTimeSeconds = missingTime ? null : (computedTotal || null)
  }

  return {
    totalTimeSeconds,
    stepTimeSeconds,
    depsTimeSeconds,
    totalCost,
    craftStepCount,
    branchPointCount,
    leafItems: [...leafAmounts.entries()].map(([itemId, { itemName, amount }]) => ({ itemId, itemName, amount })),
  }
})

const nodeLeafMaterials = computed(() => nodeSubtreeSummary.value?.leafItems ?? [])

function openDisplayNodePlanner() {
  if (!displayNode.value) return
  emit('open-item-planner', displayNode.value.itemId, Math.max(1, Math.round(displayNode.value.requiredAmount)))
}

</script>

<template>
  <aside
    class="surface-card sticky top-[calc(var(--header-height)+1.5rem)] max-h-[calc(100vh-var(--header-height)-2rem)] overflow-y-auto">
    <!-- Hero: full-bleed gradient header -->
    <div v-if="displayNode" class="relative flex flex-col items-center px-5 pb-4 pt-6" :style="{
      background: `linear-gradient(180deg, color-mix(in oklch, ${itemTypeColor(displayNode.itemType)} 15%, transparent) 0%, color-mix(in oklch, ${itemTypeColor(displayNode.itemType)} 8%, transparent) 100%)`
    }">
      <div class="flex h-28 w-full items-center justify-center">
        <img v-if="getItemImage({ id: displayNode.itemId })" :src="getItemImage({ id: displayNode.itemId })"
          :alt="displayNode.itemName" class="size-20 object-contain drop-shadow-lg" />
        <span v-else class="text-4xl font-black"
          :style="{ color: `color-mix(in oklch, ${itemTypeColor(displayNode.itemType)} 50%, transparent)` }">
          {{ displayNode.itemName.charAt(0) }}
        </span>
      </div>

      <h2 class="text-center text-xl font-black leading-tight text-foreground">{{ displayNode.itemName }}</h2>

      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <span class="rounded-full px-3 py-1 text-xs font-semibold" :style="{
          color: itemTypeColor(displayNode.itemType),
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(displayNode.itemType)} 12%, transparent)`
        }">
          {{ displayNode.itemType }}
        </span>
        <span
          class="rounded-full border border-border/60 bg-background/65 px-3 py-1 text-xs font-semibold text-foreground">
          Need <span class="font-mono" style="color: var(--color-primary)">x{{ formatAmount(displayNode.requiredAmount)
            }}</span>
        </span>
      </div>

      <div v-if="!isRootNode" class="mt-3 flex flex-wrap justify-center gap-2">
        <button
          class="focus-ring inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/12 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/18"
          @click="openDisplayNodePlanner">
          <GitBranch class="size-4" />
          Open This Planner
        </button>
      </div>

      <p v-if="displayNode.issues.length"
        class="mt-3 w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
        {{ displayNode.issues[0] }}
      </p>
      <p v-else-if="activeMethod && activeMethod.notes.length && activeMethod.localTimeSeconds == null"
        class="mt-3 w-full rounded-lg border border-yellow-400/30 bg-yellow-400/8 px-3 py-2 text-sm text-yellow-300">
        {{ activeMethod.notes[0] }}
      </p>
    </div>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center px-5 py-16"
      :style="{ background: `linear-gradient(180deg, color-mix(in oklch, var(--color-primary) 8%, transparent) 0%, transparent 100%)` }">
      <PackageSearch class="size-12 text-muted-foreground/40" />
      <p class="mt-3 text-sm font-medium text-muted-foreground">Select a node to inspect</p>
    </div>

    <!-- Sections -->
    <div class="px-5 pb-5">
      <!-- Branch Options (with inline method details) -->
      <section v-if="displayNode && methodOptions.length" class="border-t border-border/60 pt-4 mt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Branch Options</h3>

        <div class="space-y-3">
          <div v-for="method in methodOptions" :key="method.id"
            class="overflow-hidden rounded-lg border border-l-[3px] transition pt-1"
            :class="activeMethod?.id === method.id ? 'border-primary/40 bg-primary/10' : 'border-border/60 bg-background/45'"
            :style="{ borderLeftColor: methodKindColor(method.kind) }">
            <!-- Method header (clickable toggle) -->
            <button class="focus-ring relative flex w-full items-center gap-2 px-3 py-3 pt-5 text-left transition"
              :class="focusMethod?.id !== method.id ? 'hover:bg-background/60' : ''"
              @click="emit('select-method', focusMethod?.id === method.id ? '' : method.id)">
              <!-- Dog-ear kind label -->
              <span
                class="absolute left-0 top-0 rounded-br-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]"
                :style="{
                  color: methodKindColor(method.kind),
                  WebkitTextStroke: `3px var(--color-card)`,
                  paintOrder: 'stroke fill',
                }">
                {{ methodKindLabel(method.kind) }}
              </span>

              <component :is="focusMethod?.id === method.id ? ChevronDown : ChevronRight"
                class="size-4 shrink-0 text-muted-foreground" />
              <CheckCircle2 v-if="activeMethod?.id === method.id" class="size-4 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-foreground">{{ method.title }}</p>
                <p v-if="method.kind === 'gather' || method.kind === 'container'"
                  class="truncate text-xs text-muted-foreground">{{ method.subtitle }}</p>
              </div>
              <div class="shrink-0 text-right text-xs font-semibold">
                <template v-if="method.cost != null">
                  <span class="font-mono" style="color: var(--color-yellow)">{{ Math.round(method.cost).toLocaleString()
                    }} gold</span>
                </template>
                <template v-else-if="method.localTimeSeconds != null">
                  <span class="font-mono" style="color: var(--color-green)" title="Step — time for this action alone">{{ formatDuration(method.localTimeSeconds) }}</span>
                  <template v-if="getMethodTotalTime(method) != null && getMethodTotalTime(method)! > method.localTimeSeconds">
                    <span class="font-mono text-muted-foreground" title="Deps — time to complete all dependencies">/ +{{ formatDuration(getMethodTotalTime(method)! - method.localTimeSeconds) }}</span>
                    <span class="font-mono text-foreground" title="Total — step time plus dependencies">/ {{ formatDuration(getMethodTotalTime(method)!) }}</span>
                  </template>
                </template>
              </div>
              <div
                class="shrink-0 rounded-full p-1.5 transition hover:bg-primary/12 hover:text-primary"
                :class="activeMethod?.id === method.id ? 'text-primary' : 'text-muted-foreground'"
                title="Pin this method" @click.stop="displayNode && emit('pin-method', displayNode.id, method.id)">
                <Pin class="size-3.5" :fill="activeMethod?.id === method.id ? 'currentColor' : 'none'" />
              </div>
            </button>

            <!-- Expanded method details -->
            <div v-if="focusMethod?.id === method.id" class="border-t border-border/40 px-3 pb-3 pt-3 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div v-for="detail in focusMethod.detailRows" :key="`${focusMethod.id}-${detail.label}`"
                  class="rounded-lg border border-border/60 bg-background/45 px-3 py-3">
                  <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{{ detail.label }}
                  </p>
                  <p
                    class="mt-1 font-mono text-sm font-semibold text-foreground"
                    :title="detail.estimated ? 'Approximate — based on probability' : undefined"
                  >{{ detail.estimated ? '≈ ' : '' }}{{ detail.value }}</p>
                </div>
              </div>

              <div v-if="focusMethod.formula" class="rounded-lg border border-border/60 bg-background/45 px-4 py-3">
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Formula</p>
                <p class="mt-2 text-sm leading-relaxed text-foreground">{{ focusMethod.formula }}</p>
              </div>

              <div v-if="focusMethod.children.length" class="space-y-2">
                <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Dependencies</p>
                <button v-for="child in focusMethod.children" :key="child.nodeId"
                  class="focus-ring flex w-full items-center justify-between rounded-lg border border-border/60 bg-background/45 px-3 py-3 text-left transition hover:border-primary/30 hover:bg-background/60"
                  @click="emit('select-node', child.nodeId)">
                  <div class="flex items-center gap-2">
                    <img v-if="getItemImage({ id: child.itemId })" :src="getItemImage({ id: child.itemId })"
                      :alt="nodesById[child.nodeId]?.itemName ?? child.itemId" class="size-5 object-contain" />
                    <div>
                      <p class="text-sm font-semibold text-foreground">{{ nodesById[child.nodeId]?.itemName ??
                        child.itemId }}</p>
                      <p class="mt-1 text-xs text-muted-foreground">Need <span class="font-mono"
                          style="color: var(--color-primary)">x{{ formatAmount(child.amount) }}</span></p>
                    </div>
                  </div>
                  <ArrowRight class="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Subtree Totals -->
      <section v-if="nodeSubtreeSummary && nodeLeafMaterials.length > 1" class="border-t border-border/60 pt-4 mt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Subtree Totals</h3>

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3" title="Time for this action alone">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Step Time</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-green)">
              {{ nodeSubtreeSummary.stepTimeSeconds != null ? formatDuration(nodeSubtreeSummary.stepTimeSeconds) : 'N/A' }}
            </p>
          </div>
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3" title="Time to complete all dependencies (parallel across resources)">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Deps Time</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-green)">
              <template v-if="nodeSubtreeSummary.depsTimeSeconds != null && nodeSubtreeSummary.depsTimeSeconds > 0">{{ formatDuration(nodeSubtreeSummary.depsTimeSeconds) }}</template>
              <template v-else-if="nodeSubtreeSummary.totalTimeSeconds != null">&mdash;</template>
              <template v-else>N/A</template>
            </p>
          </div>
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3" title="Step time plus dependencies — total time to produce this item">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Total Time</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-green)">
              {{ nodeSubtreeSummary.totalTimeSeconds != null ? formatDuration(nodeSubtreeSummary.totalTimeSeconds) : 'N/A' }}
            </p>
          </div>
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Gold Cost</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-yellow)">{{
              Math.round(nodeSubtreeSummary.totalCost).toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Craft Steps</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-primary)">{{
              nodeSubtreeSummary.craftStepCount }}
            </p>
          </div>
          <div class="rounded-lg border border-border/60 bg-background/45 px-3 py-3">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Branch Points</p>
            <p class="mt-1 font-mono text-sm font-semibold" style="color: var(--color-primary)">{{
              nodeSubtreeSummary.branchPointCount }}
            </p>
          </div>
        </div>

        <p class="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Info class="mt-0.5 size-4 shrink-0" />
          <span>Times assume independent steps run in parallel (e.g. gathering different materials simultaneously) while dependent steps run in series (e.g. gathering before crafting). Total time reflects the longest parallel path, not the sum of all steps.</span>
        </p>

      </section>

      <!-- Leaf Materials (node-scoped) -->
      <section v-if="nodeLeafMaterials.length > 1" class="border-t border-border/60 pt-4 mt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Leaf Materials</h3>
        <div class="space-y-1">
          <div v-for="leaf in nodeLeafMaterials" :key="leaf.itemId"
            class="-mx-1 flex items-center justify-between rounded-lg px-3 py-1.5 transition hover:bg-muted/20">
            <div class="flex items-center gap-2">
              <img v-if="getItemImage({ id: leaf.itemId })" :src="getItemImage({ id: leaf.itemId })"
                :alt="leaf.itemName" class="size-5 object-contain" />
              <span class="text-sm font-medium text-foreground">{{ leaf.itemName }}</span>
            </div>
            <span class="font-mono text-sm font-semibold" style="color: var(--color-primary)">x{{
              formatAmount(leaf.amount)
              }}</span>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>
