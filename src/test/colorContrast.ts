import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Color from 'colorjs.io'

/**
 * Test-only helpers for auditing the semantic color palette in `global.css`
 * against WCAG contrast ratios. Parses the CSS variable definitions directly so
 * the audit always tracks the real tokens — no hand-maintained copy to drift.
 */

// Vitest runs with the repo root as cwd; anchor on it so the audit reads the
// real stylesheet regardless of where the test file lives.
const GLOBAL_CSS = resolve(process.cwd(), 'src/assets/styles/global.css')

/**
 * Tokens defined as space-separated HSL channels (`<h> <s>% <l>%`) and consumed
 * via `hsl(var(--x))`. Everything not listed here is treated as a bare-channel
 * OKLCH token (`<l> <c> <h>`), consumed via `oklch(var(--x) / <alpha>)`.
 */
const HSL_TOKENS = new Set([
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'card',
  'card-foreground',
  'border',
  'input',
  'ring',
  'primary',
  'primary-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'type-fire',
  'type-water',
  'type-wind',
  'type-earth',
])

export type Theme = Record<string, Color>

function selectorBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'))
  if (!match) throw new Error(`Could not find \`${selector} { ... }\` block in global.css`)
  return match[1]
}

function parseDeclarations(blockBody: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of blockBody.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

function tokenToColor(name: string, raw: string): Color {
  const parts = raw.split(/\s+/)
  if (HSL_TOKENS.has(name)) {
    const [h, s, l] = parts
    return new Color(`hsl(${h} ${s} ${l})`)
  }
  const [l, c, h] = parts
  return new Color(`oklch(${l} ${c} ${h})`)
}

function resolveBlock(css: string, selector: string): Theme {
  const decls = parseDeclarations(selectorBlock(css, selector))
  const theme: Theme = {}
  for (const [name, raw] of Object.entries(decls)) {
    theme[name] = tokenToColor(name, raw)
  }
  return theme
}

/**
 * Resolve both themes from `global.css`. The `.dark` block only overrides a
 * subset of tokens, so dark inherits everything `:root` defines and layers its
 * overrides on top — exactly how the cascade resolves at runtime.
 */
export function loadThemes(cssPath: string = GLOBAL_CSS): { light: Theme; dark: Theme } {
  const css = readFileSync(cssPath, 'utf8')
  const light = resolveBlock(css, ':root')
  const dark = { ...light, ...resolveBlock(css, '.dark') }
  return { light, dark }
}

/**
 * Composite a (possibly translucent) foreground color over an opaque base, the
 * way a `bg-success/10` fill renders over the card/background behind it.
 */
export function compositeOver(fill: Color, base: Color, alpha: number): Color {
  const f = fill.to('srgb').coords
  const b = base.to('srgb').coords
  const mix = (fc: number, bc: number) => fc * alpha + bc * (1 - alpha)
  return new Color('srgb', [mix(f[0], b[0]), mix(f[1], b[1]), mix(f[2], b[2])])
}

/** WCAG 2.1 contrast ratio (1–21) between two opaque colors. */
export function contrastRatio(a: Color, b: Color): number {
  return Math.abs(b.contrast(a, 'WCAG21'))
}
