<script setup lang="ts">
import { ChevronDown, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { Expedition } from '@/types'
import { expeditionTierIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

const props = defineProps<{
  expeditions: Expedition[]
  effectiveMaxTiers: Record<string, number>
  overrides: Record<string, number>
  includeAll: boolean
}>()


const emit = defineEmits<{
  'set-max-tier': [expeditionId: string, maxTier: number]
  'remove-override': [expeditionId: string]
  'update:includeAll': [value: boolean]
  reset: []
}>()


const expanded = ref(false)


const sorted = computed(() =>
  [...props.expeditions].toSorted((a, b) => {
    const diff = a.requiredExpeditionCompletions - b.requiredExpeditionCompletions
    if (diff !== 0) return diff
    return a.baseRating - b.baseRating
  }),
)


const includedCount = computed(
  () => sorted.value.filter((e) => (props.effectiveMaxTiers[e.id] ?? 5) > 0).length,
)


const hasOverrides = computed(() => Object.keys(props.overrides).length > 0 || props.includeAll)


function getMaxTier(expeditionId: string): number {
  return props.effectiveMaxTiers[expeditionId] ?? 5
}


function handleTierClick(expeditionId: string, tier: number) {
  const currentMax = getMaxTier(expeditionId)
  if (tier === currentMax) {
    // Clicking the current max tier reduces it by 1 (0 = fully excluded)
    emit('set-max-tier', expeditionId, tier - 1)
  } else {
    emit('set-max-tier', expeditionId, tier)
  }
}


function handleRowClick(expeditionId: string) {
  const currentMax = getMaxTier(expeditionId)
  if (currentMax === 0) {
    // Re-include: remove override to revert to default
    emit('remove-override', expeditionId)
  } else {
    // Exclude entirely
    emit('set-max-tier', expeditionId, 0)
  }
}
</script>

<template>
  <div class="surface-card overflow-hidden">
    <!-- Header -->
    <button
      class="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-foreground/[0.02]"
      @click="expanded = !expanded"
    >
      <label
        class="pointer-events-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
        >Expeditions</label
      >
      <span class="text-xs text-muted-foreground">
        {{ includedCount }} of {{ expeditions.length }} included
      </span>
      <span
        v-if="hasOverrides"
        class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"
      >
        Filtered
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition"
          :class="
            hasOverrides
              ? 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              : 'pointer-events-none invisible'
          "
          @click.stop="emit('reset')"
        >
          <RotateCcw class="size-3" />
          Reset
        </button>
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': expanded }"
        />
      </div>
    </button>

    <!-- Body -->
    <div v-if="expanded" class="border-t border-border/40 px-4 py-3">
      <p class="mb-2 text-[11px] leading-relaxed text-muted-foreground/70">
        Default state reflects your save file progress from the
        <span class="font-semibold text-muted-foreground">Configs</span> page.
      </p>

      <!-- Controls -->
      <div class="mb-3 flex items-center gap-2">
        <button
          class="focus-ring flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition"
          :class="
            includeAll
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="emit('update:includeAll', !includeAll)"
        >
          Include All
        </button>
      </div>

      <!-- Expedition list -->
      <div class="max-h-80 space-y-1 overflow-y-auto">
        <div
          v-for="exp in sorted"
          :key="exp.id"
          class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
          :class="getMaxTier(exp.id) > 0 ? '' : 'opacity-50'"
        >
          <button
            class="focus-ring flex items-center gap-2 rounded text-left transition hover:opacity-80"
            :title="
              getMaxTier(exp.id) > 0
                ? `${exp.name} — click to exclude`
                : `${exp.name} — click to include`
            "
            @click="handleRowClick(exp.id)"
          >
            <img
              v-if="exp.rewards.length > 0 && getItemImage({ id: exp.rewards[0].itemId })"
              :src="getItemImage({ id: exp.rewards[0].itemId })"
              :alt="exp.rewards[0].itemId"
              loading="lazy"
              class="size-5 shrink-0 object-contain"
            />
            <span class="font-medium">{{ exp.name }}</span>
            <span class="text-[11px] text-muted-foreground">
              ({{ exp.requiredExpeditionCompletions }} req.)
            </span>
          </button>
          <div class="flex items-center gap-1 text-xs tabular-nums">
            <button
              v-for="t in 5"
              :key="t"
              class="focus-ring rounded-md px-1.5 py-1 transition hover:ring-1 hover:ring-foreground/20"
              :class="t <= getMaxTier(exp.id) ? 'bg-emerald-500/15' : 'opacity-40 grayscale'"
              :title="`Set max tier to T${t}`"
              @click="handleTierClick(exp.id, t)"
            >
              <img
                :src="expeditionTierIcons[t]"
                :alt="`Tier ${t}`"
                class="size-7 object-contain"
                loading="lazy"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
