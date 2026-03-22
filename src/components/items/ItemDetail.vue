<script setup lang="ts">
import { X, ChevronRight, ChevronDown, GitBranch } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useItems } from '@/composables/useItems'
import expeditionsData from '@/data/expeditions.json'
import type { Item } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { itemTypeColor, toTitleCase, formatDuration } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const expeditionById = new Map(expeditionsData.map((e) => [e.id, e]))


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
}>()


const { getJobSources, getRecipeUsages, getContainerSources, getItemById } = useItems()


const jobSources = computed(() => {
  const sources = getJobSources(props.item.id)
  // For containers, deduplicate to just show the skill name
  if (props.item.type === 'Container') {
    const seen = new Set<string>()
    return sources.filter((s) => {
      if (seen.has(s.jobId)) return false
      seen.add(s.jobId)
      return true
    })
  }
  return sources
})
const recipeUsages = computed(() => getRecipeUsages(props.item.id))
const containerSources = computed(() => getContainerSources(props.item.id))


const expeditionSources = computed(() => {
  return (props.item.sources ?? [])
    .filter((s) => s?.startsWith('expedition_'))
    .map((s) => {
      const expId = s.replace('expedition_', '')
      return expeditionById.get(expId)
    })
    .filter(Boolean) as typeof expeditionsData
})


const expandedJobs = ref<Set<string>>(new Set())


const groupedJobSources = computed(() => {
  const groups = new Map<string, typeof jobSources.value>()
  for (const js of jobSources.value) {
    const arr = groups.get(js.jobId)
    if (arr) arr.push(js)
    else groups.set(js.jobId, [js])
  }
  return [...groups.entries()].map(([jobId, sources]) => {
    const levels = sources.map((s) => s.levelRequirement)
    const chances = sources.map((s) => s.chance)
    return {
      jobId,
      sources,
      count: sources.length,
      levelRange: [Math.min(...levels), Math.max(...levels)] as [number, number],
      chanceRange: [Math.min(...chances), Math.max(...chances)] as [number, number],
    }
  })
})


function toggleJobGroup(jobId: string) {
  if (expandedJobs.value.has(jobId)) expandedJobs.value.delete(jobId)
  else expandedJobs.value.add(jobId)
}


const dedupedRecipeUsages = computed(() => {
  const seen = new Set<string>()
  return recipeUsages.value.filter((u) => {
    if (seen.has(u.outputItemId)) return false
    seen.add(u.outputItemId)
    return true
  })
})


interface MergedRecipe {
  workstation: string
  levelRequirement: number
  craftTime: number
  experience: [number, number]
  outputAmount: number
  sharedIngredients: { id: string; amount: number }[]
  varyingIngredients: { id: string; amount: number }[][]
}


const mergedRecipes = computed<MergedRecipe[]>(() => {
  const groups = new Map<string, typeof props.item.recipes>()
  for (const r of props.item.recipes) {
    const key = `${r.workstation}|${r.levelRequirement}`
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }

  return [...groups.values()].map((recipes) => {
    const first = recipes[0]
    if (recipes.length === 1) {
      return {
        workstation: first.workstation,
        levelRequirement: first.levelRequirement,
        craftTime: first.craftTime,
        experience: [first.experience, first.experience] as [number, number],
        outputAmount: first.outputAmount,
        sharedIngredients: first.ingredients,
        varyingIngredients: [],
      }
    }

    // Find shared vs varying ingredients
    const ingredientSets = recipes.map((r) => new Map(r.ingredients.map((i) => [i.id, i.amount])))
    const allIds = new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.id)))
    const shared: { id: string; amount: number }[] = []
    const varyingIds = new Set<string>()

    for (const id of allIds) {
      const amounts = ingredientSets.map((m) => m.get(id))
      if (amounts.every((a) => a === amounts[0] && a !== undefined)) {
        shared.push({ id, amount: amounts[0]! })
      } else {
        varyingIds.add(id)
      }
    }

    const varying = recipes.map((r) => r.ingredients.filter((i) => varyingIds.has(i.id)))

    const xpValues = recipes.map((r) => r.experience)

    return {
      workstation: first.workstation,
      levelRequirement: first.levelRequirement,
      craftTime: first.craftTime,
      experience: [Math.min(...xpValues), Math.max(...xpValues)] as [number, number],
      outputAmount: first.outputAmount,
      sharedIngredients: shared,
      varyingIngredients: varying,
    }
  })
})


const expandedVariants = ref<Set<number>>(new Set())


function toggleVariants(recipeIdx: number) {
  if (expandedVariants.value.has(recipeIdx)) expandedVariants.value.delete(recipeIdx)
  else expandedVariants.value.add(recipeIdx)
}


