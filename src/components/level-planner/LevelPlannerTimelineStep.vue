<script setup lang="ts">
import {
  Clock3,
  Zap,
  Users,
  ChevronRight,
  Repeat,
  ExternalLink,
  ArrowRightLeft,
  RotateCcw,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.webp'
import { activeLocale } from '@/i18n'

const { t } = useI18n()
import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import LevelPlannerBoosterChip from '@/components/level-planner/LevelPlannerBoosterChip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, itemName } from '@/utils/format'
import { expeditionTierIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import type { PlanStep } from '@/utils/levelPlanner'

interface PartyMember {
  creatureId: string
  creature?: Creature
  fromLevel: number
  toLevel: number
  xpGained: number
  isBooster?: boolean
}


defineProps<{
  step: PlanStep
  index: number
  creatureName: string
  isFirst: boolean
  isLast: boolean
  expanded: boolean
  timePercent: number
  partyMembers?: PartyMember[]
  hideNode?: boolean
  hideGutter?: boolean
  scoreRatioMet?: boolean
  highlightCreatureId?: string
  hasOverride?: boolean
}>()


defineEmits<{
  toggle: []
  viewInExpeditions: []
  selectAlternative: [fromLevel: number, toLevel: number, expeditionId: string, tier: number]
  resetOverride: [fromLevel: number]
}>()


const { selectedCreature, drawerOpen, toggleCreature, closeDrawer } = useCreatureDrawer()


function nodeColor(status: 'advantage' | 'disadvantage' | 'neutral'): string {
  if (status === 'advantage') return 'var(--color-green)'
  if (status === 'disadvantage') return 'var(--color-destructive)'
  return 'hsl(var(--primary))'
}


function formatDelta(value: number): string {
  const percent = Math.round(value * 100)
  if (percent > 0) return `+${percent}%`
  if (percent < 0) return `${percent}%`
  return '0%'
}
</script>

<template>
  <div class="flex gap-3">
    <!-- Timeline gutter (hidden when parent provides a shared gutter) -->
    <div v-if="!hideGutter" class="relative w-8 shrink-0 sm:w-10">
      <!-- Connector line (absolute, spans full gutter height) -->
      <div
        v-if="!(isFirst && isLast)"
        class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-border/60"
        :class="[isFirst ? 'top-[1.1rem]' : 'top-0', isLast ? 'bottom-[1.1rem]' : 'bottom-0']"
      />
      <!-- Node circle (sticky while scrolling, hidden for parallel steps sharing same wave) -->
      <template v-if="!hideNode">
        <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-10 flex justify-center">
          <div
            v-if="step.isAwakeningStep"
            class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 text-xs font-bold sm:size-8"
            style="background-color: hsl(var(--card)); color: rgb(236 72 153)"
          >
            <img :src="awakenedSummonedIcon" alt="" class="size-4" loading="lazy" />
          </div>
          <div
            v-else
            class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-8"
            :style="{
              borderColor: nodeColor(step.biomeStatus),
              backgroundColor: 'hsl(var(--card))',
              color: nodeColor(step.biomeStatus),
            }"
          >
            {{ index + 1 }}
          </div>
        </div>
      </template>
    </div>

    <!-- Awakening step card -->
    <div v-if="step.isAwakeningStep" class="mb-2 min-w-0 flex-1 pb-1">
      <div
        class="surface-card w-full overflow-hidden border-pink-500/30 bg-gradient-to-r from-pink-500/10 to-amber-500/10"
      >
        <div class="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <RightClickHint
            v-if="partyMembers?.[0]?.creature"
            @contextmenu="toggleCreature(partyMembers[0].creature!)"
          >
            <img
              :src="getCreatureImage(partyMembers[0].creature)"
              :alt="creatureName"
              class="size-10 shrink-0 rounded-lg border border-pink-500/30 object-cover transition hover:ring-1 hover:ring-pink-500/50 sm:size-12"
              loading="lazy"
            />
          </RightClickHint>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <img
                  :src="awakenedSummonedIcon"
                  alt="Awaken"
                  class="size-5 shrink-0 object-contain"
                  loading="lazy"
                />
                <p class="text-sm font-semibold text-pink-400">
                  {{
                    step.fromLevel > 70
                      ? t('levelPlannerComponents.timelineStep.prestigeCreature')
                      : t('levelPlannerComponents.timelineStep.awakenCreature')
                  }}
                </p>
              </div>
              <span
                class="shrink-0 rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-400"
              >
                LVL {{ step.fromLevel }}&rarr;{{ step.toLevel }}
              </span>
            </div>
            <p class="mt-1.5 text-xs text-muted-foreground">
              {{
                step.fromLevel > 70
                  ? t('levelPlannerComponents.timelineStep.prestigeDescription', {
                      name: creatureName,
                    })
                  : t('levelPlannerComponents.timelineStep.awakenDescription', {
                      name: creatureName,
                    })
              }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Step card -->
    <div v-else class="mb-2 min-w-0 flex-1 pb-1">
      <div
        class="surface-card overflow-hidden"
        :class="hasOverride ? 'ring-1 ring-primary/40' : ''"
      >
        <button
          class="focus-ring w-full text-left transition hover:bg-muted/20"
          :aria-expanded="expanded"
          role="button"
          @click="$emit('toggle')"
        >
          <div class="px-3 py-2.5 sm:px-4 sm:py-3">
            <!-- Row 1: Name + level range -->
            <div class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <img
                  v-if="
                    step.expedition.rewards.length > 0 &&
                    getItemImage({ id: step.expedition.rewards[0].itemId })
                  "
                  :src="getItemImage({ id: step.expedition.rewards[0].itemId })"
                  :alt="itemName(step.expedition.rewards[0].itemId)"
                  loading="lazy"
                  class="size-5 shrink-0 object-contain"
                />
                <p class="truncate text-sm font-semibold text-foreground">
                  {{ step.expedition.name }}
                </p>
                <img
                  v-if="step.tier > 0"
                  :src="expeditionTierIcons[step.tier]"
                  :alt="`Tier ${step.tier}`"
                  class="size-5 shrink-0 object-contain"
                  loading="lazy"
                />
                <span
                  v-if="step.traitMatch"
                  class="shrink-0 text-[10px] font-semibold text-primary"
                >
                  {{ t('levelPlannerComponents.timelineStep.traitMatch') }}
                </span>
                <span v-if="hasOverride" class="shrink-0 text-[10px] font-semibold text-primary">
                  {{ t('levelPlannerComponents.timelineStep.override') }}
                </span>
              </div>

              <span
                v-if="!partyMembers"
                class="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-xs font-semibold text-foreground"
              >
                LVL {{ step.fromLevel }}&rarr;{{ step.toLevel }}
              </span>

              <ChevronRight
                class="size-4 shrink-0 text-muted-foreground/50 transition-transform"
                :class="expanded ? 'rotate-90' : ''"
              />
            </div>

            <!-- Party member slots (party mode) -->
            <div v-if="partyMembers && partyMembers.length > 0" class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="member in partyMembers"
                :key="member.creatureId"
                class="flex flex-col items-center gap-1"
              >
                <div
                  class="relative size-16 overflow-hidden rounded-lg border bg-card/50 sm:size-20"
                  :class="[
                    highlightCreatureId && member.creatureId === highlightCreatureId
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-border',
                    member.creature ? 'transition hover:ring-1 hover:ring-accent/40' : '',
                  ]"
                >
                  <RightClickHint
                    v-if="member.creature"
                    @contextmenu="toggleCreature(member.creature)"
                  >
                    <img
                      :src="getCreatureImage(member.creature)"
                      :alt="member.creature?.name ?? member.creatureId"
                      class="size-full object-cover"
                      loading="lazy"
                    />
                    <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-0.5">
                      <p
                        class="truncate text-center text-[10px] font-semibold"
                        :class="
                          highlightCreatureId && member.creatureId === highlightCreatureId
                            ? 'text-primary'
                            : 'text-white'
                        "
                      >
                        {{ member.creature?.name ?? member.creatureId }}
                      </p>
                    </div>
                  </RightClickHint>
                  <template v-else>
                    <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-0.5">
                      <p
                        class="truncate text-center text-[10px] font-semibold"
                        :class="
                          highlightCreatureId && member.creatureId === highlightCreatureId
                            ? 'text-primary'
                            : 'text-white'
                        "
                      >
                        {{ member.creatureId }}
                      </p>
                    </div>
                  </template>
                </div>
                <span
                  class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                >
                  <template v-if="member.isBooster">{{
                    t('levelPlannerComponents.timelineStep.booster')
                  }}</template>
                  <template v-else>LVL {{ member.fromLevel }}&rarr;{{ member.toLevel }}</template>
                </span>
              </div>
            </div>

            <!-- Row 2: Biome + stats on right -->
            <div class="mt-1.5 flex items-center gap-2">
              <div
                class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span>{{ step.biomeName }}</span>
                <span
                  v-if="step.biomeStatus === 'advantage'"
                  class="font-semibold"
                  style="color: var(--color-green)"
                >
                  {{ t('levelPlannerComponents.timelineStep.advantage') }}
                </span>
                <span
                  v-if="step.biomeStatus === 'disadvantage'"
                  class="font-semibold text-destructive"
                >
                  {{ t('levelPlannerComponents.timelineStep.disadvantage') }}
                </span>
              </div>

              <div class="ml-auto flex shrink-0 items-center gap-3">
                <span
                  class="inline-flex items-center gap-1 text-xs font-semibold"
                  style="color: var(--color-green)"
                >
                  <Clock3 class="size-3" />
                  {{ formatDuration(step.timeSeconds) }}
                </span>
                <span class="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                  <Repeat class="size-3" />
                  {{ step.runs.toLocaleString(activeLocale()) }}
                </span>
                <span
                  class="inline-flex items-center gap-1 text-xs font-semibold"
                  :class="
                    scoreRatioMet === undefined
                      ? 'text-purple-400'
                      : scoreRatioMet
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                  "
                >
                  <Zap class="size-3" />
                  <template
                    v-if="
                      (step.startXpPerMinute / 60).toFixed(2) !==
                      (step.endXpPerMinute / 60).toFixed(2)
                    "
                  >
                    {{
                      (step.startXpPerMinute / 60).toLocaleString(activeLocale(), {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}&rarr;{{
                      (step.endXpPerMinute / 60).toLocaleString(activeLocale(), {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}
                  </template>
                  <template v-else>
                    {{
                      (step.xpPerMinute / 60).toLocaleString(activeLocale(), {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }}
                  </template>
                  {{ t('levelPlannerComponents.timelineStep.xpPerSec') }}
                </span>
                <span
                  v-if="partyMembers"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-sky-400"
                >
                  <Users class="size-3" />
                  {{ partyMembers.length }}
                </span>
              </div>
            </div>

            <!-- Booster recommendations (single mode only) -->
            <div
              v-if="!partyMembers && step.boosters && step.boosters.length > 0"
              class="mt-2 flex flex-wrap items-center gap-2"
            >
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                <Users class="size-3" />
                {{ t('levelPlannerComponents.timelineStep.bring') }}
              </span>
              <LevelPlannerBoosterChip
                v-for="booster in step.boosters"
                :key="booster.creature.id"
                :creature="booster.creature"
                @inspect="toggleCreature"
              />
              <span
                v-if="
                  step.boosterTimeSavings &&
                  step.boosterTimeSavings > 0 &&
                  step.timeSeconds + step.boosterTimeSavings > 0
                "
                class="ml-auto text-[11px] font-semibold"
                style="color: var(--color-green)"
              >
                {{
                  Math.round(
                    (step.boosterTimeSavings / (step.timeSeconds + step.boosterTimeSavings)) * 100,
                  )
                }}{{ t('levelPlannerComponents.timelineStep.percentFaster') }}
              </span>
            </div>

            <!-- Time proportion bar -->
            <div class="mt-2 flex items-center gap-2">
              <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted/30">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :style="{
                    width: Math.max(2, timePercent) + '%',
                    backgroundColor: nodeColor(step.biomeStatus),
                    opacity: 0.6,
                  }"
                />
              </div>
              <span v-if="timePercent >= 5" class="text-[10px] font-semibold text-muted-foreground">
                {{ Math.round(timePercent) }}%
              </span>
            </div>

            <!-- Party tip -->
            <p
              v-if="step.partyTip && !partyMembers && !(step.boosters && step.boosters.length > 0)"
              class="mt-1.5 flex items-center gap-1 text-[11px] text-sky-400"
            >
              <Users class="size-3" />
              {{ step.partyTip }}
            </p>
          </div>
        </button>

        <!-- View in Expeditions (party mode, always visible) -->
        <div v-if="partyMembers" class="border-t border-border/40 px-3 py-2 sm:px-4">
          <button
            class="focus-ring flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            @click="$emit('viewInExpeditions')"
          >
            <ExternalLink class="size-3" />
            {{ t('levelPlannerComponents.timelineStep.viewInExpeditions') }}
          </button>
        </div>

        <!-- Expanded details -->
        <div v-if="expanded" class="border-t border-border/40 px-3 py-2.5 sm:px-4">
          <!-- Alternative Routes -->
          <template v-if="step.alternatives && step.alternatives.length > 0">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ArrowRightLeft class="size-3" />
                  {{ t('levelPlannerComponents.timelineStep.alternativeRoutes') }}
                </p>
                <button
                  v-if="hasOverride"
                  class="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
                  @click.stop="$emit('resetOverride', step.fromLevel)"
                >
                  <RotateCcw class="size-3" />
                  {{ t('levelPlannerComponents.timelineStep.resetToOptimal') }}
                </button>
              </div>

              <div class="space-y-1.5">
                <button
                  v-for="alt in step.alternatives"
                  :key="`${alt.expedition.id}-${alt.tier}`"
                  class="focus-ring flex w-full flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-muted/20"
                  @click.stop="
                    $emit(
                      'selectAlternative',
                      step.fromLevel,
                      step.toLevel,
                      alt.expedition.id,
                      alt.tier,
                    )
                  "
                >
                  <!-- Row 1: name + tier on left, time / xp chips on right -->
                  <div class="flex w-full items-center gap-1.5">
                    <img
                      v-if="
                        alt.expedition.rewards.length > 0 &&
                        getItemImage({ id: alt.expedition.rewards[0].itemId })
                      "
                      :src="getItemImage({ id: alt.expedition.rewards[0].itemId })"
                      :alt="itemName(alt.expedition.rewards[0].itemId)"
                      loading="lazy"
                      class="size-4 shrink-0 object-contain"
                    />
                    <span class="min-w-0 truncate font-semibold text-foreground">
                      {{ alt.expedition.name }}
                    </span>
                    <img
                      v-if="alt.tier > 0"
                      :src="expeditionTierIcons[alt.tier]"
                      :alt="`Tier ${alt.tier}`"
                      class="size-4 shrink-0 object-contain"
                      loading="lazy"
                    />

                    <div class="ml-auto flex shrink-0 items-center gap-1.5">
                      <span
                        class="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/35 px-2 py-0.5 font-mono text-xs font-semibold"
                        :style="{
                          color:
                            alt.timeDeltaPercent <= 0
                              ? 'var(--color-green)'
                              : 'var(--color-destructive)',
                        }"
                      >
                        <Clock3 class="size-3" />
                        {{ formatDuration(alt.timeSeconds) }}
                        <span class="opacity-60">{{ formatDelta(alt.timeDeltaPercent) }}</span>
                      </span>
                      <span
                        class="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/35 px-2 py-0.5 font-mono text-xs font-semibold"
                        :style="{
                          color:
                            alt.xpPerMinuteDeltaPercent >= 0
                              ? 'var(--color-green)'
                              : 'var(--color-destructive)',
                        }"
                      >
                        <Zap class="size-3" />
                        {{
                          (alt.xpPerMinute / 60).toLocaleString(activeLocale(), {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }}
                        <span class="opacity-60">{{
                          formatDelta(alt.xpPerMinuteDeltaPercent)
                        }}</span>
                      </span>
                    </div>
                  </div>

                  <!-- Row 2: booster chips (only if this alternative would use boosters) -->
                  <div
                    v-if="alt.boosters && alt.boosters.length > 0"
                    class="flex flex-wrap items-center gap-2 pl-5"
                  >
                    <span
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400"
                    >
                      <Users class="size-3" />
                      {{ t('levelPlannerComponents.timelineStep.bring') }}
                    </span>
                    <LevelPlannerBoosterChip
                      v-for="booster in alt.boosters"
                      :key="booster.creature.id"
                      :creature="booster.creature"
                      @inspect="toggleCreature"
                    />
                  </div>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
  <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
</template>
