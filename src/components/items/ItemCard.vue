<script setup lang="ts">
import type { Item } from '@/types'
import { itemTypeColor } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

defineProps<{
  item: Item
  selected: boolean
}>()


defineEmits<{
  select: [item: Item]
}>()
</script>

<template>
  <article
    tabindex="0"
    role="button"
    class="surface-card group relative cursor-pointer overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-glow active:translate-y-0 active:shadow-none"
    :class="selected ? 'border-primary/40 ring-2 ring-primary/60' : ''"
    @click="$emit('select', item)"
    @keydown.enter="$emit('select', item)"
  >
    <!-- Image / Placeholder area -->
    <div
      class="flex aspect-[4/3] items-center justify-center rounded-t-[inherit]"
      :style="{
        background: `linear-gradient(180deg, color-mix(in oklch, ${itemTypeColor(item.type)} 15%, transparent) 0%, color-mix(in oklch, ${itemTypeColor(item.type)} 8%, transparent) 100%)`,
      }"
    >
      <img
        v-if="getItemImage(item)"
        :src="getItemImage(item)"
        :alt="item.name"
        class="size-16 object-contain drop-shadow-md"
      />
      <span
        v-else
        class="text-3xl font-bold"
        :style="{ color: `color-mix(in oklch, ${itemTypeColor(item.type)} 50%, transparent)` }"
      >
        {{ item.name.charAt(0) }}
      </span>
    </div>

    <!-- Info area -->
    <div class="p-3">
      <h3 class="truncate text-sm font-bold leading-snug text-foreground">
        {{ item.name }}
      </h3>
      <span
        class="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
        :style="{
          color: itemTypeColor(item.type),
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(item.type)} 12%, transparent)`,
        }"
      >
        {{ item.type }}
      </span>
    </div>
  </article>
</template>