function formatChance(chance: number): string {
  if (chance === 1) return '100%'
  return `${(chance * 100).toFixed(chance < 0.01 ? 2 : 1)}%`
}


const jobColorMap: Record<string, string> = {
  Chopping: 'var(--color-job-chopping)',
  Mining: 'var(--color-job-mining)',
  Digging: 'var(--color-job-digging)',
  Exploring: 'var(--color-job-exploring)',
  Fishing: 'var(--color-job-fishing)',
  Farming: 'var(--color-job-farming)',
}
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
        aria-label="Close item details"
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
          Open Planner
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
          Costs
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
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Buy</p>
          </div>
          <div v-if="item.sellValue != null" class="rounded-xl bg-muted/20 px-3 py-2 text-center">
            <p class="font-mono text-sm font-semibold text-foreground">{{ item.sellValue }}</p>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Sell</p>
          </div>
        </div>
      </section>

      <!-- Obtained From -->
      <section
        v-if="jobSources.length || containerSources.length"
        class="border-t border-border/60 pt-4"
      >
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Obtained From
        </h3>
        <div class="space-y-2">
          <!-- Job activity sources -->
          <template v-for="group in groupedJobSources" :key="group.jobId">
            <!-- Single source: render flat (no collapse) -->
            <div
              v-if="group.count === 1"
              class="-mx-1 flex items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
            >
              <img
                v-if="sourceIcons[group.jobId]"
                :src="sourceIcons[group.jobId]"
                alt=""
                class="size-4 shrink-0"
              />
              <span
                v-else
                class="size-1.5 shrink-0 rounded-full"
                :style="{ backgroundColor: jobColorMap[group.jobId] ?? 'var(--color-text-muted)' }"
              />
              <div class="min-w-0 flex-1">
                <span class="text-sm font-semibold" :style="{ color: jobColorMap[group.jobId] }">{{
                  group.jobId
                }}</span>
                <span v-if="item.type !== 'Container'" class="text-sm text-muted-foreground">
                  &middot; {{ group.sources[0].activityName }}</span
                >
              </div>
              <span
                v-if="item.type !== 'Container'"
                class="shrink-0 font-mono text-sm"
                style="color: var(--color-primary)"
                >Lv{{ group.sources[0].levelRequirement }}</span
              >
              <span
                v-if="item.type !== 'Container'"
                class="shrink-0 font-mono text-sm"
                style="color: var(--color-green)"
                >{{ formatChance(group.sources[0].chance) }}</span
              >
            </div>

            <!-- Multiple sources: collapsible group -->
            <template v-else>
              <div
                class="-mx-1 flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
                @click="toggleJobGroup(group.jobId)"
              >
                <img
                  v-if="sourceIcons[group.jobId]"
                  :src="sourceIcons[group.jobId]"
                  alt=""
                  class="size-4 shrink-0"
                />
                <span
                  v-else
                  class="size-1.5 shrink-0 rounded-full"
                  :style="{
                    backgroundColor: jobColorMap[group.jobId] ?? 'var(--color-text-muted)',
                  }"
                />
                <div class="min-w-0 flex-1">
                  <span
                    class="text-sm font-semibold"
                    :style="{ color: jobColorMap[group.jobId] }"
                    >{{ group.jobId }}</span
                  >
                  <span class="text-sm text-muted-foreground">
                    &middot; {{ group.count }} variants</span
                  >
                </div>
                <span class="shrink-0 font-mono text-sm" style="color: var(--color-primary)">
                  Lv{{ group.levelRange[0]
                  }}{{
                    group.levelRange[0] !== group.levelRange[1] ? `–${group.levelRange[1]}` : ''
                  }}
                </span>
                <span class="shrink-0 font-mono text-sm" style="color: var(--color-green)">
                  {{ formatChance(group.chanceRange[0])
                  }}{{
                    group.chanceRange[0] !== group.chanceRange[1]
                      ? `–${formatChance(group.chanceRange[1])}`
                      : ''
                  }}
                </span>
                <component
                  :is="expandedJobs.has(group.jobId) ? ChevronDown : ChevronRight"
                  class="size-4 shrink-0 text-muted-foreground"
                />
              </div>

              <!-- Expanded children -->
              <template v-if="expandedJobs.has(group.jobId)">
                <div
                  v-for="(js, idx) in group.sources"
                  :key="`${group.jobId}-${idx}`"
                  class="-mx-1 flex items-center gap-3 rounded-lg py-1 pl-8 pr-3 transition hover:bg-muted/20"
                >
                  <div class="min-w-0 flex-1">
                    <span class="text-sm text-muted-foreground">{{ js.activityName }}</span>
                  </div>
                  <span class="shrink-0 font-mono text-sm" style="color: var(--color-primary)"
                    >Lv{{ js.levelRequirement }}</span
                  >
                  <span class="shrink-0 font-mono text-sm" style="color: var(--color-green)">{{
                    formatChance(js.chance)
                  }}</span>
                </div>
              </template>
            </template>
          </template>

          <!-- Container sources -->
          <div
            v-for="(cs, idx) in containerSources"
            :key="`container-${idx}`"
            class="-mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
            @click="emit('select-item', cs.containerId)"
          >
            <img
              v-if="getItemImage({ id: cs.containerId })"
              :src="getItemImage({ id: cs.containerId })"
              :alt="cs.containerName"
              class="size-5 shrink-0 object-contain"
            />
            <span
              v-else
              class="size-1.5 shrink-0 rounded-full"
              style="background-color: var(--color-item-container)"
            />
            <span class="flex-1 text-sm font-semibold text-foreground">{{ cs.containerName }}</span>
            <span class="font-mono text-sm" style="color: var(--color-yellow)"
              >x{{ cs.amount }}</span
            >
            <span class="font-mono text-sm" style="color: var(--color-green)">{{
              formatChance(cs.chance)
            }}</span>
          </div>
        </div>
      </section>

      <!-- Expeditions -->
      <section v-if="expeditionSources.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Expeditions
        </h3>
        <div class="space-y-2">
          <div
            v-for="exp in expeditionSources"
            :key="exp.id"
            class="-mx-1 flex items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background-color: var(--color-item-gathered)"
            />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-semibold text-foreground">{{ exp.name }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Recipes (how to craft this item) -->
      <section v-if="item.recipes.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Recipes
        </h3>
        <div class="space-y-3">
          <div v-for="(recipe, idx) in mergedRecipes" :key="idx" class="rounded-xl bg-muted/20 p-3">
            <!-- Header -->
            <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <img
                v-if="sourceIcons[recipe.workstation]"
                :src="sourceIcons[recipe.workstation]"
                alt=""
                class="size-4"
              />
              {{ recipe.workstation }}
            </p>

            <!-- Stats bar -->
            <div class="mb-3 flex flex-wrap gap-3 text-sm">
              <span style="color: var(--color-primary)">Lv{{ recipe.levelRequirement }}</span>
              <span class="text-foreground">{{ formatDuration(recipe.craftTime) }}</span>
              <span style="color: var(--color-green)">
                {{ recipe.experience[0]
                }}{{
                  recipe.experience[0] !== recipe.experience[1] ? `–${recipe.experience[1]}` : ''
                }}
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
                    1 of {{ recipe.varyingIngredients.length }} variants
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

      <!-- Used As Ingredient -->
      <section v-if="dedupedRecipeUsages.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Used As Ingredient
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
      <section v-if="item.lootTable?.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Loot Table
        </h3>
        <div class="space-y-2">
          <div
            v-for="entry in item.lootTable"
            :key="entry.id"
            class="-mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
            @click="emit('select-item', entry.id)"
          >
            <img
              v-if="getItemImage({ id: entry.id })"
              :src="getItemImage({ id: entry.id })"
              :alt="getItemById(entry.id)?.name"
              class="size-5 shrink-0 object-contain"
            />
            <span v-else class="size-1.5 shrink-0 rounded-full bg-accent/60" />
            <span
              class="flex-1 text-sm font-semibold text-foreground transition hover:text-primary"
              >{{ getItemById(entry.id)?.name ?? toTitleCase(entry.id) }}</span
            >
            <span class="font-mono text-sm" style="color: var(--color-yellow)"
              >x{{ entry.amount }}</span
            >
            <span class="font-mono text-sm" style="color: var(--color-green)">{{
              formatChance(entry.chance)
            }}</span>
          </div>
        </div>
      </section>

      <!-- Summoning -->
      <section v-if="item.summoning?.length" class="border-t border-border/60 pt-4">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Summoning
        </h3>
        <div class="grid grid-cols-4 gap-3">
          <div
            v-for="creature in item.summoning"
            :key="creature.id"
            class="relative aspect-square overflow-hidden rounded-lg bg-muted/20"
          >
            <img
              v-if="getCreatureImage({ id: creature.id, image: '' })"
              :src="getCreatureImage({ id: creature.id, image: '' })"
              :alt="`${creature.name} artwork`"
              class="size-full object-cover"
            />
            <div
              v-else
              class="flex size-full items-center justify-center text-2xl font-bold text-muted-foreground/50"
            >
              {{ creature.name.charAt(0) }}
            </div>
            <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1">
              <p class="truncate text-center text-[10px] font-semibold text-white">
                {{ creature.name }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
