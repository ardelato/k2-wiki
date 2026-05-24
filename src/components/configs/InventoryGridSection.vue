<script setup lang="ts">
import AppTooltip from '@/components/shared/AppTooltip.vue'
import { getItemImage } from '@/utils/itemImages'

interface InventoryGridEntry {
  id: string
  name: string
  image?: string
  amount: number
  owned: boolean
}


defineProps<{
  items: InventoryGridEntry[]
}>()


function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(amount)
}
</script>

<template>
  <section>
    <div class="rounded-2xl border border-border bg-card/50 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-2 text-left">
          <h3 class="text-sm font-extrabold">Inventory</h3>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
            {{ items.filter((i) => i.owned).length }} / {{ items.length }} collected
          </span>
        </div>
      </div>

      <div class="mt-3 space-y-3">
        <div class="rounded-xl border border-border/60 bg-background p-2">
          <div
            class="grid gap-1.5"
            style="grid-template-columns: repeat(auto-fill, minmax(60px, 1fr))"
          >
            <AppTooltip
              v-for="item in items"
              :key="item.id"
              :text="item.owned ? `${item.name} · ${item.amount.toLocaleString()}` : item.name"
            >
              <div
                class="relative aspect-square shrink-0 overflow-hidden rounded-md border"
                :class="item.owned ? 'border-border bg-card/50' : 'border-border/30 bg-card/10'"
              >
                <img
                  v-if="getItemImage({ id: item.id, image: item.image })"
                  :src="getItemImage({ id: item.id, image: item.image })"
                  :alt="item.name"
                  class="size-full object-contain p-1"
                  :class="item.owned ? '' : 'opacity-10 grayscale'"
                  loading="lazy"
                />
                <div
                  v-else
                  class="flex size-full items-center justify-center bg-muted text-xs font-bold"
                  :class="item.owned ? '' : 'opacity-20'"
                >
                  {{ item.name.charAt(0) }}
                </div>
                <template v-if="item.owned">
                  <span
                    class="absolute right-0 top-0 rounded-bl-md bg-black/85 px-1 py-px font-mono text-[9px] font-bold tabular-nums leading-none text-white shadow"
                  >
                    {{ formatAmount(item.amount) }}
                  </span>
                  <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1 py-px">
                    <p class="truncate text-center text-[9px] font-bold leading-tight text-white">
                      {{ item.name }}
                    </p>
                  </div>
                </template>
              </div>
            </AppTooltip>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
