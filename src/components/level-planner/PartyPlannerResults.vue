<script setup lang="ts">
import { GanttChart, List, BarChart3, ExternalLink, Copy, Check, X } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.png'
import biomesData from '@/data/biomes.json'
import type { PartyLevelingPlan, Creature, PartyPlanStep, PlannerStrategy } from '@/types'
import type { Biome } from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  calculateDifficultyRating,
} from '@/utils/formulas'

import LevelPlannerCreaturePicker from './LevelPlannerCreaturePicker.vue'
import LevelPlannerTimelineStep from './LevelPlannerTimelineStep.vue'
import PartyPlannerGantt from './PartyPlannerGantt.vue'
import PartyPlannerSummary from './PartyPlannerSummary.vue'
import StrategyComparisonCharts from './StrategyComparisonCharts.vue'

const props = defineProps<{
  plan: PartyLevelingPlan
  creatures: Map<string, Creature>
  otherPlan: PartyLevelingPlan | null
  strategy: PlannerStrategy
  otherComputing: boolean
  targetLevel: number
}>()


const router = useRouter()
const viewMode = ref<'timeline' | 'steps' | 'chart'>('timeline')
const expandedIndex = ref<number | null>(null)
const copied = ref(false)
const filterCreatureId = ref('')


// Reset filter when plan recomputes
watch(
  () => props.plan,
  () => {
    filterCreatureId.value = ''
  },
)


// Set of all non-booster creature IDs in the plan
const planCreatureIds = computed(() => {
  const ids = new Set<string>()
  for (const step of props.plan.steps) {
    for (const member of step.party) {
      if (!member.isBooster) ids.add(member.creatureId)
    }
  }
  return ids
})


// All creature IDs NOT in the plan — used to scope the picker via excludeIds
const excludeFromFilter = computed(() => {
  const allCreatureIds = new Set(props.creatures.keys())
  for (const id of planCreatureIds.value) {
    allCreatureIds.delete(id)
  }
  return allCreatureIds
})


function copyPlanJson() {
  const json = JSON.stringify(props.plan, null, 2)
  navigator.clipboard.writeText(json).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}


function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}


function receivingMembers(step: PartyPlanStep) {
  const levelers = step.party.filter((member) => !member.isBooster)
  return levelers.length > 0 ? levelers : step.party
}


function computeXpPerMinute(
  step: PartyPlanStep,
  biome: Biome | undefined,
  levelFn: (p: (typeof step.party)[0]) => number,
  loopCount: number,
): number {
  const partySize = step.party.length
  const xpPerCreature = calculateExpeditionXp(step.expedition, step.tier, loopCount, partySize)
  const partyScore = step.party.reduce((sum, p) => {
    const creature = props.creatures.get(p.creatureId)
    if (!creature) return sum
    return sum + calculateCreatureRating(creature, step.expedition, levelFn(p), biome)
  }, 0)
  const duration = partyScore > 0 ? calculateDuration(partyScore, step.expedition, step.tier) : 0
  return duration > 0 ? (xpPerCreature / duration) * 60 : 0
}


// Filter sortedIndices to only steps involving the selected creature
const filteredSortedIndices = computed(() => {
  if (!filterCreatureId.value) return sortedIndices.value
  return sortedIndices.value.filter((i) => {
    const step = props.plan.steps[i]
    // Awakening steps: include only if this creature is the one awakening
    if (step.isAwakeningStep) return step.party[0]?.creatureId === filterCreatureId.value
    return step.party.some((m) => m.creatureId === filterCreatureId.value)
  })
})


const timePercents = computed(() =>
  filteredSortedIndices.value.map((i) => {
    const step = props.plan.steps[i]
    return props.plan.totalTimeSeconds > 0
      ? (step.timeSeconds / props.plan.totalTimeSeconds) * 100
      : 100 / props.plan.steps.length
  }),
)


