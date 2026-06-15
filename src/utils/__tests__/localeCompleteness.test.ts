import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const LOCALES_DIR = join(__dirname, '../../locales')

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return val && typeof val === 'object' && !Array.isArray(val)
      ? flatKeys(val as Record<string, unknown>, path)
      : [path]
  })
}

const enJson = JSON.parse(readFileSync(join(LOCALES_DIR, 'en/ui.json'), 'utf8'))
const enKeys = new Set(flatKeys(enJson))

const localeDirs = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'en')
  .filter((d) => existsSync(join(LOCALES_DIR, d.name, 'ui.json')))
  .map((d) => d.name)

it.skipIf(localeDirs.length === 0)('has at least one non-English locale', () => {
  expect(localeDirs.length).toBeGreaterThan(0)
})

describe.skipIf(localeDirs.length === 0).each(localeDirs)('locale %s', (locale) => {
  const filePath = join(LOCALES_DIR, locale, 'ui.json')
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  const keys = new Set(flatKeys(json))

  it('has no missing keys', () => {
    const missing = [...enKeys].filter((k) => !keys.has(k))
    expect(missing).toEqual([])
  })

  it('has no extra keys', () => {
    const extra = [...keys].filter((k) => !enKeys.has(k))
    expect(extra).toEqual([])
  })

  it('preserves all interpolation placeholders', () => {
    const placeholderRe = /\{[^}]+\}/g
    const mismatches: string[] = []
    for (const key of enKeys) {
      const enVal = key.split('.').reduce((o: any, k) => o?.[k], enJson) as string
      const locVal = key.split('.').reduce((o: any, k) => o?.[k], json) as string
      if (typeof enVal !== 'string' || typeof locVal !== 'string') continue
      // Compare the SET of placeholder names, not raw counts: vue-i18n plural
      // forms ("{n} item | {n} items") and languages without plurals (tr, zh)
      // legitimately repeat a placeholder a different number of times. What
      // must match is that no placeholder NAME is dropped or invented.
      const enPlaceholders = [...new Set(enVal.match(placeholderRe) ?? [])].toSorted()
      const locPlaceholders = [...new Set(locVal.match(placeholderRe) ?? [])].toSorted()
      if (JSON.stringify(enPlaceholders) !== JSON.stringify(locPlaceholders)) {
        mismatches.push(
          `${key}: expected ${JSON.stringify(enPlaceholders)}, got ${JSON.stringify(locPlaceholders)}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  })
})
