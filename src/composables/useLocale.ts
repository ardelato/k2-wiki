import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { loadLocaleMessages } from '@/i18n'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/locales'

export { SUPPORTED_LOCALES, type SupportedLocale, detectLocale } from '@/i18n/locales'

export function useLocale() {
  const { locale } = useI18n()

  const currentLocale = computed(() => locale.value as SupportedLocale)

  const currentLocaleName = computed(
    () => SUPPORTED_LOCALES.find((l) => l.code === locale.value)?.name ?? locale.value,
  )

  const currentLocaleShort = computed(
    () =>
      SUPPORTED_LOCALES.find((l) => l.code === locale.value)?.short ??
      String(locale.value).slice(0, 2).toUpperCase(),
  )

  watch(
    locale,
    (val) => {
      localStorage.setItem('k2-wiki-locale', val)
      document.documentElement.lang = val
    },
    { immediate: true },
  )

  async function setLocale(code: SupportedLocale) {
    await loadLocaleMessages(code)
    locale.value = code
  }

  return {
    currentLocale,
    currentLocaleName,
    currentLocaleShort,
    setLocale,
    locales: SUPPORTED_LOCALES,
  }
}
