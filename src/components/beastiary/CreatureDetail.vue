<script setup lang="ts">
import { Minus, Plus, TrendingUp, X } from 'lucide-vue-next'
import { computed } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useItems } from '@/composables/useItems'
import type { Creature, CreatureStats, Jobs } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { toTitleCase, typeColor, typeColorVar } from '@/utils/format'
import {
  getBestExpeditionsForCreature,
  jobColors,
  jobLabels,
  maxLevelForState,
  statLabels,
} from '@/utils/formulas'
import { jobIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

import ProficiencyRing from './ProficiencyRing.vue'
import StatRadarChart from './StatRadarChart.vue'

const props = defineProps<{
  creature: Creature | null
  open: boolean
}>()


const emit = defineEmits<{
  close: []
}>()


const { isOwned, isAwakened, toggleOwned, setAwakened, getLevel, stepLevel, normalizeLevelOnBlur } =
  useCreatureCollection()
const { getItemById } = useItems()


const maxJobLevel = 10


const jobEntries = computed(() => Object.entries(jobLabels) as [keyof Jobs, string][])
const statEntries = computed(() => Object.entries(statLabels) as [keyof CreatureStats, string][])


const selectedCreatureStats = computed<CreatureStats | undefined>(() => {
  if (!props.creature) return undefined
  const level = getLevel(props.creature.id)
  if (level <= 1) return undefined
  const base = props.creature.stats
  return {
    power: base.power * level,
    grit: base.grit * level,
    agility: base.agility * level,
    smarts: base.smarts * level,
    looting: base.looting * level,
    luck: base.luck * level,
  }
})


const bestExpeditions = computed(() => {
  if (!props.creature) return []
  return getBestExpeditionsForCreature(props.creature)
})


function statHighlight(creature: Creature, statKey: keyof CreatureStats): string {
  const values = Object.values(creature.stats)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const val = creature.stats[statKey]
  if (val === max) return 'text-primary border-primary/40 bg-primary/10'
  if (val === min) return 'text-destructive border-destructive/40 bg-destructive/10'
  return 'text-foreground border-border bg-muted/35'
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="open && creature"
        class="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        @click="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="slide">
      <div
        v-if="open && creature"
        class="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] overflow-y-auto border-l border-border bg-card shadow-2xl"
      >
        <!-- Gradient header with centered hero -->
        <div
          class="relative flex flex-col items-center px-5 pb-4 pt-6"
          :style="{
            background: `linear-gradient(180deg, hsl(${typeColorVar(creature.types[0])} / 0.15) 0%, transparent 100%)`,
          }"
        >
          <button
            class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>

          <img
            :src="getCreatureImage(creature)"
            :alt="`${creature.name} artwork`"
            class="size-24 rounded-2xl border-2 border-border object-cover shadow-lg"
            :style="{ backgroundColor: `hsl(${typeColorVar(creature.types[0])} / 0.1)` }"
            loading="lazy"
          />
          <h2 class="mt-3 text-center text-2xl font-black leading-tight">
            {{ creature.name }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            T{{ creature.tier + 1 }} · {{ toTitleCase(creature.mainJob) }}
          </p>
          <div class="mt-2 flex flex-wrap justify-center gap-2">
            <span
              v-for="type in creature.types"
              :key="type"
              class="rounded-full px-3 py-1 text-xs font-semibold"
              :style="{
                color: typeColor(type),
                backgroundColor: `hsl(${typeColorVar(type)} / 0.12)`,
              }"
            >
              {{ type }}
            </span>
            <span class="trait-chip">
              {{ toTitleCase(creature.trait) }}
            </span>
          </div>
        </div>

        <div class="space-y-5 px-5 pb-5">
          <!-- Description -->
          <div class="border-t border-border/60 pt-4">
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ creature.description }}
            </p>
          </div>

          <!-- Collection -->
          <section class="border-t border-border/60 pt-4">
            <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Collection
            </h3>
            <div class="space-y-3">
              <label
                class="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <span class="text-sm font-medium text-foreground">Summoned</span>
                <button
                  role="switch"
                  :aria-checked="isOwned(creature.id)"
                  class="focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                  :class="isOwned(creature.id) ? 'bg-primary' : 'bg-muted'"
                  @click="toggleOwned(creature.id)"
                >
                  <span
                    class="inline-block size-4 rounded-full bg-white shadow-sm transition-transform"
                    :class="isOwned(creature.id) ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </label>
              <div
                v-if="isOwned(creature.id)"
                class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <span class="text-sm font-medium text-foreground">Level</span>
                <div
                  class="ml-auto inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
                >
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="getLevel(creature.id) <= 1"
                    aria-label="Decrease creature level"
                    @click="stepLevel(creature.id, -1)"
                  >
                    <Minus class="size-3" />
                  </button>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="focus-ring h-7 w-11 border-x border-input bg-transparent text-center font-mono text-xs"
                    :value="getLevel(creature.id)"
                    aria-label="Creature level"
                    @blur="normalizeLevelOnBlur(creature.id, $event)"
                  />
                  <button
                    class="focus-ring inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="getLevel(creature.id) >= maxLevelForState(isAwakened(creature.id))"
                    aria-label="Increase creature level"
                    @click="stepLevel(creature.id, 1)"
                  >
                    <Plus class="size-3" />
                  </button>
                </div>
              </div>
              <label
                v-if="isOwned(creature.id)"
                class="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <div>
                  <span class="text-sm font-medium text-foreground">Awakened</span>
                  <p class="text-[11px] text-muted-foreground">
                    {{
                      isAwakened(creature.id)
                        ? 'Cap raised to 120. Un-awaken to clamp to 70.'
                        : 'Raises level cap to 120.'
                    }}
                  </p>
                </div>
                <button
                  role="switch"
                  :aria-checked="isAwakened(creature.id)"
                  class="focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                  :class="isAwakened(creature.id) ? 'bg-pink-500' : 'bg-muted'"
                  @click="setAwakened(creature.id, !isAwakened(creature.id))"
                >
                  <span
                    class="inline-block size-4 rounded-full bg-white shadow-sm transition-transform"
                    :class="isAwakened(creature.id) ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </label>
            </div>
          </section>

          <!-- Plan Leveling Link -->
          <section class="border-t border-border/60 pt-4">
            <router-link
              :to="{ path: '/planner', query: { tab: 'levelup', creature: creature.id } }"
              class="focus-ring bg-primary/12 hover:bg-primary/18 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 px-4 py-2.5 text-sm font-semibold text-primary transition"
            >
              <TrendingUp class="size-4" />
              Plan Leveling
            </router-link>
          </section>

          <!-- Stats with Radar Chart -->
          <section class="border-t border-border/60 pt-4">
            <div class="mb-3 flex items-baseline justify-between">
              <h3 class="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Stats
              </h3>
              <span
                v-if="selectedCreatureStats"
                class="font-mono text-[10px] text-muted-foreground"
              >
                LVL {{ getLevel(creature.id) }}
              </span>
            </div>
            <div class="flex justify-center">
              <StatRadarChart
                :creature="creature"
                :stats-override="selectedCreatureStats"
                :size="180"
              />
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <div
                v-for="[statKey, statLabel] in statEntries"
                :key="statKey"
                class="rounded-lg border px-2 py-2 text-center transition-colors"
                :class="statHighlight(creature, statKey)"
              >
                <p class="font-mono text-xs">
                  {{ (selectedCreatureStats ?? creature.stats)[statKey] }}
                </p>
                <p
                  v-if="selectedCreatureStats"
                  class="font-mono text-[10px] text-muted-foreground/60"
                >
                  (BASE {{ creature.stats[statKey] }})
                </p>
                <p class="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {{ statLabel }}
                </p>
              </div>
            </div>
          </section>

          <!-- Job Levels with Proficiency Rings -->
          <section class="border-t border-border/60 pt-4">
            <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Job Levels
            </h3>
            <div class="flex flex-wrap justify-center gap-3">
              <div
                v-for="[jobKey, jobName] in jobEntries"
                :key="jobKey"
                class="flex flex-col items-center gap-1"
              >
                <img
                  v-if="jobIcons[jobKey]"
                  :src="jobIcons[jobKey]"
                  alt=""
                  class="size-4"
                  loading="lazy"
                />
                <ProficiencyRing
                  :label="jobName.slice(0, 3)"
                  :value="creature.jobs[jobKey]"
                  :max-value="maxJobLevel"
                  :color="jobColors[jobKey]"
                  size="sm"
                />
              </div>
            </div>
          </section>

          <!-- Best Expeditions -->
          <section v-if="bestExpeditions.length" class="border-t border-border/60 pt-4">
            <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Best Expeditions
            </h3>
            <div class="space-y-2">
              <router-link
                v-for="(entry, index) in bestExpeditions"
                :key="entry.expedition.id"
                :to="{ path: '/expeditions', query: { expedition: entry.expedition.id } }"
                class="block rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:border-accent/45 hover:bg-muted/30"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground"
                  >
                    <span class="shrink-0 font-mono text-xs text-muted-foreground"
                      >{{ index + 1 }}.</span
                    >
                    <img
                      v-if="
                        entry.expedition.rewards.length &&
                        getItemImage({ id: entry.expedition.rewards[0].itemId })
                      "
                      :src="getItemImage({ id: entry.expedition.rewards[0].itemId })"
                      :alt="toTitleCase(entry.expedition.rewards[0].itemId)"
                      class="size-5 shrink-0 object-contain"
                      loading="lazy"
                    />
                    <span class="truncate">{{ entry.expedition.name }}</span>
                  </span>
                  <span class="shrink-0 font-mono text-xs font-semibold text-primary"
                    >{{ entry.score }}%</span
                  >
                </div>
                <div
                  class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span>{{ entry.biomeName }}</span>
                  <span v-if="entry.traitMatch" class="text-primary">· Trait ✓</span>
                  <span v-if="entry.biomeStatus === 'advantage'" class="text-green-500"
                    >· ▲ Advantage</span
                  >
                  <span v-if="entry.biomeStatus === 'disadvantage'" class="text-destructive"
                    >· ▼ Disadvantage</span
                  >
                </div>
              </router-link>
            </div>
          </section>

          <!-- Summoning Cost -->
          <section class="border-t border-border/60 pt-4">
            <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Summoning Cost
            </h3>
            <div class="space-y-2">
              <router-link
                v-for="cost in creature.summoningCost"
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
                  >x{{ cost.amount }}</span
                >
              </router-link>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
