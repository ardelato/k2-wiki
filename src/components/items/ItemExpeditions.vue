<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  expeditions: { id: string; name: string }[]
}>()


const { t } = useI18n()
</script>

<template>
  <section class="border-t border-border/60 pt-4">
    <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {{ t('items.detail.expeditions') }}
    </h3>
    <div class="space-y-2">
      <div
        v-for="exp in expeditions"
        :key="exp.id"
        class="-mx-1 flex items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          style="background-color: var(--color-item-gathered)"
        />
        <div class="min-w-0 flex-1">
          <span class="text-sm font-semibold text-foreground">{{ exp.name }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
