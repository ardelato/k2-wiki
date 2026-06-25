<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import RightClickHint from '@/components/shared/RightClickHint.vue'
import type { SummoningReference } from '@/types'
import { getCreatureImage } from '@/utils/images/creatureImages'

defineProps<{
  creatures: SummoningReference[]
}>()


const emit = defineEmits<{
  'select-creature': [id: string]
}>()


const { t } = useI18n()
</script>

<template>
  <section class="detail-section">
    <h3 class="section-title mb-3">
      {{ t('items.detail.summoning') }}
    </h3>
    <div class="grid grid-cols-4 gap-3">
      <RightClickHint
        v-for="creature in creatures"
        :key="creature.id"
        @contextmenu="emit('select-creature', creature.id)"
      >
        <div
          class="relative aspect-square overflow-hidden rounded-lg bg-muted/20 transition hover:ring-1 hover:ring-accent/40"
        >
          <img
            v-if="getCreatureImage({ id: creature.id, image: '' })"
            :src="getCreatureImage({ id: creature.id, image: '' })"
            :alt="`${creature.name} artwork`"
            class="size-full object-cover"
            loading="lazy"
          />
          <div
            v-else
            class="flex size-full items-center justify-center text-2xl font-bold text-muted-foreground/50"
          >
            {{ creature.name.charAt(0) }}
          </div>
          <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1">
            <p class="truncate text-center text-3xs font-semibold text-white">
              {{ creature.name }}
            </p>
          </div>
        </div>
      </RightClickHint>
    </div>
  </section>
</template>
