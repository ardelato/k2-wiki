<script setup lang="ts">
import { GanttChart, List, ExternalLink } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

import biomesData from '@/data/biomes.json'
import type { PartyLevelingPlan, Creature, PartyPlanStep } from '@/types'
import type { Biome } from '@/types'
import {
  calculateCreatureRating,
  calculateDuration,
  calculateExpeditionXp,
  calculateDifficultyRating,
} from '@/utils/formulas'

import LevelPlannerTimelineStep from './LevelPlannerTimelineStep.vue'
import PartyPlannerGantt from './PartyPlannerGantt.vue'
import PartyPlannerSummary from './PartyPlannerSummary.vue'

const props = defineProps<{
  plan: PartyLevelingPlan
  creatures: Map<string, Creature>
}>()


const router = useRouter()
const viewMode = ref<'timeline' | 'steps'>('timeline')
const expandedIndex = ref<number | null>(null)


function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}


const timePercents = computed(() =>
  sortedIndices.value.map((i) => {
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
    return props.plan.steps[a].expedition.id.localeCompare(
      props.plan.steps[b].expedition.id,
      undefined,
      { numeric: true },
    )
  })
})


// Convert PartyPlanStep to PlanStep-like shape for the timeline step component
const stepsAsPlanSteps = computed(() =>
  sortedIndices.value.map((i) => {
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
      fromLevel: Math.min(...step.party.map((p) => p.fromLevel)),
      toLevel: Math.max(...step.party.map((p) => p.toLevel)),
      runs: step.runs,
      timeSeconds: step.timeSeconds,
      xpPerRun:
        step.runs > 0
          ? Math.round(step.party.reduce((sum, p) => sum + p.xpGained, 0) / step.runs)
          : 0,
      durationPerRun: (() => {
        // Compute final duration per run from end-state creature levels
        const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
        const endPartyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.toLevel, biome)
        }, 0)
        if (endPartyScore <= 0) return step.runs > 0 ? step.timeSeconds / step.runs : 0
        return calculateDuration(endPartyScore, step.expedition, step.tier)
      })(),
      xpPerMinute: (() => {
        // Per-creature XP rate to match expeditions page
        const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
        const partySize = step.party.length
        const avgLoopCount = Math.max(0, step.loopCount - Math.floor(step.runs / 2))
        const xpPerCreature = calculateExpeditionXp(
          step.expedition,
          step.tier,
          avgLoopCount,
          partySize,
        )
        const avgPartyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          const avgLevel = Math.round((p.fromLevel + p.toLevel) / 2)
          return sum + calculateCreatureRating(creature, step.expedition, avgLevel, biome)
        }, 0)
        const duration =
          avgPartyScore > 0 ? calculateDuration(avgPartyScore, step.expedition, step.tier) : 0
        return duration > 0 ? (xpPerCreature / duration) * 60 : 0
      })(),
      startXpPerMinute: (() => {
        // Per-creature rate at start of step
        const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
        const partySize = step.party.length
        const startLoopCount = Math.max(0, step.loopCount - step.runs)
        const xpPerCreature = calculateExpeditionXp(
          step.expedition,
          step.tier,
          startLoopCount,
          partySize,
        )
        const startPartyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.fromLevel, biome)
        }, 0)
        const duration =
          startPartyScore > 0 ? calculateDuration(startPartyScore, step.expedition, step.tier) : 0
        return duration > 0 ? (xpPerCreature / duration) * 60 : 0
      })(),
      endXpPerMinute: (() => {
        // Per-creature rate at end of step
        const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
        const partySize = step.party.length
        const xpPerCreature = calculateExpeditionXp(
          step.expedition,
          step.tier,
          step.loopCount,
          partySize,
        )
        const endPartyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.toLevel, biome)
        }, 0)
        const duration =
          endPartyScore > 0 ? calculateDuration(endPartyScore, step.expedition, step.tier) : 0
        return duration > 0 ? (xpPerCreature / duration) * 60 : 0
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
      })),
      scoreRatioMet: (() => {
        const biome = biomesData.find((b) => b.name === step.biomeName) as Biome | undefined
        const partyScore = step.party.reduce((sum, p) => {
          const creature = props.creatures.get(p.creatureId)
          if (!creature) return sum
          return sum + calculateCreatureRating(creature, step.expedition, p.fromLevel, biome)
        }, 0)
        const diff = calculateDifficultyRating(step.expedition, step.tier)
        return diff > 0 ? partyScore / diff >= 1 : false
      })(),
    }
  }),
)