// Sorted indices: group by startTime, then sort by expedition ID within each wave
const sortedIndices = computed(() => {
  const indices = props.plan.steps.map((_, i) => i)
  return indices.toSorted((a, b) => {
    const timeA = props.plan.steps[a].startTime ?? 0
    const timeB = props.plan.steps[b].startTime ?? 0
    if (timeA !== timeB) return timeA - timeB
    const idA = props.plan.steps[a].expedition?.id ?? ''
    const idB = props.plan.steps[b].expedition?.id ?? ''
    return idA.localeCompare(idB, undefined, { numeric: true })
  })
})


// Convert PartyPlanStep to PlanStep-like shape for the timeline step component
const stepsAsPlanSteps = computed(() => {
  const biomeByName = new Map(biomesData.map((b) => [b.name, b as Biome]))

  return filteredSortedIndices.value.map((i) => {
    const step = props.plan.steps[i]

    // Awakening steps are pass-through markers
    if (step.isAwakeningStep) {
      const creatureId = step.party[0]?.creatureId ?? ''
      const creature = props.creatures.get(creatureId)
      return {
        originalIndex: i,
        isAwakeningStep: true,
        creatureName: creature?.name ?? creatureId,
        expedition: step.expedition,
        tier: 0,
        fromLevel: 70,
        toLevel: 1,
        runs: 0,
        timeSeconds: 0,
        xpPerRun: 0,
        durationPerRun: 0,
        xpPerMinute: 0,
        startXpPerMinute: 0,
        endXpPerMinute: 0,
        biomeName: '',
        traitMatch: false,
        biomeStatus: 'neutral' as const,
        partyMembers: [
          {
            creatureId,
            creature,
            fromLevel: 70,
            toLevel: 1,
            xpGained: 0,
          },
        ],
        scoreRatioMet: undefined as boolean | undefined,
      }
    }

    return {
      originalIndex: i,
      isAwakeningStep: false,
      creatureName: '',
      expedition: step.expedition,
      tier: step.tier,
      fromLevel: Math.min(...receivingMembers(step).map((p) => p.fromLevel)),
      toLevel: Math.max(...receivingMembers(step).map((p) => p.toLevel)),
      runs: step.runs,
      timeSeconds: step.timeSeconds,
      xpPerRun:
        step.runs > 0
          ? Math.round(step.party.reduce((sum, p) => sum + p.xpGained, 0) / step.runs)
          : 0,
      durationPerRun: (() => {
        // Compute final duration per run from end-state creature levels
        const biome = biomeByName.get(step.biomeName)
        const endPartyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.toLevel, biome)
        }, 0)
        if (endPartyScore <= 0) return step.runs > 0 ? step.timeSeconds / step.runs : 0
        return calculateDuration(endPartyScore, step.expedition, step.tier)
      })(),
      xpPerMinute: (() => {
        const biome = biomeByName.get(step.biomeName)
        const avgLoopCount = Math.max(0, step.loopCount - Math.floor(step.runs / 2))
        return computeXpPerMinute(
          step,
          biome,
          (p) => Math.round((p.fromLevel + p.toLevel) / 2),
          avgLoopCount,
        )
      })(),
      startXpPerMinute: (() => {
        const biome = biomeByName.get(step.biomeName)
        return computeXpPerMinute(
          step,
          biome,
          (p) => p.fromLevel,
          Math.max(0, step.loopCount - step.runs),
        )
      })(),
      endXpPerMinute: (() => {
        const biome = biomeByName.get(step.biomeName)
        return computeXpPerMinute(step, biome, (p) => p.toLevel, step.loopCount)
      })(),
      biomeName: step.biomeName,
      traitMatch: false,
      biomeStatus: 'neutral' as const,
      partyMembers: step.party.map((p) => ({
        creatureId: p.creatureId,
        creature: props.creatures.get(p.creatureId),
        fromLevel: p.fromLevel,
        toLevel: p.toLevel,
        xpGained: p.xpGained,
        isBooster: p.isBooster,
      })),
      scoreRatioMet: (() => {
        const biome = biomeByName.get(step.biomeName)
        const partyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.fromLevel, biome)
        }, 0)
        const diff = calculateDifficultyRating(step.expedition, step.tier)
        return diff > 0 ? partyScore / diff >= 1 : false
      })(),
    }
  })
})


