<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { RotateCcw, RotateCw } from 'lucide-vue-next'
import { computed, onMounted, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import CreatureSelector from '@/components/expeditions/CreatureSelector.vue'
import ExpeditionDetail from '@/components/expeditions/ExpeditionDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatures } from '@/composables/useCreatures'
import { useExpeditions } from '@/composables/useExpeditions'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature, ExpeditionStatWeights } from '@/types'
import { formatDecimal, formatDuration, itemName, toTitleCase } from '@/utils/format/format'
import { expeditionTierIcons, toolIcons } from '@/utils/format/icons'
import { getLoopXpBonus, getRecommendedCreatures } from '@/utils/formulas'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')


const { creatures } = useCreatures()
const {
  sanctuaryCreatureIds,
  helperCreatureIds,
  machineCreatureIds,
  expeditionCreatureIds,
  dungeonParty,
  expeditionToolXpBonus,
} = useGameConfig()
const {
  filteredExpeditions,
  selectedExpedition,
  selectedTier,
  partySlots,
  activeSlotIndex,
  creatureLevels,
  recommendedCreatures,
  difficultyRating,
  partyScore,
  estimatedDuration,
  scoreRatio,
  loopCount,
  loopBonusPercent,
  totalXp,
  xpPerMinute,
  partyXpProgress,
  assignCreatureToSlot,
  removeCreatureFromSlot,
  setActiveSlot,
  getCreatureSlotRating,
  updateCreatureLevel,
  expeditionEvaluations,
  totalXpPerSecond,
  resetAllExpeditions,
  expeditionTiers,
  expeditionParties,
  expeditionLoopCounts,
  showExcludedCreatures,
} = useExpeditions(creatures.value)


const { collectionLevels } = useCreatureCollection()


function handleReset() {
  if (window.confirm(t('expeditions.resetConfirm'))) {
    resetAllExpeditions()
    autoFilledCreatures.clear()
    for (const [id, level] of Object.entries(collectionLevels.value)) {
      updateCreatureLevel(id, level)
    }
  }
}


type MobileSection = 'list' | 'details' | 'creature'


function normalizeSection(value: unknown): MobileSection {
  if (value === 'details') return 'details'
  if (value === 'creature') return 'creature'
  return 'list'
}


const mobileSection = computed<MobileSection>({
  get() {
    return normalizeSection(route.query.section)
  },
  set(value) {
    const nextQuery = { ...route.query, section: value }
    router.replace({ query: nextQuery })
  },
})


onMounted(() => {
  const expeditionId = route.query.expedition
  if (typeof expeditionId === 'string') {
    const match = filteredExpeditions.value.find((e) => e.id === expeditionId)
    if (match) selectExpedition(match)
  }
})


watch(selectedExpedition, (exp) => {
  if (exp && !isDesktop.value && mobileSection.value === 'list') {
    mobileSection.value = 'details'
  }
})


const weightedStats = computed(() => {
  if (!selectedExpedition.value) return []
  return Object.entries(selectedExpedition.value.statWeights).filter(
    ([, weight]) => weight > 0,
  ) as [keyof ExpeditionStatWeights, number][]
})


const topRecommendedCreatures = computed(() => {
  if (!selectedExpedition.value) return []
  const ranked = getRecommendedCreatures(creatures.value, selectedExpedition.value).slice(0, 6)
  const topRating = ranked[0]?.rating ?? 1
  return ranked.map(({ creature, rating }) => ({
    creature,
    percent: Math.round((rating / topRating) * 100),
  }))
})


// Auto-fill creature levels from collection (once per creature, so manual edits aren't overwritten)
const autoFilledCreatures = new Set<string>()
watchEffect(() => {
  const levels = collectionLevels.value
  for (const [id, level] of Object.entries(levels)) {
    if (autoFilledCreatures.has(id)) continue
    const rec = recommendedCreatures.value.find((r) => r.creature.id === id)
    if (rec && rec.level === 1) {
      autoFilledCreatures.add(id)
      updateCreatureLevel(id, level)
    }
  }
})


const hasEmptySlot = computed(() => partySlots.value.some((s) => s === null))


function selectExpedition(expedition: (typeof filteredExpeditions.value)[number]) {
  selectedExpedition.value = expedition
}


function chooseExpedition(expedition: (typeof filteredExpeditions.value)[number]) {
  selectExpedition(expedition)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}


function chooseCreature(creature: Creature) {
  if (!hasEmptySlot.value) return
  assignCreatureToSlot(creature)
  if (!isDesktop.value) {
    mobileSection.value = 'details'
  }
}


const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  toggleCreature: toggleInspectCreature,
  closeDrawer: closeCreatureDrawer,
} = useCreatureDrawer()


