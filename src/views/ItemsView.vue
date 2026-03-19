<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { useItems } from '@/composables/useItems'
import type { Item } from '@/types'
import { itemTypeColor, sourceLabel } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
import ItemsToolbar from '@/components/items/ItemsToolbar.vue'
import ItemCard from '@/components/items/ItemCard.vue'
import ItemDetail from '@/components/items/ItemDetail.vue'

const {
  filteredItems,
  searchQuery,
  typeFilter,
  sourceFilter,
  sourceSubFilter,
  availableSubFilters,
  getItemById,
  getRecipeUsages,
} = useItems()

const viewMode = ref<'grid' | 'table'>('grid')
const selectedItem = ref<Item | null>(null)
const detailPanelRef = ref<HTMLElement | null>(null)
const lastTriggerEl = ref<HTMLElement | null>(null)

type SortKey = 'name' | 'type' | 'buyValue' | 'sellValue' | 'recipeCount' | 'usedInCount'

function getDeduplicatedRecipeCount(itemId: string): number {
  const usages = getRecipeUsages(itemId)
  const seen = new Set<string>()
  for (const u of usages) seen.add(u.outputItemId)
  return seen.size
}

const anySummons = computed(() => filteredItems.value.some(i => (i.summoning?.length ?? 0) > 0))

function uniqueSourceLabels(sources: string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of (sources ?? []).filter(Boolean)) {
    const label = sourceLabel(s)
    if (!seen.has(label)) {
      seen.add(label)
      result.push(label)
    }
  }
  return result
}
const tableSortKey = ref<SortKey>('name')
const tableSortDirection = ref<'asc' | 'desc'>('asc')

const isMobile = useMediaQuery('(max-width: 1279px)')

const sortedItems = computed(() => {
  const list = [...filteredItems.value]
  list.sort((a, b) => {
    let result = 0
    const key = tableSortKey.value
    if (key === 'name') result = a.name.localeCompare(b.name)
    else if (key === 'type') result = a.type.localeCompare(b.type)
    else if (key === 'buyValue') result = (a.buyValue ?? 0) - (b.buyValue ?? 0)
    else if (key === 'sellValue') result = (a.sellValue ?? 0) - (b.sellValue ?? 0)
    else if (key === 'recipeCount') result = getDeduplicatedRecipeCount(a.id) - getDeduplicatedRecipeCount(b.id)
    else if (key === 'usedInCount') result = getRecipeUsages(a.id).length - getRecipeUsages(b.id).length
    return tableSortDirection.value === 'asc' ? result : -result
  })
  return list
})

