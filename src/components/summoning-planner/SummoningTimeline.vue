<script setup lang="ts">
import { Clock3 } from 'lucide-vue-next'
import { computed } from 'vue'

import PlannerGantt from '@/components/planner/PlannerGantt.vue'
import type { Creature, PlannerNode, PlannerSchedule } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, methodKindClasses } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import type { PriorityWave } from '@/utils/prioritySteps'

const props = defineProps<{
  schedule: PlannerSchedule
  nodesById: Record<string, PlannerNode>
  waves: PriorityWave[]
  expeditionParties: Record<
    string,
    { expeditionName: string; party: { creature: Creature; rating: number }[] }
  >
}>()


function humanAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}


const parallelEstimate = computed(() => {
  const { tasks } = props.schedule
  if (tasks.length === 0) return null

  let maxPassive = 0
  let maxActive = 0

  for (const task of tasks) {
    if (task.kind === 'expedition' || task.kind === 'garden') {
      maxPassive = Math.max(maxPassive, task.endTime)
    } else {
      maxActive = Math.max(maxActive, task.endTime)
    }
  }

  if (maxPassive > 0 && maxActive > 0) {
    return Math.max(maxPassive, maxActive)
  }

  return null
})
</script>

<template>
  <div class="space-y-6">
    <!-- Estimate bar -->
    <div
      v-if="schedule.totalTime > 0"
      class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-card/60 px-4 py-2.5 text-sm"
    >
      <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        Estimated
      </span>
      <span class="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <Clock3 class="size-3.5 text-emerald-600 dark:text-emerald-400" />
        {{ formatDuration(schedule.totalTime) }} total
      </span>
      <template v-if="parallelEstimate != null && parallelEstimate < schedule.totalTime">
        <span class="text-muted-foreground">·</span>
        <span class="text-xs text-muted-foreground">
          ~{{ formatDuration(parallelEstimate) }} with parallel expeditions
        </span>
      </template>
    </div>

    <!-- Gantt chart -->
    <PlannerGantt
      v-if="schedule.tasks.length > 0"
      :schedule="schedule"
      :nodes-by-id="nodesById"
      :selected-node-id="null"
    />

    <!-- Priority steps (wave-based vertical timeline) -->
    <div v-if="waves.length > 0">
      <p class="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Priority Steps
      </p>
      <div>
        <div v-for="(wave, wi) in waves" :key="wave.waveNumber" class="flex gap-3">
          <!-- Gutter -->
          <div class="relative w-8 shrink-0 sm:w-10">
            <div
              v-if="waves.length > 1"
              class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-border/60"
              :class="[
                wi === 0 ? 'top-[1.1rem]' : 'top-0',
                wi === waves.length - 1 ? 'bottom-[1.1rem]' : 'bottom-0',
              ]"
            />
            <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-10 flex justify-center">
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-8"
                style="
                  border-color: hsl(var(--primary));
                  background-color: hsl(var(--card));
                  color: hsl(var(--primary));
                "
              >
                {{ wave.waveNumber }}
              </div>
            </div>
          </div>

          <!-- Wave cards -->
          <div class="mb-2 min-w-0 flex-1 space-y-1.5">
            <div
              v-for="(card, ci) in wave.cards"
              :key="ci"
              class="overflow-hidden rounded-lg border"
              :class="methodKindClasses(card.kind === 'passive' ? 'expedition' : card.kind)"
            >
              <!-- ═══ Expedition / Passive card ═══ -->
              <template v-if="card.kind === 'passive'">
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold">
                      {{ expeditionParties[card.itemId]?.expeditionName ?? card.description }}
                    </p>
                    <p class="truncate text-xs opacity-60">{{ card.label }}</p>
                  </div>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                  <span class="shrink-0 text-xs font-semibold text-primary">passive</span>
                </div>
                <!-- Party creatures -->
                <div
                  v-if="expeditionParties[card.itemId]?.party.length"
                  class="border-current/10 flex flex-wrap items-center gap-1.5 border-t px-3 py-2"
                >
                  <div
                    v-for="member in expeditionParties[card.itemId].party"
                    :key="member.creature.id"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-0.5 pr-2"
                  >
                    <div class="size-5 overflow-hidden rounded-md bg-card">
                      <img
                        v-if="getCreatureImage(member.creature)"
                        :src="getCreatureImage(member.creature)"
                        :alt="member.creature.name"
                        class="size-full object-cover"
                      />
                    </div>
                    <span class="text-[10px] font-semibold text-foreground">{{
                      member.creature.name
                    }}</span>
                  </div>
                </div>
              </template>

              <!-- ═══ Gather card ═══ -->
              <template v-else-if="card.kind === 'gather'">
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="sourceIcons[card.resource]"
                    :src="sourceIcons[card.resource]"
                    alt=""
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="text-xs font-semibold opacity-60">{{ card.resource }}</span>
                  <span class="text-muted-foreground/30">·</span>
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="min-w-0 truncate text-sm font-semibold">{{ card.label }}</span>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                  <span
                    class="ml-auto shrink-0 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                  >
                    <Clock3 class="mr-1 inline size-3" />{{ formatDuration(card.timeEstimate) }}
                  </span>
                </div>
              </template>

              <!-- ═══ Craft card ═══ -->
              <template v-else-if="card.kind === 'craft'">
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="sourceIcons[card.resource]"
                    :src="sourceIcons[card.resource]"
                    alt=""
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="text-xs font-semibold opacity-60">{{ card.resource }}</span>
                  <span class="text-muted-foreground/30">·</span>
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="min-w-0 truncate text-sm font-semibold">{{ card.label }}</span>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                  <span
                    class="ml-auto shrink-0 font-mono text-xs font-semibold text-amber-700 dark:text-amber-400"
                  >
                    <Clock3 class="mr-1 inline size-3" />{{ formatDuration(card.timeEstimate) }}
                  </span>
                </div>
              </template>

              <!-- Buy card -->
              <template v-else-if="card.kind === 'buy'">
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="getItemImage({ id: 'gold' })"
                    :src="getItemImage({ id: 'gold' })"
                    alt="Gold"
                    class="size-5 shrink-0 object-contain"
                  />
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="min-w-0 truncate text-sm font-semibold">{{ card.label }}</span>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                  <span
                    v-if="card.timeEstimate > 0"
                    class="ml-auto shrink-0 font-mono text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400"
                  >
                    <Clock3 class="mr-1 inline size-3" />{{ formatDuration(card.timeEstimate) }}
                  </span>
                </div>
              </template>

              <!-- Container card -->
              <template v-else-if="card.kind === 'container'">
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="min-w-0 truncate text-sm font-semibold">{{ card.label }}</span>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                </div>
              </template>

              <!-- Fallback card (machine, fabrication, etc.) -->
              <template v-else>
                <div class="flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="min-w-0 truncate text-sm font-semibold">{{ card.label }}</span>
                  <span v-if="card.amount" class="shrink-0 font-mono text-[10px] opacity-70"
                    >×{{ humanAmount(card.amount) }}</span
                  >
                  <span
                    class="ml-auto shrink-0 font-mono text-xs font-semibold text-muted-foreground"
                  >
                    <Clock3 class="mr-1 inline size-3" />{{ formatDuration(card.timeEstimate) }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
