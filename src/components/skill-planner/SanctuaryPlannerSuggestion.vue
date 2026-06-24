<script setup lang="ts">
import { ArrowRight, Sparkles, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SanctuaryPartyDiff from '@/components/skill-planner/SanctuaryPartyDiff.vue'
import { jobIcons } from '@/utils/format/icons'
import type { SanctuaryRosterDiff } from '@/utils/planner/skillAdvisories'

/**
 * Visible, actionable handoff from the skill planner's "Open in Sanctuary" advisory.
 * Pure/presentational: shows the suggested target tier alongside the player's current
 * one (so the original is never silently overwritten), then the exact roster swap via
 * the shared `SanctuaryPartyDiff` (remove/add/keep + the collateral tier moves the
 * shared 8-slot party causes). The parent owns store access and applies on `apply`.
 */
const props = defineProps<{
  job: string
  suggestedTier: number
  diff: SanctuaryRosterDiff
}>()


defineEmits<{
  apply: []
  dismiss: []
  inspect: [id: string]
}>()


const { t } = useI18n()


const jobIconSrc = computed(() => jobIcons[props.job.toLowerCase() as keyof typeof jobIcons])
</script>

<template>
  <section
    class="surface-card border border-primary/40 bg-primary/5 p-4"
    :aria-label="t('skillPlanner.suggestion.aria')"
  >
    <!-- Header: a single vertically-centered line — the suggested job + tier. -->
    <div class="flex items-center justify-between gap-3">
      <p class="flex items-center gap-2 text-sm font-semibold">
        <Sparkles class="size-4 shrink-0 text-primary" />
        <span>{{ t('skillPlanner.suggestion.suggests') }}</span>
        <span class="inline-flex items-center gap-1 font-bold">
          <img v-if="jobIconSrc" :src="jobIconSrc" :alt="job" class="size-4" />
          {{ t('skillPlanner.suggestion.jobToTier', { job, tier: suggestedTier }) }}
        </span>
      </p>
      <button
        class="focus-ring shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
        :aria-label="t('skillPlanner.suggestion.dismissAria')"
        @click="$emit('dismiss')"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- The exact roster swap (remove / add / keep) + shared-slot tier ripple. -->
    <SanctuaryPartyDiff :diff="diff" @inspect="$emit('inspect', $event)" />

    <!-- Actions -->
    <div class="mt-3 flex items-center justify-end gap-2">
      <button
        class="focus-ring rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        @click="$emit('dismiss')"
      >
        {{ t('skillPlanner.suggestion.dismiss') }}
      </button>
      <button
        class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition hover:bg-primary/90"
        @click="$emit('apply')"
      >
        {{ t('skillPlanner.suggestion.apply') }}
        <ArrowRight class="size-3.5" />
      </button>
    </div>
  </section>
</template>
