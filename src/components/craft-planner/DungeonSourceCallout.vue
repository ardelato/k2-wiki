<script setup lang="ts">
import { ArrowUpRight, Swords } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { dungeonCombatRewardIds } from '@/data/indexes'

const { t } = useI18n()


/**
 * "Also obtainable from the Dungeon" callout, shown for dungeon *combat* rewards (Chronicle
 * Rune, Hide, Meat, Egg) wherever a planner material is rendered. Self-gates: renders nothing
 * for items the dungeon doesn't drop as a combat reward. Uses the same Swords icon as the
 * Dungeons nav entry.
 */
const props = defineProps<{ itemId: string }>()


const isDungeonReward = computed(() => dungeonCombatRewardIds.has(props.itemId))
</script>

<template>
  <RouterLink
    v-if="isDungeonReward"
    :to="{ name: 'dungeons' }"
    class="group/dungeon mt-2.5 flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 transition hover:border-rose-500/50 hover:bg-rose-500/15 dark:border-rose-400/25 dark:bg-rose-400/10"
  >
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300"
    >
      <Swords class="size-4" />
    </span>
    <span class="flex flex-col leading-tight">
      <span class="text-xs font-semibold text-rose-700 dark:text-rose-300">
        {{ t('planner.dungeonCallout.title') }}
      </span>
      <span class="text-3xs font-medium text-rose-600/70 dark:text-rose-400/70">
        {{ t('planner.dungeonCallout.subtitle') }}
      </span>
    </span>
    <span
      class="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-rose-600 transition group-hover/dungeon:translate-x-0.5 group-hover/dungeon:bg-rose-500/15 dark:text-rose-300"
    >
      <ArrowUpRight class="size-4" />
    </span>
  </RouterLink>
</template>
