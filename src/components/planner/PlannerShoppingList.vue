<script setup lang="ts">
import { ClipboardCopy, ShoppingCart } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PlannerMethodKind, PlannerSummaryLeaf } from '@/types'
import { methodKindColor, methodKindLabel } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

const props = defineProps<{
  leafItems: PlannerSummaryLeaf[]
  formatAmount: (value: number) => string
  shoppingListText: string
}>()


const copied = ref(false)


const groupedItems = computed(() => {
  // Separate stocked items from non-stocked, group by kind
  const groups = new Map<PlannerMethodKind, PlannerSummaryLeaf[]>()
  const stockedItems: PlannerSummaryLeaf[] = []

  for (const leaf of props.leafItems) {
    if (leaf.stillNeeded === 0) {
      stockedItems.push(leaf)
    } else {
      const group = groups.get(leaf.acquisitionKind) ?? []
      group.push(leaf)
      groups.set(leaf.acquisitionKind, group)
    }
  }

  const result: [PlannerMethodKind, PlannerSummaryLeaf[]][] = [...groups.entries()]

  // "In stock" items always last
  if (stockedItems.length > 0) {
    result.push(['stocked', stockedItems])
  }

  return result
})


async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.shoppingListText)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Clipboard API not available
  }
}
</script>

<template>
  <div class="surface-card overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-3">
      <div class="flex flex-1 items-center gap-2">
        <ShoppingCart class="size-4 text-primary" />
        <span class="text-sm font-bold text-foreground">Gathering List</span>
        <span
          class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
        >
          {{ leafItems.length }}
        </span>
      </div>
      <button
        v-if="leafItems.length"
        class="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
        @click="copyToClipboard"
      >
        <ClipboardCopy class="size-3" />
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>

    <div v-if="leafItems.length" class="space-y-3 px-4 pb-4">
      <div v-for="[kind, leaves] in groupedItems" :key="kind" class="space-y-1">
        <p
          class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]"
          :style="{ color: methodKindColor(kind) }"
        >
          {{ methodKindLabel(kind) }}
        </p>
        <div class="space-y-1">
          <div
            v-for="leaf in leaves"
            :key="leaf.itemId"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="getItemImage({ id: leaf.itemId })"
              :src="getItemImage({ id: leaf.itemId })"
              :alt="leaf.itemName"
              class="size-5 object-contain"
              loading="lazy"
            />
            <span
              class="min-w-0 truncate text-sm"
              :class="
                leaf.stillNeeded === 0 ? 'text-muted-foreground line-through' : 'text-foreground'
              "
              >{{ leaf.itemName }}
              <span
                v-if="leaf.inventoryAmount > 0"
                class="text-[11px] font-normal text-muted-foreground"
                >({{ leaf.inventoryAmount }} in stock)</span
              >
            </span>
            <span class="ml-auto shrink-0 font-mono text-sm font-semibold">
              <template v-if="leaf.stillNeeded === 0">
                <span style="color: var(--color-green)">In Stock</span>
              </template>
              <template v-else-if="leaf.stillNeeded === leaf.amount">
                <span style="color: var(--color-primary)">x{{ formatAmount(leaf.amount) }}</span>
              </template>
              <template v-else>
                <span class="group/amounts relative">
                  <span style="color: var(--color-primary)"
                    >x{{ formatAmount(leaf.stillNeeded) }}</span
                  >
                  <span class="font-normal text-muted-foreground"> / </span>
                  <span class="text-muted-foreground/60">x{{ formatAmount(leaf.amount) }}</span>
                  <!-- Tooltip -->
                  <span
                    class="pointer-events-none absolute bottom-full right-0 mb-2 flex min-w-36 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 opacity-0 shadow-lg transition-opacity group-hover/amounts:opacity-100"
                  >
                    <span class="flex items-center justify-between gap-3 text-xs">
                      <span class="font-semibold text-muted-foreground">Needed</span>
                      <span class="font-bold" style="color: var(--color-primary)"
                        >x{{ formatAmount(leaf.stillNeeded) }}</span
                      >
                    </span>
                    <span class="flex items-center justify-between gap-3 text-xs">
                      <span class="font-semibold text-muted-foreground">Total</span>
                      <span class="font-bold text-foreground"
                        >x{{ formatAmount(leaf.amount) }}</span
                      >
                    </span>
                    <span class="flex items-center justify-between gap-3 text-xs">
                      <span class="font-semibold text-muted-foreground">In stock</span>
                      <span class="font-bold text-emerald-600 dark:text-emerald-400">{{
                        formatAmount(leaf.inventoryAmount)
                      }}</span>
                    </span>
                  </span>
                </span>
              </template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