function sortBy(key: SortKey) {
  if (tableSortKey.value === key) {
    tableSortDirection.value = tableSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  tableSortKey.value = key
  tableSortDirection.value = 'asc'
}

function selectItem(item: Item) {
  selectedItem.value = item
  nextTick(() => {
    detailPanelRef.value?.focus()
  })
}

function selectItemFromEvent(item: Item, event: Event) {
  lastTriggerEl.value = (event.currentTarget as HTMLElement) ?? null
  selectItem(item)
}

function selectItemById(id: string) {
  const item = getItemById(id)
  if (!item) return
  // Clear filters if item is currently filtered out
  if (!filteredItems.value.find(i => i.id === id)) {
    searchQuery.value = ''
    typeFilter.value = 'all'
    sourceFilter.value = 'all'
    sourceSubFilter.value.clear()
  }
  selectedItem.value = item
}

function closeDetail() {
  selectedItem.value = null
  nextTick(() => {
    lastTriggerEl.value?.focus()
    lastTriggerEl.value = null
  })
}

function toggleSubFilter(v: string) {
  if (sourceSubFilter.value.has(v)) sourceSubFilter.value.delete(v)
  else sourceSubFilter.value.add(v)
}

function clearSubFilters() {
  sourceSubFilter.value.clear()
}

function clearFilters() {
  searchQuery.value = ''
  typeFilter.value = 'all'
  sourceFilter.value = 'all'
  sourceSubFilter.value.clear()
}

const hasActiveFilters = computed(() =>
  typeFilter.value !== 'all' || sourceFilter.value !== 'all' || searchQuery.value !== '' || sourceSubFilter.value.size > 0
)

const route = useRoute()

onMounted(() => {
  const itemId = route.query.item
  if (typeof itemId === 'string') {
    selectItemById(itemId)
  }
})
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <ItemsToolbar
      v-model:search-query="searchQuery"
      v-model:type-filter="typeFilter"
      v-model:source-filter="sourceFilter"
      v-model:view-mode="viewMode"
      :result-count="filteredItems.length"
      :source-sub-filter="sourceSubFilter"
      :available-sub-filters="availableSubFilters"
      @toggle-sub-filter="toggleSubFilter"
      @clear-sub-filters="clearSubFilters"
    />

    <div class="flex gap-5">
      <div class="min-w-0 flex-1">
        <!-- Empty state -->
        <div v-if="filteredItems.length === 0" class="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/50 px-6 py-16 text-center">
          <p class="text-lg font-semibold text-foreground">No items match your filters</p>
          <p class="mt-1 text-sm text-muted-foreground">Try adjusting your search or filter criteria.</p>
          <button
            v-if="hasActiveFilters"
            class="focus-ring mt-4 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
            @click="clearFilters"
          >
            Clear all filters
          </button>
        </div>

        <!-- Grid view -->
        <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <ItemCard
            v-for="item in filteredItems"
            :key="item.id"
            :item="item"
            :selected="selectedItem?.id === item.id"
            @select="selectItem"
          />
        </div>

        <!-- Table view -->
        <div v-else class="surface-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm" role="grid">
              <thead class="bg-muted/50">
                <tr>
                  <th
                    class="px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'name' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('name')">
                      Name
                      <span :class="tableSortKey === 'name' ? 'text-primary' : 'opacity-30'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'type' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('type')">
                      Type
                      <span :class="tableSortKey === 'type' ? 'text-primary' : 'opacity-30'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Sources
                  </th>
                  <th class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    <span class="inline-flex items-center gap-1">
                      <button class="focus-ring inline-flex items-center gap-0.5 transition hover:text-foreground" @click="sortBy('buyValue')">
                        Buy
                        <span :class="tableSortKey === 'buyValue' ? 'text-primary' : 'opacity-30'">{{ tableSortKey === 'buyValue' ? (tableSortDirection === 'asc' ? '▲' : '▼') : '▲' }}</span>
                      </button>
                      <span class="text-muted-foreground/50">/</span>
                      <button class="focus-ring inline-flex items-center gap-0.5 transition hover:text-foreground" @click="sortBy('sellValue')">
                        Sell
                        <span :class="tableSortKey === 'sellValue' ? 'text-primary' : 'opacity-30'">{{ tableSortKey === 'sellValue' ? (tableSortDirection === 'asc' ? '▲' : '▼') : '▲' }}</span>
                      </button>
                    </span>
                  </th>
                  <th
                    class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'recipeCount' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('recipeCount')">
                      Recipes
                      <span :class="tableSortKey === 'recipeCount' ? 'text-primary' : 'opacity-30'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th
                    class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    :aria-sort="tableSortKey === 'usedInCount' ? (tableSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                  >
                    <button class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground" @click="sortBy('usedInCount')">
                      Used In
                      <span :class="tableSortKey === 'usedInCount' ? 'text-primary' : 'opacity-30'">{{ tableSortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                  </th>
                  <th v-if="anySummons" class="whitespace-nowrap px-2 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Summons
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60">
                <tr
                  v-for="item in sortedItems"
                  :key="item.id"
                  tabindex="0"
                  role="row"
                  class="cursor-pointer transition-colors duration-150"
                  :class="[
                    selectedItem?.id === item.id ? 'bg-muted/40' : 'bg-card/50 hover:bg-muted/30',
                    'even:bg-muted/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60'
                  ]"
                  @click="selectItemFromEvent(item, $event)"
                  @keydown.enter="selectItemFromEvent(item, $event)"
                >
                  <td
                    class="border-l-2 px-2 py-2.5 transition-[border-color] duration-150"
                    :style="{ borderColor: selectedItem?.id === item.id ? itemTypeColor(item.type) : 'transparent' }"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border text-xs font-bold"
                        :style="{ color: itemTypeColor(item.type), backgroundColor: `color-mix(in oklch, ${itemTypeColor(item.type)} 10%, transparent)` }"
                      >
                        <img
                          v-if="getItemImage(item)"
                          :src="getItemImage(item)"
                          :alt="item.name"
                          class="size-8 object-contain"
                        />
                        <template v-else>{{ item.name.charAt(0) }}</template>
                      </div>
                      <span class="text-sm font-semibold text-foreground">{{ item.name }}</span>
                    </div>
                  </td>
                  <td class="px-2 py-2.5">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      :style="{ color: itemTypeColor(item.type), backgroundColor: `color-mix(in oklch, ${itemTypeColor(item.type)} 12%, transparent)` }"
                    >
                      {{ item.type }}
                    </span>
                  </td>
                  <td class="px-2 py-2.5">
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="label in uniqueSourceLabels(item.sources).slice(0, 2)"
                        :key="label"
                        class="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {{ label }}
                      </span>
                      <span v-if="uniqueSourceLabels(item.sources).length > 2" class="text-xs text-muted-foreground">+{{ uniqueSourceLabels(item.sources).length - 2 }}</span>
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-2 py-2.5 font-mono text-sm text-yellow-400">
                    {{ item.buyValue ?? '—' }} / {{ item.sellValue ?? '—' }}
                  </td>
                  <td class="px-2 py-2.5 text-sm text-foreground">
                    {{ getDeduplicatedRecipeCount(item.id) || '—' }}
                  </td>
                  <td class="px-2 py-2.5 text-sm text-foreground">
                    {{ getRecipeUsages(item.id).length || '—' }}
                  </td>
                  <td v-if="anySummons" class="px-2 py-2.5 text-sm text-foreground">
                    {{ item.summoning?.length || '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Detail Sidebar -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-x-3"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-3"
      >
        <aside v-if="selectedItem" class="hidden w-[380px] shrink-0 xl:block">
          <div
            ref="detailPanelRef"
            tabindex="-1"
            class="surface-card sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto outline-none"
          >
            <ItemDetail :item="selectedItem" @close="closeDetail" @select-item="selectItemById" />
          </div>
        </aside>
      </Transition>
    </div>

    <!-- Mobile Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="selectedItem && isMobile"
          class="fixed inset-0 z-50 bg-background/95 p-4 backdrop-blur-sm xl:hidden"
          @click.self="closeDetail"
        >
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-4"
          >
            <div class="mx-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-card">
              <ItemDetail :item="selectedItem" @close="closeDetail" @select-item="selectItemById" />
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
