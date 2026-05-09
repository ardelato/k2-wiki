<script setup lang="ts">
import { Play } from 'lucide-vue-next'

defineProps<{
  creatureName: string
  creatureImage?: string
  fromLevel: number
  toLevel: number
}>()


defineEmits<{
  calculate: []
}>()
</script>

<template>
  <div class="surface-card space-y-4 px-4 py-4">
    <!-- Creature title — matches LevelPlannerSummary layout -->
    <div class="flex items-center gap-3">
      <img
        v-if="creatureImage"
        :src="creatureImage"
        :alt="creatureName"
        class="size-14 rounded-xl border border-border object-cover sm:size-16"
        loading="lazy"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-bold text-foreground">{{ creatureName }}</p>
        <p class="text-xs text-muted-foreground">
          Leveling Plan · LVL {{ fromLevel }} &rarr; {{ toLevel }}
        </p>
      </div>
    </div>

    <!-- Calculate prompt -->
    <div class="flex flex-col items-center gap-3 py-4 text-center">
      <p class="max-w-md text-sm text-muted-foreground">
        Choose your target level and expedition filters above, then click Calculate to find the
        fastest leveling path for {{ creatureName }}.
      </p>
      <button
        class="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        @click="$emit('calculate')"
      >
        <Play class="size-4" />
        Calculate
      </button>
    </div>
  </div>
</template>
