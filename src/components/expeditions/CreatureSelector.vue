<script setup lang="ts">
import { ChevronDown, Info, Target } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import summonedIcon from '@/assets/icons/summoned.webp'
import ActiveFilters from '@/components/shared/ActiveFilters.vue'
import type { ActiveFilter } from '@/components/shared/ActiveFilters.vue'
import CreatureAssignmentBadge from '@/components/shared/CreatureAssignmentBadge.vue'
import LevelStepper from '@/components/shared/LevelStepper.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import type { Creature, ElementType, Expedition, ExpeditionStatWeights } from '@/types'
import { toTitleCase, typeColor } from '@/utils/format/format'
import { statAbbreviations } from '@/utils/formulas'
import { getCreatureImage } from '@/utils/images/creatureImages'

const { t } = useI18n()


const props = defineProps<{
  recommendedCreatures: {
    creature: Creature
    rating: number
    level: number
    suggestedLevel?: number | null
  }[]
  weightedStats: [keyof ExpeditionStatWeights, number][]
  hasEmptySlot: boolean
  selectedExpedition: Expedition | null
  sanctuaryCreatureIds: string[]
  helperCreatureIds: string[]
  machineCreatureIds: string[]
  expeditionCreatureIds: Set<string>
  dungeonParty: string[]
  expeditionToolXpBonus: number
  showExcludedCreatures: boolean
}>()


const emit = defineEmits<{
  'choose-creature': [creature: Creature]
  'inspect-creature': [creature: Creature]
  'step-level': [creatureId: string, currentLevel: number, delta: number]
  'normalize-level': [creatureId: string, currentLevel: number, event: FocusEvent]
  'update:showExcludedCreatures': [value: boolean]
}>()


const { isOwned, isAwakened } = useCreatureCollection()
const { creatures } = useCreatures()


const creatureTypes: ElementType[] = ['Fire', 'Water', 'Wind', 'Earth']
const creatureSearch = ref('')
const selectedCreatureType = ref<ElementType | 'all'>('all')
const selectedCreatureTiers = ref<number[]>([])
const ownedOnly = ref(true)
const showMoreCreatureFilters = ref(false)


const creatureTierOptions = computed(() => {
  const tiers = new Set(creatures.value.map((c) => c.tier))
  return Array.from(tiers).toSorted((a, b) => a - b)
})


const allCreatureTiersSelected = computed(() => {
  return (
    creatureTierOptions.value.length > 0 &&
    creatureTierOptions.value.every((tier) => selectedCreatureTiers.value.includes(tier))
  )
})


watch(
  creatureTierOptions,
  (tiers) => {
    const preserved = selectedCreatureTiers.value.filter((tier) => tiers.includes(tier))
    selectedCreatureTiers.value = preserved.length ? preserved : [...tiers]
  },
  { immediate: true },
)


const hasSecondaryCreatureFilters = computed(
  () => selectedCreatureType.value !== 'all' || !allCreatureTiersSelected.value,
)


const filteredRecommended = computed(() => {
  return props.recommendedCreatures.filter(({ creature }) => {
    const query = creatureSearch.value.toLowerCase()
    const matchesSearch =
      creature.name.toLowerCase().includes(query) || creature.trait.toLowerCase().includes(query)
    const matchesType =
      selectedCreatureType.value === 'all' || creature.types.includes(selectedCreatureType.value)
    const matchesTier =
      selectedCreatureTiers.value.length === 0 ||
      selectedCreatureTiers.value.includes(creature.tier)
    return matchesSearch && matchesType && matchesTier
  })
})


const displayRecommended = computed(() => {
  if (!ownedOnly.value) return filteredRecommended.value
  return filteredRecommended.value.filter(({ creature }) => isOwned(creature.id))
})


function statBar(creature: Creature, key: keyof ExpeditionStatWeights): number {
  return Math.min(100, creature.stats[key])
}


function toggleCreatureType(type: ElementType) {
  selectedCreatureType.value = selectedCreatureType.value === type ? 'all' : type
}


function toggleCreatureTier(tier: number) {
  if (allCreatureTiersSelected.value) {
    selectedCreatureTiers.value = [tier]
    return
  }
  if (selectedCreatureTiers.value.includes(tier)) {
    if (selectedCreatureTiers.value.length === 1) {
      selectedCreatureTiers.value = [...creatureTierOptions.value]
      return
    }
    selectedCreatureTiers.value = selectedCreatureTiers.value.filter(
      (selected) => selected !== tier,
    )
    return
  }
  selectedCreatureTiers.value = [...selectedCreatureTiers.value, tier]
}


function clearCreatureFilters() {
  creatureSearch.value = ''
  selectedCreatureType.value = 'all'
  selectedCreatureTiers.value = [...creatureTierOptions.value]
  ownedOnly.value = true
  emit('update:showExcludedCreatures', false)
}


