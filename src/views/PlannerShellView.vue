<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  Coins,
  GanttChart,
  GraduationCap,
  Hammer,
  HelpCircle,
  Network,
  Search,
  Sparkles,
  Target,
} from 'lucide-vue-next'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Component,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CraftPlannerHero from '@/components/craft-planner/CraftPlannerHero.vue'
import GoldRateBadge from '@/components/craft-planner/GoldRateBadge.vue'
import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import PlannerGantt from '@/components/craft-planner/PlannerGantt.vue'
import PlannerItemPickerModal from '@/components/craft-planner/PlannerItemPickerModal.vue'
import PlannerMaterialCard from '@/components/craft-planner/PlannerMaterialCard.vue'
import PlannerObjectiveList from '@/components/craft-planner/PlannerObjectiveList.vue'
import PlannerTabSkeleton from '@/components/craft-planner/PlannerTabSkeleton.vue'
import PlannerTreeNode from '@/components/craft-planner/PlannerTreeNode.vue'
import SkillGateRollup from '@/components/craft-planner/SkillGateRollup.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import { useCraftPlanner } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'
import { useItems } from '@/composables/useItems'
import { usePlannerTour, type TourObjective } from '@/composables/usePlannerTour'
import { useRecommendations } from '@/composables/useRecommendations'
import { sourceLabel } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'
// Tab panels — only one renders at a time (v-if by active tab), so load each on
// demand instead of bundling all three (incl. the ~2,250-line LevelPlanner and
// its precomputed-data path) into the creature route's initial chunk. A shimmer
// placeholder fills the tab area while the chunk loads so the page never looks
// frozen; `delay` skips the shimmer for fast/cached loads to avoid a flash.
const asyncTab = (loader: () => Promise<unknown>) =>
  defineAsyncComponent({
    loader: loader as () => Promise<Component>,
    loadingComponent: PlannerTabSkeleton,
    // Show the shimmer on the first pending frame (no empty gap). Cached re-mounts
    // resolve synchronously so they don't flash it.
    delay: 0,
  })


const loadLevelPlanner = () => import('@/views/LevelPlanner.vue')
const loadSkillPlanner = () => import('@/views/SkillPlanner.vue')
const loadSummoningPlanner = () => import('@/views/SummoningPlanner.vue')
const LevelPlanner = asyncTab(loadLevelPlanner)
const SkillPlanner = asyncTab(loadSkillPlanner)
const SummoningPlanner = asyncTab(loadSummoningPlanner)


// Same loaders keyed by tab, so the tour can await the active tab's chunk before seeding.
const TAB_LOADERS: Record<string, () => Promise<unknown>> = {
  summon: loadSummoningPlanner,
  awaken: loadLevelPlanner,
  prestige: loadLevelPlanner,
  skills: loadSkillPlanner,
}


function normalizeQuantity(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.max(1, Math.round(parsed))
}


const { t } = useI18n()
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
      source: item.sources?.find(Boolean)
        ? sourceLabel(item.sources.find(Boolean)!)
        : t('methods.unknown'),
      image: item.image,
    })),
)


const selectedPlannerItemId = ref('')


const viewMode = ref<'list' | 'tree' | 'timeline'>('list')


const listViewRef = ref<InstanceType<typeof PlannerObjectiveList> | null>(null)


const {
  rootNode,
  nodesById,
  activeMethodIdByNode,
  lockedGateByNode,
  skillGateSummary,
  schedule,
  summary,
  inventoryAmounts,
  flatQueuedAmounts,
  getActiveMethod,
  setPinnedMethod,
  resetPins,
} = useCraftPlanner(targetItemId, targetQuantity)


// Hero summary stats — read straight from existing planner outputs (no new logic).
const selectedItemImage = computed(() => {
  const option = plannerItemOptions.value.find((o) => o.id === targetItemId.value)
  return getItemImage({ id: targetItemId.value, image: option?.image })
})


const craftsLeft = computed(() => summary.value?.craftStepCount ?? 0)
const estTimeSeconds = computed(() => summary.value?.totalTimeSeconds ?? null)
const stockedPct = computed(() => {
  const nodes = Object.values(nodesById.value)
  if (nodes.length === 0) return 0
  const fulfilled = nodes.filter((node) => node.fulfilled).length
  return Math.round((fulfilled / nodes.length) * 100)
})


