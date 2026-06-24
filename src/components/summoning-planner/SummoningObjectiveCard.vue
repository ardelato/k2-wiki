<script setup lang="ts">
import { ArrowUpRight, CheckCircle2, Lock } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import DungeonSourceCallout from '@/components/craft-planner/DungeonSourceCallout.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import BaseCard from '@/components/shared/BaseCard.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import { usePopover } from '@/composables/core/usePopover'
import type { ItemType, PlannerLockedGate } from '@/types'
import { formatNumber, itemTypeColor } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'
import type { ModifierChip } from '@/utils/planner/modifierChips'

const { t } = useI18n()


const props = withDefaults(
  defineProps<{
    itemId: string
    itemName: string
    itemType: ItemType
    totalNeeded: number
    inventoryAmount: number
    queuedAmount?: number
    sourceLabel: string
    sourceIcon?: string | null
    modifiers?: ModifierChip[]
    compact?: boolean
    lockedGate?: PlannerLockedGate | null
    /** Amount you'll still actively get after passive accrual (acquisition timeline). */
    effectiveRemaining?: number | null
    /** Plan-context only: global stock (inventory + queued) for this item BEFORE the shared
     * pool is depleted by creatures earlier in the plan. When set, the card explains that a
     * shortfall here may be stock earmarked for those creatures rather than a true shortage.
     * Null (List/aggregate view) keeps the plain global behavior. */
    ownedTotal?: number | null
  }>(),
  {
    modifiers: () => [],
    compact: false,
    lockedGate: null,
    effectiveRemaining: null,
    ownedTotal: null,
  },
)


const lockedTarget = computed(() =>
  props.lockedGate
    ? {
        name: 'planner',
        query: {
          tab: 'skills',
          skill: props.lockedGate.skill.toLowerCase(),
          target: String(props.lockedGate.level),
        },
      }
    : null,
)


// Modifier chip popover — anchored below the chip, right-aligned.
const activeChipIndex = ref<number | null>(null)
const activeChip = ref<ModifierChip | null>(null)
const chipPop = usePopover({ width: 224, gap: 8, hAlign: 'right' })


function onChipEnter(chip: ModifierChip, index: number, event: MouseEvent) {
  activeChipIndex.value = index
  activeChip.value = chip
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  chipPop.open(target)
}


function onChipLeave() {
  activeChipIndex.value = null
  activeChip.value = null
  chipPop.close()
}


// Bar-segment popover — follows the cursor.
const barPopoverSegment = ref<'owned' | 'queued' | 'reserved' | null>(null)
const barPop = usePopover({ width: 180, gap: 12 })


function onSegmentEnter(segment: 'owned' | 'queued' | 'reserved', event: MouseEvent) {
  barPopoverSegment.value = segment
  barPop.openAtPoint(event.clientX, event.clientY)
}


function onSegmentMove(event: MouseEvent) {
  if (!barPopoverSegment.value) return
  barPop.openAtPoint(event.clientX, event.clientY)
}


function onSegmentLeave() {
  barPopoverSegment.value = null
  barPop.close()
}


// Only fulfilled when raw inventory alone covers the need — queued items
// shouldn't mark an objective as complete since they're still being crafted.
const fulfilled = computed(() => props.inventoryAmount >= props.totalNeeded)


// #2 skill-gate: a locked, still-needed resource gets a lock chip + popover.
const showLock = computed(() => !!props.lockedGate && !fulfilled.value)


const progressPct = computed(() =>
  Math.min(100, Math.round((props.inventoryAmount / Math.max(1, props.totalNeeded)) * 100)),
)


const deficit = computed(() =>
  Math.max(0, props.totalNeeded - props.inventoryAmount - (props.queuedAmount ?? 0)),
)


// What you'll still actively obtain: the timeline's effectiveRemaining when known
// (passive accrual already credited), otherwise the raw inventory/queue deficit.
const displayNeed = computed(() => props.effectiveRemaining ?? deficit.value)


