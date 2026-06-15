<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useGoldIncome } from '@/composables/useGoldIncome'
import { getItemImage } from '@/utils/itemImages'

const { t } = useI18n()
const { goldPerMinute, breakdown } = useGoldIncome()
</script>

<template>
  <div v-if="goldPerMinute > 0" class="group relative inline-flex">
    <div
      class="inline-flex cursor-help items-center gap-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-400"
    >
      <img
        v-if="getItemImage({ id: 'gold' })"
        :src="getItemImage({ id: 'gold' })"
        alt="Gold"
        class="size-3.5 object-contain"
      />
      {{ goldPerMinute }} {{ t('plannerComponents.goldRate.goldPerMin') }}
    </div>

    <!-- Popover -->
    <div
      class="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-border bg-card p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
    >
      <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {{ t('plannerComponents.goldRate.breakdown') }}
      </p>
      <div class="space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">{{
            t('plannerComponents.goldRate.awakenedCreatures')
          }}</span>
          <span class="font-semibold text-foreground">
            {{ breakdown.awakenedCount }} × {{ 1 + breakdown.awakenGoldLevel }} =
            {{ breakdown.creatureGoldPerMin }}{{ t('plannerComponents.goldRate.perMin') }}
          </span>
        </div>
        <div v-if="breakdown.awakenGoldLevel > 0" class="flex items-center justify-between pl-3">
          <span class="text-muted-foreground/60">{{
            t('plannerComponents.goldRate.awakenGold', { n: breakdown.awakenGoldLevel })
          }}</span>
        </div>
        <div v-if="breakdown.flowerGoldPerMin > 0" class="flex items-center justify-between">
          <span class="text-muted-foreground">{{
            t('plannerComponents.goldRate.goldFlowers')
          }}</span>
          <span class="font-semibold text-foreground"
            >{{ breakdown.flowerGoldPerMin }}{{ t('plannerComponents.goldRate.perMin') }}</span
          >
        </div>
        <div class="border-t border-border/40 pt-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-foreground">{{
              t('plannerComponents.goldRate.total')
            }}</span>
            <span class="font-bold text-yellow-700 dark:text-yellow-400"
              >{{ breakdown.totalGoldPerMin }}
              {{ t('plannerComponents.goldRate.goldPerMin') }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
