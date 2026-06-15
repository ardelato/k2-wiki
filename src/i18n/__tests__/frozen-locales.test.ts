import de from '@/locales/de/ui.json'
import en from '@/locales/en/ui.json'
import es from '@/locales/es/ui.json'
import fr from '@/locales/fr/ui.json'
import tr from '@/locales/tr/ui.json'
import zhTW from '@/locales/zh-TW/ui.json'

import { collectFrozenPaths, getPath } from '../../../scripts/i18nFrozen.mjs'

// Koltera 2 is English-only (no in-game localization), so game-canonical
// vocabulary — stats, traits, jobs, feature names, summon/awaken state — must
// stay in English in every locale or players can't cross-reference the wiki
// with their game. scripts/i18nFrozen.mjs defines which keys are frozen; run
// `node scripts/sync-frozen-locales.mjs` to fix any drift this test reports.

const translations: Record<string, unknown> = { de, es, fr, tr, 'zh-TW': zhTW }
const frozenPaths = [...collectFrozenPaths(en)]

describe('frozen game-vocabulary locale keys', () => {
  test('the frozen-key set is non-empty', () => {
    expect(frozenPaths.length).toBeGreaterThan(0)
  })

  for (const [locale, messages] of Object.entries(translations)) {
    test(`${locale} keeps every frozen key equal to English`, () => {
      const drift = frozenPaths
        .filter((path) => getPath(messages, path) !== getPath(en, path))
        .map((path) => `${path}: ${JSON.stringify(getPath(messages, path))}`)

      expect(
        drift,
        `Frozen keys translated in ${locale} (run sync-frozen-locales.mjs):\n${drift.join('\n')}`,
      ).toEqual([])
    })
  }
})

// The level abbreviation is localized per-locale (es "Nvl", fr "Niv",
// tr "Svy", zh-TW "Lv"), unlike de which legitimately uses the Latin
// "Lvl"/"LVL" gaming idiom. Guard against the English token leaking back into
// the non-Latin locales (e.g. an untranslated "LVL {n}" composite string).
function collectStrings(obj: unknown, prefix: string, out: Map<string, string>) {
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') collectStrings(value, path, out)
    else if (typeof value === 'string') out.set(path, value)
  }
}

describe('localized level abbreviation', () => {
  for (const locale of ['es', 'fr', 'tr', 'zh-TW']) {
    test(`${locale} has no stray English "LVL"/"Lvl" token`, () => {
      const strings = new Map<string, string>()
      collectStrings(translations[locale], '', strings)

      const stray = [...strings]
        .filter(([, value]) => /\bLVL\b|\bLvl\b/.test(value))
        .map(([path, value]) => `${path}: ${JSON.stringify(value)}`)

      expect(stray, `English level token left in ${locale}:\n${stray.join('\n')}`).toEqual([])
    })
  }
})

// "Gold" is the in-game currency name and stays English everywhere. Any key
// whose English value mentions gold must keep the word "gold"/"Gold" in every
// locale (the surrounding UI words may be translated).
describe('Gold currency stays English', () => {
  const enStrings = new Map<string, string>()
  collectStrings(en, '', enStrings)
  const goldKeys = [...enStrings].filter(([, v]) => /gold/i.test(v)).map(([k]) => k)

  test('there are gold keys to check', () => {
    expect(goldKeys.length).toBeGreaterThan(0)
  })

  for (const [locale, messages] of Object.entries(translations)) {
    test(`${locale} keeps "gold" in every gold key`, () => {
      const missing = goldKeys
        .filter((k) => !/gold/i.test(String(getPath(messages, k) ?? '')))
        .map((k) => `${k}: ${JSON.stringify(getPath(messages, k))}`)

      expect(
        missing,
        `Currency "Gold" was translated away in ${locale}:\n${missing.join('\n')}`,
      ).toEqual([])
    })
  }
})
