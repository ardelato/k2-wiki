<script setup lang="ts">
import Badge from '@/components/shared/Badge.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/images/creatureImages'

defineProps<{
  creature: Creature
}>()


defineEmits<{
  inspect: [creature: Creature]
}>()
</script>

<template>
  <RightClickHint @contextmenu="$emit('inspect', creature)">
    <Badge variant="neutral" :pill="false" size="sm">
      <div class="size-6 overflow-hidden rounded-full bg-card">
        <img
          :src="getCreatureImage(creature)"
          :alt="creature.name"
          class="size-full object-cover"
          loading="lazy"
        />
      </div>
      <span>{{ creature.name }}</span>
    </Badge>
  </RightClickHint>
</template>
