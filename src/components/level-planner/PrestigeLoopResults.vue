<script setup lang="ts">
import {
  Anchor,
  ChevronDown,
  Coins,
  ExternalLink,
  LayoutGrid,
  LineChart,
  RefreshCw,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PartyCreatureTile from '@/components/level-planner/PartyCreatureTile.vue'
import PrestigeCardLevelChart from '@/components/level-planner/PrestigeCardLevelChart.vue'
import InfoHint from '@/components/shared/InfoHint.vue'
import LearnMore from '@/components/shared/LearnMore.vue'
import { useGameConfig } from '@/composables/useGameConfig'
import type { Creature } from '@/types'
import { itemName } from '@/utils/format/format'
import { expeditionTierIcons } from '@/utils/format/icons'
import { tierModifiers } from '@/utils/formulas'
import { getItemImage } from '@/utils/images/itemImages'
import type { MemberRole, PrestigeLoopPlan } from '@/utils/planner/prestigeLoopPlanner'
import { biomeMap, expeditionMap } from '@/utils/save/precomputedTables'

const props = defineProps<{
  plan: PrestigeLoopPlan
  creatures: Map<string, Creature>
  getLevel: (id: string) => number
  isAwakened: (id: string) => boolean
  computing?: boolean
}>()


const emit = defineEmits<{
  recalculate: []
}>()


const { t } = useI18n()


const ROLE_LABEL: Record<MemberRole, string> = {
  climber: t('levelPlanner.prestigeLoop.roles.climber'),
  booster: t('levelPlanner.prestigeLoop.roles.booster'),
  anchor: t('levelPlanner.prestigeLoop.roles.anchor'),
}


// Mirror the Roster rail's role badge styling so the same role reads the same in both places.
const ROLE_CLASS: Record<MemberRole, string> = {
  climber: 'bg-primary/15 text-primary',
  booster: 'bg-warning/15 text-warning-strong',
  anchor: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
}


const ROLE_ORDER: Record<MemberRole, number> = { anchor: 0, booster: 1, climber: 2 }


interface RewardView {
  itemId: string
  name: string
  image: string | undefined
  amount: number
}


interface PartyMemberView {
  creatureId: string
  role: MemberRole
  level: number
  creature: Creature
}


interface PartyView {
  expeditionId: string
  name: string
  biome: string
  tier: number
  rewards: RewardView[]
  members: PartyMemberView[]
}


const parties = computed<PartyView[]>(() =>
  props.plan.assignment
    .map((a) => {
      const exp = expeditionMap.get(a.expeditionId)
      const lootMod = tierModifiers.loot[a.tier - 1] ?? 1
      return {
        expeditionId: a.expeditionId,
        name: exp?.name ?? a.expeditionId,
        biome: exp?.biome ? (biomeMap.get(exp.biome)?.name ?? '') : '',
        tier: a.tier,
        rewards: (exp?.rewards ?? []).map((r) => ({
          itemId: r.itemId,
          name: itemName(r.itemId),
          image: getItemImage({ id: r.itemId }),
          amount: r.amount * lootMod,
        })),
        members: a.members
          .map((m) => ({ ...m, creature: props.creatures.get(m.creatureId) }))
          .filter((m): m is PartyMemberView => Boolean(m.creature))
          .toSorted((x, y) => ROLE_ORDER[x.role] - ROLE_ORDER[y.role]),
      }
    })
    // Match the canonical Expeditions-page order (useExpeditions / AwakenExpeditionPicker):
    // required completions ascending, then base rating ascending.
    .toSorted((a, b) => {
      const ea = expeditionMap.get(a.expeditionId)
      const eb = expeditionMap.get(b.expeditionId)
      const reqDiff =
        (ea?.requiredExpeditionCompletions ?? 0) - (eb?.requiredExpeditionCompletions ?? 0)
      if (reqDiff !== 0) return reqDiff
      return (ea?.baseRating ?? 0) - (eb?.baseRating ?? 0)
    }),
)


// One-line summary shown when "Learn more" is expanded.
const strategySummary = computed(() => t('levelPlanner.prestigeLoop.results.strategySummary'))


// The fuller explanation, lightly trimmed, shown beneath the summary.
const strategyExplainer = computed(() =>
  t('levelPlanner.prestigeLoop.results.strategyExplainer', {
    boosterCount: props.plan.boosterCount,
  }),
)


const tokensPerHour = computed(() => props.plan.tokensPerHour)
const tokensPerDay = computed(() => tokensPerHour.value * 24)


// The real prestige-token asset for the hero (falls back to the Coins glyph if missing).
const prestigeTokenIcon = getItemImage({ id: 'prestige-points' })


function fmt(n: number): string {
  return n.toFixed(2)
}


const learnMoreOpen = ref(false)


type ViewMode = 'setup' | 'levels'
const viewMode = ref<ViewMode>('setup')
// The level charts come from the per-check-in timeline; without it there's nothing to chart.
const hasTimeline = computed(() => props.plan.timeline.length > 0)


const tabs = computed<{ id: ViewMode; label: string; icon: typeof LayoutGrid }[]>(() => [
  { id: 'setup', label: t('levelPlanner.prestigeLoop.results.tabSetup'), icon: LayoutGrid },
  ...(hasTimeline.value
    ? [
        {
          id: 'levels' as const,
          label: t('levelPlanner.prestigeLoop.results.tabLevels'),
          icon: LineChart,
        },
      ]
    : []),
])


// Fall back to Setup if the active tab is no longer available (e.g. timeline vanished).
watch(
  tabs,
  (list) => {
    if (!list.some((t) => t.id === viewMode.value)) viewMode.value = 'setup'
  },
  { immediate: true },
)


const router = useRouter()
const {
  setExpeditionParties,
  setExpeditionCreatureLevels,
  setExpeditionTiers,
  setExpeditionLoopCounts,
} = useGameConfig()


// Write the recommended stable assignment into the Expeditions config (replacing any
// existing parties) and open the Expeditions page so the user can inspect/tweak it there.
function viewSetupInExpeditions() {
  const partyIds: Record<string, string[]> = {}
  const levels: Record<string, number> = {}
  const tiers: Record<string, number> = {}


  for (const a of props.plan.assignment) {
    partyIds[a.expeditionId] = a.members.map((m) => m.creatureId)
    tiers[a.expeditionId] = a.tier
    for (const m of a.members) {
      levels[m.creatureId] = m.level
    }
  }


  setExpeditionParties(partyIds)
  setExpeditionCreatureLevels(levels)
  setExpeditionTiers(tiers)
  setExpeditionLoopCounts({})


  const resolved = router.resolve({ path: '/expeditions' })
  window.open(resolved.href, '_blank')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Result hero: lead with tokens/day, the most tangible figure for a check-in loop -->
    <section data-tour="prestige-hero" class="surface-card px-4 py-4">
      <div class="flex items-start justify-between gap-2">
        <p class="flex items-baseline gap-2 font-bold text-foreground">
          <img
            v-if="prestigeTokenIcon"
            :src="prestigeTokenIcon"
            :alt="t('levelPlanner.prestigeLoop.results.prestigeTokenAlt')"
            class="size-7 shrink-0 self-center object-contain"
          />
          <Coins v-else class="size-7 shrink-0 self-center text-primary" />
          <span class="text-3xl tabular-nums sm:text-4xl">≈ {{ fmt(tokensPerDay) }}</span>
          <span class="text-base text-muted-foreground">{{
            t('levelPlanner.prestigeLoop.results.tokensPerDay')
          }}</span>
          <InfoHint term="prestige" position="bottom" />
        </p>
        <button
          class="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          :disabled="computing"
          :class="{ 'cursor-not-allowed opacity-50': computing }"
          @click="emit('recalculate')"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': computing }" />
          {{ t('levelPlanner.controls.recalculate') }}
        </button>
      </div>
      <p
        class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground"
      >
        <span>{{
          t('levelPlanner.prestigeLoop.results.checkingInEvery', { h: plan.cadenceHours })
        }}</span>
        <span class="text-muted-foreground/40">·</span>
        <button
          class="focus-ring inline-flex items-center gap-0.5 rounded text-xs font-semibold text-primary transition hover:text-primary/80"
          @click="learnMoreOpen = !learnMoreOpen"
        >
          {{ t('levelPlanner.prestigeLoop.learnMore') }}
          <ChevronDown
            class="size-3.5 transition-transform"
            :class="{ 'rotate-180': learnMoreOpen }"
          />
        </button>
      </p>
      <div
        v-if="learnMoreOpen"
        class="mt-3 space-y-2 border-t border-border/40 pt-3 text-sm leading-relaxed text-muted-foreground"
      >
        <p class="font-semibold text-foreground">{{ strategySummary }}</p>
        <p>{{ strategyExplainer }}</p>
      </div>
    </section>

    <!-- Tabs: the setup to apply now · the levels across each check-in (only when there's a chart) -->
    <div
      v-if="tabs.length > 1"
      data-tour="prestige-tabs"
      class="inline-flex overflow-hidden rounded-lg border border-border/70 bg-background/70"
    >
      <template v-for="(tab, i) in tabs" :key="tab.id">
        <div v-if="i > 0" class="w-px self-stretch bg-border/40" />
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            viewMode === tab.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="viewMode = tab.id"
        >
          <component :is="tab.icon" class="size-3.5" />
          {{ tab.label }}
        </button>
      </template>
    </div>

    <!-- Header shared by both views -->
    <div
      v-if="viewMode === 'setup' || viewMode === 'levels'"
      class="flex flex-wrap items-center justify-between gap-2"
    >
      <h2 class="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
        {{ t('levelPlanner.prestigeLoop.results.recommendedSetup') }}
      </h2>
      <button
        class="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        :title="t('levelPlanner.prestigeLoop.results.viewSetupTitle')"
        @click="viewSetupInExpeditions"
      >
        <ExternalLink class="size-3.5" />
        {{ t('levelPlanner.prestigeLoop.results.viewSetup') }}
      </button>
    </div>

    <!-- ===== Setup: the stable party to apply now. Cards size to their party (no flip). ===== -->
    <section v-if="viewMode === 'setup'" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="party in parties" :key="party.expeditionId" class="surface-card px-4 py-3">
        <div class="mb-2">
          <p class="flex min-w-0 items-center gap-1.5 font-bold text-foreground">
            <img
              v-if="party.rewards[0]?.image"
              :src="party.rewards[0].image"
              :alt="party.rewards[0].name"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="truncate">{{ party.name }}</span>
            <img
              :src="expeditionTierIcons[party.tier]"
              :alt="t('levelPlanner.tier', { tier: party.tier })"
              :title="t('levelPlanner.tier', { tier: party.tier })"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
          </p>
        </div>
        <div class="flex flex-wrap justify-between gap-3">
          <div
            v-for="m in party.members"
            :key="m.creatureId"
            class="flex flex-col items-center gap-1"
          >
            <PartyCreatureTile
              :creature="m.creature"
              chip-state="included"
              :level="getLevel(m.creatureId)"
              :awakened="isAwakened(m.creatureId)"
              :title-suffix="` — ${ROLE_LABEL[m.role]}`"
            />
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide"
              :class="ROLE_CLASS[m.role]"
            >
              <Anchor v-if="m.role === 'anchor'" class="size-2.5" />
              {{ ROLE_LABEL[m.role] }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Levels: each expedition's per-creature level trajectory. Cards size to the
         chart + legend, so charts get full height. ===== -->
    <section v-else-if="viewMode === 'levels'" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div class="col-span-full">
        <LearnMore
          term="levelChart"
          :label="t('levelPlanner.prestigeLoop.results.howToReadCharts')"
        />
      </div>
      <div
        v-for="party in parties"
        :key="party.expeditionId"
        class="surface-card flex flex-col px-4 py-3"
      >
        <div class="mb-2">
          <p class="flex min-w-0 items-center gap-1.5 font-bold text-foreground">
            <img
              v-if="party.rewards[0]?.image"
              :src="party.rewards[0].image"
              :alt="party.rewards[0].name"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="truncate">{{ party.name }}</span>
            <img
              :src="expeditionTierIcons[party.tier]"
              :alt="t('levelPlanner.tier', { tier: party.tier })"
              :title="t('levelPlanner.tier', { tier: party.tier })"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
          </p>
        </div>
        <PrestigeCardLevelChart
          :timeline="plan.timeline"
          :creatures="creatures"
          :member-ids="party.members.map((m) => m.creatureId)"
          :anchor-ids="plan.anchorIds"
          :get-level="getLevel"
        />
      </div>
    </section>
  </div>
</template>
