import { createI18n } from 'vue-i18n'

import en from '@/locales/en/ui.json'

import { detectLocale, type SupportedLocale } from './locales'

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en },
})

export function t(key: string, named?: Record<string, unknown>): string {
  return i18n.global.t(key, named ?? {})
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
