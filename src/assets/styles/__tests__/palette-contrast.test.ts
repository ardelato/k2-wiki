import { compositeOver, contrastRatio, loadThemes, type Theme } from '@/test/colorContrast'

/**
 * Automated WCAG contrast audit for the semantic color palette defined in
 * `global.css`. Guards the foreground/background pairings that actually render
 * in the UI so a token tweak that quietly breaks readability fails CI instead of
 * shipping.
 *
 * Two thresholds, applied per the kind of text each pair carries:
 *  - AA_NORMAL (4.5): body copy, labels, and the semantic status chips, whose
 *    text is small/regular weight.
 *  - AA_LARGE (3.0): solid call-to-action buttons (primary/accent/destructive),
 *    whose labels are bold ≥14px — WCAG's large-text / UI-component tier. These
 *    intentionally sit below 4.5; asserting 4.5 here would fail accessible,
 *    shipped design.
 */
const AA_NORMAL = 4.5
const AA_LARGE = 3.0

const { light, dark } = loadThemes()
const THEMES: [name: string, theme: Theme][] = [
  ['light', light],
  ['dark', dark],
]

// Opaque text on an opaque surface.
const CORE_TEXT_PAIRS: [label: string, fg: string, bg: string][] = [
  ['foreground on background', 'foreground', 'background'],
  ['foreground on card', 'foreground', 'card'],
  ['muted-foreground on background', 'muted-foreground', 'background'],
  ['muted-foreground on card', 'muted-foreground', 'card'],
]

// Bold button labels on a solid fill — WCAG large-text / UI-component tier.
const BUTTON_PAIRS: [label: string, fg: string, bg: string][] = [
  ['primary-foreground on primary', 'primary-foreground', 'primary'],
  ['accent-foreground on accent', 'accent-foreground', 'accent'],
  ['destructive-foreground on destructive', 'destructive-foreground', 'destructive'],
]

// Status chips: opaque `text-X-strong` over a translucent `bg-X/<alpha>` fill
// that itself sits on the card or page background. Alphas span the real chip
// range used across the app (bg-X/10 … bg-X/25).
const SEMANTIC_COLORS = [
  'success',
  'warning',
  'danger',
  'info',
  'reserved',
  'gold',
  // Method-kind + state colors share the chip recipe (text-X-strong on bg-X/alpha).
  'awakened',
  'garden',
  'buy',
  'machine',
  'tool',
] as const
const CHIP_ALPHAS = [0.1, 0.25]
const CHIP_BASES = ['card', 'background'] as const

describe('semantic palette contrast (WCAG 2.1)', () => {
  describe.each(THEMES)('%s theme', (_name, theme) => {
    it.each(CORE_TEXT_PAIRS)('%s meets AA (4.5:1)', (_label, fg, bg) => {
      expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it.each(BUTTON_PAIRS)('%s meets AA-large (3:1)', (_label, fg, bg) => {
      expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA_LARGE)
    })

    describe.each(SEMANTIC_COLORS)('%s chip', (color) => {
      const cases = CHIP_BASES.flatMap((base) => CHIP_ALPHAS.map((alpha) => [alpha, base] as const))
      it.each(cases)(
        `${color}-strong text on ${color}/%s fill over %s meets AA (4.5:1)`,
        (alpha, base) => {
          const fill = compositeOver(theme[color], theme[base], alpha)
          expect(contrastRatio(theme[`${color}-strong`], fill)).toBeGreaterThanOrEqual(AA_NORMAL)
        },
      )
    })
  })
})
