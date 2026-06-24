import { ref } from 'vue'

import { useLocale } from '@/composables/core/useLocale'
import { localeAutoDetected } from '@/i18n'
import { storeLocale } from '@/i18n/locales'

const HINT_DISMISSED_KEY = 'k2-wiki-i18n-hint-dismissed'

function hintDismissed(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(HINT_DISMISSED_KEY) === '1'
}

// Shared across every caller (the switcher is mounted twice — desktop rail and
// mobile drawer), so dismissing the hint or notice in one instance retires it
// everywhere. Snapshotted once: localeAutoDetected is fixed at boot.
const showAutoSwitchNotice = ref(localeAutoDetected)
const showSwitcherHint = ref(!localeAutoDetected && !hintDismissed())

/**
 * Drives the two first-run localization affordances, which are mutually
 * exclusive for a given visit:
 *  - a reversible notice when the user was auto-switched into a translated UI
 *    (so an English speaker abroad can get back to English), or
 *  - a one-time pointer to the language switcher for everyone else (so users
 *    seeing English discover that other languages exist).
 */
export function useLocaleOnboarding() {
  const { currentLocale, currentLocaleName, setLocale } = useLocale()

  async function switchToEnglish() {
    await setLocale('en')
    showAutoSwitchNotice.value = false
  }

  function keepLanguage() {
    // Mark the auto-detected locale as a deliberate choice so the notice retires.
    storeLocale(currentLocale.value)
    showAutoSwitchNotice.value = false
  }

  function dismissHint() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_DISMISSED_KEY, '1')
    showSwitcherHint.value = false
  }

  return {
    showAutoSwitchNotice,
    showSwitcherHint,
    currentLocaleName,
    switchToEnglish,
    keepLanguage,
    dismissHint,
  }
}
