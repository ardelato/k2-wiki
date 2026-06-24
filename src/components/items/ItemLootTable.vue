<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useItems } from '@/composables/useItems'
import type { LootTableEntry } from '@/types'
import { toTitleCase, formatChance } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

defineProps<{
  entries: LootTableEntry[]
}>()


const emit = defineEmits<{
  'select-item': [id: string]
}>()


const { t } = useI18n()
const { getItemById } = useItems()
</script>

<template>
  <section class="border-t border-border/60 pt-4">
    <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {{ t('items.detail.lootTable') }}
    </h3>
    <div class="space-y-2">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="-mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
        @click="emit('select-item', entry.id)"
      >
        <img
          v-if="getItemImage({ id: entry.id })"
          :src="getItemImage({ id: entry.id })"
          :alt="getItemById(entry.id)?.name"
          class="size-5 shrink-0 object-contain"
          loading="lazy"
        />
        <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
        <span class="flex-1 text-sm font-semibold text-foreground transition hover:text-primary">{{
          getItemById(entry.id)?.name ?? toTitleCase(entry.id)
        }}</span>
        <span class="font-mono text-sm" style="color: var(--color-yellow)"
          >x{{ entry.amount }}</span
        >
        <span class="font-mono text-sm" style="color: var(--color-green)">{{
          formatChance(entry.chance)
        }}</span>
      </div>
    </div>
  </section>
</template>
