<script setup lang="ts">
import { Clock3, Target, Zap } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { formatDuration, formatNumber, itemName } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'
import type { SkillPlan, SkillSegment } from '@/utils/planner/skillPlanner'

const props = defineProps<{ plan: SkillPlan; isWorkstation?: boolean }>()


const { t } = useI18n()


// Gathering repeats an activity (cycles); crafting makes an item a number of times.
const cycleNoun = computed(() =>
  props.isWorkstation ? t('skillPlanner.segments.times') : t('skillPlanner.segments.cycles'),
)


/**
 * How far the player's current level sits through this tier, measured from the
 * tier's unlock level to its top: 0% for tiers not unlocked yet (haven't started),
 * 100% for tiers already cleared, partial for the tier currently in progress.
 */
function progressPct(seg: SkillSegment): number {
  const span = seg.toLevel - seg.unlockLevel
  if (span <= 0) return 0
  const done = props.plan.currentLevel - seg.unlockLevel
  return Math.max(0, Math.min(100, Math.round((done / span) * 100)))
}


/**
 * Bar fill % per card. Workstation cards show the queued fraction of their crafts
 * (sky-blue), so the bar only fills as far as the queue covers the total needed —
 * empty when nothing's queued, full only when the queue covers every craft.
 * Gathering keeps the tier-progress fill.
 */
function barPct(seg: SkillSegment): number {
  if (props.isWorkstation) {
    const queued = seg.queuedCycles ?? 0
    return seg.cycles > 0 ? Math.round((queued / seg.cycles) * 100) : 0
  }
  return progressPct(seg)
}


/** Sky-blue = the portion already in the workstation queue (matches the cost
 * planners); neutral for the gathering tier-progress fill. */
function barColor(seg: SkillSegment): string {
  return (seg.queuedCycles ?? 0) > 0 ? 'bg-info' : 'bg-muted-foreground/50'
}
</script>

<template>
  <div>
    <div class="mb-3 border-b border-border/60 pb-2">
      <p class="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground/70">
        {{ t('skillPlanner.segments.stepByStep') }}
      </p>
      <h2 class="mt-0.5 text-xl font-black tracking-tight text-foreground">
        {{ t('skillPlanner.segments.grindPath') }}
      </h2>
    </div>

    <div class="space-y-2">
      <!-- Step card (topmost = do first) -->
      <div
        v-for="(seg, i) in plan.segments"
        :key="`${seg.activityId}-${i}`"
        class="overflow-hidden rounded-xl border border-border/40 bg-card/60 p-3"
      >
        <div class="flex items-stretch gap-3">
          <!-- Activity icon -->
          <div class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <img
              v-if="getItemImage({ id: seg.iconItemId })"
              :src="getItemImage({ id: seg.iconItemId })"
              :alt="seg.activityName"
              class="size-8 object-contain"
              loading="lazy"
            />
            <span v-else class="text-sm font-bold text-primary">
              {{ seg.activityName.charAt(0) }}
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <!-- Activity name + level band -->
            <div class="mb-1 flex items-center gap-2">
              <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                {{ seg.activityName }}
                <span v-if="seg.variantItemId" class="font-normal text-muted-foreground">
                  · {{ itemName(seg.variantItemId) }}
                </span>
              </span>
              <span
                v-if="(seg.queuedCycles ?? 0) > 0"
                class="shrink-0 rounded-md bg-info/15 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-info-strong"
              >
                {{
                  t('skillPlanner.segments.inQueue', {
                    count: formatNumber(Math.round(seg.queuedCycles ?? 0)),
                  })
                }}
              </span>
              <span
                class="ml-auto shrink-0 rounded-md bg-muted/50 px-2 py-0.5 font-mono text-2xs font-bold text-foreground"
              >
                LVL {{ seg.fromLevel }} → {{ seg.toLevel }}
              </span>
            </div>

            <!-- Progress bar: sky = in workstation queue, neutral = tier progress -->
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-border/30">
              <div
                class="h-full rounded-full transition-all"
                :class="barColor(seg)"
                :style="{ width: `${barPct(seg)}%` }"
              />
            </div>

            <!-- Metrics -->
            <div
              class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs font-semibold text-muted-foreground"
            >
              <span class="inline-flex items-center gap-1">
                <Zap class="size-3 text-primary" />
                {{ seg.xpPerSec.toFixed(2)
                }}<span class="font-normal text-muted-foreground/50"> XP/s</span>
              </span>
              <span class="inline-flex items-center gap-1">
                <Target class="size-3" />
                {{ formatNumber(Math.round(seg.cycles))
                }}<span class="font-normal text-muted-foreground/50"> {{ cycleNoun }}</span>
              </span>
              <span class="ml-auto inline-flex items-center gap-1 text-foreground">
                <Clock3 class="size-3" />
                {{ formatDuration(seg.timeSeconds) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
