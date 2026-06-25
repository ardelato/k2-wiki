import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Enforcement guard for the semantic color palette (issue #61). Fails if any
 * raw Tailwind color utility (e.g. `text-emerald-600`, `bg-pink-500/10`) appears
 * in source — all colors must go through the semantic tokens defined in
 * `global.css` (success/warning/danger/info/reserved/gold and the method-kind /
 * state tokens awakened/garden/buy/machine/tool, each with a `-strong` ramp).
 *
 * Element-type colors intentionally use the `--type-*` tokens via the
 * `typeColorVar()` helper and inline `hsl(var(--type-*))`, not raw classes, so
 * they don't trip this guard.
 *
 * Scope: this guard matches the Tailwind utility-class form only
 * (`<prefix>-<color>-<shade>`). It deliberately does NOT scan inline `style`
 * color literals (`rgb()`/`hsl()`/hex) or arbitrary-value classes
 * (`text-[#...]`). Those forms remain in decorative gradients, SVG/canvas
 * fills, and themed surfaces that were never part of the #61 class migration —
 * flagging them here would be out of scope. Guard those by review, not regex.
 */

const SRC = resolve(process.cwd(), 'src')

// Tailwind's default color scales — the palette we've migrated away from.
const RAW_COLOR = String.raw`(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)`
// Utility prefix + color + numeric shade, e.g. `text-emerald-600`, `dark:bg-pink-500`.
const RAW_COLOR_CLASS = new RegExp(
  String.raw`\b(?:text|bg|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|ring-offset|placeholder|caret|accent)-${RAW_COLOR}-\d`,
)

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    // Skip test dirs — they reference raw-color patterns as fixtures/examples.
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') out.push(...sourceFiles(full))
    } else if (/\.(vue|ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('no raw Tailwind color classes in source', () => {
  it('every color goes through a semantic token', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (RAW_COLOR_CLASS.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(
      offenders,
      `Raw Tailwind color classes found — migrate to a semantic token:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
