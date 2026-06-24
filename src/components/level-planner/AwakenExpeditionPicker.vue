<script setup lang="ts">
/**
 * Modal expedition picker for the Awaken tab, mirroring the SummonCreaturePicker
 * chrome. Lets you include/exclude whole expeditions (and toggle individual tiers)
 * from the awaken calculator. Selection state is the global planner expedition
 * config — the same source the single/party planners read — so the parent owns it
 * and just forwards the existing handlers.
 */
import { onKeyStroke } from '@vueuse/core'
import { RotateCcw, Search, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Expedition } from '@/types'
import { itemName } from '@/utils/format/format'
import { expeditionTierIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

const props = defineProps<{
  open: boolean
  expeditions: Expedition[]
  effectiveTierSelections: Record<string, number[]>
  overrides: Record<string, number[]>
  includeAll: boolean
}>()


const emit = defineEmits<{
  'toggle-tier': [expeditionId: string, tier: number]
  'remove-override': [expeditionId: string]
  'update:includeAll': [value: boolean]
  reset: []
  close: []
}>()


const { t } = useI18n()


const query = ref('')


const sorted = computed(() =>
  [...props.expeditions].toSorted((a, b) => {
    const diff = a.requiredExpeditionCompletions - b.requiredExpeditionCompletions
    if (diff !== 0) return diff
    return a.baseRating - b.baseRating
  }),
)


const filtered = computed(() => {
  if (!query.value) return sorted.value
  const q = query.value.toLowerCase()
  return sorted.value.filter((e) => e.name.toLowerCase().includes(q))
})


const includedCount = computed(
  () => sorted.value.filter((e) => getSelectedTiers(e.id).length > 0).length,
)


const hasOverrides = computed(() => Object.keys(props.overrides).length > 0 || props.includeAll)


// "Include All" is only useful when something is still excluded. If every expedition
// is already in (e.g. the save has unlocked them all), hide it — unless it's currently
// forced on, so the user can still toggle it back off.
const showIncludeAll = computed(
  () => props.includeAll || includedCount.value < props.expeditions.length,
)


function getSelectedTiers(expeditionId: string): number[] {
  return props.effectiveTierSelections[expeditionId] ?? [1, 2, 3, 4, 5]
}


function isTierSelected(expeditionId: string, tier: number): boolean {
  return getSelectedTiers(expeditionId).includes(tier)
}


function isExpeditionIncluded(expeditionId: string): boolean {
  return getSelectedTiers(expeditionId).length > 0
}


function handleRowClick(expeditionId: string) {
  if (isExpeditionIncluded(expeditionId)) {
    // Exclude entirely: toggle off all currently selected tiers.
    for (const tier of getSelectedTiers(expeditionId)) emit('toggle-tier', expeditionId, tier)
  } else {
    // Re-include: drop the override to revert to the unlock default.
    emit('remove-override', expeditionId)
  }
}


// Clear the search each time the modal opens for a fresh start.
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)


onKeyStroke('Escape', () => {
  if (props.open) emit('close')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="picker">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="surface-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <div class="flex items-baseline gap-2">
              <h3 class="text-base font-bold text-foreground">
                {{ t('levelPlanner.expeditionPicker.title') }}
              </h3>
              <span class="text-xs text-muted-foreground">
                {{
                  t('levelPlanner.expeditionPicker.includedCount', {
                    included: includedCount,
                    total: expeditions.length,
                  })
                }}
              </span>
            </div>
            <button
              class="focus-ring ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              @click="emit('close')"
            >
              <X class="size-3.5" />
              {{ t('common.close') }}
            </button>
          </div>

          <!-- Search + include-all + reset -->
          <div class="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
            <div class="relative min-w-0 flex-1">
              <Search
                class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                v-model="query"
                type="text"
                :placeholder="t('levelPlanner.expeditionPicker.searchPlaceholder')"
                class="focus-ring h-9 w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 text-sm font-medium text-foreground"
              />
            </div>
            <button
              v-if="showIncludeAll"
              class="focus-ring flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-semibold transition"
              :class="
                includeAll
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              "
              @click="emit('update:includeAll', !includeAll)"
            >
              {{ t('levelPlanner.expeditionPicker.includeAll') }}
            </button>
            <button
              v-if="hasOverrides"
              class="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              @click="emit('reset')"
            >
              <RotateCcw class="size-3" />
              {{ t('common.reset') }}
            </button>
          </div>

          <!-- Scrollable list -->
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p class="mb-2 text-2xs leading-relaxed text-muted-foreground/70">
              {{ t('levelPlanner.expeditionPicker.captionBefore') }}
              <span class="font-semibold text-muted-foreground">{{
                t('levelPlanner.expeditionPicker.captionConfigs')
              }}</span>
              {{ t('levelPlanner.expeditionPicker.captionAfter') }}
            </p>
            <div class="space-y-1">
              <div
                v-for="exp in filtered"
                :key="exp.id"
                class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
                :class="isExpeditionIncluded(exp.id) ? '' : 'opacity-50'"
              >
                <button
                  class="focus-ring flex min-w-0 items-center gap-2 rounded text-left transition hover:opacity-80"
                  :title="
                    isExpeditionIncluded(exp.id)
                      ? t('levelPlanner.expeditionPicker.rowExcludeTitle', { name: exp.name })
                      : t('levelPlanner.expeditionPicker.rowIncludeTitle', { name: exp.name })
                  "
                  @click="handleRowClick(exp.id)"
                >
                  <img
                    v-if="exp.rewards.length > 0 && getItemImage({ id: exp.rewards[0].itemId })"
                    :src="getItemImage({ id: exp.rewards[0].itemId })"
                    :alt="itemName(exp.rewards[0].itemId)"
                    loading="lazy"
                    class="size-5 shrink-0 object-contain"
                  />
                  <span class="truncate font-medium">{{ exp.name }}</span>
                  <span class="shrink-0 text-2xs text-muted-foreground">
                    {{
                      t('levelPlanner.expeditionPicker.requiredCompletions', {
                        n: exp.requiredExpeditionCompletions,
                      })
                    }}
                  </span>
                </button>
                <div class="flex shrink-0 items-center gap-1 text-xs tabular-nums">
                  <button
                    v-for="tier in 5"
                    :key="tier"
                    class="focus-ring rounded-md px-1.5 py-1 transition hover:ring-1 hover:ring-foreground/20"
                    :class="isTierSelected(exp.id, tier) ? 'bg-success/15' : 'opacity-40 grayscale'"
                    :title="t('levelPlanner.expeditionPicker.toggleTier', { tier })"
                    @click="emit('toggle-tier', exp.id, tier)"
                  >
                    <img
                      :src="expeditionTierIcons[tier]"
                      :alt="t('levelPlanner.tier', { tier })"
                      class="size-7 object-contain"
                      loading="lazy"
                    />
                  </button>
                </div>
              </div>
              <p
                v-if="filtered.length === 0"
                class="py-6 text-center text-sm text-muted-foreground"
              >
                {{ t('levelPlanner.expeditionPicker.noMatches') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.picker-enter-active,
.picker-leave-active {
  transition: opacity 0.15s ease;
}
.picker-enter-from,
.picker-leave-to {
  opacity: 0;
}
</style>
