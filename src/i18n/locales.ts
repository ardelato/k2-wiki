export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'tr', name: 'Türkçe', short: 'TR' },
  { code: 'zh-TW', name: '繁體中文', short: '繁' },
  { code: 'de', name: 'Deutsch', short: 'DE' },
  { code: 'es', name: 'Español', short: 'ES' },
  { code: 'fr', name: 'Français', short: 'FR' },
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code']

const STORAGE_KEY = 'k2-wiki-locale'
const LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code) as readonly string[]

function isSupported(code: string): code is SupportedLocale {
  return LOCALE_CODES.includes(code)
}

function matchBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return 'en'
  for (const lang of navigator.languages ?? [navigator.language]) {
    if (isSupported(lang)) return lang
    const prefix = lang.split('-')[0]
    if (isSupported(prefix)) return prefix
  }
  return 'en'
}

export function detectLocale(): SupportedLocale {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (stored && isSupported(stored)) return stored
  return matchBrowserLocale()
}