function removeCreatureFilter(key: string) {
  if (key === 'search') {
    creatureSearch.value = ''
    return
  }
  if (key === 'ownedOnly') {
    ownedOnly.value = true
    return
  }
  if (key === 'showExcluded') {
    emit('update:showExcludedCreatures', false)
    return
  }
  if (key === 'type') {
    selectedCreatureType.value = 'all'
    return
  }
  if (key.startsWith('tier:')) {
    const tier = Number(key.slice(5))
    if (selectedCreatureTiers.value.length === 1) {
      selectedCreatureTiers.value = [...creatureTierOptions.value]
    } else {
      selectedCreatureTiers.value = selectedCreatureTiers.value.filter((t_val) => t_val !== tier)
    }
    return
  }
}


const activeCreatureFilters = computed<ActiveFilter[]>(() => {
  const filters: ActiveFilter[] = []
  if (creatureSearch.value)
    filters.push({
      key: 'search',
      group: 'Search',
      label:
        creatureSearch.value.length > 20
          ? `${creatureSearch.value.slice(0, 20)}…`
          : creatureSearch.value,
    })
  if (selectedCreatureType.value !== 'all')
    filters.push({
      key: 'type',
      group: 'Type',
      label: selectedCreatureType.value,
      color: typeColor(selectedCreatureType.value),
    })
  if (!allCreatureTiersSelected.value) {
    for (const tier of selectedCreatureTiers.value) {
      filters.push({ key: `tier:${tier}`, group: 'Tier', label: `T${tier + 1}` })
    }
  }
  if (!ownedOnly.value)
    filters.push({
      key: 'ownedOnly',
      group: 'Summoned',
      label: t('common.showingAll'),
      image: summonedIcon,
    })
  if (props.showExcludedCreatures)
    filters.push({ key: 'showExcluded', group: 'Excluded', label: t('common.showing') })
  return filters
})
</script>

