<script setup lang="ts">
/**
 * Expedition child card shown under an Expedition-group material tree in the All-materials
 * Tree view: the recommended party (with conflict highlighting + hover popover hooks), run
 * count / total time, and swappable alternative parties. The active party is resolved by
 * the parent and passed in as a single `party` prop so the markup reads it once.
 */
import { Clock3 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import RightClickHint from '@/components/shared/RightClickHint.vue'
import type {
  ExpeditionAllocation,
  ExpeditionPartyVariant,
} from '@/composables/useExpeditionAllocation'
import type { Creature } from '@/types'
import { formatDuration } from '@/utils/format/format'
import { expeditionTierIcons } from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

defineProps<{
  /** The resolved active expedition party for this material (allocation + active variant). */
  party: ExpeditionAllocation & { activeVariant: ExpeditionPartyVariant }
  /** Swappable alternative parties to render below the active one. */
  alternatives: { variant: ExpeditionPartyVariant; targetIndex: number }[]
  /** Creature ids double-booked across active parties (warning highlight + popover gate). */
  conflictedCreatureIds: Set<string>
}>()


const emit = defineEmits<{
  inspect: [creature: Creature]
  'conflict-enter': [creatureId: string, expeditionName: string, event: MouseEvent]
  'conflict-leave': []
  'select-variant': [targetIndex: number]
}>()


const { t } = useI18n()
</script>

<template>
  <div class="rounded-lg border border-border/40 bg-card/50 px-3 py-2.5">
    <!-- Row 1: Reward icon + Expedition name | Duration + Tier -->
    <div class="flex items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <img
          v-if="getItemImage({ id: party.rewardItemId })"
          :src="getItemImage({ id: party.rewardItemId })"
          :alt="party.expeditionName"
          class="size-5 shrink-0 object-contain"
        />
        <p class="truncate text-sm font-semibold text-foreground">
          {{ party.expeditionName }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <span class="text-xs font-semibold text-success-strong">
          {{ formatDuration(party.activeVariant.durationPerRun) }}
        </span>
        <img
          :src="expeditionTierIcons[party.tier]"
          :alt="t('summoningPlanner.expeditionCard.tierAlt', { tier: party.tier })"
          class="size-4 object-contain"
        />
      </div>
    </div>

    <!-- Divider -->
    <div class="my-2 border-t border-border/40" />

    <!-- Active party -->
    <div class="flex items-center gap-1.5">
      <div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
        <RightClickHint
          v-for="member in party.activeVariant.party"
          :key="member.creature.id"
          @contextmenu="emit('inspect', member.creature)"
        >
          <div
            class="inline-flex cursor-default items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-2"
            :class="
              conflictedCreatureIds.has(member.creature.id)
                ? 'cursor-default border-warning/50 bg-warning/10'
                : 'border-border bg-muted/35'
            "
            @mouseenter="emit('conflict-enter', member.creature.id, party.expeditionName, $event)"
            @mouseleave="emit('conflict-leave')"
          >
            <div class="size-5 overflow-hidden rounded-md bg-card">
              <img
                v-if="getCreatureImage(member.creature)"
                :src="getCreatureImage(member.creature)"
                :alt="member.creature.name"
                class="size-full object-cover"
              />
            </div>
            <span class="text-3xs font-semibold text-foreground">{{ member.creature.name }}</span>
          </div>
        </RightClickHint>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 font-mono text-xs">
        <span class="text-muted-foreground">
          {{ party.activeVariant.runsNeeded }}
          {{ t('summoningPlanner.runs') }}
        </span>
        <span class="flex items-center gap-1 font-semibold text-success-strong">
          <Clock3 class="size-3" />
          {{ formatDuration(party.activeVariant.totalTime) }}
        </span>
      </div>
    </div>

    <!-- Alternative parties (swaps with primary when selected) -->
    <template v-if="alternatives.length">
      <div class="mt-2 space-y-1">
        <button
          v-for="{ variant, targetIndex } in alternatives"
          :key="targetIndex"
          class="flex w-full items-center gap-1.5 rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-left transition hover:border-primary/30 hover:bg-primary/5"
          @click="emit('select-variant', targetIndex)"
        >
          <span class="text-3xs font-semibold uppercase text-muted-foreground/50">{{
            t('summoningPlanner.altButton')
          }}</span>
          <div class="flex min-w-0 flex-1 flex-wrap gap-1">
            <RightClickHint
              v-for="member in variant.party"
              :key="member.creature.id"
              @contextmenu="emit('inspect', member.creature)"
            >
              <div
                class="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/25 py-0.5 pl-0.5 pr-1.5"
              >
                <div class="size-4 overflow-hidden rounded bg-card">
                  <img
                    v-if="getCreatureImage(member.creature)"
                    :src="getCreatureImage(member.creature)"
                    :alt="member.creature.name"
                    class="size-full object-cover"
                  />
                </div>
                <span class="text-3xs font-semibold text-muted-foreground">{{
                  member.creature.name
                }}</span>
              </div>
            </RightClickHint>
          </div>
          <span class="shrink-0 font-mono text-3xs text-muted-foreground">
            {{ formatDuration(variant.totalTime) }}
          </span>
        </button>
      </div>
    </template>
  </div>
</template>
