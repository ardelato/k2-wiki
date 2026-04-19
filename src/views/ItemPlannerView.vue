<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  GanttChart,
  Hammer,
  Network,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import GoldRateBadge from '@/components/planner/GoldRateBadge.vue'
import PlannerEmptyState from '@/components/planner/PlannerEmptyState.vue'
import PlannerGantt from '@/components/planner/PlannerGantt.vue'
import PlannerItemPicker from '@/components/planner/PlannerItemPicker.vue'
import PlannerListView from '@/components/planner/PlannerListView.vue'
import PlannerToolbar from '@/components/planner/PlannerToolbar.vue'
import PlannerTreeNode from '@/components/planner/PlannerTreeNode.vue'
import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'
import { useItems } from '@/composables/useItems'
import { useRecommendations } from '@/composables/useRecommendations'
import { sourceLabel } from '@/utils/format'
import LevelPlannerView from '@/views/LevelPlannerView.vue'
import SummoningPlannerView from '@/views/SummoningPlannerView.vue'

function normalizeQuantity(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.max(1, Math.round(parsed))
}


const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')
const { items } = useItems()
const gameConfig = useGameConfig()


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
      image: item.image,
    })),
)


const selectedPlannerItemId = ref('')


const viewMode = ref<'list' | 'tree' | 'timeline'>('list')


const listViewRef = ref<InstanceType<typeof PlannerListView> | null>(null)


const {
  rootNode,
  nodesById,
  activeMethodIdByNode,
  schedule,
  inventoryAmounts,
  getActiveMethod,
  setPinnedMethod,
  resetPins,
} = useCraftPlanner(targetItemId, targetQuantity)


const recommendations = useRecommendations(nodesById, getActiveMethod, gameConfig)


const collapsedNodeIds = ref(new Set<string>())


const selectedNodeId = ref<string | null>(null)


watch(
  rootNode,
  (node) => {
    selectedNodeId.value = node?.id ?? null
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
  const current = normalizeQuantity(quantityInput.value)
  const step = quantityStep.value
  let next: number
  if (direction === 1 && current === 1 && step > 1) {
    next = step
  } else {
    next = current + direction * step
  }
  quantityInput.value = String(Math.max(1, next))
  applyQuantity()
}


function handlePlannerTargetChange(nextItemId: string) {
  selectedPlannerItemId.value = nextItemId
  updateRoute(nextItemId, targetQuantity.value)
}


function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId
}


function pinMethod(nodeId: string, methodId: string) {
  setPinnedMethod(nodeId, methodId)
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


const activeTab = computed(() => {
  if (route.query.tab === 'levelup') return 'levelup'
  if (route.query.tab === 'summoning') return 'summoning'
  return 'craft'
})


function switchTab(tab: 'craft' | 'levelup' | 'summoning') {
  if (tab === 'craft') {
    router.push({ name: 'planner', params: route.params, query: {} })
  } else {
    router.push({ path: '/planner', query: { tab } })
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
        <button
          class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === 'summoning'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
          "
          @click="switchTab('summoning')"
        >
          <Sparkles class="size-4" />
          Summoning
        </button>
      </div>
    </div>

    <LevelPlannerView v-if="activeTab === 'levelup'" />

    <SummoningPlannerView v-else-if="activeTab === 'summoning'" />

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
            <GoldRateBadge class="mt-2" />
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
                v-for="step in [1, 10, 100, 1000]"
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
      </PlannerToolbar>

      <PlannerEmptyState
        v-if="!rootNode"
        title="Choose an item to begin planning."
        subtitle="Select a target item above or jump here directly from any item card's planner link."
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
        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-border/60 p-0.5">
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition"
              :class="
                viewMode === 'list'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'list'"
            >
              <ClipboardList class="size-3.5" />
              List
            </button>
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

          <template v-if="viewMode === 'list' || viewMode === 'tree'">
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="viewMode === 'list' ? listViewRef?.collapseAll() : collapseToLeaves()"
            >
              <ChevronsDownUp class="size-3.5" />
              Collapse All
            </button>
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="viewMode === 'list' ? listViewRef?.expandAll() : expandAll()"
            >
              <ChevronsUpDown class="size-3.5" />
              Expand All
            </button>
            <span
              v-if="viewMode === 'tree' && collapsedCount > 0"
              class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
            >
              {{ collapsedCount }} collapsed
            </span>
          </template>
        </div>

        <!-- List view (default) -->
        <PlannerListView
          v-if="viewMode === 'list'"
          ref="listViewRef"
          :root-node="rootNode"
          :nodes-by-id="nodesById"
          :active-method-id-by-node="activeMethodIdByNode"
          :inventory-amounts="inventoryAmounts"
          :get-active-method="getActiveMethod"
          :recommendations="recommendations"
        />

        <!-- Timeline view -->
        <div v-else-if="viewMode === 'timeline' && schedule" class="space-y-3">
          <PlannerGantt
            :schedule="schedule"
            :nodes-by-id="nodesById"
            :selected-node-id="selectedNodeId"
            @select-node="selectNode"
          />
        </div>

        <!-- Tree view -->
        <div v-else-if="viewMode === 'tree'" class="space-y-3">
          <PlannerTreeNode
            :node="rootNode"
            :nodes-by-id="nodesById"
            :active-method-id-by-node="activeMethodIdByNode"
            :selected-node-id="selectedNodeId"
            :selected-method-id="null"
            :collapsed-node-ids="collapsedNodeIds"
            :inventory-amounts="inventoryAmounts"
            :completion-time-by-node="schedule?.completionTimeByNode ?? {}"
            :recommendations="recommendations"
            @select-node="selectNode"
            @select-method="() => {}"
            @pin-method="pinMethod"
            @toggle-collapse="toggleCollapse"
          />
        </div>
      </div>
    </template>
  </section>
</template>
