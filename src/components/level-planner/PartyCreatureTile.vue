<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { useCreatureStatus } from '@/composables/useCreatureStatus'
import type { Creature } from '@/types'
import {
  sanctuaryIcon,
  helpersIcon,
  machinesIcon,
  expeditionsIcon,
  dungeonsIcon,
} from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'

const { t } = useI18n()


type ChipState = 'included' | 'excluded' | 'force-included' | 'selected'


const props = defineProps<{
  creature: Creature
  chipState: ChipState
  level: number
  awakened: boolean
  titleSuffix?: string
  /** Show the creature's current in-game assignment as a corner badge (busy elsewhere). */
  showActivity?: boolean
}>()


defineEmits<{
  toggle: []
}>()


const { selectedCreature, drawerOpen, toggleCreature, closeDrawer } = useCreatureDrawer()


// Same "currently doing" badge used by the Sanctuary roster diff: an icon in the
// upper-left corner that reads out what the creature is busy with right now.
const ROLE_BADGE = {
  sanctuary: { icon: sanctuaryIcon, label: 'Sanctuary' },
  helper: { icon: helpersIcon, label: 'Helper' },
  machine: { icon: machinesIcon, label: 'Machine' },
  expedition: { icon: expeditionsIcon, label: 'Expedition' },
  dungeon: { icon: dungeonsIcon, label: 'Dungeon' },
} as const


const { statusOf } = useCreatureStatus()


const activity = computed(() => {
  if (!props.showActivity) return null
  const role = statusOf(props.creature.id).role
  return role ? ROLE_BADGE[role] : null
})


function tileBorderClass(): string {
  if (props.chipState === 'excluded') return 'border-border/40 opacity-40 grayscale'
  if (props.chipState === 'selected') return 'border-primary/60 ring-2 ring-primary/40'
  if (props.chipState === 'force-included') return 'border-primary/60 ring-1 ring-primary/30'
  if (props.awakened) return 'border-pink-500/40 ring-1 ring-pink-500/20 hover:border-pink-500/60'
  return 'border-border bg-card/50 hover:border-primary/50'
}


function nameClass(): string {
  if (props.chipState === 'excluded') return 'text-white/60 line-through'
  if (props.chipState === 'selected') return 'text-primary'
  if (props.chipState === 'force-included') return 'text-primary'
  if (props.awakened) return 'text-pink-400'
  return 'text-white'
}


function levelBadgeClass(): string {
  if (props.chipState === 'excluded') return 'text-muted-foreground'
  if (props.chipState === 'selected') return 'text-primary'
  if (props.chipState === 'force-included') return 'text-primary'
  if (props.awakened) return 'text-pink-400'
  return 'text-foreground'
}
</script>

<template>
  <div class="relative flex flex-col items-center gap-1">
    <!-- Current-activity badge: vivid, sits outside the button so the excluded-tile
         grayscale never dims it (mirrors the Sanctuary roster-diff tile). -->
    <span v-if="activity" class="absolute -left-1 -top-1 z-10">
      <AppTooltip :text="`Assigned to ${activity.label}`" position="top">
        <img
          :src="activity.icon"
          :alt="activity.label"
          class="size-5 rounded-full border border-background bg-background"
          loading="lazy"
        />
      </AppTooltip>
    </span>
    <button
      class="focus-ring relative size-16 overflow-hidden rounded-lg border transition sm:size-[4.5rem]"
      :class="tileBorderClass()"
      :title="`${creature.name} — ${t('levelPlanner.stats.level', { n: level })}${awakened ? ' ★' : ''}${titleSuffix ?? ''}`"
      @click="$emit('toggle')"
    >
      <RightClickHint @contextmenu="toggleCreature(creature)">
        <img
          v-if="getCreatureImage(creature)"
          :src="getCreatureImage(creature)"
          :alt="creature.name"
          class="size-full object-cover"
          loading="lazy"
        />
      </RightClickHint>
      <div class="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
        <p class="truncate text-center text-3xs font-semibold" :class="nameClass()">
          {{ creature.name }}
        </p>
      </div>
    </button>
    <span
      class="rounded-full bg-muted/40 px-2 py-0.5 text-3xs font-semibold"
      :class="levelBadgeClass()"
    >
      {{ t('levelPlanner.stats.level', { n: level }) }}<span v-if="awakened" class="ml-0.5">★</span>
    </span>
  </div>
  <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
</template>
