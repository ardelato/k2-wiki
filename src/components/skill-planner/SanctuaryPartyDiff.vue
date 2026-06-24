<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import CreatureDiffTile from '@/components/skill-planner/CreatureDiffTile.vue'
import { jobIcons } from '@/utils/format/icons'
import { getJobBenefits } from '@/utils/planner/sanctuaryConstants'
import type { SanctuaryRosterDiff } from '@/utils/planner/skillAdvisories'

/**
 * The actionable side of a "raise this job's sanctuary tier" advisory: the exact
 * roster change to apply as full-width tile grids (remove ▸ add ▸ keep), plus the
 * collateral tier moves it causes on the other jobs (the sanctuary's 8 slots are
 * shared, so optimizing one job rebalances the rest). Inspect tiles to open the drawer.
 */
const props = defineProps<{
  diff: SanctuaryRosterDiff
}>()


defineEmits<{
  inspect: [id: string]
}>()


const { t } = useI18n()


/** One sanctuary benefit shifting across a tier move, formatted before → after.
 * `improved` keys the arrow colour (a side-effect job can drop a tier). */
interface BenefitDelta {
  label: string
  before: string
  after: string
  improved: boolean
}


const fmtXp = (v: number) => `+${v}%`
const fmtDuration = (v: number) => (v > 0 ? `−${v}%` : '0%')
const fmtYield = (v: number) => `+${v}`


/** The sanctuary benefits that actually change between two tiers (benefits are
 * cumulative, so a from≠to move always shifts at least one). */
function benefitDeltas(from: number, to: number): BenefitDelta[] {
  const b = getJobBenefits(from)
  const a = getJobBenefits(to)
  const improved = to > from
  const rows: BenefitDelta[] = []
  if (a.xpBonus !== b.xpBonus)
    rows.push({ label: 'XP', before: fmtXp(b.xpBonus), after: fmtXp(a.xpBonus), improved })
  if (a.durationReduction !== b.durationReduction)
    rows.push({
      label: t('skillPlanner.sanctuary.benefitGatherSpeed'),
      before: fmtDuration(b.durationReduction),
      after: fmtDuration(a.durationReduction),
      improved,
    })
  if (a.yieldBonus !== b.yieldBonus)
    rows.push({
      label: t('skillPlanner.sanctuary.benefitYield'),
      before: fmtYield(b.yieldBonus),
      after: fmtYield(a.yieldBonus),
      improved,
    })
  return rows
}


/** Every resulting tier move at a glance: the optimized job first (the goal, kept
 * even though it's echoed in the title — it anchors the other jobs), then each
 * other job the shared roster shifts. Each carries its benefit deltas for the
 * hover popover. */
const tierChanges = computed(() =>
  [
    { ...props.diff.target, primary: true },
    ...props.diff.sideEffects.map((d) => ({ ...d, primary: false })),
  ].map((d) => ({ ...d, benefits: benefitDeltas(d.from, d.to) })),
)
</script>

