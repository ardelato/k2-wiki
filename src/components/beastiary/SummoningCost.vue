<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useItems } from '@/composables/useItems'
import { activeLocale } from '@/i18n'
import { toTitleCase } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

const { t } = useI18n()


defineProps<{
  costs: { id: string; amount: number }[]
}>()


const { getItemById } = useItems()
</script>

<template>
  <section class="detail-section">
    <h3 class="section-title mb-3">{{ t('beastiary.summoningCost.title') }}</h3>
    <div class="space-y-2">
      <router-link
        v-for="cost in costs"
        :key="cost.id"
        :to="{ path: '/items', query: { item: cost.id } }"
        class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:border-accent/45 hover:bg-muted/30"
      >
        <img
          v-if="getItemImage({ id: cost.id })"
          :src="getItemImage({ id: cost.id })"
          :alt="getItemById(cost.id)?.name ?? toTitleCase(cost.id)"
          class="size-5 shrink-0 object-contain"
          loading="lazy"
        />
        <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
        <span class="flex-1 text-sm text-foreground">{{
          getItemById(cost.id)?.name ?? toTitleCase(cost.id)
        }}</span>
        <span class="font-mono text-sm font-semibold text-muted-foreground"
          >x{{ cost.amount.toLocaleString(activeLocale()) }}</span
        >
      </router-link>
    </div>
  </section>
</template>
