<script setup lang="ts">
import { ArrowUpRight, ChevronRight } from 'lucide-vue-next'
import type { FunctionalComponent } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

import { formatDuration } from '@/utils/format/format'
import { jobIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

/**
 * The one disclosure row shared by every "Ways to improve" advisory list — the Skill
 * planner, the Summon action plan, and the Summon plan focus pane. The collapsed header
 * (glyph, headline, cost, time saved, chevron) is a button; the expanded body shows the
 * gain + the items it speeds up, then a caller-provided plan (slot), then one navigation
 * CTA. Purely presentational: the parent maps its own advisory shape onto these props,
 * owns the single-open accordion state, and wires `inspect` through the slotted plan.
 */
const props = defineProps<{
  /** Real in-game asset image for the lever (sanctuary / awaken tree / tool / item).
   * Preferred over `glyph` when present. */
  iconSrc?: string
  /** Fallback icon when there's no asset image (e.g. the player-level row). */
  glyph?: FunctionalComponent
  headline: string
  /** Gathering job this advisory raises. When set, the headline names the job and shows
   * its icon inline (Summon mixes advisories from several skills). */
  job?: string
  /** The price to act, shown as the single muted subline. Omit for free levers. */
  cost?: string
  /** The gain this lever grants, shown large at the top of the expanded body. */
  benefit?: string
  timeSavedSeconds: number
  /** Top-level items this gather speeds up, rendered as chips beside the gain. */
  forItems?: { itemId: string; itemName: string }[]
  /** The single navigation CTA. Omit both to render no CTA (e.g. player level). */
  ctaLabel?: string
  ctaLink?: RouteLocationRaw
  /** A subtle left stripe marking a standing global boost (player level). */
  accent?: 'violet'
  open: boolean
  /** Links the disclosure button to its expanded region for a11y. */
  bodyId?: string
}>()


defineEmits<{ toggle: [] }>()


const { t } = useI18n()


const jobIconSrc = computed(() => (props.job ? jobIcons[props.job.toLowerCase()] : undefined))


// Split the headline around the job word so the icon drops in right before it
// (e.g. "Raise [icon] Mining Sanctuary tier to 3").
const headlineParts = computed(() => {
  const h = props.headline
  if (!props.job) return { before: h, rest: '' }
  const idx = h.indexOf(props.job)
  if (idx < 0) return { before: h, rest: '' }
  return { before: h.slice(0, idx), rest: h.slice(idx) }
})
</script>

<template>
  <div :class="accent === 'violet' ? 'border-l-2 border-l-violet-400/50' : ''">
    <button
      type="button"
      class="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-card/60"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="$emit('toggle')"
      @keydown.enter.prevent="$emit('toggle')"
      @keydown.space.prevent="$emit('toggle')"
    >
      <!-- Real in-game asset image when available; neutral square, no colored fill. -->
      <span
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/20 text-muted-foreground"
      >
        <img v-if="iconSrc" :src="iconSrc" alt="" class="size-5 object-contain" loading="lazy" />
        <component :is="glyph" v-else-if="glyph" class="size-4" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-foreground">
          <template v-if="jobIconSrc && headlineParts.rest"
            >{{ headlineParts.before
            }}<img
              :src="jobIconSrc"
              :alt="job"
              class="mx-0.5 inline-block size-4 object-contain align-middle"
              loading="lazy"
            />{{ headlineParts.rest }}</template
          >
          <template v-else>{{ headline }}</template>
        </span>
        <span v-if="cost" class="block truncate text-xs text-muted-foreground">{{ cost }}</span>
      </span>

      <span class="shrink-0 whitespace-nowrap text-sm font-semibold text-success-strong">
        −{{ formatDuration(timeSavedSeconds) }}
      </span>

      <ChevronRight
        class="size-4 shrink-0 text-muted-foreground transition-transform"
        :class="open ? 'rotate-90' : ''"
      />
    </button>

    <!-- Expanded body: aligned to the icon's left edge, not indented under the headline. -->
    <div v-if="open" :id="bodyId" class="px-3 pb-3">
      <!-- Context strip: the gain reads large on the left, the items it speeds up flow as
           chips on the right, filling the width instead of stacking tiny text. -->
      <div
        v-if="benefit || forItems?.length"
        class="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
        <p v-if="benefit" class="text-sm font-medium text-foreground">{{ benefit }}</p>
        <div v-if="forItems?.length" class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-muted-foreground">{{ t('shared.advisory.speedsUp') }}</span>
          <span
            v-for="i in forItems"
            :key="i.itemId"
            class="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs text-foreground"
          >
            <img
              v-if="getItemImage({ id: i.itemId })"
              :src="getItemImage({ id: i.itemId })!"
              alt=""
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            {{ i.itemName }}
          </span>
        </div>
      </div>

      <!-- Type-specific plan: the roster swap, the awaken-point funding, or the
           player-level checklist. The parent owns it (and any `inspect` wiring). -->
      <slot />

      <!-- The single, specific navigation action. -->
      <div v-if="ctaLabel && ctaLink" class="mt-2.5 flex justify-end">
        <RouterLink
          :to="ctaLink"
          class="focus-ring inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs font-medium text-primary transition hover:border-primary/60"
        >
          {{ ctaLabel }}
          <ArrowUpRight class="size-3.5" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>