function viewStepInExpeditions(step: PartyPlanStep) {
  // Write party config and creature levels to localStorage so the expeditions page picks them up
  const parties = JSON.parse(localStorage.getItem('expedition-parties') ?? '{}')
  const levels = JSON.parse(localStorage.getItem('expedition-creature-levels') ?? '{}')
  const tiers = JSON.parse(localStorage.getItem('expedition-tiers') ?? '{}')


  parties[step.expedition.id] = step.party.map((p) => p.creatureId)
  tiers[step.expedition.id] = step.tier


  for (const member of step.party) {
    levels[member.creatureId] = member.fromLevel
  }


  localStorage.setItem('expedition-parties', JSON.stringify(parties))
  localStorage.setItem('expedition-creature-levels', JSON.stringify(levels))
  localStorage.setItem('expedition-tiers', JSON.stringify(tiers))


  const resolved = router.resolve({
    path: '/expeditions',
    query: { expedition: step.expedition.id },
  })
  window.open(resolved.href, '_blank')
}


function viewInitialSetupInExpeditions() {
  // Load all steps from the first wave (startTime === 0) into expeditions
  const firstStartTime = props.plan.steps[0]?.startTime ?? 0
  const initialSteps = props.plan.steps.filter((s) => (s.startTime ?? 0) === firstStartTime)


  const parties: Record<string, string[]> = {}
  const levels: Record<string, number> = {}
  const tiers: Record<string, number> = {}


  for (const step of initialSteps) {
    parties[step.expedition.id] = step.party.map((p) => p.creatureId)
    tiers[step.expedition.id] = step.tier


    for (const member of step.party) {
      levels[member.creatureId] = member.fromLevel
    }
  }


  localStorage.setItem('expedition-parties', JSON.stringify(parties))
  localStorage.setItem('expedition-creature-levels', JSON.stringify(levels))
  localStorage.setItem('expedition-tiers', JSON.stringify(tiers))


  const resolved = router.resolve({ path: '/expeditions' })
  window.open(resolved.href, '_blank')
}


// Map each sorted step to its wave number and whether it's first in that wave
const stepWaveInfo = computed(() => {
  const seenTimes = new Map<number, number>()
  let waveCount = 0
  return sortedIndices.value.map((i) => {
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
</script>

<template>
  <div class="space-y-5">
    <PartyPlannerSummary :plan="plan" :creatures="creatures" />

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
      </div>

      <button
        class="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        @click="viewInitialSetupInExpeditions"
      >
        <ExternalLink class="size-3.5" />
        View Initial Setup in Expeditions
      </button>
    </div>

    <!-- Timeline view -->
    <PartyPlannerGantt v-if="viewMode === 'timeline'" :plan="plan" :creatures="creatures" />

    <!-- Steps view -->
    <div v-if="viewMode === 'steps'">
      <LevelPlannerTimelineStep
        v-for="(step, index) in stepsAsPlanSteps"
        :key="index"
        :step="step"
        :index="stepWaveInfo[index].wave"
        :hide-node="!stepWaveInfo[index].isFirst"
        :creature-name="step.creatureName"
        :party-members="step.partyMembers"
        :score-ratio-met="step.scoreRatioMet"
        :is-first="index === 0"
        :is-last="index === stepsAsPlanSteps.length - 1"
        :expanded="expandedIndex === index"
        :time-percent="timePercents[index]"
        @toggle="toggleExpand(index)"
        @view-in-expeditions="viewStepInExpeditions(plan.steps[step.originalIndex])"
      />
    </div>
  </div>
</template>
