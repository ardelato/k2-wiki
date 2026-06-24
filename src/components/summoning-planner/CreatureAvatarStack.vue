<script setup lang="ts">
/**
 * Overlapping stack of creature avatar chips. Collapsed, the avatars fan over each
 * other to stay compact; when the surrounding `group/shared` is hovered the whole
 * stack spreads so every avatar is fully visible and evenly spaced. Each chip shows
 * the creature name in an app tooltip.
 */
import AppTooltip from '@/components/shared/AppTooltip.vue'

defineProps<{
  /** `highlighted` rings the avatar in violet — used to point out the creatures a reserved
   * call-out refers to (those earlier in the plan that draw from a shared stock first). */
  creatures: { id: string; name: string; image: string | null; highlighted?: boolean }[]
}>()
</script>

<template>
  <div class="flex items-center">
    <AppTooltip
      v-for="(creature, i) in creatures"
      :key="creature.id"
      :text="creature.name"
      position="top"
    >
      <span
        :style="{ zIndex: creatures.length - i }"
        :class="[
          i === 0 ? '' : '-ml-2 group-hover/shared:ml-0.5',
          creature.highlighted ? 'ring-reserved dark:ring-reserved' : 'ring-background',
        ]"
        class="relative block size-6 overflow-hidden rounded-full bg-card ring-2 transition-[margin,transform] duration-200 ease-out group-hover/shared:scale-105"
      >
        <img
          v-if="creature.image"
          :src="creature.image"
          :alt="creature.name"
          class="size-full object-cover"
        />
      </span>
    </AppTooltip>
  </div>
</template>