function writeExpeditionSetup(steps: PartyPlanStep[], merge: boolean) {
  const parties: Record<string, string[]> = merge
    ? JSON.parse(localStorage.getItem('expedition-parties') ?? '{}')
    : {}
  const levels: Record<string, number> = merge
    ? JSON.parse(localStorage.getItem('expedition-creature-levels') ?? '{}')
    : {}
  const tiers: Record<string, number> = merge
    ? JSON.parse(localStorage.getItem('expedition-tiers') ?? '{}')
    : {}
  const loopCounts: Record<string, number> = merge
    ? JSON.parse(localStorage.getItem('expedition-loop-counts') ?? '{}')
    : {}


  for (const step of steps) {
    parties[step.expedition.id] = step.party.map((p) => p.creatureId)
    tiers[step.expedition.id] = step.tier
    loopCounts[step.expedition.id] = step.loopCountStart
    for (const member of step.party) {
      levels[member.creatureId] = member.fromLevel
    }
  }


  localStorage.setItem('expedition-parties', JSON.stringify(parties))
  localStorage.setItem('expedition-creature-levels', JSON.stringify(levels))
  localStorage.setItem('expedition-tiers', JSON.stringify(tiers))
  localStorage.setItem('expedition-loop-counts', JSON.stringify(loopCounts))
}


function viewStepInExpeditions(step: PartyPlanStep) {
  writeExpeditionSetup([step], true)
  const resolved = router.resolve({
    path: '/expeditions',
    query: { expedition: step.expedition.id },
  })
  window.open(resolved.href, '_blank')
}


function viewInitialSetupInExpeditions() {
  const firstStartTime = props.plan.steps[0]?.startTime ?? 0
  const initialSteps = props.plan.steps.filter((s) => (s.startTime ?? 0) === firstStartTime)
  writeExpeditionSetup(initialSteps, false)
  const resolved = router.resolve({ path: '/expeditions' })
  window.open(resolved.href, '_blank')
}


// Map each sorted step to its wave number and whether it's first in that wave
const stepWaveInfo = computed(() => {
  const seenTimes = new Map<number, number>()
  let waveCount = 0
  return filteredSortedIndices.value.map((i) => {
    const t = props.plan.steps[i].startTime ?? 0
    let wave = seenTimes.get(t)
    const isFirst = wave === undefined
    if (isFirst) {
      wave = waveCount++
      seenTimes.set(t, wave)
    }
    return { wave: wave!, isFirst }
  })
})


// Group steps by wave for the shared-gutter layout
const stepsByWave = computed(() => {
  const waves: {
    waveIndex: number
    isAwakening: boolean
    steps: { step: (typeof stepsAsPlanSteps.value)[0]; flatIndex: number }[]
  }[] = []
  for (let i = 0; i < stepsAsPlanSteps.value.length; i++) {
    const info = stepWaveInfo.value[i]
    if (info.isFirst) {
      waves.push({
        waveIndex: info.wave,
        isAwakening: stepsAsPlanSteps.value[i].isAwakeningStep,
        steps: [],
      })
    }
    waves[waves.length - 1].steps.push({ step: stepsAsPlanSteps.value[i], flatIndex: i })
  }
  return waves
})
</script>

