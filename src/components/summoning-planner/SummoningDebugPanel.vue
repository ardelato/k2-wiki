<script setup lang="ts">
import { Bug, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useGameConfig } from '@/composables/useGameConfig'
import { itemById } from '@/data/indexes'
import { activeLocale } from '@/i18n'
import type { PlannerNode } from '@/types'
import { getItemImage } from '@/utils/itemImages'

import type SummoningMaterialTree from './SummoningMaterialTree.vue'

const props = defineProps<{
  open: boolean
  treeRefs: InstanceType<typeof SummoningMaterialTree>[]
}>()


const emit = defineEmits<{
  close: []
}>()


const { t } = useI18n()
const gameConfig = useGameConfig()


type Tab = 'inventory' | 'nodes'
const activeTab = ref<Tab>('inventory')
const filter = ref('')


interface InventoryEntry {
  itemId: string
  itemName: string
  owned: number
  queued: number
  total: number
}


const flatQueuedAmounts = computed(() => {
  const flat: Record<string, number> = {}
  for (const items of Object.values(gameConfig.queuedAmounts.value)) {
    for (const [id, amount] of Object.entries(items)) {
      if (amount > 0) flat[id] = (flat[id] ?? 0) + amount
    }
  }
  return flat
})


const inventoryEntries = computed<InventoryEntry[]>(() => {
  const seenIds = new Set<string>()
  const entries: InventoryEntry[] = []

  for (const id of Object.keys(gameConfig.inventoryAmounts.value)) {
    seenIds.add(id)
  }
  for (const id of Object.keys(flatQueuedAmounts.value)) {
    seenIds.add(id)
  }

  for (const id of seenIds) {
    const owned = gameConfig.inventoryAmounts.value[id] ?? 0
    const queued = flatQueuedAmounts.value[id] ?? 0
    if (owned <= 0 && queued <= 0) continue
    const item = itemById.get(id)
    entries.push({
      itemId: id,
      itemName: item?.name ?? id,
      owned,
      queued,
      total: owned + queued,
    })
  }

  return entries.toSorted((a, b) => a.itemName.localeCompare(b.itemName))
})


const filteredInventory = computed(() => {
  if (!filter.value) return inventoryEntries.value
  const q = filter.value.toLowerCase()
  return inventoryEntries.value.filter(
    (e) => e.itemName.toLowerCase().includes(q) || e.itemId.toLowerCase().includes(q),
  )
})


interface NodeEntry {
  treeRoot: string
  nodeId: string
  itemId: string
  itemName: string
  depth: number
  grossAmount: number
  requiredAmount: number
  fulfilled: boolean
  methodCount: number
  defaultMethodKind: string | null
}


function collectTreeNodes(treeRefs: InstanceType<typeof SummoningMaterialTree>[]): NodeEntry[] {
  const entries: NodeEntry[] = []


  for (const tree of treeRefs) {
    if (!tree?.rootNode || !tree?.nodesById) continue
    const treeRoot = tree.rootNode.itemName ?? tree.rootNode.itemId


    function walkNode(node: PlannerNode) {
      const activeMethodId = tree.activeMethodIdByNode[node.id]
      const activeMethod = activeMethodId ? node.methods.find((m) => m.id === activeMethodId) : null


      entries.push({
        treeRoot,
        nodeId: node.id,
        itemId: node.itemId,
        itemName: node.itemName,
        depth: node.depth,
        grossAmount: node.grossAmount,
        requiredAmount: node.requiredAmount,
        fulfilled: node.fulfilled,
        methodCount: node.methods.length,
        defaultMethodKind: activeMethod?.kind ?? null,
      })


      // Recurse into children of active method
      if (!node.fulfilled && activeMethod) {
        for (const child of activeMethod.children) {
          const childNode = tree.nodesById[child.nodeId]
          if (childNode) walkNode(childNode)
        }
      }
    }


    walkNode(tree.rootNode)
  }


  return entries
}


const filteredNodes = computed(() => {
  const nodes = collectTreeNodes(props.treeRefs)
  if (!filter.value) return nodes
  const q = filter.value.toLowerCase()
  return nodes.filter(
    (n) => n.itemName.toLowerCase().includes(q) || n.itemId.toLowerCase().includes(q),
  )
})


function fmt(n: number): string {
  return n.toLocaleString(activeLocale())
}
</script>

