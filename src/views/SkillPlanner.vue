<script setup lang="ts">
import { ArrowRight, Bot, Clock3, Target, TrendingUp, Trophy, Zap } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import PlannerEmptyState from '@/components/craft-planner/PlannerEmptyState.vue'
import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import SectionHead from '@/components/shared/SectionHead.vue'
import AdvisoryRow from '@/components/skill-planner/AdvisoryRow.vue'
import SkillPlanSegments from '@/components/skill-planner/SkillPlanSegments.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useGameConfig } from '@/composables/useGameConfig'
import { useSkillPlanner, WORKSTATION_IDS, type SkillAdvisory } from '@/composables/useSkillPlanner'
import { formatDuration, formatNumber, itemName } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

const GATHERING_SKILLS = ['Chopping', 'Mining', 'Digging', 'Exploring', 'Fishing', 'Farming']
const WORKSTATIONS = WORKSTATION_IDS
const ALL_SKILLS = [...GATHERING_SKILLS, ...WORKSTATIONS]


const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { skillLevels } = useGameConfig()
const {
  selectedCreature: inspectedCreature,
  drawerOpen: creatureDrawerOpen,
  toggleCreatureById,
  closeDrawer: closeCreatureDrawer,
} = useCreatureDrawer()


function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase()
}


const initialSkill = (() => {
  const q = typeof route.query.skill === 'string' ? titleCase(route.query.skill) : ''
  return ALL_SKILLS.includes(q) ? q : 'Mining'
})()


const skillId = ref(initialSkill)
const targetLevel = ref(Number(route.query.target) > 1 ? Number(route.query.target) : 70)


const {
  plan,
  isWorkstation,
  isMaxLevel,
  targetPresets,
  ingredientCost,
  playerLevelDelta,
  playerLevelXpBonusGain,
  playerLevelGain,
  advisories,
} = useSkillPlanner(skillId, targetLevel)


const ingredientList = computed(() =>
  Object.entries(ingredientCost.value)
    .map(([id, amount]) => ({ id, name: itemName(id), amount }))
    .sort((a, b) => b.amount - a.amount),
)


function configLevel(id: string): number {
  return skillLevels.value[id] ?? 1
}


/** Accordion key for an advisory row (its lever, or the singleton playerLevel). */
function advisoryKey(adv: SkillAdvisory): string {
  return adv.kind === 'bonus' ? adv.lever : 'playerLevel'
}


// Single-open accordion: only one advisory plan is expanded at a time; all
// collapsed on load. Toggling an open row closes it; opening another replaces it.
const openAdvisory = ref<string | null>(null)
function toggleAdvisory(adv: SkillAdvisory) {
  const k = advisoryKey(adv)
  openAdvisory.value = openAdvisory.value === k ? null : k
}


// Keep the target on a valid preset: if the current pick isn't an available
// summon tier (e.g. after switching skills), snap to the highest one.
watch(
  targetPresets,
  (presets) => {
    if (presets.length && !presets.some((p) => p.level === targetLevel.value)) {
      // Snap to the highest resource tier, not the max-out preset.
      const resourceTiers = presets.filter((p) => !p.isMax)
      const fallback = resourceTiers.length ? resourceTiers : presets
      targetLevel.value = fallback[fallback.length - 1].level
    }
  },
  { immediate: true },
)


// URL sync
watch([skillId, targetLevel], ([id, target]) => {
  const query: Record<string, string> = { tab: 'skills', skill: id.toLowerCase() }
  if (target !== 70) query.target = String(target)
  router.replace({ path: route.path, query })
})


watch(
  () => route.query.skill,
  (val) => {
    if (typeof val === 'string') {
      const next = titleCase(val)
      if (ALL_SKILLS.includes(next) && next !== skillId.value) skillId.value = next
    }
  },
)
</script>

