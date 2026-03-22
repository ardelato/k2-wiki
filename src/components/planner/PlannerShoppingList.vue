<script setup lang="ts">
import { ChevronDown, ChevronRight, ClipboardCopy, ShoppingCart } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PlannerMethodKind, PlannerSummaryLeaf } from '@/types'
import { methodKindColor, methodKindLabel } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

const props = defineProps<{
  leafItems: PlannerSummaryLeaf[]
  formatAmount: (value: number) => string
  shoppingListText: string
}>()


const isOpen = ref(true)
const copied = ref(false)


const groupedItems = computed(() => {
  const groups = new Map<PlannerMethodKind, PlannerSummaryLeaf[]>()
  for (const leaf of props.leafItems) {
    const group = groups.get(leaf.acquisitionKind) ?? []
    group.push(leaf)
    groups.set(leaf.acquisitionKind, group)
  }
  return [...groups.entries()]
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
      <button
        class="focus-ring -mx-1 flex flex-1 items-center gap-2 rounded-lg px-1 text-left transition hover:bg-muted/15"
        @click="isOpen = !isOpen"
      >
        <component :is="isOpen ? ChevronDown : ChevronRight" class="size-4 text-muted-foreground" />
        <ShoppingCart class="size-4 text-primary" />
        <span class="text-sm font-bold text-foreground">Gathering List</span>
        <span
          class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
        >
          {{ leafItems.length }}
        </span>
      </button>
      <button
        v-if="isOpen && leafItems.length"
        class="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
        @click="copyToClipboard"
      >
        <ClipboardCopy class="size-3" />
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>

    <div v-if="isOpen && leafItems.length" class="space-y-3 px-4 pb-4">
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
            <span
              class="ml-auto shrink-0 font-mono text-sm font-semibold"
              :style="{
                color: leaf.stillNeeded === 0 ? 'var(--color-green)' : 'var(--color-primary)',
              }"
            >
              {{
                leaf.stillNeeded === 0
                  ? 'In Stock'
                  : leaf.stillNeeded === leaf.amount
                    ? `x${formatAmount(leaf.amount)}`
                    : `x${formatAmount(leaf.stillNeeded)} / x${formatAmount(leaf.amount)}`
              }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
