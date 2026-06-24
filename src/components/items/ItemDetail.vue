<script setup lang="ts">
import { X, GitBranch } from 'lucide-vue-next'
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ItemExpeditions from '@/components/items/ItemExpeditions.vue'
import ItemJobSources from '@/components/items/ItemJobSources.vue'
import ItemLootTable from '@/components/items/ItemLootTable.vue'
import ItemRecipeList from '@/components/items/ItemRecipeList.vue'
import ItemSummoning from '@/components/items/ItemSummoning.vue'
import { useItemDetail } from '@/composables/useItemDetail'
import type { Item } from '@/types'
import { itemTypeColor } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const props = withDefaults(
  defineProps<{
    item: Item
    showCloseButton?: boolean
  }>(),
  {
    showCloseButton: true,
  },
)


const emit = defineEmits<{
  close: []
  'select-item': [id: string]
  'select-creature': [id: string]
}>()


const item = toRef(props, 'item')


const {
  summoningCreatures,
  jobSources,
  containerSources,
  expeditionSources,
  groupedJobSources,
  dedupedRecipeUsages,
  mergedRecipes,
} = useItemDetail(item)


const hasJobOrContainerSources = computed(
  () => jobSources.value.length > 0 || containerSources.value.length > 0,
)
</script>

<template>
  <div>
    <!-- Gradient header -->
    <div
      class="relative flex flex-col items-center px-5 pb-4 pt-6"
      :style="{
        background: `linear-gradient(180deg, color-mix(in oklch, ${itemTypeColor(item.type)} 15%, transparent) 0%, color-mix(in oklch, ${itemTypeColor(item.type)} 8%, transparent) 100%)`,
      }"
    >
      <button
        v-if="showCloseButton"
        :aria-label="t('items.detail.closeDetails')"
        class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground active:bg-muted/60"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>

      <div class="flex aspect-[3/2] w-full items-center justify-center">
        <img
          v-if="getItemImage(item)"
          :src="getItemImage(item)"
          :alt="item.name"
          class="size-24 object-contain drop-shadow-lg"
          loading="lazy"
        />
        <span
          v-else
          class="text-4xl font-bold"
          :style="{ color: `color-mix(in oklch, ${itemTypeColor(item.type)} 50%, transparent)` }"
        >
          {{ item.name.charAt(0) }}
        </span>
      </div>
      <h2 class="text-center text-xl font-black leading-tight">{{ item.name }}</h2>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :style="{
            color: itemTypeColor(item.type),
            backgroundColor: `color-mix(in oklch, ${itemTypeColor(item.type)} 12%, transparent)`,
          }"
        >
          {{ item.type }}
        </span>
        <RouterLink
          :to="{ name: 'planner', params: { id: item.id } }"
          class="focus-ring inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
        >
          <GitBranch class="size-3.5" />
          {{ t('items.detail.openPlanner') }}
        </RouterLink>
      </div>
    </div>

    <div class="space-y-5 px-5 pb-5">
      <!-- Description -->
      <div v-if="item.description" class="border-t border-border/60 pt-4">
        <p class="text-sm leading-relaxed text-muted-foreground">{{ item.description }}</p>
      </div>

      <!-- Values -->
      <section
        v-if="item.buyValue != null || item.sellValue != null"
        class="border-t border-border/60 pt-4"
      >
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {{ t('items.detail.costs') }}
        </h3>
        <div
          class="grid gap-2"
          :class="
            item.buyValue != null && item.sellValue != null
              ? 'grid-cols-2'
              : 'max-w-[180px] grid-cols-1'
          "
        >
          <div v-if="item.buyValue != null" class="rounded-xl bg-muted/20 px-3 py-2 text-center">
            <p class="font-mono text-sm font-semibold text-foreground">{{ item.buyValue }}</p>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">
              {{ t('items.detail.buy') }}
            </p>
          </div>
          <div v-if="item.sellValue != null" class="rounded-xl bg-muted/20 px-3 py-2 text-center">
            <p class="font-mono text-sm font-semibold text-foreground">{{ item.sellValue }}</p>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">
              {{ t('items.detail.sell') }}
            </p>
          </div>
        </div>
      </section>

      <!-- Obtained From -->
      <ItemJobSources
        v-if="hasJobOrContainerSources"
        :item-type="item.type"
        :grouped-job-sources="groupedJobSources"
        :container-sources="containerSources"
        @select-item="emit('select-item', $event)"
      />

      <!-- Expeditions -->
      <ItemExpeditions v-if="expeditionSources.length" :expeditions="expeditionSources" />

      <!-- Recipes (how to craft this item) -->
      <ItemRecipeList
        v-if="item.recipes.length"
        :recipes="mergedRecipes"
        @select-item="emit('select-item', $event)"
      />

      <!-- Used As Ingredient -->
      <section v-if="dedupedRecipeUsages.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {{ t('items.detail.usedAsIngredient') }}
        </h3>
        <div class="space-y-2">
          <div
            v-for="usage in dedupedRecipeUsages"
            :key="usage.outputItemId"
            class="-mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
            @click="emit('select-item', usage.outputItemId)"
          >
            <img
              v-if="getItemImage({ id: usage.outputItemId })"
              :src="getItemImage({ id: usage.outputItemId })"
              :alt="usage.outputItemName"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-semibold text-foreground transition hover:text-primary">{{
                usage.outputItemName
              }}</span>
              <span class="text-sm text-muted-foreground"> &middot; {{ usage.workstation }}</span>
            </div>
            <span class="font-mono text-sm" style="color: var(--color-yellow)"
              >x{{ usage.amountNeeded }}</span
            >
          </div>
        </div>
      </section>

      <!-- Loot Table -->
      <ItemLootTable
        v-if="item.lootTable?.length"
        :entries="item.lootTable"
        @select-item="emit('select-item', $event)"
      />

      <!-- Summoning -->
      <ItemSummoning
        v-if="summoningCreatures.length"
        :creatures="summoningCreatures"
        @select-creature="emit('select-creature', $event)"
      />
    </div>
  </div>
</template>
