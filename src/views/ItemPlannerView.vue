<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Coins,
  GanttChart,
  GitBranch,
  Hammer,
  Network,
  Search,
  TrendingUp,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import PlannerActiveMods from '@/components/planner/PlannerActiveMods.vue'
import PlannerBadge from '@/components/planner/PlannerBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerGantt from '@/components/planner/PlannerGantt.vue'
import PlannerInspector from '@/components/planner/PlannerInspector.vue'
import PlannerItemPicker from '@/components/planner/PlannerItemPicker.vue'
import PlannerSettings from '@/components/planner/PlannerSettings.vue'
import PlannerShoppingList from '@/components/planner/PlannerShoppingList.vue'
import PlannerToolbar from '@/components/planner/PlannerToolbar.vue'
import PlannerTreeNode from '@/components/planner/PlannerTreeNode.vue'
import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useItems } from '@/composables/useItems'
import { formatDuration, sourceLabel } from '@/utils/format'
import LevelPlannerView from '@/views/LevelPlannerView.vue'

function normalizeQuantity(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.max(1, Math.round(parsed))
}


const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')
const { items } = useItems()


const targetItemId = computed(() => {
  const routeId = route.params.id
  return typeof routeId === 'string' ? routeId : ''
})


const quantityInput = ref(String(normalizeQuantity(route.query.qty)))


watch(
  () => route.query.qty,
  (queryQty) => {
    quantityInput.value = String(normalizeQuantity(queryQty))
  },
  { immediate: true },
)


const targetQuantity = computed(() => normalizeQuantity(quantityInput.value))


const plannerItemOptions = computed(() =>
  items
    .slice()
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      source: item.sources?.find(Boolean) ? sourceLabel(item.sources.find(Boolean)!) : 'Unknown',
    })),
)


const selectedPlannerItemId = ref('')


const viewMode = ref<'tree' | 'timeline'>('tree')


const {
  rootNode,
  nodesById,
  methodsById,
  activeMethodIdByNode,
  schedule,
  summary,
  shoppingListText,
  inventoryAmounts,
  gardenFlowers,
  awakenGatherUpgrades,
  awakenSpeedTiers,
  allTreeItems,
  getActiveMethod,
  setPinnedMethod,
  resetPins,
  setInventory,
  resetInventory,
  setGardenFlowerEntries,
  resetGarden,
  setAwakenGatherYieldBonus,
  setAwakenGatherDurationTier,
  setAwakenSpeedTier,
  resetAwaken,
  jobTiers,
  setJobTier,
  resetJobTiers,
  resetAllSettings,
  formatAmount,
} = useCraftPlanner(targetItemId, targetQuantity)


const collapsedNodeIds = ref(new Set<string>())


const selectedNodeId = ref<string | null>(null)
const selectedMethodId = ref<string | null>(null)


watch(
  rootNode,
  (node) => {
    selectedNodeId.value = node?.id ?? null
    selectedMethodId.value = null
  },
  { immediate: true },
)


watch(targetItemId, () => {
  resetPins()
  collapsedNodeIds.value = new Set()
})


watch(
  [targetItemId, plannerItemOptions],
  ([currentId, options]) => {
    if (currentId) {
      selectedPlannerItemId.value = currentId
      return
    }

    if (!options.some((option) => option.id === selectedPlannerItemId.value)) {
      selectedPlannerItemId.value = ''
    }
  },
  { immediate: true },
)


const selectedMethod = computed(() => {
  if (!selectedMethodId.value) return null
  return methodsById.value[selectedMethodId.value] ?? null
})


const selectedNode = computed(() => {
  if (selectedMethod.value) return nodesById.value[selectedMethod.value.nodeId] ?? null
  if (selectedNodeId.value) return nodesById.value[selectedNodeId.value] ?? null
  return rootNode.value
})


const activeMethodForSelectedNode = computed(() => {
  if (!selectedNode.value) return null
  return getActiveMethod(selectedNode.value.id)
})


function updateRoute(nextItemId: string, nextQuantity: number, replace: boolean = false) {
  const navigation = {
    name: 'planner',
    params: nextItemId ? { id: nextItemId } : {},
    query: nextQuantity > 1 ? { qty: String(nextQuantity) } : {},
  }


  if (replace) router.replace(navigation)
  else router.push(navigation)
}


function applyQuantity() {
  const normalized = normalizeQuantity(quantityInput.value)
  quantityInput.value = String(normalized)
  updateRoute(targetItemId.value, normalized, true)
}


const quantityStep = ref(1)


function changeQuantity(direction: 1 | -1) {
  quantityInput.value = String(
    Math.max(1, normalizeQuantity(quantityInput.value) + direction * quantityStep.value),
  )
  applyQuantity()
}


function handlePlannerTargetChange(nextItemId: string) {
  selectedPlannerItemId.value = nextItemId
  updateRoute(nextItemId, targetQuantity.value)
}


function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId
  selectedMethodId.value = null
}


