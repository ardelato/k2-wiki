<script setup lang="ts">
import { Check, Info, Minus, Pencil, Plus, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import type { Creature, ElementType } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { typeColor, typeColorVar } from '@/utils/format'
import { maxLevelForState } from '@/utils/formulas'

const { creatures } = useCreatures()
const { isOwned, getLevel, toggleOwned, setLevel, ownedCreatureIds, isAwakened, setAwakened } =
  useCreatureCollection()


const editing = ref(false)
const searchQuery = ref('')
const tierFilter = ref<number | 'all'>('all')
const typeFilter = ref<ElementType | 'all'>('all')
const bulkLevel = ref(1)


const typeOptions: Array<ElementType | 'all'> = ['all', 'Fire', 'Water', 'Wind', 'Earth']
const tierOptions = ['all', 0, 1, 2, 3, 4, 5] as const


const filteredCreatures = computed(() => {
  return creatures.value.filter((c) => {
    const q = searchQuery.value.toLowerCase()
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      c.types.some((t) => t.toLowerCase().includes(q)) ||
      c.trait.toLowerCase().includes(q)
    const matchesType = typeFilter.value === 'all' || c.types.includes(typeFilter.value)
    const matchesTier = tierFilter.value === 'all' || c.tier === tierFilter.value
    return matchesSearch && matchesType && matchesTier
  })
})


const groupedByTier = computed(() => {
  const groups: Record<number, Creature[]> = {}
  for (const c of filteredCreatures.value) {
    if (!groups[c.tier]) groups[c.tier] = []
    groups[c.tier].push(c)
  }
  return Object.entries(groups)
    .toSorted(([a], [b]) => Number(a) - Number(b))
    .map(([tier, tierCreatures]) => ({ tier: Number(tier), creatures: tierCreatures }))
})


const ownedCount = computed(() => ownedCreatureIds.value.size)
const totalCount = computed(() => creatures.value.length)


function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
}


function stepLevel(id: string, delta: number) {
  setLevel(id, clampLevel(getLevel(id) + delta))
}


function normalizeLevelOnBlur(id: string, event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    setLevel(id, getLevel(id))
    return
  }
  setLevel(id, clampLevel(Number(target.value)))
}


function selectAll() {
  for (const c of filteredCreatures.value) {
    if (!isOwned(c.id)) toggleOwned(c.id)
  }
}


function deselectAll() {
  for (const c of filteredCreatures.value) {
    if (isOwned(c.id)) toggleOwned(c.id)
  }
}


function stepBulkLevel(delta: number) {
  bulkLevel.value = clampLevel(bulkLevel.value + delta)
}


function normalizeBulkLevelOnBlur(event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    bulkLevel.value = 1
    return
  }
  bulkLevel.value = clampLevel(Number(target.value))
}


