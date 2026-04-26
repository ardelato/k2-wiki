<script setup lang="ts">
import { Clock3, Copy, Check } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import PlannerGantt from '@/components/planner/PlannerGantt.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { Creature, ItemType, PlannerNode, PlannerSchedule } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { formatDuration, itemTypeColor, methodKindLabel } from '@/utils/format'
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
  queueOffsets?: Record<string, number>
  queuedAmounts?: Record<string, number>
}>()


const { selectedCreature, drawerOpen, openCreature, closeDrawer } = useCreatureDrawer()


/** Kinds that are passive / non-actionable — hide from priority steps */
const hiddenKinds = new Set<string>(['garden', 'fabrication'])


/** Waves with non-actionable cards filtered out, empty waves removed, re-numbered */
const filteredWaves = computed(() => {
  let num = 0
  return props.waves.flatMap((wave) => {
    const cards = wave.cards.filter((c) => !hiddenKinds.has(c.kind))
    if (cards.length === 0) return []
    num++
    return [{ ...wave, waveNumber: num, cards }]
  })
})


function humanAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}


function itemType(itemId: string): ItemType {
  return props.nodesById[itemId]?.itemType ?? 'Gathered'
}


const copied = ref(false)
function copyScheduleJson() {
  const json = JSON.stringify(props.schedule, null, 2)
  navigator.clipboard.writeText(json).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Gantt chart -->
    <PlannerGantt
      v-if="schedule.tasks.length > 0"
      :schedule="schedule"
      :nodes-by-id="nodesById"
      :selected-node-id="null"
      :queue-offsets="queueOffsets"
      :queued-amounts="queuedAmounts"
    />

    <!-- Debug: copy schedule JSON -->
    <div
      v-if="schedule.tasks.length > 0"
      class="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100"
    >
      <button
        class="flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
        @click="copyScheduleJson"
      >
        <component :is="copied ? Check : Copy" class="size-3" />
        {{ copied ? 'Copied!' : 'Copy JSON' }}
      </button>
    </div>

    <!-- Priority steps (wave-based vertical timeline) -->
    <div v-if="filteredWaves.length > 0">
      <p class="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Priority Steps
      </p>
      <div>
        <div v-for="(wave, wi) in filteredWaves" :key="wave.waveNumber" class="flex gap-3">
          <!-- Gutter -->
          <div class="relative w-8 shrink-0 sm:w-10">
            <div
              v-if="filteredWaves.length > 1"
              class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-border/60"
              :class="[
                wi === 0 ? 'top-[1.1rem]' : 'top-0',
                wi === filteredWaves.length - 1 ? 'bottom-[1.1rem]' : 'bottom-0',
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
              class="overflow-hidden rounded-xl border border-border/40 bg-card/60 p-3"
            >
              <div class="flex items-stretch gap-3">
                <!-- Item icon (square, matching tree node style) -->
                <div
                  class="flex size-14 shrink-0 items-center justify-center rounded-lg"
                  :style="{
                    backgroundColor: `color-mix(in oklch, ${itemTypeColor(itemType(card.itemId))} 10%, transparent)`,
                  }"
                >
                  <img
                    v-if="getItemImage({ id: card.itemId })"
                    :src="getItemImage({ id: card.itemId })"
                    :alt="card.label"
                    class="size-8 object-contain"
                    loading="lazy"
                  />
                  <span
                    v-else
                    class="text-sm font-bold"
                    :style="{ color: itemTypeColor(itemType(card.itemId)) }"
                  >
                    {{ card.label.charAt(0) }}
                  </span>
                </div>

                <div class="min-w-0 flex-1">
                  <!-- Name + source -->
                  <div class="mb-1.5 flex items-center gap-2">
                    <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                      {{ card.label }}
                    </span>
                    <template v-if="card.resource">
                      <span class="shrink-0 text-muted-foreground/30">&middot;</span>
                      <img
                        v-if="sourceIcons[card.description] || sourceIcons[card.resource]"
                        :src="sourceIcons[card.description] ?? sourceIcons[card.resource]"
                        alt=""
                        class="size-3.5 shrink-0 object-contain"
                      />
                      <span class="min-w-0 truncate text-xs text-muted-foreground">
                        {{
                          card.kind === 'expedition'
                            ? (expeditionParties[card.itemId]?.expeditionName ?? card.description)
                            : card.kind === 'buy'
                              ? 'Merchant'
                              : card.description
                        }}
                      </span>
                    </template>
                  </div>

                  <!-- Amount + kind + cost & time -->
                  <div class="flex items-baseline gap-3">
                    <span
                      v-if="card.amount"
                      class="font-mono text-[11px] font-semibold text-foreground"
                    >
                      &times;{{ humanAmount(card.amount) }}
                    </span>
                    <span class="text-[10px] font-semibold text-muted-foreground/60">
                      {{ methodKindLabel(card.kind) }}
                    </span>
                    <div class="ml-auto flex items-center gap-3">
                      <span
                        v-if="card.cost"
                        class="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-500"
                      >
                        <img
                          v-if="getItemImage({ id: 'gold' })"
                          :src="getItemImage({ id: 'gold' })"
                          alt="Gold"
                          class="size-3.5 object-contain"
                        />
                        {{ humanAmount(card.cost) }}
                      </span>
                      <span
                        v-if="card.timeEstimate > 0"
                        class="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-muted-foreground"
                      >
                        <Clock3 class="size-3" />
                        {{ formatDuration(card.timeEstimate) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Expedition party -->
              <div
                v-if="card.kind === 'expedition' && expeditionParties[card.itemId]?.party.length"
                class="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2"
              >
                <RightClickHint
                  v-for="member in expeditionParties[card.itemId].party"
                  :key="member.creature.id"
                  @contextmenu="openCreature(member.creature)"
                >
                  <div
                    class="inline-flex cursor-default items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-0.5 pr-2"
                  >
                    <div class="size-5 overflow-hidden rounded-md bg-card">
                      <img
                        v-if="getCreatureImage(member.creature)"
                        :src="getCreatureImage(member.creature)"
                        :alt="member.creature.name"
                        class="size-full object-cover"
                      />
                    </div>
                    <span class="text-[10px] font-semibold text-foreground">
                      {{ member.creature.name }}
                    </span>
                  </div>
                </RightClickHint>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
</template>
