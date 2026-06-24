<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Canonical badge / chip shell. Owns padding, shape, and the token-based color
 * recipe; image-led chips (boosters, summons, gold) put their `<img>` in the
 * default slot and `Badge` only owns the surrounding pill.
 *
 * Semantic variants are two-tone: a pale fill + darker `-strong` text in light
 * mode, a translucent fill + lighter base-token text in dark mode, so contrast
 * holds in both themes.
 */
withDefaults(
  defineProps<{
    variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'reserved' | 'accent'
    size?: 'xs' | 'sm' | 'md'
    pill?: boolean
    icon?: Component
    title?: string
  }>(),
  {
    variant: 'neutral',
    size: 'sm',
    pill: true,
    icon: undefined,
    title: undefined,
  },
)


const SIZES = {
  xs: 'gap-1 px-1.5 py-0.5 text-3xs',
  sm: 'gap-1.5 px-2.5 py-1 text-xs',
  md: 'gap-1.5 px-3 py-1.5 text-sm',
} as const


const ICON_SIZES = {
  xs: 'size-2.5',
  sm: 'size-3.5',
  md: 'size-4',
} as const


// The `-strong` text token redefines itself per theme (dark text on pale light
// fills, light text on translucent dark fills), so `text-{v}-strong` needs no
// `dark:` override and clears WCAG AA in both themes (verified 6.07–9.33:1).
const VARIANTS = {
  neutral: 'border-border bg-muted/35 text-foreground',
  success: 'border-success/25 bg-success/10 dark:bg-success/15 text-success-strong',
  warning: 'border-warning/25 bg-warning/10 dark:bg-warning/15 text-warning-strong',
  danger: 'border-danger/25 bg-danger/10 dark:bg-danger/15 text-danger-strong',
  info: 'border-info/25 bg-info/10 dark:bg-info/15 text-info-strong',
  gold: 'border-gold/25 bg-gold/10 dark:bg-gold/15 text-gold-strong',
  reserved: 'border-reserved/25 bg-reserved/10 dark:bg-reserved/15 text-reserved-strong',
  accent: 'border-accent/30 bg-accent/15 text-accent',
} as const
</script>

<template>
  <span
    class="inline-flex items-center border font-semibold"
    :class="[SIZES[size], VARIANTS[variant], pill ? 'rounded-full' : 'rounded-lg']"
    :title="title"
  >
    <component :is="icon" v-if="icon" :class="ICON_SIZES[size]" />
    <slot />
  </span>
</template>
