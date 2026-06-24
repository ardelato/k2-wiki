<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import RightClickHint from '@/components/shared/RightClickHint.vue'
import { getCreatureImage } from '@/utils/images/creatureImages'

const { t } = useI18n()


interface AssignmentSlot {
  id: string
  name: string
  image: string
  tier: number
  isNew?: boolean
}


defineProps<{
  icon: string
  label: string
  slots: (AssignmentSlot | null)[]
  currentCount: number
  max: number
  showDiff: boolean
  targetCount?: number
}>()


defineEmits<{
  (e: 'context-menu', id: string): void
}>()
</script>

<template>
  <div class="bg-bg/30 space-y-2 rounded-xl border border-border/70 p-3">
    <div class="flex items-center justify-between gap-1.5">
      <h3 class="flex items-center gap-1.5 text-xs font-extrabold">
        <img :src="icon" alt="" class="size-3.5" loading="lazy" />
        {{ label }}
      </h3>
      <span class="font-mono text-3xs text-muted-foreground">
        <template v-if="showDiff && targetCount !== undefined">
          {{ currentCount }} &rarr; {{ targetCount }}
        </template>
        <template v-else>{{ currentCount }}/{{ max }}</template>
      </span>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <div
        v-for="(slot, index) in slots"
        :key="index"
        class="relative size-14 shrink-0 overflow-hidden rounded-md border transition"
        :class="slot ? 'border-border bg-card/50' : 'border-dashed border-border/50 bg-muted/20'"
      >
        <template v-if="slot">
          <RightClickHint @contextmenu="$emit('context-menu', slot.id)">
            <img
              v-if="getCreatureImage(slot)"
              :src="getCreatureImage(slot)"
              :alt="slot.name"
              class="size-full object-cover"
              loading="lazy"
            />
            <div
              v-else
              class="flex size-full items-center justify-center bg-muted text-xs font-bold"
            >
              {{ slot.name.charAt(0) }}
            </div>
            <div class="absolute inset-x-0 bottom-0 select-none bg-black/75 px-1 py-px">
              <p class="truncate text-center text-3xs font-bold leading-tight text-white">
                {{ slot.name }}
              </p>
            </div>
            <span
              v-if="slot.isNew"
              class="absolute left-0.5 top-0.5 rounded bg-success/85 px-1 text-3xs font-bold uppercase leading-none text-white shadow"
            >
              {{ t('configs.newBadge') }}
            </span>
          </RightClickHint>
        </template>
      </div>
    </div>
  </div>
</template>