// ── Shared-pool depletion (plan context, ownedTotal set) ─────────────────────────
// `inventoryAmount`/`queuedAmount` are already what's LEFT for this creature after the
// ones ahead of it consume the shared stock; `ownedTotal` is the global stock. The gap is
// "reserved" by earlier creatures — distinct from a true shortage you'd have to go gather.
const pooledHave = computed(() => props.inventoryAmount + (props.queuedAmount ?? 0))
const reservedEarlier = computed(() =>
  props.ownedTotal != null ? Math.max(0, props.ownedTotal - pooledHave.value) : 0,
)
// Only surface the depletion framing when it explains a *low* number — fulfilled cards stay
// plain (the player isn't confused by a healthy "have").
const isDepleted = computed(() => reservedEarlier.value > 0 && !fulfilled.value)
// You own enough globally → any shortfall here is purely sequencing, not a real shortage.
const ownsEnough = computed(() => props.ownedTotal != null && props.ownedTotal >= props.totalNeeded)
const shortfallHere = computed(() => Math.max(0, props.totalNeeded - pooledHave.value))
const earmarkedOnly = computed(
  () => isDepleted.value && ownsEnough.value && !fulfilled.value && shortfallHere.value > 0,
)


// Bar segments as % of need: available-here (owned + queued), then the reserved slice.
const queuedPct = computed(() =>
  Math.min(
    100 - progressPct.value,
    Math.round(((props.queuedAmount ?? 0) / Math.max(1, props.totalNeeded)) * 100),
  ),
)
const reservedPct = computed(() => {
  if (!isDepleted.value) return 0
  const track = 100 - progressPct.value - queuedPct.value
  return Math.min(track, Math.round((reservedEarlier.value / Math.max(1, props.totalNeeded)) * 100))
})
const hasQueued = computed(() => (props.queuedAmount ?? 0) > 0)
const hasReserved = computed(() => reservedPct.value > 0)


const fmt = formatNumber
</script>