<template>
  <div class="mt-2.5 space-y-3">
    <p class="text-xs text-muted-foreground">{{ t('skillPlanner.sanctuary.swapRoster') }}</p>

    <!-- Remove ▸ Add, side by side and filling the full width on wider screens -->
    <div class="grid gap-2.5 sm:grid-cols-2">
      <div class="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-2.5">
        <p
          class="mb-2 text-2xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400"
        >
          {{ t('skillPlanner.sanctuary.remove') }}
          <span class="text-muted-foreground">({{ diff.swapOut.length }})</span>
        </p>
        <div v-if="diff.swapOut.length" class="flex flex-wrap gap-2">
          <CreatureDiffTile
            v-for="c in diff.swapOut"
            :key="c.id"
            :id="c.id"
            :name="c.name"
            :contribution="c.contribution"
            variant="remove"
            @inspect="$emit('inspect', $event)"
          />
        </div>
        <p v-else class="text-2xs italic text-muted-foreground/80">
          {{ t('skillPlanner.sanctuary.nothingToRemove') }}
        </p>
      </div>

      <div class="rounded-xl border border-success/25 bg-success/[0.04] p-2.5">
        <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-success-strong">
          {{ t('skillPlanner.sanctuary.add') }}
          <span class="text-muted-foreground">({{ diff.swapIn.length }})</span>
        </p>
        <div v-if="diff.swapIn.length" class="flex flex-wrap gap-2">
          <CreatureDiffTile
            v-for="c in diff.swapIn"
            :key="c.id"
            :id="c.id"
            :name="c.name"
            :contribution="c.contribution"
            variant="add"
            @inspect="$emit('inspect', $event)"
          />
        </div>
        <p v-else class="text-2xs italic text-muted-foreground/80">
          {{ t('skillPlanner.sanctuary.alreadySlotted') }}
        </p>
      </div>
    </div>

    <!-- Members that stay put -->
    <div v-if="diff.keep.length">
      <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('skillPlanner.sanctuary.keepInPlace') }}
        <span>({{ diff.keep.length }})</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <CreatureDiffTile
          v-for="c in diff.keep"
          :key="c.id"
          :id="c.id"
          :name="c.name"
          :contribution="c.contribution"
          variant="keep"
          @inspect="$emit('inspect', $event)"
        />
      </div>
    </div>

    <!-- Resulting tier moves at a glance: the target job (emphasized) plus the
         shared-party ripple on every other job the same 8 slots feed. -->
    <div class="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <p class="mb-2 text-2xs font-medium text-muted-foreground">
        {{ t('skillPlanner.sanctuary.resultingTierChanges') }}
        <span class="text-muted-foreground/70">{{
          t('skillPlanner.sanctuary.slotsSharedNote')
        }}</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <!-- Plain tier-move chip: which job moves from which tier to which.
             Direction arrow keys rose (down) / emerald (up). Hover reveals the
             sanctuary benefits that shift across the move (like the craft-card chips). -->
        <AppTooltip v-for="d in tierChanges" :key="d.job" position="top">
          <span
            class="inline-flex cursor-default items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2"
            :class="d.primary ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-card/70'"
          >
            <img
              v-if="jobIcons[d.job.toLowerCase()]"
              :src="jobIcons[d.job.toLowerCase()]"
              :alt="d.job"
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="text-2xs text-foreground" :class="d.primary ? 'font-bold' : 'font-medium'">
              {{ d.job }}
            </span>
            <span class="text-2xs tabular-nums text-muted-foreground">{{ d.from }}</span>
            <span
              class="text-3xs"
              :class="d.to < d.from ? 'text-rose-500 dark:text-rose-400' : 'text-success-strong'"
            >
              {{ d.to < d.from ? '▼' : '▲' }}
            </span>
            <span class="text-2xs font-semibold tabular-nums text-foreground">{{ d.to }}</span>
          </span>

          <!-- Benefit-shift popover: header (job + tier move) then one before→after
               row per sanctuary benefit that changes. -->
          <template #content>
            <div class="flex min-w-40 flex-col gap-2">
              <div class="flex items-center gap-2">
                <img
                  v-if="jobIcons[d.job.toLowerCase()]"
                  :src="jobIcons[d.job.toLowerCase()]"
                  :alt="d.job"
                  class="size-4 shrink-0"
                  loading="lazy"
                />
                <span class="font-semibold text-foreground">{{ d.job }}</span>
                <span class="ml-auto text-2xs font-medium tabular-nums text-muted-foreground">
                  {{ t('skillPlanner.sanctuary.tierMove', { from: d.from, to: d.to }) }}
                </span>
              </div>
              <div class="border-t border-border/40" />
              <div class="flex flex-col gap-1">
                <div
                  v-for="(b, bi) in d.benefits"
                  :key="bi"
                  class="flex items-center justify-between gap-4"
                >
                  <span class="text-2xs text-muted-foreground">{{ b.label }}</span>
                  <span class="flex items-center gap-1 text-2xs tabular-nums">
                    <span class="text-foreground/80">{{ b.before }}</span>
                    <span
                      :class="
                        b.improved ? 'text-success-strong' : 'text-rose-500 dark:text-rose-400'
                      "
                      >→</span
                    >
                    <span class="font-semibold text-foreground">{{ b.after }}</span>
                  </span>
                </div>
              </div>
            </div>
          </template>
        </AppTooltip>
      </div>
    </div>
  </div>
</template>