<template>
  <Teleport to="body">
    <!-- Drawer panel -->
    <Transition name="slide">
      <div
        v-if="open"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-border bg-card shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <Bug class="size-4 text-amber-500" />
          <span
            class="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400"
          >
            {{ t('summoningPlannerComponents.debugPanel.title') }}
          </span>
          <button
            class="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-border/40">
          <button
            class="flex-1 px-4 py-2 text-xs font-medium transition"
            :class="
              activeTab === 'inventory'
                ? 'border-b-2 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'inventory'"
          >
            {{
              t('summoningPlannerComponents.debugPanel.inventory', { n: inventoryEntries.length })
            }}
          </button>
          <button
            class="flex-1 px-4 py-2 text-xs font-medium transition"
            :class="
              activeTab === 'nodes'
                ? 'border-b-2 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'nodes'"
          >
            {{ t('summoningPlannerComponents.debugPanel.treeNodes') }}
          </button>
        </div>

        <!-- Filter -->
        <div class="border-b border-border/40 px-4 py-3">
          <input
            v-model="filter"
            type="text"
            :placeholder="
              activeTab === 'inventory'
                ? t('summoningPlannerComponents.debugPanel.filterItems')
                : t('summoningPlannerComponents.debugPanel.filterNodes')
            "
            class="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
        </div>

        <!-- Content: Inventory tab -->
        <div v-if="activeTab === 'inventory'" class="flex-1 overflow-y-auto">
          <p
            v-if="filteredInventory.length === 0"
            class="py-8 text-center text-xs text-muted-foreground/50"
          >
            {{
              filter
                ? t('summoningPlannerComponents.debugPanel.noItems')
                : t('summoningPlannerComponents.debugPanel.noInventory')
            }}
          </p>

          <table v-else class="w-full text-xs">
            <thead class="sticky top-0 bg-card">
              <tr
                class="border-b border-border/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60"
              >
                <th class="px-4 py-2">{{ t('summoningPlannerComponents.debugPanel.item') }}</th>
                <th class="px-3 py-2 text-right">
                  {{ t('summoningPlannerComponents.debugPanel.owned') }}
                </th>
                <th class="px-3 py-2 text-right">
                  {{ t('summoningPlannerComponents.debugPanel.queued') }}
                </th>
                <th class="px-3 py-2 text-right">
                  {{ t('summoningPlannerComponents.debugPanel.total') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/20">
              <tr
                v-for="entry in filteredInventory"
                :key="entry.itemId"
                class="transition hover:bg-foreground/[0.02]"
              >
                <td class="px-4 py-1.5">
                  <div class="flex items-center gap-2">
                    <img
                      v-if="getItemImage({ id: entry.itemId })"
                      :src="getItemImage({ id: entry.itemId })"
                      :alt="entry.itemName"
                      class="size-5 shrink-0 object-contain"
                      loading="lazy"
                    />
                    <div class="min-w-0">
                      <span class="block truncate font-medium text-foreground">
                        {{ entry.itemName }}
                      </span>
                      <span class="block truncate text-[10px] text-muted-foreground/40">
                        {{ entry.itemId }}
                      </span>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-1.5 text-right font-mono">
                  <span :class="entry.owned > 0 ? 'text-foreground' : 'text-muted-foreground/30'">
                    {{ fmt(entry.owned) }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-right font-mono">
                  <span :class="entry.queued > 0 ? 'text-sky-500' : 'text-muted-foreground/30'">
                    {{ fmt(entry.queued) }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-right font-mono font-semibold text-foreground">
                  {{ fmt(entry.total) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Content: Tree Nodes tab -->
        <div v-else-if="activeTab === 'nodes'" class="flex-1 overflow-y-auto">
          <template v-if="treeRefs.length > 0">
            <div
              v-for="entry in filteredNodes"
              :key="entry.nodeId"
              class="border-b border-border/20 px-4 py-2 transition hover:bg-foreground/[0.02]"
              :class="entry.depth === 0 ? 'bg-muted/20' : ''"
            >
              <div class="flex items-center gap-2">
                <span
                  v-if="entry.depth > 0"
                  class="text-[10px] text-muted-foreground/40"
                  :style="{ paddingLeft: (entry.depth - 1) * 12 + 'px' }"
                >
                  └
                </span>
                <img
                  v-if="getItemImage({ id: entry.itemId })"
                  :src="getItemImage({ id: entry.itemId })"
                  :alt="entry.itemName"
                  class="size-4 shrink-0 object-contain"
                  loading="lazy"
                />
                <span class="text-xs font-medium text-foreground">{{ entry.itemName }}</span>
                <span
                  v-if="entry.fulfilled"
                  class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {{ t('summoningPlannerComponents.debugPanel.fulfilled') }}
                </span>
                <span
                  v-else-if="entry.methodCount === 0"
                  class="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400"
                >
                  {{ t('summoningPlannerComponents.debugPanel.noMethods') }}
                </span>
                <span
                  v-if="entry.depth === 0"
                  class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {{ t('summoningPlannerComponents.debugPanel.root') }}
                </span>
              </div>
              <div
                class="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground/60"
                :style="{ paddingLeft: entry.depth > 0 ? (entry.depth - 1) * 12 + 16 + 'px' : '0' }"
              >
                <span
                  >{{ t('summoningPlannerComponents.debugPanel.gross') }}
                  {{ fmt(entry.grossAmount) }}</span
                >
                <span
                  >{{ t('summoningPlannerComponents.debugPanel.net') }}
                  {{ fmt(entry.requiredAmount) }}</span
                >
                <span v-if="entry.defaultMethodKind"
                  >{{ t('summoningPlannerComponents.debugPanel.via') }}
                  {{ entry.defaultMethodKind }}</span
                >
                <span
                  >{{ t('summoningPlannerComponents.debugPanel.methods') }}
                  {{ entry.methodCount }}</span
                >
                <span class="text-muted-foreground/30">{{ entry.treeRoot }}</span>
              </div>
            </div>
          </template>
          <p v-else class="py-8 text-center text-xs text-muted-foreground/50">
            {{ t('summoningPlannerComponents.debugPanel.noTree') }}
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
