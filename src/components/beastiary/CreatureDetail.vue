<script setup lang="ts">
import { Sparkles, TrendingUp, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.webp'
import summonedIcon from '@/assets/icons/summoned.webp'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import CreatureAssignmentBadge from '@/components/shared/CreatureAssignmentBadge.vue'
import LevelStepper from '@/components/shared/LevelStepper.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, CreatureStats, Jobs } from '@/types'
import { itemName, toTitleCase, typeColor, typeColorVar } from '@/utils/format/format'
import { expeditionTierIcons, jobIcons } from '@/utils/format/icons'
import {
  getBestExpeditionsForCreature,
  jobColors,
  jobLabels,
  maxLevelForState,
  statLabels,
} from '@/utils/formulas'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

import ProficiencyRing from './ProficiencyRing.vue'
import StatRadarChart from './StatRadarChart.vue'
import SummoningCost from './SummoningCost.vue'

const props = defineProps<{
  creature: Creature | null
  open: boolean
}>()


const emit = defineEmits<{
  close: []
}>()


const { isOwned, isAwakened, toggleOwned, setAwakened, getLevel, stepLevel, normalizeLevelOnBlur } =
  useCreatureCollection()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  dungeonParty,
  expeditionCreatureIds,
} = useGameConfig()


const { t } = useI18n()


const maxJobLevel = 10


