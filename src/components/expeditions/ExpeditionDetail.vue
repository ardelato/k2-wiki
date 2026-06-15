<script setup lang="ts">
import { ChevronDown, Compass, Minus, Plus, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RightClickHint from '@/components/shared/RightClickHint.vue'
import { activeLocale } from '@/i18n'
import type { Creature, Expedition, ExpeditionStatWeights } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { TIER_UNLOCK_REQUIREMENTS } from '@/utils/expeditionUnlocks'
import { formatDecimal, formatDuration, itemName, toTitleCase } from '@/utils/format'
import { statLabels, tierModifiers } from '@/utils/formulas'
import { expeditionTierIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const { t } = useI18n()


const props = defineProps<{
  expedition: Expedition | null
  selectedTier: number
  partySlots: (Creature | null)[]
  activeSlotIndex: number | null
  creatureLevels: Record<string, number>
  difficultyRating: number
  partyScore: number
  estimatedDuration: number | null
  scoreRatio: number | null
  loopCount: number
  loopBonusPercent: number
  totalXp: number | null
  xpPerMinute: number | null
  partyXpProgress: {
    creature: Creature
    currentLevel: number
    targetLevel: number
    progress: number
  }[]
  topRecommendedCreatures: { creature: Creature; percent: number }[]
  weightedStats: [keyof ExpeditionStatWeights, number][]
  getCreatureSlotRating: (creature: Creature) => number
}>()


const emit = defineEmits<{
  'update:selectedTier': [tier: number]
  'update:loopCount': [count: number]
  'set-active-slot': [index: number]
  'remove-creature': [index: number]
  'inspect-creature': [creature: Creature]
}>()


const showAdvancedDetails = ref(false)


function clampLoopCount(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(200, Math.round(value)))
}


function stepLoopCount(delta: number) {
  emit('update:loopCount', clampLoopCount(props.loopCount + delta))
}


function normalizeLoopCountOnBlur(event: FocusEvent) {
  const target = event.target as HTMLInputElement
  if (!target.value.trim()) {
    emit('update:loopCount', 0)
    return
  }
  const parsed = Number(target.value)
  emit('update:loopCount', clampLoopCount(parsed))
}
</script>

<template>
  <section class="surface-card flex flex-col overflow-hidden">
    <div class="border-b border-border/70 px-4 py-3">
      <h2 class="text-base font-bold">{{ t('expeditions.detail.title') }}</h2>
    </div>

    <div
      v-if="expedition"
      class="max-h-[62vh] animate-fade-in space-y-4 overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1"
    >
      <!-- Name & Description -->
      <div>
        <h3 class="text-2xl font-black leading-tight">{{ expedition.name }}</h3>
        <p class="mt-1 text-sm text-muted-foreground">{{ expedition.description }}</p>
      </div>

      <!-- Quick Facts: Biome, Trait -->
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
          <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
            {{ t('expeditions.detail.biome') }}
          </p>
          <p class="font-semibold">{{ toTitleCase(expedition.biome) }}</p>
        </div>
        <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
          <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
            {{ t('expeditions.detail.trait') }}
          </p>
          <p class="font-semibold text-amber-700 dark:text-amber-300">
            {{ expedition.trait ? toTitleCase(expedition.trait) : t('expeditions.detail.none') }}
          </p>
        </div>
      </div>

      <!-- Rewards -->
      <div class="space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {{ t('expeditions.detail.rewards') }}
        </h4>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="reward in expedition.rewards"
            :key="reward.itemId"
            class="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/45 px-3 py-1 font-mono text-xs"
          >
            <img
              v-if="getItemImage({ id: reward.itemId })"
              :src="getItemImage({ id: reward.itemId })"
              :alt="itemName(reward.itemId)"
              class="size-4 object-contain"
              loading="lazy"
            />
            {{ reward.amount * tierModifiers.loot[selectedTier - 1] }}x
            {{ itemName(reward.itemId) }}
          </span>
        </div>
      </div>

      <!-- Recommended Creatures -->
      <div v-if="topRecommendedCreatures.length" class="space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {{ t('expeditions.detail.recommendedCreatures') }}
        </h4>
        <div class="flex flex-wrap gap-2">
          <RightClickHint
            v-for="{ creature, percent } in topRecommendedCreatures"
            :key="creature.id"
            @contextmenu="emit('inspect-creature', creature)"
          >
            <div
              class="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/35 py-1 pl-1 pr-3 transition hover:border-accent/45 hover:bg-muted/50"
            >
              <div class="size-6 overflow-hidden rounded-full bg-card">
                <img
                  :src="getCreatureImage(creature)"
                  :alt="creature.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
              </div>
              <span class="text-xs font-semibold">{{ creature.name }}</span>
              <span
                class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
                >{{ percent }}%</span
              >
            </div>
          </RightClickHint>
        </div>
      </div>

      <!-- Advanced Details toggle -->
      <div>
        <button
          class="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          :aria-expanded="showAdvancedDetails"
          @click="showAdvancedDetails = !showAdvancedDetails"
        >
          <ChevronDown
            class="size-3.5 transition-transform"
            :class="showAdvancedDetails ? '' : '-rotate-90'"
          />
          {{ t('expeditions.detail.advancedDetails') }}
        </button>

        <div class="mt-3 space-y-4" :class="showAdvancedDetails ? 'block' : 'hidden'">
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t('expeditions.detail.rating') }}
              </p>
              <p class="font-mono font-semibold">{{ difficultyRating }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t('expeditions.detail.xpPool') }}
              </p>
              <p class="font-semibold">
                {{ Math.floor(expedition.baseXP * tierModifiers.xp[selectedTier - 1]) }}
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/35 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t('expeditions.detail.unlockAfter') }}
              </p>
              <p class="font-semibold">
                {{ expedition.requiredExpeditionCompletions }}
                {{ t('expeditions.detail.expeditions') }}
              </p>
            </div>
            <div
              v-if="selectedTier > 1"
              class="rounded-lg border border-border bg-muted/35 px-3 py-2"
            >
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t('expeditions.detail.tierRequires', { tier: selectedTier }) }}
              </p>
              <p class="font-semibold">
                {{
                  t('expeditions.detail.tierClears', {
                    n: TIER_UNLOCK_REQUIREMENTS[selectedTier],
                    prev: selectedTier - 1,
                  })
                }}
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {{ t('expeditions.detail.statWeights') }}
            </h4>
            <div
              v-for="[key, weight] in weightedStats"
              :key="key"
              class="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-2"
            >
              <span class="text-xs text-muted-foreground">{{ statLabels[key] }}</span>
              <div class="h-2 rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${weight * 100}%` }"
                />
              </div>
              <span class="text-right text-xs font-semibold text-foreground"
                >{{ Math.round(weight * 100) }}%</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Tier & Loop Count -->
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {{ t('expeditions.detail.tierLabel') }}
          </h4>
          <div class="inline-flex rounded-lg border border-border bg-muted/45 p-1">
            <button
              v-for="t_val in 5"
              :key="t_val"
              class="focus-ring rounded-md px-1.5 py-1 text-xs font-semibold transition"
              :class="
                selectedTier === t_val
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="emit('update:selectedTier', t_val)"
            >
              <img
                :src="expeditionTierIcons[t_val]"
                :alt="`Tier ${t_val}`"
                class="size-7 object-contain"
                loading="lazy"
              />
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {{ t('expeditions.detail.loopCount') }}
          </h4>
          <div class="flex items-center gap-2">
            <div
              class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
            >
              <button
                class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="loopCount <= 0"
                :aria-label="t('expeditions.detail.decreaseLoopCount')"
                @click="stepLoopCount(-10)"
              >
                <Minus class="size-3" />
              </button>
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="focus-ring h-8 w-14 border-x border-input bg-transparent text-center font-mono text-sm"
                :value="loopCount"
                :aria-label="t('expeditions.detail.loopCountLabel')"
                @blur="normalizeLoopCountOnBlur($event)"
              />
              <button
                class="focus-ring inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="loopCount >= 200"
                :aria-label="t('expeditions.detail.increaseLoopCount')"
                @click="stepLoopCount(10)"
              >
                <Plus class="size-3" />
              </button>
            </div>
            <span
              v-if="loopBonusPercent > 0"
              class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
            >
              +{{ loopBonusPercent }}%
            </span>
          </div>
          <p class="text-[11px] text-muted-foreground">{{ t('expeditions.detail.loopHint') }}</p>
        </div>
      </div>

      <!-- Party Slots -->
      <div class="space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {{ t('expeditions.detail.party', 'Party') }}
        </h4>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="(slot, index) in partySlots"
            :key="index"
            class="flex flex-col items-center gap-1"
          >
            <div
              class="relative size-20 overflow-hidden rounded-lg border transition"
              :class="[
                slot
                  ? 'border-border bg-card/50 hover:border-primary/50'
                  : activeSlotIndex === index
                    ? 'border-dashed border-primary bg-primary/10'
                    : 'cursor-pointer border-dashed border-border/50 bg-muted/20 hover:border-accent/45',
              ]"
              @click="!slot ? emit('set-active-slot', index) : undefined"
            >
              <template v-if="slot">
                <RightClickHint @contextmenu="emit('inspect-creature', slot)">
                  <img
                    :src="getCreatureImage(slot)"
                    :alt="`${slot.name} artwork`"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <span
                    class="absolute left-0.5 top-0.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300"
                  >
                    {{ getCreatureSlotRating(slot) }}
                  </span>
                  <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1.5 py-1">
                    <p class="truncate text-center text-[10px] font-semibold text-white">
                      {{ slot.name }}
                    </p>
                  </div>
                </RightClickHint>
                <button
                  class="focus-ring absolute right-0 top-0 rounded-bl rounded-tr-lg bg-black/70 p-0.5 text-white/80 transition hover:bg-destructive hover:text-white"
                  @click.stop="emit('remove-creature', index)"
                >
                  <X class="size-3" />
                </button>
              </template>
              <template v-else>
                <div class="flex size-full flex-col items-center justify-center gap-1">
                  <Plus class="size-4 text-muted-foreground/50" />
                  <span v-if="activeSlotIndex === index" class="text-[9px] text-primary">{{
                    t('common.select')
                  }}</span>
                </div>
              </template>
            </div>
            <span
              v-if="slot"
              class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
            >
              {{ t('levelPlanner.stats.level', { n: creatureLevels[slot.id] || 1 }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Party Summary -->
      <div v-if="partyScore > 0" class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <h4 class="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {{ t('expeditions.detail.partySummary') }}
        </h4>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.partyScore') }}</p>
            <p class="font-mono text-sm font-semibold text-primary">{{ partyScore }}</p>
          </div>
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.difficulty') }}</p>
            <p class="font-mono text-sm font-semibold">{{ difficultyRating }}</p>
          </div>
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.scoreRatio') }}</p>
            <p
              class="font-mono text-sm font-semibold"
              :class="
                scoreRatio && scoreRatio >= 1
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              "
            >
              {{ scoreRatio ? formatDecimal(scoreRatio) : '—' }}
            </p>
          </div>
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.durationPerRun') }}</p>
            <p class="font-mono text-sm font-semibold">
              {{ estimatedDuration ? formatDuration(estimatedDuration) : '—' }}
            </p>
            <p
              v-if="loopCount > 0 && estimatedDuration"
              class="mt-0.5 text-[10px] text-muted-foreground"
            >
              {{ formatDuration(estimatedDuration * loopCount) }}
            </p>
          </div>
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.xpPerCreature') }}</p>
            <p class="font-mono text-sm font-semibold">
              {{ totalXp ? totalXp.toLocaleString(activeLocale()) : '—' }}
              <span
                v-if="loopBonusPercent > 0 && totalXp"
                class="ml-0.5 inline-block rounded bg-emerald-100 px-1 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              >
                +{{ loopBonusPercent }}%
              </span>
            </p>
          </div>
          <div class="rounded-md bg-card px-2 py-2">
            <p class="text-muted-foreground">{{ t('expeditions.detail.xpRate') }}</p>
            <div class="flex items-center justify-center gap-2">
              <p class="font-mono text-sm font-semibold">
                {{ xpPerMinute ? Math.round(xpPerMinute).toLocaleString(activeLocale()) : '—'
                }}<span class="text-[10px] text-muted-foreground">/m</span>
              </p>
              <div class="h-4 border-l border-border/50" />
              <p class="font-mono text-sm font-semibold">
                {{ xpPerMinute ? formatDecimal(xpPerMinute / 60) : '—'
                }}<span class="text-[10px] text-muted-foreground">/s</span>
              </p>
            </div>
          </div>
        </div>

        <div v-if="partyXpProgress.length" class="space-y-1.5">
          <div
            v-for="entry in partyXpProgress"
            :key="entry.creature.id"
            class="flex items-center gap-2"
          >
            <span
              class="w-16 shrink-0 truncate font-mono text-[10px] font-semibold text-muted-foreground"
            >
              {{ entry.creature.name }}
            </span>
            <span
              class="w-7 shrink-0 text-right font-mono text-[10px] font-semibold text-muted-foreground"
            >
              {{ entry.currentLevel }}
            </span>
            <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                :style="{ width: `${entry.progress * 100}%` }"
              />
            </div>
            <span class="w-7 shrink-0 font-mono text-[10px] font-semibold text-foreground">
              {{ entry.targetLevel }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground"
    >
      <Compass class="size-8 text-accent/65" />
      <p class="text-sm">{{ t('expeditions.detail.selectPrompt') }}</p>
    </div>
  </section>
</template>
