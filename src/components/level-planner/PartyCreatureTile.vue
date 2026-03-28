<script setup lang="ts">
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'

type ChipState = 'included' | 'excluded' | 'force-included'


const props = defineProps<{
  creature: Creature
  chipState: ChipState
  level: number
  awakened: boolean
  titleSuffix?: string
}>()


defineEmits<{
  toggle: []
}>()


function tileBorderClass(): string {
  if (props.chipState === 'excluded') return 'border-border/40 opacity-40 grayscale'
  if (props.chipState === 'force-included') return 'border-primary/60 ring-1 ring-primary/30'
  if (props.awakened) return 'border-pink-500/40 ring-1 ring-pink-500/20 hover:border-pink-500/60'
  return 'border-border bg-card/50 hover:border-primary/50'
}


function nameClass(): string {
  if (props.chipState === 'excluded') return 'text-white/60 line-through'
  if (props.chipState === 'force-included') return 'text-primary'
  if (props.awakened) return 'text-pink-400'
  return 'text-white'
}


function levelBadgeClass(): string {
  if (props.chipState === 'excluded') return 'text-muted-foreground'
  if (props.chipState === 'force-included') return 'text-primary'
  if (props.awakened) return 'text-pink-400'
  return 'text-foreground'
}
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <button
      class="focus-ring relative size-16 overflow-hidden rounded-lg border transition sm:size-[4.5rem]"
      :class="tileBorderClass()"
      :title="`${creature.name} — LVL ${level}${awakened ? ' ★' : ''}${titleSuffix ?? ''}`"
      @click="$emit('toggle')"
    >
      <img
        v-if="getCreatureImage(creature)"
        :src="getCreatureImage(creature)"
        :alt="creature.name"
        class="size-full object-cover"
      />
      <div class="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
        <p class="truncate text-center text-[9px] font-semibold" :class="nameClass()">
          {{ creature.name }}
        </p>
      </div>
    </button>
    <span
      class="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold"
      :class="levelBadgeClass()"
    >
      LVL {{ level }}<span v-if="awakened" class="ml-0.5">★</span>
    </span>
  </div>
</template>
