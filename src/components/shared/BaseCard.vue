<script setup lang="ts">
/**
 * Canonical card surface. A thin token-based wrapper that applies variant/state
 * classes over the same recipe as the `surface-card` utility (rounded-xl border
 * bg-card shadow-card), and hosts the two card-specific features: a type accent
 * bar and the reserved diagonal stripe overlay.
 *
 * Image-led / structured cards put their content in the default slot; BaseCard
 * owns only the shell. Uses the HSL `--card`/`--border` token set — do NOT force
 * it onto the beastiary grid card, which lives on the OKLCH `--color-*` type system.
 */
withDefaults(
  defineProps<{
    variant?: 'default' | 'success' | 'warning' | 'locked' | 'selected' | 'reserved'
    interactive?: boolean
    accentBarColor?: string | null
    stripePattern?: 'reserved' | null
    /** Root element tag — e.g. `article` for a self-contained card. Defaults to `div`. */
    as?: string
  }>(),
  {
    variant: 'default',
    interactive: false,
    accentBarColor: null,
    stripePattern: null,
    as: 'div',
  },
)


const VARIANTS = {
  default: 'border-border bg-card',
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/50 bg-card/60',
  locked: 'border-warning/50 bg-card/60',
  selected: 'border-primary/40 bg-card ring-2 ring-primary/60',
  reserved: 'border-reserved/30 bg-reserved/5',
} as const
</script>

<template>
  <component
    :is="as"
    class="relative rounded-xl border shadow-card"
    :class="[
      VARIANTS[variant],
      interactive
        ? 'transition duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-glow active:translate-y-0 active:shadow-none'
        : '',
    ]"
  >
    <!-- Type accent bar (colored top bar) -->
    <div
      v-if="accentBarColor"
      class="absolute inset-x-0 top-0 h-[3px] rounded-t-xl"
      :style="{ backgroundColor: accentBarColor }"
    />
    <!-- Reserved diagonal stripe overlay (token-based, replaces hardcoded rgb) -->
    <div
      v-if="stripePattern === 'reserved'"
      class="base-card-stripe pointer-events-none absolute inset-0"
    />
    <slot />
  </component>
</template>

<style scoped>
.base-card-stripe {
  background-image: repeating-linear-gradient(
    45deg,
    oklch(var(--reserved) / 0.55) 0 2px,
    transparent 2px 5px
  );
}
</style>
