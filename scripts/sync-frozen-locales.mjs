// Resets every "frozen" (game-canonical) key in each non-English locale back
// to its English value, so game vocabulary stays matchable with the
// English-only game. Safe to re-run; only touches frozen keys.
//
//   node scripts/sync-frozen-locales.mjs          # apply fixes
//   node scripts/sync-frozen-locales.mjs --check  # report only, exit 1 if drift
//
// See scripts/i18nFrozen.mjs for the frozen-key policy.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectFrozenPaths, getPath, setPath } from './i18nFrozen.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', 'src', 'locales')
const SOURCE = 'en'

const checkOnly = process.argv.includes('--check')

const en = JSON.parse(readFileSync(join(LOCALES_DIR, SOURCE, 'ui.json'), 'utf8'))
const frozenPaths = collectFrozenPaths(en)

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== SOURCE)
  .map((entry) => entry.name)

let drift = 0

for (const locale of locales) {
  const file = join(LOCALES_DIR, locale, 'ui.json')
  const messages = JSON.parse(readFileSync(file, 'utf8'))
  const changed = []

  for (const path of frozenPaths) {
    const expected = getPath(en, path)
    const actual = getPath(messages, path)
    if (actual !== expected) {
      changed.push({ path, from: actual, to: expected })
      if (!checkOnly) setPath(messages, path, expected)
    }
  }

  if (changed.length === 0) continue
  drift += changed.length

  for (const { path, from, to } of changed) {
    console.log(`  ${locale}  ${path}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`)
  }

  if (!checkOnly) {
    writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`)
  }
}

console.log(
  checkOnly
    ? `\n${drift} frozen key(s) drifted from ${SOURCE} across ${locales.length} locale(s).`
    : `\nSynced ${drift} frozen key(s) to ${SOURCE} across ${locales.length} locale(s).`,
)

if (checkOnly && drift > 0) process.exit(1)