function assignmentLabel(id: string): string | null {
  if (sanctuaryCreatureIds.value.includes(id)) return 'Sanctuary'
  if (helperCreatureIds.value.includes(id)) return 'Helper'
  if (machineCreatureIds.value.includes(id)) return 'Machine'
  if (dungeonParty.value.includes(id)) return 'Dungeon'
  if (expeditionCreatureIds.value.has(id)) return 'Expedition'
  return null
}


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
  return getBestExpeditionsForCreature(props.creature, 5, getLevel(props.creature.id))
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
        class="fixed inset-0 z-[120] bg-background/60 backdrop-blur-sm"
        @click="emit('close')"
        @contextmenu.prevent="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="slide">
      <div
        v-if="open && creature"
        class="fixed inset-y-0 right-0 z-[120] w-full max-w-[420px] overflow-y-auto border-l border-border bg-card shadow-2xl"
      >
        <!-- Gradient header with centered hero -->
        <div
          class="relative flex flex-col items-center px-5 pb-4 pt-6"
          :style="{
            background: `linear-gradient(180deg, hsl(${typeColorVar(creature.types[0])} / 0.15) 0%, transparent 100%)`,
          }"
        >
          <button
            :aria-label="t('beastiary.detail.close')"
            class="focus-ring absolute right-3 top-3 rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>

          <div class="relative">
            <img
              :src="getCreatureImage(creature)"
              :alt="`${creature.name} artwork`"
              class="size-24 rounded-xl border-2 border-border object-cover shadow-lg"
              :style="{ backgroundColor: `hsl(${typeColorVar(creature.types[0])} / 0.1)` }"
              loading="lazy"
            />
            <span
              class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-2xs font-bold text-muted-foreground shadow-sm"
            >
              T{{ creature.tier + 1 }}
            </span>
            <AppTooltip
              v-if="assignmentLabel(creature.id)"
              :text="t('beastiary.detail.assignedTo', { label: assignmentLabel(creature.id) })"
              position="right"
            >
              <CreatureAssignmentBadge
                :creature-id="creature.id"
                :sanctuary-creature-ids="sanctuaryCreatureIds"
                :helper-creature-ids="helperCreatureIds"
                :machine-creature-ids="machineCreatureIds"
                :expedition-creature-ids="expeditionCreatureIds"
                :dungeon-party="dungeonParty"
                img-class="absolute -left-1 -top-1 size-7 rounded-full border-2 border-background bg-background"
              />
            </AppTooltip>
          </div>
          <h2 class="mt-3 text-center text-2xl font-black leading-tight">
            {{ creature.name }}
          </h2>
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
          <div class="detail-section">
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ creature.description }}
            </p>
          </div>

          <!-- Collection & Actions -->
          <div class="detail-section space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
            <h3 class="section-title">{{ t('beastiary.detail.collection') }}</h3>
            <div class="space-y-3">
              <label
                class="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-card/80 px-3 py-2.5"
              >
                <span class="flex items-center gap-2 text-sm font-medium text-foreground">
                  <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
                  {{ t('beastiary.detail.summoned') }}
                </span>
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
              <label
                v-if="isOwned(creature.id)"
                class="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-card/80 px-3 py-2.5"
              >
                <div>
                  <span class="flex items-center gap-2 text-sm font-medium text-foreground">
                    <img :src="awakenedSummonedIcon" alt="" class="size-4" loading="lazy" />
                    {{ t('beastiary.detail.awakened') }}
                  </span>
                  <p class="text-2xs text-muted-foreground">
                    {{
                      isAwakened(creature.id)
                        ? t('beastiary.detail.awakenedCapRaised')
                        : t('beastiary.detail.awakenedCapInfo')
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
              <div
                v-if="isOwned(creature.id)"
                class="flex items-center gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2.5"
              >
                <span class="text-sm font-medium text-foreground">{{
                  t('beastiary.detail.level')
                }}</span>
                <LevelStepper
                  class="ml-auto"
                  :model-value="getLevel(creature.id)"
                  :min="1"
                  :max="maxLevelForState(isAwakened(creature.id))"
                  :decrease-label="t('beastiary.detail.decreaseCreatureLevel')"
                  :increase-label="t('beastiary.detail.increaseCreatureLevel')"
                  :input-label="t('beastiary.detail.creatureLevel')"
                  @step="stepLevel(creature.id, $event)"
                  @normalize="normalizeLevelOnBlur(creature.id, $event)"
                />
              </div>
            </div>

            <router-link
              :to="{ name: 'planner-creature', query: { tab: 'awaken', creature: creature.id } }"
              class="focus-ring bg-primary/12 hover:bg-primary/18 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 px-4 py-2.5 text-sm font-semibold text-primary transition"
            >
              <TrendingUp class="size-4" />
              {{ t('beastiary.detail.planLeveling') }}
            </router-link>

            <router-link
              v-if="!isOwned(creature.id) && creature.summoningCost.length"
              :to="{ name: 'planner-creature', query: { creature: creature.id } }"
              class="focus-ring bg-primary/12 hover:bg-primary/18 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 px-4 py-2.5 text-sm font-semibold text-primary transition"
            >
              <Sparkles class="size-4" />
              {{ t('beastiary.detail.planSummoning') }}
            </router-link>
          </div>

          <!-- Summoning Cost -->
          <SummoningCost v-if="creature.summoningCost.length" :costs="creature.summoningCost" />

          <!-- Stats with Radar Chart -->
          <section class="detail-section">
            <div class="mb-3 flex items-baseline justify-between">
              <h3 class="section-title">{{ t('beastiary.detail.stats') }}</h3>
              <span
                v-if="selectedCreatureStats"
                class="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-2xs font-semibold text-primary"
              >
                {{ t('beastiary.detail.lvlBadge', { level: getLevel(creature.id) }) }}
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
                <p v-if="selectedCreatureStats" class="font-mono text-3xs text-muted-foreground/60">
                  {{ t('beastiary.detail.baseStat', { value: creature.stats[statKey] }) }}
                </p>
                <p class="mt-1 text-3xs uppercase tracking-wide text-muted-foreground">
                  {{ statLabel }}
                </p>
              </div>
            </div>
          </section>

          <!-- Job Levels with Proficiency Rings -->
          <section class="detail-section">
            <div class="mb-3 flex items-baseline justify-between">
              <h3 class="section-title">{{ t('beastiary.detail.jobLevels') }}</h3>
              <span
                class="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-2xs font-semibold text-primary"
              >
                {{
                  t('beastiary.detail.totalJobPoints', {
                    total: Object.values(creature.jobs).reduce((sum, v) => sum + v, 0),
                  })
                }}
              </span>
            </div>
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
          <section v-if="bestExpeditions.length" class="detail-section">
            <h3 class="section-title mb-3">{{ t('beastiary.detail.bestExpeditions') }}</h3>
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
                      :alt="itemName(entry.expedition.rewards[0].itemId)"
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
                  <img
                    :src="expeditionTierIcons[entry.tier]"
                    :alt="`Tier ${entry.tier}`"
                    class="size-4 shrink-0 object-contain"
                    loading="lazy"
                  />
                  <span>{{ entry.biomeName }}</span>
                  <span v-if="entry.traitMatch" class="text-primary">{{
                    t('beastiary.detail.traitMatch')
                  }}</span>
                  <span v-if="entry.biomeStatus === 'advantage'" class="text-green-500">{{
                    t('beastiary.detail.advantage')
                  }}</span>
                  <span v-if="entry.biomeStatus === 'disadvantage'" class="text-destructive">{{
                    t('beastiary.detail.disadvantage')
                  }}</span>
                </div>
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