<template>
  <div class="space-y-5">
    <PartyPlannerSummary :plan="plan" :creatures="creatures" />

    <!-- Creature filter -->
    <div class="flex items-center gap-3">
      <div class="min-w-0 flex-1">
        <LevelPlannerCreaturePicker
          v-model="filterCreatureId"
          :owned-only="true"
          :exclude-ids="excludeFromFilter"
          party-mode
        />
      </div>
      <button
        v-if="filterCreatureId"
        class="focus-ring flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        @click="filterCreatureId = ''"
      >
        <X class="size-3.5" />
        Clear
      </button>
    </div>

    <!-- View mode toggle + actions -->
    <div class="flex items-center justify-between">
      <div class="inline-flex overflow-hidden rounded-lg border border-border/70 bg-background/70">
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            viewMode === 'timeline'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="viewMode = 'timeline'"
        >
          <GanttChart class="size-3.5" />
          Timeline
        </button>
        <div class="w-px self-stretch bg-border/40" />
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            viewMode === 'steps'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="viewMode = 'steps'"
        >
          <List class="size-3.5" />
          Steps
        </button>
        <div class="w-px self-stretch bg-border/40" />
        <button
          class="focus-ring flex h-8 items-center gap-1.5 px-3 text-sm font-semibold transition"
          :class="
            viewMode === 'chart'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="viewMode = 'chart'"
        >
          <BarChart3 class="size-3.5" />
          Chart
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          @click="copyPlanJson"
        >
          <Check v-if="copied" class="size-3.5 text-emerald-400" />
          <Copy v-else class="size-3.5" />
          {{ copied ? 'Copied!' : 'Copy JSON' }}
        </button>
        <button
          class="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          @click="viewInitialSetupInExpeditions"
        >
          <ExternalLink class="size-3.5" />
          View Initial Setup in Expeditions
        </button>
      </div>
    </div>

    <!-- Timeline view -->
    <PartyPlannerGantt
      v-if="viewMode === 'timeline'"
      :plan="plan"
      :creatures="creatures"
      :filter-creature-id="filterCreatureId"
    />

    <!-- Steps view (grouped by wave with shared sticky gutter) -->
    <div v-if="viewMode === 'steps'">
      <div v-for="(wave, wi) in stepsByWave" :key="wi" class="flex gap-3">
        <!-- Shared wave gutter -->
        <div class="relative w-8 shrink-0 sm:w-10">
          <!-- Connector line -->
          <div
            v-if="!(wi === 0 && wi === stepsByWave.length - 1)"
            class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-border/60"
            :class="[
              wi === 0 ? 'top-[1.1rem]' : 'top-0',
              wi === stepsByWave.length - 1 ? 'bottom-[1.1rem]' : 'bottom-0',
            ]"
          />
          <!-- Sticky node -->
          <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-10 flex justify-center">
            <div
              v-if="wave.isAwakening"
              class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 text-xs font-bold sm:size-8"
              style="background-color: hsl(var(--card)); color: rgb(236 72 153)"
            >
              <img :src="awakenedSummonedIcon" alt="" class="size-4" />
            </div>
            <div
              v-else
              class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-8"
              style="
                border-color: hsl(var(--primary));
                background-color: hsl(var(--card));
                color: hsl(var(--primary));
              "
            >
              {{ wave.waveIndex + 1 }}
            </div>
          </div>
        </div>
        <!-- Wave step cards -->
        <div class="min-w-0 flex-1">
          <LevelPlannerTimelineStep
            v-for="{ step, flatIndex } in wave.steps"
            :key="flatIndex"
            :step="step"
            :index="wave.waveIndex"
            :hide-gutter="true"
            :creature-name="step.creatureName"
            :party-members="step.partyMembers"
            :score-ratio-met="step.scoreRatioMet"
            :is-first="flatIndex === 0"
            :is-last="flatIndex === stepsAsPlanSteps.length - 1"
            :expanded="expandedIndex === flatIndex"
            :time-percent="timePercents[flatIndex]"
            :highlight-creature-id="filterCreatureId"
            @toggle="toggleExpand(flatIndex)"
            @view-in-expeditions="viewStepInExpeditions(plan.steps[step.originalIndex])"
          />
        </div>
      </div>
    </div>

    <!-- Chart view -->
    <StrategyComparisonCharts
      v-if="viewMode === 'chart'"
      :plan="plan"
      :other-plan="otherPlan"
      :strategy="strategy"
      :other-computing="otherComputing"
      :target-level="targetLevel"
      :filter-creature-id="filterCreatureId"
    />
  </div>
</template>
