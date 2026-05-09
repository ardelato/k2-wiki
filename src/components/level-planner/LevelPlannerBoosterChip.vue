<script setup lang="ts">
import RightClickHint from '@/components/shared/RightClickHint.vue'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'

defineProps<{
  creature: Creature
}>()


defineEmits<{
  inspect: [creature: Creature]
}>()
</script>

<template>
  <RightClickHint @contextmenu="$emit('inspect', creature)">
    <div
      class="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/35 py-1 pl-1 pr-3"
    >
      <div class="size-6 overflow-hidden rounded-full bg-card">
        <img
          :src="getCreatureImage(creature)"
          :alt="creature.name"
          class="size-full object-cover"
          loading="lazy"
        />
      </div>
      <span class="text-xs font-semibold">{{ creature.name }}</span>
    </div>
  </RightClickHint>
</template>