function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 1
  return Math.max(1, Math.min(120, Math.round(level)))
}


function stepCreatureLevel(creatureId: string, currentLevel: number, delta: number) {
  updateCreatureLevel(creatureId, clampLevel(currentLevel + delta))
}


function normalizeLevelOnBlur(creatureId: string, currentLevel: number, event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }
  const parsed = Number(target.value)
  if (Number.isNaN(parsed)) {
    updateCreatureLevel(creatureId, currentLevel)
    return
  }
  updateCreatureLevel(creatureId, clampLevel(parsed))
}


function getPartyCreatures(expeditionId: string): Creature[] {
  const ids = expeditionParties.value[expeditionId] || []
  return ids
    .map((id) => creatures.value.find((c) => c.id === id))
    .filter((c): c is Creature => c != null)
}


function rowSelected(id: string): boolean {
  return selectedExpedition.value?.id === id
}
</script>

<template>
  <section class="space-y-5 lg:space-y-6">
    <div class="surface-card p-2 lg:hidden">
      <div class="grid grid-cols-3 gap-2">
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'list'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'list'"
        >
          {{ t('expeditions.list') }}
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'details'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'details'"
        >
          {{ t('expeditions.details') }}
        </button>
        <button
          class="focus-ring rounded-lg px-3 py-2 text-xs font-semibold"
          :class="
            mobileSection === 'creature'
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted/45 text-muted-foreground'
          "
          @click="mobileSection = 'creature'"
        >
          {{ t('expeditions.creature') }}
        </button>
      </div>
    </div>

    <div
      class="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12rem)] lg:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)_minmax(320px,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <!-- Column 1: Expedition List -->
      <section
        class="surface-card flex flex-col overflow-hidden"
        :class="!isDesktop && mobileSection !== 'list' ? 'hidden' : ''"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 class="text-base font-bold">{{ t('expeditions.title') }}</h2>
            <span
              v-if="totalXpPerSecond > 0"
              class="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success-strong dark:bg-success/15 dark:text-success-strong"
            >
              {{ formatDecimal(totalXpPerSecond) }} {{ t('expeditions.xpPerSecondSuffix') }}
            </span>
            <span
              v-if="expeditionToolXpBonus > 1"
              class="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning-strong dark:bg-warning/15 dark:text-warning-strong"
            >
              <img :src="toolIcons.sword" alt="" class="size-3.5" loading="lazy" />
              {{
                t('levelPlanner.badges.swordBonus', {
                  pct: Math.round((expeditionToolXpBonus - 1) * 100),
                })
              }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="focus-ring rounded-lg p-1.5 text-muted-foreground transition hover:text-destructive"
              title="Reset All"
              @click="handleReset"
            >
              <RotateCcw class="size-5" />
            </button>
          </div>
        </div>

        <div class="max-h-[62vh] space-y-2 overflow-y-auto p-2 lg:max-h-none lg:min-h-0 lg:flex-1">
          <button
            v-for="expedition in filteredExpeditions"
            :key="expedition.id"
            class="focus-ring block w-full rounded-lg border px-4 py-4 text-left transition"
            :class="
              rowSelected(expedition.id)
                ? 'border-primary bg-primary/10'
                : 'border-border/55 bg-card/50 hover:border-border hover:bg-muted/30'
            "
            @click="chooseExpedition(expedition)"
          >
            <!-- Row 1: Name + reward icon | Duration + Tier icon -->
            <div class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <img
                  v-if="
                    expedition.rewards.length > 0 &&
                    getItemImage({ id: expedition.rewards[0].itemId })
                  "
                  :src="getItemImage({ id: expedition.rewards[0].itemId })"
                  :alt="itemName(expedition.rewards[0].itemId)"
                  loading="lazy"
                  class="size-5 shrink-0 object-contain"
                />
                <p class="truncate text-sm font-semibold text-foreground">{{ expedition.name }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <span
                  v-if="expeditionEvaluations[expedition.id]"
                  class="text-xs font-semibold"
                  :class="
                    expeditionEvaluations[expedition.id]!.scoreRatio >= 1
                      ? 'text-success-strong'
                      : 'text-warning-strong'
                  "
                >
                  {{ formatDuration(expeditionEvaluations[expedition.id]!.duration) }}
                </span>
                <img
                  :src="expeditionTierIcons[expeditionTiers[expedition.id] || 1]"
                  :alt="`Tier ${expeditionTiers[expedition.id] || 1}`"
                  class="size-4 object-contain"
                  loading="lazy"
                />
              </div>
            </div>

            <!-- Row 2: Biome, Trait | Loop bonus -->
            <div class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{{ toTitleCase(expedition.biome) }}</span>
              <span v-if="expedition.trait">•</span>
              <span v-if="expedition.trait" class="font-semibold">{{
                toTitleCase(expedition.trait)
              }}</span>
              <span
                v-if="(expeditionLoopCounts[expedition.id] ?? 0) > 0"
                class="ml-auto inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-3xs font-semibold text-success-strong dark:bg-success/15 dark:text-success-strong"
              >
                <RotateCw class="size-2.5" />
                +{{ Math.round(getLoopXpBonus(expeditionLoopCounts[expedition.id] ?? 0) * 100) }}%
              </span>
            </div>

            <!-- Divider + Party/XP section (only when party assigned) -->
            <template v-if="getPartyCreatures(expedition.id).length">
              <div class="my-3 border-t border-border/40" />

              <div class="flex items-center gap-1.5">
                <div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  <RightClickHint
                    v-for="creature in getPartyCreatures(expedition.id)"
                    :key="creature.id"
                    @contextmenu="toggleInspectCreature(creature)"
                  >
                    <div
                      class="inline-flex cursor-default items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-0.5 pr-2"
                    >
                      <div class="size-5 overflow-hidden rounded-md bg-card">
                        <img
                          :src="getCreatureImage(creature)"
                          :alt="creature.name"
                          class="size-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <span class="text-3xs font-semibold text-foreground">{{
                        creature.name
                      }}</span>
                    </div>
                  </RightClickHint>
                </div>
                <div
                  v-if="expeditionEvaluations[expedition.id]"
                  class="flex shrink-0 items-center gap-1.5 text-xs"
                >
                  <span
                    class="font-mono font-semibold"
                    :class="
                      expeditionEvaluations[expedition.id]!.scoreRatio >= 1
                        ? 'text-success-strong'
                        : 'text-warning-strong'
                    "
                  >
                    {{ formatDecimal(expeditionEvaluations[expedition.id]!.partyXpPerSecond) }}
                    {{ t('expeditions.xpPerSecondSuffix') }}
                  </span>
                  <span class="font-mono text-muted-foreground">
                    ({{ formatDecimal(expeditionEvaluations[expedition.id]!.xpPerSecond)
                    }}{{ t('expeditions.perEachSuffix') }})
                  </span>
                </div>
              </div>
            </template>
          </button>

          <div
            v-if="filteredExpeditions.length === 0"
            class="px-4 py-8 text-center text-sm text-muted-foreground"
          >
            {{ t('expeditions.noMatch') }}
          </div>
        </div>
      </section>

      <!-- Column 2: Expedition Details -->
      <ExpeditionDetail
        :class="!isDesktop && mobileSection !== 'details' ? 'hidden' : ''"
        :expedition="selectedExpedition"
        :selected-tier="selectedTier"
        :party-slots="partySlots"
        :active-slot-index="activeSlotIndex"
        :creature-levels="creatureLevels"
        :difficulty-rating="difficultyRating"
        :party-score="partyScore"
        :estimated-duration="estimatedDuration"
        :score-ratio="scoreRatio"
        :loop-count="loopCount"
        :loop-bonus-percent="loopBonusPercent"
        :total-xp="totalXp"
        :xp-per-minute="xpPerMinute"
        :party-xp-progress="partyXpProgress"
        :top-recommended-creatures="topRecommendedCreatures"
        :weighted-stats="weightedStats"
        :get-creature-slot-rating="getCreatureSlotRating"
        @update:selected-tier="selectedTier = $event"
        @update:loop-count="loopCount = $event"
        @set-active-slot="setActiveSlot"
        @remove-creature="removeCreatureFromSlot"
        @inspect-creature="toggleInspectCreature"
      />

      <!-- Column 3: Creature Selector -->
      <CreatureSelector
        :class="!isDesktop && mobileSection !== 'creature' ? 'hidden' : ''"
        :recommended-creatures="recommendedCreatures"
        :weighted-stats="weightedStats"
        :has-empty-slot="hasEmptySlot"
        :selected-expedition="selectedExpedition"
        :sanctuary-creature-ids="sanctuaryCreatureIds"
        :helper-creature-ids="helperCreatureIds"
        :machine-creature-ids="machineCreatureIds"
        :expedition-creature-ids="expeditionCreatureIds"
        :dungeon-party="dungeonParty"
        :expedition-tool-xp-bonus="expeditionToolXpBonus"
        :show-excluded-creatures="showExcludedCreatures"
        @update:show-excluded-creatures="showExcludedCreatures = $event"
        @choose-creature="chooseCreature"
        @inspect-creature="toggleInspectCreature"
        @step-level="stepCreatureLevel"
        @normalize-level="normalizeLevelOnBlur"
      />
    </div>

    <CreatureDetail
      :creature="inspectedCreature"
      :open="creatureDrawerOpen"
      @close="closeCreatureDrawer"
    />
  </section>
</template>
