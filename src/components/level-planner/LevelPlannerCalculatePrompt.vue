<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { Creature } from '@/types'

const { t } = useI18n()


defineProps<{
  creatureName: string
  creatureImage?: string
  /** When provided, the avatar becomes right-clickable to open the creature drawer */
  creature?: Creature | null
  fromLevel: number
  toLevel: number
}>()


defineEmits<{
  calculate: []
}>()


const { selectedCreature, drawerOpen, toggleCreature, closeDrawer } = useCreatureDrawer()
</script>

<template>
  <div class="surface-card space-y-4 px-4 py-4">
    <!-- Creature title — matches LevelPlannerSummary layout -->
    <div class="flex items-center gap-3">
      <RightClickHint v-if="creatureImage && creature" @contextmenu="toggleCreature(creature)">
        <img
          :src="creatureImage"
          :alt="creatureName"
          class="size-14 rounded-xl border border-border object-cover sm:size-16"
          loading="lazy"
        />
      </RightClickHint>
      <img
        v-else-if="creatureImage"
        :src="creatureImage"
        :alt="creatureName"
        class="size-14 rounded-xl border border-border object-cover sm:size-16"
        loading="lazy"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-bold text-foreground">{{ creatureName }}</p>
        <p class="text-xs text-muted-foreground">
          {{ t('levelPlannerComponents.calculatePrompt.title', { from: fromLevel, to: toLevel }) }}
        </p>
      </div>
    </div>

    <!-- Calculate prompt -->
    <div class="flex flex-col items-center gap-3 py-4 text-center">
      <p class="max-w-md text-sm text-muted-foreground">
        {{ t('levelPlannerComponents.calculatePrompt.description', { creatureName }) }}
      </p>
      <button
        class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        @click="$emit('calculate')"
      >
        <Play class="size-4" />
        {{ t('levelPlannerComponents.calculatePrompt.calculate') }}
      </button>
    </div>
  </div>
  <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
</template>