function selectMethod(methodId: string) {
  if (!methodId) {
    selectedMethodId.value = null
    return
  }
  const method = methodsById.value[methodId]
  if (!method) return
  selectedMethodId.value = methodId
  selectedNodeId.value = method.nodeId
}


function pinMethod(nodeId: string, methodId: string) {
  setPinnedMethod(nodeId, methodId)
}


function openPlannerForItem(itemId: string, quantity: number = 1) {
  updateRoute(itemId, Math.max(1, Math.round(quantity)))
}


function toggleCollapse(nodeId: string) {
  const next = new Set(collapsedNodeIds.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  collapsedNodeIds.value = next
}


function collapseToLeaves() {
  const next = new Set<string>()
  for (const node of Object.values(nodesById.value)) {
    const method = getActiveMethod(node.id)
    if (method && method.children.length > 0) {
      next.add(node.id)
    }
  }
  collapsedNodeIds.value = next
}


function expandAll() {
  collapsedNodeIds.value = new Set()
}


const collapsedCount = computed(() => collapsedNodeIds.value.size)


const activeTab = computed(() => (route.query.tab === 'levelup' ? 'levelup' : 'craft'))


function switchTab(tab: 'craft' | 'levelup') {
  if (tab === 'craft') {
    router.push({ name: 'planner', params: route.params, query: {} })
  } else {
    router.push({ path: '/planner', query: { tab: 'levelup' } })
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex justify-center">
      <div class="inline-flex rounded-xl border border-border/60 bg-card/60 p-1">
        <button
          class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === 'craft'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
          "
          @click="switchTab('craft')"
        >
          <Hammer class="size-4" />
          Craft
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === 'levelup'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
          "
          @click="switchTab('levelup')"
        >
          <TrendingUp class="size-4" />
          Level Up
        </button>
      </div>
    </div>

    <LevelPlannerView v-if="activeTab === 'levelup'" />

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="space-y-2">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Craft Planner
            </p>
            <h1 class="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {{ rootNode ? `${rootNode.itemName} Planner` : 'Planner' }}
            </h1>
            <p class="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Browse every recipe branch, container route, and gathering path for any item, then pin
              the method you want to use for totals and expected time.
            </p>
          </div>
        </div>
      </div>

      <PlannerToolbar picker-label="Item">
        <template #picker>
          <PlannerItemPicker
            :model-value="selectedPlannerItemId"
            :options="plannerItemOptions"
            placeholder="Choose an item"
            @update:model-value="handlePlannerTargetChange"
          />
        </template>

        <template #controls>
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="inline-flex items-center overflow-hidden rounded-xl border border-border/70 bg-background/70"
            >
              <button
                class="focus-ring flex h-9 w-8 items-center justify-center text-sm font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="changeQuantity(-1)"
              >
                -
              </button>
              <input
                v-model="quantityInput"
                type="number"
                min="1"
                inputmode="numeric"
                class="focus-ring h-9 w-14 border-x border-border/50 bg-transparent px-1 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                @change="applyQuantity"
                @blur="applyQuantity"
              />
              <button
                class="focus-ring flex h-9 w-8 items-center justify-center text-sm font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                @click="changeQuantity(1)"
              >
                +
              </button>
            </div>
            <div
              class="inline-flex items-center overflow-hidden rounded-xl border border-border/70 bg-background/70"
            >
              <button
                v-for="step in [1, 5, 10, 25, 100, 1000]"
                :key="step"
                class="focus-ring h-9 px-3 text-xs font-semibold transition"
                :class="
                  quantityStep === step
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                "
                @click="quantityStep = step"
              >
                x{{ step }}
              </button>
            </div>
          </div>
        </template>

        <template v-if="rootNode && summary" #summary>
          <PlannerBadge
            color="var(--color-green)"
            title="Total time assumes independent steps run in parallel and dependent steps run in series"
          >
            <Clock3 class="size-3.5" />
            {{ summary.totalTimeSeconds != null ? formatDuration(summary.totalTimeSeconds) : '?' }}
          </PlannerBadge>
          <PlannerBadge color="var(--color-yellow)">
            <Coins class="size-3.5" />
            {{ Math.round(summary.totalCost).toLocaleString() }}
          </PlannerBadge>
          <PlannerBadge color="var(--color-primary)">
            <GitBranch class="size-3.5" />
            {{ summary.branchPointCount }}
          </PlannerBadge>
        </template>
      </PlannerToolbar>

      <PlannerEmptyState
        v-if="!rootNode"
        title="Choose an item to begin planning."
        subtitle="Select a target item above or jump here directly from any item card’s planner link."
      >
        <template #action>
          <RouterLink
            to="/items"
            class="focus-ring bg-primary/12 hover:bg-primary/18 inline-flex items-center gap-2 rounded-full border border-primary/35 px-4 py-2.5 text-sm font-semibold text-primary transition"
          >
            <Search class="size-4" />
            Browse Items
          </RouterLink>
        </template>
      </PlannerEmptyState>

      <PlannerEmptyState
        v-else-if="!isDesktop"
        title="Planner is desktop-first for now."
        subtitle="Open this page on a wider screen to browse the full dependency tree and inspector."
      />

      <div v-else-if="rootNode" class="space-y-6">
        <PlannerSettings
          :tree-items="allTreeItems"
          :inventory-amounts="inventoryAmounts"
          :garden-flowers="gardenFlowers"
          :awaken-gather-upgrades="awakenGatherUpgrades"
          :awaken-speed-tiers="awakenSpeedTiers"
          :job-tiers="jobTiers"
          @set-inventory="setInventory"
          @reset-inventory="resetInventory"
          @set-garden-flower-entries="setGardenFlowerEntries"
          @reset-garden="resetGarden"
          @set-awaken-gather-yield-bonus="setAwakenGatherYieldBonus"
          @set-awaken-gather-duration-tier="setAwakenGatherDurationTier"
          @set-awaken-speed-tier="setAwakenSpeedTier"
          @reset-awaken="resetAwaken"
          @set-job-tier="setJobTier"
          @reset-job-tiers="resetJobTiers"
          @reset-all="resetAllSettings"
        />

        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-border/60 p-0.5">
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition"
              :class="
                viewMode === 'tree'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'tree'"
            >
              <Network class="size-3.5" />
              Tree
            </button>
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition"
              :class="
                viewMode === 'timeline'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'timeline'"
            >
              <GanttChart class="size-3.5" />
              Timeline
            </button>
          </div>

          <template v-if="viewMode === 'tree'">
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="collapseToLeaves"
            >
              <ChevronsDownUp class="size-3.5" />
              Collapse to Leaves
            </button>
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="expandAll"
            >
              <ChevronsUpDown class="size-3.5" />
              Expand All
            </button>
            <span
              v-if="collapsedCount > 0"
              class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
            >
              {{ collapsedCount }} collapsed
            </span>
          </template>
        </div>

        <!-- Timeline view -->
        <div
          v-if="viewMode === 'timeline' && schedule"
          class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
        >
          <div class="space-y-3">
            <PlannerGantt
              :schedule="schedule"
              :nodes-by-id="nodesById"
              :selected-node-id="selectedNodeId"
              @select-node="selectNode"
            />

            <PlannerActiveMods
              :inventory-amounts="inventoryAmounts"
              :garden-flowers="gardenFlowers"
              :awaken-gather-upgrades="awakenGatherUpgrades"
              :awaken-speed-tiers="awakenSpeedTiers"
              :job-tiers="jobTiers"
              :tree-items="allTreeItems"
            />

            <PlannerShoppingList
              v-if="summary && summary.leafItems.length"
              :leaf-items="summary.leafItems"
              :format-amount="formatAmount"
              :shopping-list-text="shoppingListText"
            />
          </div>

          <PlannerInspector
            :focus-node="selectedNode"
            :focus-method="selectedMethod"
            :active-method="activeMethodForSelectedNode"
            :nodes-by-id="nodesById"
            :schedule="schedule"
            :get-active-method-for-node="getActiveMethod"
            :format-amount="formatAmount"
            :is-root-node="selectedNode?.id === rootNode?.id"
            @pin-method="pinMethod"
            @select-method="selectMethod"
            @select-node="selectNode"
            @open-item-planner="openPlannerForItem"
          />
        </div>

        <!-- Tree view -->
        <div v-else class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div class="space-y-3">
            <div class="space-y-3">
              <PlannerTreeNode
                :node="rootNode"
                :nodes-by-id="nodesById"
                :active-method-id-by-node="activeMethodIdByNode"
                :selected-node-id="selectedNodeId"
                :selected-method-id="selectedMethodId"
                :collapsed-node-ids="collapsedNodeIds"
                :inventory-amounts="inventoryAmounts"
                :completion-time-by-node="schedule?.completionTimeByNode ?? {}"
                @select-node="selectNode"
                @select-method="selectMethod"
                @pin-method="pinMethod"
                @toggle-collapse="toggleCollapse"
              />
            </div>

            <PlannerActiveMods
              :inventory-amounts="inventoryAmounts"
              :garden-flowers="gardenFlowers"
              :awaken-gather-upgrades="awakenGatherUpgrades"
              :awaken-speed-tiers="awakenSpeedTiers"
              :job-tiers="jobTiers"
              :tree-items="allTreeItems"
            />

            <PlannerShoppingList
              v-if="summary && summary.leafItems.length"
              :leaf-items="summary.leafItems"
              :format-amount="formatAmount"
              :shopping-list-text="shoppingListText"
            />
          </div>

          <PlannerInspector
            :focus-node="selectedNode"
            :focus-method="selectedMethod"
            :active-method="activeMethodForSelectedNode"
            :nodes-by-id="nodesById"
            :schedule="schedule"
            :get-active-method-for-node="getActiveMethod"
            :format-amount="formatAmount"
            :is-root-node="selectedNode?.id === rootNode?.id"
            @pin-method="pinMethod"
            @select-method="selectMethod"
            @select-node="selectNode"
            @open-item-planner="openPlannerForItem"
          />
        </div>
      </div>
    </template>
  </section>
</template>
