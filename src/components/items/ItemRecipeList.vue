<script setup lang="ts">
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MergedRecipe } from '@/composables/useItemDetail'
import { useItems } from '@/composables/useItems'
import { toTitleCase, formatDuration } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

defineProps<{
  recipes: MergedRecipe[]
}>()


const emit = defineEmits<{
  'select-item': [id: string]
}>()


const { t } = useI18n()
const { getItemById } = useItems()


const expandedVariants = ref<Set<number>>(new Set())


function toggleVariants(recipeIdx: number) {
  if (expandedVariants.value.has(recipeIdx)) expandedVariants.value.delete(recipeIdx)
  else expandedVariants.value.add(recipeIdx)
}
</script>

<template>
  <section class="detail-section">
    <h3 class="section-title mb-3">
      {{ t('items.detail.recipes') }}
    </h3>
    <div class="space-y-3">
      <div v-for="(recipe, idx) in recipes" :key="idx" class="rounded-xl bg-muted/20 p-3">
        <!-- Header -->
        <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <img
            v-if="sourceIcons[recipe.workstation]"
            :src="sourceIcons[recipe.workstation]"
            alt=""
            class="size-4"
            loading="lazy"
          />
          {{ recipe.workstation }}
        </p>

        <!-- Stats bar -->
        <div class="mb-3 flex flex-wrap gap-3 text-sm">
          <span style="color: var(--color-primary)"
            >{{ t('items.detail.levelShort') }}{{ recipe.levelRequirement }}</span
          >
          <span class="text-foreground">{{ formatDuration(recipe.craftTime) }}</span>
          <span style="color: var(--color-green)">
            {{ recipe.experience[0]
            }}{{ recipe.experience[0] !== recipe.experience[1] ? `–${recipe.experience[1]}` : '' }}
            XP
          </span>
          <span v-if="recipe.outputAmount > 1" style="color: var(--color-yellow)"
            >x{{ recipe.outputAmount }}</span
          >
        </div>

        <!-- Divider -->
        <div class="mb-2 border-t border-border/40" />

        <!-- Shared ingredients -->
        <div class="space-y-1">
          <div
            v-for="ingredient in recipe.sharedIngredients"
            :key="ingredient.id"
            class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 transition hover:bg-muted/50"
            @click="emit('select-item', ingredient.id)"
          >
            <img
              v-if="getItemImage({ id: ingredient.id })"
              :src="getItemImage({ id: ingredient.id })"
              :alt="getItemById(ingredient.id)?.name"
              class="size-5 shrink-0 object-contain"
              loading="lazy"
            />
            <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
            <span class="flex-1 text-sm text-foreground transition hover:text-primary">{{
              getItemById(ingredient.id)?.name ?? toTitleCase(ingredient.id)
            }}</span>
            <span class="font-mono text-sm font-semibold" style="color: var(--color-yellow)"
              >x{{ ingredient.amount }}</span
            >
          </div>

          <!-- Varying ingredients (dropdown) -->
          <div v-if="recipe.varyingIngredients.length">
            <div
              class="flex cursor-pointer select-none items-center gap-2 rounded px-1 py-0.5 transition hover:bg-muted/50"
              @click="toggleVariants(idx)"
            >
              <span class="size-1.5 shrink-0 rounded-full bg-accent/60" />
              <span class="flex-1 text-sm text-muted-foreground">
                {{ t('items.detail.oneOfVariants', { count: recipe.varyingIngredients.length }) }}
              </span>
              <component
                :is="expandedVariants.has(idx) ? ChevronDown : ChevronRight"
                class="size-4 shrink-0 text-muted-foreground"
              />
            </div>
            <div v-if="expandedVariants.has(idx)" class="ml-4 mt-0.5 space-y-0.5">
              <div
                v-for="variant in [
                  ...new Set(recipe.varyingIngredients.flatMap((v) => v.map((i) => i.id))),
                ]"
                :key="variant"
                class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 transition hover:bg-muted/50"
                @click="emit('select-item', variant)"
              >
                <img
                  v-if="getItemImage({ id: variant })"
                  :src="getItemImage({ id: variant })"
                  :alt="getItemById(variant)?.name"
                  class="size-5 shrink-0 object-contain"
                  loading="lazy"
                />
                <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/40" />
                <span class="flex-1 text-sm text-foreground transition hover:text-primary">
                  {{ getItemById(variant)?.name ?? toTitleCase(variant) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