<template>
  <section class="space-y-8">
    <!-- Hero -->
    <header class="border-b border-border/60 pb-5">
      <SectionEyebrow>{{ t('skillPlanner.eyebrow') }}</SectionEyebrow>
      <h1
        class="mt-2 flex items-center gap-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl"
      >
        <img
          v-if="sourceIcons[skillId]"
          :src="sourceIcons[skillId]"
          alt=""
          class="size-9 shrink-0 sm:size-11"
          loading="lazy"
        />
        {{ t('skillPlanner.heading', { skill: skillId }) }}
      </h1>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {{ t('skillPlanner.subheading') }}
      </p>
    </header>

    <!-- Controls: skill + target flow together as one setup region -->
    <div class="space-y-4">
      <div>
        <p class="section-title mb-1.5">{{ t('skillPlanner.controls.gathering') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="id in GATHERING_SKILLS"
            :key="id"
            class="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition"
            :class="
              skillId === id
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground'
            "
            @click="skillId = id"
          >
            <img
              v-if="sourceIcons[id]"
              :src="sourceIcons[id]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            {{ id }}
            <span class="ml-1 text-xs opacity-70">LVL {{ configLevel(id) }}</span>
          </button>
        </div>
      </div>
      <div>
        <p class="section-title mb-1.5">{{ t('skillPlanner.controls.workstations') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="id in WORKSTATIONS"
            :key="id"
            class="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition"
            :class="
              skillId === id
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground'
            "
            @click="skillId = id"
          >
            <img
              v-if="sourceIcons[id]"
              :src="sourceIcons[id]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            {{ id }}
            <span class="ml-1 text-xs opacity-70">LVL {{ configLevel(id) }}</span>
          </button>
        </div>
      </div>

      <!-- Target -->
      <div>
        <p class="section-title mb-1.5">{{ t('skillPlanner.controls.targetLevel') }}</p>
        <div v-if="targetPresets.length" class="flex flex-wrap items-center gap-2">
          <button
            v-for="preset in targetPresets"
            :key="preset.level"
            class="focus-ring inline-flex items-center gap-1.5 rounded-lg border py-1.5 pl-1.5 pr-2.5 text-sm font-medium transition"
            :class="
              targetLevel === preset.level
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground'
            "
            :title="
              preset.isMax
                ? t('skillPlanner.controls.maxOut')
                : t('skillPlanner.controls.unlocksAtLevel', {
                    item: preset.itemName,
                    level: preset.level,
                  })
            "
            @click="targetLevel = preset.level"
          >
            <Trophy v-if="preset.isMax" class="size-4 shrink-0 opacity-70" />
            <img
              v-else-if="getItemImage({ id: preset.itemId ?? '' })"
              :src="getItemImage({ id: preset.itemId ?? '' })"
              :alt="preset.itemName"
              class="size-5 shrink-0"
              loading="lazy"
            />
            {{ preset.level }}
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          {{ t('skillPlanner.controls.atTopTier') }}
        </p>
      </div>
    </div>

    <!-- Results -->
    <PlannerEmptyState
      v-if="isMaxLevel || !plan || plan.segments.length === 0"
      :title="t('skillPlanner.empty.title')"
      :subtitle="t('skillPlanner.empty.subtitle')"
    />
    <template v-else>
      <!-- Summary stat bar -->
      <section v-if="plan.segments.length">
        <SectionHead
          :kicker="t('skillPlanner.summary.kicker')"
          :title="t('skillPlanner.summary.title')"
        />
        <div
          class="grid grid-cols-2 divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/60 sm:grid-cols-4 sm:divide-x"
        >
          <div class="border-b border-border/60 p-4 sm:border-b-0">
            <div
              class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <Zap class="size-3.5 text-warning-strong" /> {{ t('skillPlanner.summary.totalXp') }}
            </div>
            <p class="mt-1 text-2xl font-black tabular-nums text-foreground">
              {{ formatNumber(Math.round(plan.totalXp)) }}
            </p>
          </div>
          <div class="border-b border-border/60 p-4 sm:border-b-0">
            <div
              class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <Target class="size-3.5 text-info-strong" />
              {{
                isWorkstation
                  ? t('skillPlanner.summary.totalCrafts')
                  : t('skillPlanner.summary.totalCycles')
              }}
            </div>
            <p class="mt-1 text-2xl font-black tabular-nums text-foreground">
              {{ formatNumber(plan.totalCycles) }}
            </p>
          </div>
          <div class="p-4">
            <div
              class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <component :is="isWorkstation ? Bot : Clock3" class="size-3.5 text-success-strong" />
              {{
                isWorkstation
                  ? t('skillPlanner.summary.totalAutocraft')
                  : t('skillPlanner.summary.totalFocusTime')
              }}
            </div>
            <p class="mt-1 text-2xl font-black tabular-nums text-foreground">
              {{ formatDuration(plan.totalTimeSeconds) }}
            </p>
          </div>
          <div class="p-4">
            <div
              class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <TrendingUp class="size-3.5 text-reserved-strong" />
              {{ t('skillPlanner.summary.playerLevel') }}
            </div>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-2xl font-black tabular-nums text-foreground">
                {{ playerLevelDelta > 0 ? `+${playerLevelDelta}` : playerLevelDelta }}
              </span>
              <span
                v-if="playerLevelDelta > 0"
                class="inline-flex items-center gap-1 text-sm font-medium tabular-nums text-muted-foreground"
              >
                ({{ playerLevelGain.levelFrom }}
                <ArrowRight class="size-3" />
                {{ playerLevelGain.levelTo }})
              </span>
            </div>
            <p
              class="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold tabular-nums text-success-strong"
              :class="{ invisible: playerLevelXpBonusGain <= 0 }"
            >
              {{
                t('skillPlanner.summary.xpBonusGain', { value: +playerLevelXpBonusGain.toFixed(2) })
              }}
              <span class="inline-flex items-center gap-1 font-medium text-muted-foreground">
                ({{ playerLevelGain.xpBonusFrom.toFixed(2) }}%
                <ArrowRight class="size-3" />
                {{ playerLevelGain.xpBonusTo.toFixed(2) }}%)
              </span>
            </p>
          </div>
        </div>
      </section>

      <!-- Ways to improve: ranked efficiency advisories -->
      <section v-if="advisories.length">
        <SectionHead
          :kicker="t('skillPlanner.waysToImprove.kicker')"
          :title="t('skillPlanner.waysToImprove.title')"
        />
        <ul
          class="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40"
        >
          <li v-for="adv in advisories" :key="advisoryKey(adv)">
            <AdvisoryRow
              :advisory="adv"
              :open="openAdvisory === advisoryKey(adv)"
              @toggle="toggleAdvisory(adv)"
              @inspect="toggleCreatureById"
            />
          </li>
        </ul>
      </section>

      <SkillPlanSegments v-if="plan.segments.length" :plan="plan" :is-workstation="isWorkstation" />

      <section v-if="isWorkstation && ingredientList.length">
        <SectionHead
          :kicker="t('skillPlanner.ingredients.kicker')"
          :title="t('skillPlanner.ingredients.title')"
        >
          <template #aside>{{ t('skillPlanner.ingredients.aside') }}</template>
        </SectionHead>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="ing in ingredientList"
            :key="ing.id"
            class="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1 text-sm"
          >
            <img
              v-if="getItemImage({ id: ing.id })"
              :src="getItemImage({ id: ing.id })"
              :alt="ing.name"
              class="size-5 object-contain"
              loading="lazy"
            />
            <span class="font-medium">{{ ing.name }}</span>
            <span class="font-mono text-sm font-semibold text-muted-foreground"
              >x{{ formatNumber(ing.amount) }}</span
            >
          </div>
        </div>
      </section>
    </template>

    <CreatureDetail
      :creature="inspectedCreature"
      :open="creatureDrawerOpen"
      @close="closeCreatureDrawer"
    />
  </section>
</template>