function applyBulkLevel() {
  const level = clampLevel(bulkLevel.value)
  for (const c of filteredCreatures.value) {
    if (isOwned(c.id)) setLevel(c.id, level)
  }
}
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <!-- Toolbar -->
    <div class="surface-card p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-3">
        <label class="relative min-w-[220px] flex-1">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="searchQuery"
            type="text"
            class="focus-ring w-full rounded-xl border border-input bg-background/70 py-2.5 pl-10 pr-4 text-sm"
            placeholder="Search creatures"
          />
        </label>

        <button
          class="focus-ring inline-flex w-[5.5rem] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition"
          :class="
            editing
              ? 'border-primary bg-primary text-primary-foreground shadow-glow'
              : 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground'
          "
          @click="editing = !editing"
        >
          <Pencil class="size-4" />
          {{ editing ? 'Done' : 'Edit' }}
        </button>
      </div>

      <div class="mt-4 space-y-3">
        <!-- Type filter -->
        <div
          class="flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-label="Filter by type"
        >
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
            >Type</span
          >
          <button
            v-for="option in typeOptions"
            :key="option"
            role="radio"
            :aria-checked="typeFilter === option"
            class="pill focus-ring"
            :class="typeFilter === option ? 'pill-active' : ''"
            @click="typeFilter = option"
          >
            <span
              v-if="option !== 'all'"
              class="mr-1.5 inline-block size-2 rounded-full"
              :style="{ backgroundColor: typeColor(option as ElementType) }"
            />
            {{ option === 'all' ? 'All Types' : option }}
          </button>
        </div>

        <!-- Tier filter -->
        <div
          class="flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-label="Filter by tier"
        >
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
            >Tier</span
          >
          <button
            v-for="option in tierOptions"
            :key="option"
            role="radio"
            :aria-checked="tierFilter === option"
            class="pill focus-ring font-mono"
            :class="tierFilter === option ? 'pill-active' : ''"
            @click="tierFilter = option"
          >
            {{ option === 'all' ? 'All' : `T${(option as number) + 1}` }}
          </button>
          <div
            class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
          >
            {{ ownedCount }} / {{ totalCount }} summoned
          </div>
        </div>

        <!-- Bulk summon -->
        <div
          v-if="editing"
          class="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3"
        >
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
            >Mark</span
          >
          <button class="pill focus-ring pill-active" @click="selectAll">
            All Visible as Summoned
          </button>
          <button class="pill focus-ring" @click="deselectAll">All Visible as Not Summoned</button>
        </div>

        <!-- Bulk level -->
        <div v-if="editing" class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
            >Level</span
          >
          <div
            class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
          >
            <button
              class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="bulkLevel <= 1"
              aria-label="Decrease bulk level"
              @click="stepBulkLevel(-1)"
            >
              <Minus class="size-3" />
            </button>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center font-mono text-xs"
              :value="bulkLevel"
              aria-label="Bulk level"
              @blur="normalizeBulkLevelOnBlur($event)"
            />
            <button
              class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="bulkLevel >= 120"
              aria-label="Increase bulk level"
              @click="stepBulkLevel(1)"
            >
              <Plus class="size-3" />
            </button>
          </div>
          <button class="pill focus-ring pill-active" @click="applyBulkLevel">
            Apply to All Summoned
          </button>
          <span class="text-[11px] text-muted-foreground"
            >Sets level for all summoned creatures shown</span
          >
        </div>
      </div>
    </div>

    <!-- Info callout (edit mode) -->
    <div
      v-if="editing"
      class="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3"
    >
      <Info class="mt-0.5 size-4 shrink-0 text-accent" />
      <p class="text-sm text-muted-foreground">
        Click a creature card to mark it as summoned or not summoned. Set levels to match your
        in-game creatures. Your collection is saved locally and auto-fills levels in the expedition
        simulator.
      </p>
    </div>

    <!-- Creature grid grouped by tier -->
    <div v-for="group in groupedByTier" :key="group.tier" class="space-y-3">
      <h2 class="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
        Tier {{ group.tier + 1 }}
        <span class="ml-2 text-xs font-normal">
          ({{ group.creatures.filter((c) => isOwned(c.id)).length }}/{{ group.creatures.length }})
        </span>
      </h2>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <div
          v-for="creature in group.creatures"
          :key="creature.id"
          class="group relative rounded-xl border transition"
          :class="[
            isOwned(creature.id)
              ? isAwakened(creature.id)
                ? 'border-pink-500/40 ring-1 ring-pink-500/20'
                : 'border-primary/40 ring-1 ring-primary/20'
              : 'border-border/60 opacity-55',
            editing ? 'cursor-pointer' : '',
          ]"
          @click="editing ? toggleOwned(creature.id) : undefined"
        >
          <!-- Type gradient bar -->
          <div
            class="h-1 rounded-t-xl"
            :style="{
              background:
                creature.types.length > 1
                  ? `linear-gradient(to right, ${typeColor(creature.types[0])}, ${typeColor(creature.types[1])})`
                  : typeColor(creature.types[0]),
            }"
          />

          <!-- Owned check overlay -->
          <div
            v-if="isOwned(creature.id)"
            class="absolute left-2 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          >
            <Check class="size-3.5" />
          </div>

          <!-- Type chips overlay -->
          <!-- Tier badge -->
          <span
            class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground shadow-sm"
          >
            T{{ creature.tier + 1 }}
          </span>

          <!-- Type chips -->
          <div class="absolute right-1.5 top-5 z-10 flex flex-col items-end gap-0.5">
            <span
              v-for="type in creature.types"
              :key="type"
              class="rounded-full px-1.5 py-px text-[10px] font-semibold leading-tight shadow-sm"
              :style="{
                color: typeColor(type),
                backgroundColor: `hsl(${typeColorVar(type)} / 0.2)`,
              }"
            >
              {{ type }}
            </span>
          </div>

          <!-- Hero image -->
          <div
            class="flex items-center justify-center px-4 pb-5 pt-6"
            :style="{
              background: `linear-gradient(180deg, hsl(${typeColorVar(creature.types[0])} / 0.12) 0%, hsl(var(--card)) 100%)`,
            }"
          >
            <img
              :src="getCreatureImage(creature)"
              :alt="creature.name"
              class="size-24 rounded-xl object-cover"
              loading="lazy"
            />
          </div>

          <!-- Divider -->
          <div class="h-px bg-border/60" />

          <!-- Footer info -->
          <div class="space-y-2 rounded-b-xl bg-card/80 px-3 pb-3 pt-2.5">
            <!-- Name + level -->
            <div class="text-center">
              <p
                class="truncate text-lg font-extrabold"
                :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-foreground'"
              >
                {{ creature.name }}
              </p>
              <p
                v-if="!editing && isOwned(creature.id)"
                class="font-mono text-[10px] text-muted-foreground"
              >
                LVL {{ getLevel(creature.id)
                }}<span v-if="isAwakened(creature.id)" class="ml-1 text-pink-400">★</span>
              </p>
            </div>

            <!-- Level stepper (only when owned) -->
            <div v-if="isOwned(creature.id) && editing" class="space-y-1" @click.stop>
              <p
                class="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                LVL
              </p>
              <div
                class="inline-flex w-full items-center overflow-hidden rounded-md border border-input bg-background/85"
              >
                <button
                  class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="getLevel(creature.id) <= 1"
                  aria-label="Decrease level"
                  @click="stepLevel(creature.id, -1)"
                >
                  <Minus class="size-3" />
                </button>
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="focus-ring h-7 min-w-0 flex-1 border-x border-input bg-transparent text-center font-mono text-xs"
                  :value="getLevel(creature.id)"
                  aria-label="Creature level"
                  @blur="normalizeLevelOnBlur(creature.id, $event)"
                />
                <button
                  class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="getLevel(creature.id) >= maxLevelForState(isAwakened(creature.id))"
                  aria-label="Increase level"
                  @click="stepLevel(creature.id, 1)"
                >
                  <Plus class="size-3" />
                </button>
              </div>
              <!-- Awakened toggle -->
              <button
                class="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition"
                :class="
                  isAwakened(creature.id)
                    ? 'border-pink-500/40 bg-pink-500/10 text-pink-400'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                "
                @click="setAwakened(creature.id, !isAwakened(creature.id))"
              >
                <span>&#9733;</span>
                {{ isAwakened(creature.id) ? 'Awakened' : 'Awaken' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="filteredCreatures.length === 0"
      class="surface-card px-4 py-8 text-center text-sm text-muted-foreground"
    >
      No creatures match your search.
    </div>
  </section>
</template>