<template>
  <BaseCard
    :variant="showLock ? 'locked' : fulfilled ? 'success' : isDepleted ? 'reserved' : 'default'"
    class="overflow-hidden"
    :class="compact ? 'p-3' : 'p-3.5'"
  >
    <div class="flex items-stretch gap-3">
      <!-- Item icon -->
      <div
        class="flex shrink-0 items-center justify-center rounded-lg"
        :class="compact ? 'size-14' : 'size-16'"
        :style="{
          backgroundColor: `color-mix(in oklch, ${itemTypeColor(itemType)} 10%, transparent)`,
        }"
      >
        <img
          v-if="getItemImage({ id: itemId })"
          :src="getItemImage({ id: itemId })"
          :alt="itemName"
          :class="compact ? 'size-8' : 'size-9'"
          class="object-contain"
          loading="lazy"
        />
        <span v-else class="text-sm font-bold" :style="{ color: itemTypeColor(itemType) }">
          {{ itemName.charAt(0) }}
        </span>
      </div>

      <div class="min-w-0 flex-1">
        <!-- Name + source + status -->
        <div class="mb-2 flex items-center gap-2">
          <span class="min-w-0 truncate text-sm font-semibold text-foreground">
            {{ itemName }}
          </span>
          <template v-if="sourceLabel">
            <span class="shrink-0 text-muted-foreground/30">&middot;</span>
            <img
              v-if="sourceIcon"
              :src="sourceIcon"
              alt=""
              class="size-3.5 shrink-0 object-contain"
            />
            <span class="min-w-0 truncate text-xs text-muted-foreground">
              {{ sourceLabel }}
            </span>
          </template>
          <!-- Modifier chips -->
          <div v-if="modifiers.length > 0" class="ml-auto flex shrink-0 items-center gap-1">
            <span
              v-for="(chip, ci) in modifiers"
              :key="ci"
              class="inline-flex size-6 cursor-default items-center justify-center rounded-md border"
              :class="chip.color"
              :title="chip.label"
              @mouseenter="onChipEnter(chip, ci, $event)"
              @mouseleave="onChipLeave"
            >
              <img v-if="chip.icon" :src="chip.icon" alt="" class="size-4" loading="lazy" />
            </span>
          </div>
          <span
            v-if="fulfilled"
            class="inline-flex shrink-0 items-center gap-1 text-3xs font-bold text-success-strong"
            :class="{ 'ml-auto': modifiers.length === 0 }"
          >
            <CheckCircle2 class="size-3" />
            {{ t('summoningPlannerComponents.objectiveCard.complete') }}
          </span>
        </div>

        <!-- Progress bar: available-here (owned + queued), then a striped slice for stock
             reserved by creatures earlier in the plan, then the truly-short remainder. -->
        <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
          <div class="flex h-full">
            <div
              class="h-full rounded-l-full transition-all"
              :class="[
                fulfilled ? 'bg-success' : 'bg-warning',
                { 'rounded-r-full': !hasQueued && !hasReserved },
              ]"
              :style="{ width: `${progressPct}%` }"
              @mouseenter="!fulfilled && onSegmentEnter('owned', $event)"
              @mousemove="!fulfilled && onSegmentMove($event)"
              @mouseleave="!fulfilled && onSegmentLeave()"
            />
            <div
              v-if="hasQueued"
              class="h-full bg-info transition-all"
              :class="{ 'rounded-r-full': !hasReserved }"
              :style="{ width: `${queuedPct}%` }"
              @mouseenter="!fulfilled && onSegmentEnter('queued', $event)"
              @mousemove="!fulfilled && onSegmentMove($event)"
              @mouseleave="!fulfilled && onSegmentLeave()"
            />
            <div
              v-if="hasReserved"
              class="reserved-stripe h-full rounded-r-full transition-all"
              :style="{ width: `${reservedPct}%` }"
              @mouseenter="onSegmentEnter('reserved', $event)"
              @mousemove="onSegmentMove($event)"
              @mouseleave="onSegmentLeave()"
            />
          </div>
        </div>

        <!-- Amounts -->
        <div class="mt-1.5 flex items-baseline justify-between">
          <span class="font-mono text-xs font-semibold">
            <!-- "Here" (not "Have") once a shared pool is depleted: this is what's left for
                 THIS creature, not your global stock — which is shown as "owned" alongside. -->
            <span class="text-3xs font-normal text-muted-foreground/50">{{
              isDepleted
                ? t('summoningPlannerComponents.objectiveCard.here')
                : t('summoningPlannerComponents.objectiveCard.have')
            }}</span>
            <span :class="fulfilled ? 'text-success-strong' : 'text-foreground'">
              {{ fmt(inventoryAmount)
              }}<sup v-if="!fulfilled && queuedAmount && queuedAmount > 0" class="text-info">*</sup>
            </span>
            <span class="text-muted-foreground/50"> / {{ fmt(totalNeeded) }} </span>
            <span class="text-3xs font-normal text-muted-foreground/50">
              {{ t('summoningPlannerComponents.objectiveCard.total') }}</span
            >
            <span v-if="isDepleted" class="ml-1 text-xs font-medium text-reserved-strong">
              ·
              {{ t('summoningPlannerComponents.objectiveCard.owned', { n: fmt(ownedTotal ?? 0) }) }}
            </span>
          </span>
          <!-- #2 skill-gate: a lock chip replaces the "Need" value when the resource
               can't be acquired yet. The chip is the CTA; detail lives in the popover. -->
          <AppTooltip v-if="showLock && lockedTarget" position="top">
            <RouterLink
              :to="lockedTarget"
              class="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 font-mono text-2xs font-bold text-warning-strong transition hover:bg-warning/25"
            >
              <Lock class="size-3" />
              L{{ lockedGate!.level }}
              <ArrowUpRight class="size-3" />
            </RouterLink>
            <template #content>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-card-foreground">
                  {{
                    t('summoningPlannerComponents.objectiveCard.requiresSkill', {
                      skill: lockedGate!.skill,
                      level: lockedGate!.level,
                    })
                  }}
                  <span class="font-normal text-muted-foreground">{{
                    t('summoningPlannerComponents.objectiveCard.currentLevel', {
                      current: lockedGate!.current,
                    })
                  }}</span>
                </span>
                <span class="mt-0.5 italic text-muted-foreground">
                  {{
                    t('summoningPlannerComponents.objectiveCard.clickToPlan', {
                      skill: lockedGate!.skill,
                    })
                  }}
                </span>
              </div>
            </template>
          </AppTooltip>
          <!-- Earmarked, not short: same "Need" amount, but violet instead of amber — you own
               enough overall; this slice is just claimed by creatures earlier in the plan. -->
          <span
            v-else-if="earmarkedOnly"
            class="font-mono text-xs font-semibold text-reserved-strong"
          >
            <span class="text-3xs font-normal text-reserved-strong/60">Need </span>
            {{ fmt(displayNeed) }}
          </span>
          <span
            v-else-if="!fulfilled && displayNeed > 0"
            class="font-mono text-xs font-semibold text-warning-strong"
          >
            <span class="text-3xs font-normal text-warning-strong/60"
              >{{ t('summoningPlannerComponents.objectiveCard.need') }}
            </span>
            {{ fmt(displayNeed) }}
          </span>
        </div>

        <!-- Dungeon combat rewards (Chronicle Rune, Hide, Meat, Egg): alternative-source hint. -->
        <DungeonSourceCallout :item-id="itemId" />
      </div>
    </div>

    <!-- Bar segment popover -->
    <FloatingPanel
      :is-open="barPop.isOpen"
      :el-ref="barPop.setPanelEl"
      :style="barPop.style"
      class="w-45 pointer-events-none z-50 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
    >
      <div class="flex items-center gap-1.5 px-3 py-2">
        <template v-if="barPopoverSegment === 'owned'">
          <span class="font-mono text-xs font-bold text-warning-strong">
            {{ fmt(inventoryAmount) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('summoningPlannerComponents.objectiveCard.have2')
          }}</span>
        </template>
        <template v-else-if="barPopoverSegment === 'queued'">
          <span class="font-mono text-xs font-bold text-info-strong">
            {{ fmt(queuedAmount ?? 0) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('summoningPlannerComponents.objectiveCard.queued')
          }}</span>
        </template>
        <template v-else-if="barPopoverSegment === 'reserved'">
          <span class="font-mono text-xs font-bold text-reserved-strong">
            {{ fmt(reservedEarlier) }}
          </span>
          <span class="text-2xs text-muted-foreground">{{
            t('summoningPlannerComponents.objectiveCard.usedByEarlier')
          }}</span>
        </template>
      </div>
    </FloatingPanel>

    <!-- Modifier chip popover -->
    <FloatingPanel
      :is-open="chipPop.isOpen"
      :el-ref="chipPop.setPanelEl"
      :style="chipPop.style"
      class="pointer-events-none z-50 w-56 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
    >
      <template v-if="activeChip">
        <div class="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
          <div
            class="flex size-7 shrink-0 items-center justify-center rounded-lg"
            :class="activeChip.color"
          >
            <img
              v-if="activeChip.icon"
              :src="activeChip.icon"
              alt=""
              class="size-4"
              loading="lazy"
            />
          </div>
          <div class="min-w-0">
            <span class="block text-sm font-bold leading-tight text-foreground">{{
              activeChip.label
            }}</span>
            <span class="block text-2xs leading-tight text-muted-foreground">{{
              activeChip.subtitle
            }}</span>
          </div>
        </div>
        <div class="mx-3.5 border-t border-border/40" />
        <div class="flex flex-col gap-1 px-3.5 pb-3 pt-2">
          <div v-for="(stat, si) in activeChip.stats" :key="si" class="flex items-center gap-1.5">
            <span
              class="shrink-0 text-3xs font-bold leading-none"
              :class="stat.trimStart().startsWith('-') ? 'text-info-strong' : 'text-success-strong'"
              >{{ stat.trimStart().startsWith('-') ? '▼' : '▲' }}</span
            >
            <span class="text-xs font-medium text-foreground/90">{{ stat }}</span>
          </div>
        </div>
      </template>
    </FloatingPanel>
  </BaseCard>
</template>

<style scoped>
/* Reserved-by-earlier-creatures bar slice: a violet diagonal stripe reads "spoken for,
   not available here" — distinct from amber (available) and sky (queued). */
.reserved-stripe {
  background-color: oklch(var(--reserved) / 0.3);
  background-image: repeating-linear-gradient(
    45deg,
    oklch(var(--reserved) / 0.55) 0 2px,
    transparent 2px 5px
  );
}
</style>
