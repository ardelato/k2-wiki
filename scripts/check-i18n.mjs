// i18n translation-coverage guard (complements sync-frozen-locales.mjs).
//
// sync-frozen ensures FROZEN keys stay English. This guard enforces the inverse:
// every NON-frozen string should be translated. It fails if a non-English locale
// value is byte-identical to the English source, UNLESS:
//   - the key is frozen (collectFrozenPaths) — intentionally English, or
//   - the "<locale>\t<path>" pair is in scripts/i18n-allow-identical.json — a
//     deliberate cognate/brand/token whose correct translation equals English.
//
//   node scripts/check-i18n.mjs            # check, exit 1 on new untranslated keys
//   node scripts/check-i18n.mjs --update   # regenerate the cognate allowlist baseline
//
// Wired as `npm run i18n:check`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectFrozenPaths } from './i18nFrozen.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', 'src', 'locales')
const ALLOW_PATH = join(__dirname, 'i18n-allow-identical.json')
const SOURCE = 'en'

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, path, out)
    else out[path] = v
  }
  return out
}
// A value with no Latin letters (pure numbers/symbols/CJK) can legitimately repeat
// across languages and is never a translation gap.
const hasLatinLetters = (s) => typeof s === 'string' && /[A-Za-z]/.test(s)

const enObj = JSON.parse(readFileSync(join(LOCALES_DIR, SOURCE, 'ui.json'), 'utf8'))
const en = flatten(enObj)
const frozen = collectFrozenPaths(enObj)

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== SOURCE)
  .map((e) => e.name)

const update = process.argv.includes('--update')
const allow = new Set(!update ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : [])

const identical = []
for (const loc of locales) {
  const flat = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, loc, 'ui.json'), 'utf8')))
  for (const [path, enVal] of Object.entries(en)) {
    if (!hasLatinLetters(enVal)) continue
    if (frozen.has(path)) continue
    if (flat[path] !== enVal) continue
    identical.push(`${loc}\t${path}`)
  }
}

if (update) {
  identical.sort()
  writeFileSync(ALLOW_PATH, JSON.stringify(identical, null, 2) + '\n')
  console.log(
    `wrote ${identical.length} allowlisted identical (non-frozen) entries to ${ALLOW_PATH}`,
  )
  process.exit(0)
}

const offenders = identical.filter((id) => !allow.has(id))
if (offenders.length) {
  console.error(
    `i18n:check failed — ${offenders.length} non-frozen string(s) identical to English and not allowlisted:\n`,
  )
  for (const o of offenders.sort()) console.error('  ' + o.replace('\t', '  →  '))
  console.error(
    `\nFix: translate them in src/locales/<loc>/ui.json.\n` +
      `If a string is a deliberate cognate/brand/token whose translation equals English,\n` +
      `run \`node scripts/check-i18n.mjs --update\` to add it to the allowlist.`,
  )
  process.exit(1)
}
console.log(
  `i18n:check passed — all non-frozen strings translated or allowlisted (${locales.length} locales).`,
)