// Modal item picker (replaces the inline dropdown).
const pickerOpen = ref(false)


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


// `selectedPlannerItemId` is NOT a pure derivation of `targetItemId`, so it stays a ref synced
// by this watcher rather than a computed: (1) the picker handlers set it optimistically before
// `updateRoute`'s async navigation settles `targetItemId`, keeping the picker highlight snappy;
// (2) when there is no routed target it must be validated against (and cleared to match) the
// available options. A computed mirror would drop both behaviors.
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


// Clear the target → back to the empty 'Choose an item' state.
function clearTarget() {
  selectedPlannerItemId.value = ''
  updateRoute('', 1)
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


// Tree view: the target item renders as a top-level material card (like the Summon
// planner), with its active recipe's children as the recursive tree below.
const treeRootOpen = ref(true)
const rootChildren = computed(() => {
  if (!rootNode.value) return []
  return getActiveMethod(rootNode.value.id)?.children ?? []
})


// Two planner pages, selected by route meta: Creature (Summon/Awaken/Prestige) and
// Crafting (Single item/Skills). Each renders this same shell with its own tab group.
const page = computed<'creature' | 'crafting'>(() =>
  route.meta.page === 'creature' ? 'creature' : 'crafting',
)


const creatureTabs = computed(
  () =>
    [
      { id: 'summon', label: t('planner.creatureTabs.summon'), icon: Sparkles },
      { id: 'awaken', label: t('planner.creatureTabs.awaken'), icon: Target },
      { id: 'prestige', label: t('planner.creatureTabs.prestige'), icon: Coins },
    ] as const,
)


const craftingTabs = computed(
  () =>
    [
      { id: 'craft', label: t('planner.craftingTabs.singleItem'), icon: Hammer },
      { id: 'skills', label: t('planner.craftingTabs.skills'), icon: GraduationCap },
    ] as const,
)


const tabs = computed(() => (page.value === 'creature' ? creatureTabs.value : craftingTabs.value))


const activeTab = computed(() => {
  const tab = route.query.tab
  if (page.value === 'creature') {
    if (tab === 'awaken' || tab === 'prestige') return tab
    return 'summon'
  }
  return tab === 'skills' ? 'skills' : 'craft'
})


// The active tab's view, rendered through <KeepAlive> so switching tabs no longer
// unmounts/rebuilds the (expensive) planner trees. Each tab has a stable key so the
// forced-objective LevelPlanner instances cache separately. Returns null
// for the crafting default, which renders the inline empty/craft state below.
const activeTabView = computed(() => {
  if (page.value === 'creature') {
    if (activeTab.value === 'summon') return { is: SummoningPlanner, key: 'summon', props: {} }
    if (activeTab.value === 'awaken')
      return { is: LevelPlanner, key: 'awaken', props: { forcedObjective: 'awaken-rush' } }
    if (activeTab.value === 'prestige')
      return { is: LevelPlanner, key: 'prestige', props: { forcedObjective: 'prestige-loop' } }
  }
  if (page.value === 'crafting' && activeTab.value === 'skills')
    return { is: SkillPlanner, key: 'skills', props: {} }
  return null
})


function switchTab(tab: string) {
  if (page.value === 'creature') {
    router.push({ name: 'planner-creature', query: tab === 'summon' ? {} : { tab } })
  } else if (tab === 'skills') {
    router.push({ name: 'planner', query: { tab: 'skills' } })
  } else {
    router.push({ name: 'planner', params: route.params, query: {} })
  }
}


// Guided tour. The shell owns the planner tabs, so it also owns the tour: it maps the
// active creature tab (Summon / Awaken / Prestige) to a tour and drives the walkthrough.
// The crafting tabs have no tour, so the trigger hides there.
const TAB_TO_OBJECTIVE: Record<string, TourObjective> = {
  summon: 'summon',
  awaken: 'awaken-rush',
  prestige: 'prestige-loop',
}
const tourObjective = computed<TourObjective | null>(() =>
  page.value === 'creature' ? (TAB_TO_OBJECTIVE[activeTab.value] ?? null) : null,
)


const { hasSeenTour, startTour, stopTour } = usePlannerTour()
// The tab views load async (defineAsyncComponent), so a view's tour-demo handlers only
// register once its chunk has loaded and mounted. Await the active tab's loader, then let
// the resolved view mount and register, before seeding. Otherwise an auto-launched tour
// fires before the seeding view exists, the seed lookup misses, and the walkthrough runs
// with no demo data — only observable once the chunk is a real network fetch (prod build).
async function takeTour() {
  const obj = tourObjective.value
  if (!obj) return
  await TAB_LOADERS[activeTab.value]?.()
  // Two ticks: the async wrapper swaps skeleton → view on one flush, the view mounts and
  // registers its demo on the next. (Its resolve runs after our await, so one isn't enough.)
  await nextTick()
  await nextTick()
  if (tourObjective.value === obj) startTour(obj, { includeIntro: true })
}
// Auto-run once, the first time the user lands on a planner objective.
let autoLaunched = false
watch(
  tourObjective,
  (obj) => {
    if (autoLaunched || hasSeenTour.value || !obj) return
    autoLaunched = true
    takeTour()
  },
  { immediate: true },
)
// A tour spotlights one objective's elements; if the user switches tabs (or leaves the
// planner) mid-tour, tear it down so the overlay doesn't orphan and the seeded demo
// data is reverted. The shell unmounts before its child views, so this restore runs
// while the seeding view is still mounted.
watch(tourObjective, () => stopTour())
onBeforeUnmount(stopTour)
</script>

<template>
  <section class="space-y-6">
    <div class="relative flex justify-center">
      <div
        data-tour="objective-selector"
        class="inline-flex rounded-xl border border-border/60 bg-card/60 p-1"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === tab.id
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
          "
          @click="switchTab(tab.id)"
        >
          <component :is="tab.icon" class="size-4" />
          {{ tab.label }}
        </button>
      </div>
      <button
        v-if="tourObjective"
        class="focus-ring absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground sm:inline-flex"
        @click="takeTour"
      >
        <HelpCircle class="size-3.5" />
        {{ t('planner.takeTour') }}
      </button>
    </div>

    <KeepAlive>
      <component
        :is="activeTabView.is"
        v-if="activeTabView"
        :key="activeTabView.key"
        v-bind="activeTabView.props"
      />
    </KeepAlive>

    <template v-if="!activeTabView">
      <!-- Header stays put whether or not an item is selected (no layout shift). The title
           is static ("Planner") so it never duplicates the hero card's item identity. -->
      <div>
        <SectionEyebrow>{{ t('planner.title') }}</SectionEyebrow>
        <h1 class="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          {{ t('planner.heading') }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {{ t('planner.subheading') }}
        </p>
        <GoldRateBadge class="mt-2" />
      </div>

      <!-- Slim empty state — opens the modal picker. Button sits on the left, where the
           item control lives once something is selected. -->
      <div v-if="!rootNode" class="surface-card flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
          @click="pickerOpen = true"
        >
          <Search class="size-4" />
          {{ t('plannerComponents.itemPicker.choosePlaceholder') }}
        </button>
        <span class="text-sm text-muted-foreground">{{ t('planner.noItemSelected') }}</span>
      </div>

      <PlannerEmptyState
        v-else-if="!isDesktop"
        :title="t('planner.emptyState.desktopOnly')"
        :subtitle="t('planner.desktopOnlyTreeHint')"
      />

      <div v-else-if="rootNode" class="space-y-6">
        <!-- Command card: target item (click to change) + quantity + summary stats. -->
        <CraftPlannerHero
          :item-id="targetItemId"
          :item-name="rootNode.itemName"
          :item-image="selectedItemImage"
          :crafts-left="craftsLeft"
          :est-time-seconds="estTimeSeconds"
          :stocked-pct="stockedPct"
          @change-item="pickerOpen = true"
          @clear="clearTarget"
        >
          <template #controls>
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
          </template>
        </CraftPlannerHero>

        <!-- Subtle "additional crafts" hint (was a sky-tinted banner). -->
        <i18n-t
          keypath="planner.additionalCraftsHint"
          tag="p"
          class="text-xs text-muted-foreground/70"
        >
          <template #additional>
            <span class="font-semibold text-muted-foreground">{{
              t('planner.additionalCraftsEmphasis')
            }}</span>
          </template>
        </i18n-t>

        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-border/60 p-0.5">
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
              :class="
                viewMode === 'list'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'list'"
            >
              <ClipboardList class="size-3.5" />
              {{ t('planner.viewMode.list') }}
            </button>
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
              :class="
                viewMode === 'tree'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'tree'"
            >
              <Network class="size-3.5" />
              {{ t('planner.viewMode.tree') }}
            </button>
            <button
              class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
              :class="
                viewMode === 'timeline'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="viewMode = 'timeline'"
            >
              <GanttChart class="size-3.5" />
              {{ t('planner.viewMode.timeline') }}
            </button>
          </div>

          <template v-if="viewMode === 'list' || viewMode === 'tree'">
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="viewMode === 'list' ? listViewRef?.collapseAll() : collapseToLeaves()"
            >
              <ChevronsDownUp class="size-3.5" />
              {{ t('planner.controls.collapseAll') }}
            </button>
            <button
              class="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="viewMode === 'list' ? listViewRef?.expandAll() : expandAll()"
            >
              <ChevronsUpDown class="size-3.5" />
              {{ t('planner.controls.expandAll') }}
            </button>
            <span
              v-if="viewMode === 'tree' && collapsedCount > 0"
              class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-2xs font-semibold text-muted-foreground"
            >
              {{ collapsedCount }} {{ t('planner.controls.collapsed') }}
            </span>
          </template>
        </div>

        <!-- Skill-gate roll-up (#2): plan needs resources above current skill levels -->
        <SkillGateRollup :summary="skillGateSummary" class="mb-3" />

        <!-- List view (default) -->
        <PlannerObjectiveList
          v-if="viewMode === 'list'"
          ref="listViewRef"
          :root-node="rootNode"
          :nodes-by-id="nodesById"
          :inventory-amounts="inventoryAmounts"
          :queued-amounts="flatQueuedAmounts"
          :get-active-method="getActiveMethod"
          :locked-gate-by-node="lockedGateByNode"
        />

        <!-- Timeline view -->
        <div v-else-if="viewMode === 'timeline' && schedule" class="space-y-3">
          <PlannerGantt
            :schedule="schedule"
            :nodes-by-id="nodesById"
            :selected-node-id="selectedNodeId"
            :queue-offsets="gameConfig.queuedTimes.value"
            :queued-amounts="flatQueuedAmounts"
            :queued-by-resource="gameConfig.queuedAmounts.value"
            @select-node="selectNode"
          />
        </div>

        <!-- Tree view -->
        <div v-else-if="viewMode === 'tree'" class="space-y-3">
          <PlannerMaterialCard
            :item-id="rootNode.itemId"
            :item-name="rootNode.itemName"
            :item-type="rootNode.itemType"
            :required-amount="rootNode.requiredAmount"
            :summary="summary"
            :open="treeRootOpen"
            @toggle="treeRootOpen = !treeRootOpen"
          >
            <PlannerTreeNode
              v-for="child in rootChildren"
              :key="child.nodeId"
              :node="nodesById[child.nodeId]"
              :nodes-by-id="nodesById"
              :active-method-id-by-node="activeMethodIdByNode"
              :selected-node-id="selectedNodeId"
              :selected-method-id="null"
              :collapsed-node-ids="collapsedNodeIds"
              :inventory-amounts="inventoryAmounts"
              :queued-amounts="flatQueuedAmounts"
              :completion-time-by-node="schedule?.completionTimeByNode ?? {}"
              :recommendations="recommendations"
              :locked-gate-by-node="lockedGateByNode"
              @select-node="selectNode"
              @select-method="() => {}"
              @pin-method="pinMethod"
              @toggle-collapse="toggleCollapse"
            />
            <p v-if="rootChildren.length === 0" class="text-xs text-muted-foreground">
              {{
                rootNode.fulfilled
                  ? t('planner.alreadyStocked')
                  : t('summoningPlannerComponents.materialTree.leafItem')
              }}
            </p>
          </PlannerMaterialCard>
        </div>
      </div>

      <PlannerItemPickerModal
        :open="pickerOpen"
        :options="plannerItemOptions"
        :selected-id="selectedPlannerItemId"
        @select="handlePlannerTargetChange"
        @close="pickerOpen = false"
      />
    </template>
  </section>
</template>