<template>
  <section class="surface-card flex flex-col overflow-hidden">
    <!-- Header with Focus stats -->
    <div class="flex items-center gap-3 border-b border-border/70 px-4 py-3">
      <h2 class="text-base font-bold">{{ t('common.selectCreature') }}</h2>
      <div v-if="weightedStats.length" class="flex items-center gap-1.5">
        <Target class="size-3.5 text-accent" />
        <span
          v-for="[key] in weightedStats"
          :key="key"
          class="bg-accent/12 rounded-md border border-accent/35 px-2 py-0.5 text-xs font-semibold text-accent"
        >
          {{ statAbbreviations[key] }}
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div class="space-y-3 border-b border-border/70 px-4 py-3">
      <input
        v-model="creatureSearch"
        type="text"
        :placeholder="t('common.searchCreature')"
        class="focus-ring w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-sm"
      />

      <div class="flex flex-wrap gap-2">
        <button
          class="pill focus-ring gap-1.5"
          :class="ownedOnly ? 'pill-active' : ''"
          @click="ownedOnly = !ownedOnly"
        >
          <img :src="summonedIcon" alt="" class="size-4" loading="lazy" />
          {{ t('common.summoned') }}
        </button>
        <button
          class="pill focus-ring gap-1.5"
          :class="showExcludedCreatures ? 'pill-active' : ''"
          @click="emit('update:showExcludedCreatures', !showExcludedCreatures)"
        >
          {{ t('common.showExcluded') }}
        </button>

        <div
          class="ml-auto rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
          aria-live="polite"
        >
          {{ t('common.creaturesCount', { n: displayRecommended.length }) }}
        </div>
      </div>

      <!-- More filters toggle -->
      <div>
        <button
          class="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          :aria-expanded="showMoreCreatureFilters || hasSecondaryCreatureFilters"
          @click="showMoreCreatureFilters = !showMoreCreatureFilters"
        >
          <ChevronDown
            class="size-3.5 transition-transform"
            :class="showMoreCreatureFilters || hasSecondaryCreatureFilters ? '' : '-rotate-90'"
          />
          {{ t('common.moreFilters') }}
        </button>

        <div
          class="mt-3 space-y-3"
          :class="showMoreCreatureFilters || hasSecondaryCreatureFilters ? 'block' : 'hidden'"
        >
          <!-- Type filter -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{{
              t('common.type')
            }}</span>
            <button
              v-for="type in creatureTypes"
              :key="type"
              class="pill focus-ring"
              :class="selectedCreatureType === type ? 'pill-active' : ''"
              @click="toggleCreatureType(type)"
            >
              <span
                class="mr-1.5 inline-block size-2 rounded-full"
                :class="selectedCreatureType === type ? 'ring-1 ring-white/60' : ''"
                :style="{ backgroundColor: typeColor(type) }"
              />
              {{ type }}
            </button>
          </div>

          <!-- Tier filter -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{{
              t('common.tier')
            }}</span>
            <button
              v-for="tier in creatureTierOptions"
              :key="tier"
              class="pill focus-ring font-mono"
              :class="
                !allCreatureTiersSelected && selectedCreatureTiers.includes(tier)
                  ? 'pill-active'
                  : ''
              "
              @click="toggleCreatureTier(tier)"
            >
              T{{ tier + 1 }}
            </button>
          </div>
        </div>
      </div>

      <ActiveFilters
        :filters="activeCreatureFilters"
        @remove="removeCreatureFilter"
        @clear-all="clearCreatureFilters"
      />

      <div class="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
        <Info class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p class="text-2xs text-muted-foreground">
          {{ t('expeditions.selector.levelHint') }}
        </p>
      </div>
    </div>

    <div class="max-h-[58vh] space-y-2 overflow-y-auto p-3 lg:max-h-none lg:min-h-0 lg:flex-1">
      <button
        v-for="{ creature, rating, level, suggestedLevel } in displayRecommended"
        :key="creature.id"
        class="focus-ring block w-full rounded-xl border px-3 py-3 text-left transition"
        :class="
          hasEmptySlot
            ? 'border-border bg-card/50 hover:border-accent/45 hover:bg-muted/25'
            : 'border-border/50 bg-card/30 opacity-60'
        "
        @click="emit('choose-creature', creature)"
      >
        <div class="flex items-start gap-3">
          <RightClickHint @contextmenu="emit('inspect-creature', creature)">
            <div class="relative shrink-0">
              <img
                :src="getCreatureImage(creature)"
                :alt="`${creature.name} artwork`"
                class="size-10 rounded-md border border-border object-cover"
                loading="lazy"
              />
              <CreatureAssignmentBadge
                :creature-id="creature.id"
                :sanctuary-creature-ids="sanctuaryCreatureIds"
                :helper-creature-ids="helperCreatureIds"
                :machine-creature-ids="machineCreatureIds"
                :expedition-creature-ids="expeditionCreatureIds"
                :dungeon-party="dungeonParty"
                img-class="absolute -left-1 -top-1 size-5 rounded-full border border-background bg-background"
              />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1">
                <p
                  class="truncate font-semibold"
                  :class="
                    isAwakened(creature.id) ? 'text-pink-600 dark:text-pink-400' : 'text-foreground'
                  "
                >
                  {{ creature.name }}
                </p>
                <span
                  v-if="isOwned(creature.id)"
                  class="text-xs"
                  :class="
                    isAwakened(creature.id)
                      ? 'text-pink-600 dark:text-pink-400'
                      : 'text-warning-strong'
                  "
                  >★</span
                >
              </div>
              <div class="mt-1 flex flex-wrap gap-1 text-xs">
                <span
                  v-for="type in creature.types"
                  :key="type"
                  class="rounded-full bg-muted px-2 py-0.5 font-semibold"
                  :style="{ color: typeColor(type) }"
                >
                  {{ type }}
                </span>
                <span class="trait-chip">{{ toTitleCase(creature.trait) }}</span>
              </div>
            </div>
          </RightClickHint>

          <div class="text-right" @click.stop>
            <p
              class="mb-1 text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              {{ t('common.lvl') }}
              <span
                v-if="suggestedLevel != null"
                class="ml-1 normal-case tracking-normal"
                :class="level >= suggestedLevel ? 'text-success-strong' : 'text-warning-strong'"
              >
                {{ t('common.suggested', { n: suggestedLevel }) }}
              </span>
            </p>
            <LevelStepper
              :model-value="level"
              :min="1"
              :max="120"
              :decrease-label="t('common.decreaseLevel')"
              :increase-label="t('common.increaseLevel')"
              :input-label="t('common.creatureLevel')"
              @click.stop
              @step="emit('step-level', creature.id, level, $event)"
              @normalize="emit('normalize-level', creature.id, level, $event)"
            />
            <p class="mt-1 font-mono text-sm font-semibold text-primary">{{ rating }}</p>
          </div>
        </div>

        <div v-if="weightedStats.length" class="mt-3 space-y-1.5">
          <div
            v-for="[key, weight] in weightedStats"
            :key="key"
            class="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2"
          >
            <span class="text-3xs font-bold uppercase tracking-wide text-muted-foreground">{{
              statAbbreviations[key]
            }}</span>
            <div class="h-1.5 rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: `${statBar(creature, key)}%`, opacity: 0.45 + weight * 0.55 }"
              />
            </div>
          </div>
        </div>
      </button>

      <div
        v-if="displayRecommended.length === 0"
        class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center text-sm text-muted-foreground"
      >
        {{
          selectedExpedition
            ? t('expeditions.selector.noCreaturesExpedition')
            : t('expeditions.selector.selectExpeditionFirst')
        }}
      </div>
    </div>
  </section>
</template>
