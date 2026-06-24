import { createI18n } from 'vue-i18n'

import en from '@/locales/en/ui.json'

import { detectLocale, getStoredLocale, type SupportedLocale } from './locales'

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  // A few planner-tour messages contain <b> tags rendered as HTML by driver.js.
  // Messages are developer-authored static strings, so suppress the HTML warning.
  warnHtmlMessage: false,
  messages: { en },
})

/**
 * True when the active locale came from the browser rather than a saved choice,
 * and isn't English — i.e. the user was auto-switched into a translated UI.
 * Snapshotted at boot, before useLocale persists the active locale on mount
 * (which would otherwise erase the "no stored preference" signal).
 */
export const localeAutoDetected =
  getStoredLocale() === null && (i18n.global.locale.value as string) !== 'en'

export function t(key: string, named?: Record<string, unknown>, plural?: number): string {
  // Forward the optional plural count so pluralized messages ("{n} point | {n} points")
  // select the right form, mirroring the component `$t(key, named, plural)` call shape.
  return plural === undefined
    ? i18n.global.t(key, named ?? {})
    : i18n.global.t(key, named ?? {}, plural)
}

/**
 * The active locale code (e.g. 'de', 'zh-TW'). Reactive — reads inside a render
 * or computed re-run when the language changes. Pass it to `toLocaleString` /
 * `Intl.*` so numbers, separators, and decimals follow the selected language.
 */
export function activeLocale(): string {
  return i18n.global.locale.value as string
}

export function i18nRecord<K extends string>(
  keys: readonly K[],
  prefix: string,
  keyFn: (key: K) => string = (key) => key,
): Record<K, string> {
  const obj = {} as Record<K, string>
  for (const key of keys) {
    Object.defineProperty(obj, key, {
      get: () => t(`${prefix}.${keyFn(key)}`),
      enumerable: true,
    })
  }
  return obj
}

export async function loadLocaleMessages(locale: SupportedLocale) {
  if (locale === 'en') return
  if ((i18n.global.availableLocales as string[]).includes(locale)) return

  const messages = await import(`@/locales/${locale}/ui.json`)
  i18n.global.setLocaleMessage(locale, messages.default)
}

export default i18n
