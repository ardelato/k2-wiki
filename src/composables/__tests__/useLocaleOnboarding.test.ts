import { afterEach, describe, expect, it, vi } from 'vitest'

// useLocaleOnboarding reads `localeAutoDetected` (a boot snapshot) at module
// eval, so each scenario re-imports the module with that value mocked. useLocale
// is mocked too, so the composable can run without a Vue app context.
const setLocale = vi.fn()

async function load(autoDetected: boolean) {
  vi.resetModules()
  vi.doMock('@/i18n', () => ({ localeAutoDetected: autoDetected }))
  vi.doMock('@/composables/core/useLocale', () => ({
    useLocale: () => ({
      currentLocale: { value: 'de' },
      currentLocaleName: { value: 'Deutsch' },
      setLocale,
    }),
  }))
  return (await import('@/composables/core/useLocaleOnboarding')).useLocaleOnboarding()
}

describe('useLocaleOnboarding gating', () => {
  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.doUnmock('@/i18n')
    vi.doUnmock('@/composables/core/useLocale')
  })

  it('auto-switched into a non-English UI → notice shows, hint hidden', async () => {
    const o = await load(true)
    expect(o.showAutoSwitchNotice.value).toBe(true)
    expect(o.showSwitcherHint.value).toBe(false)
  })

  it('seeing English, hint not yet dismissed → hint shows, notice hidden', async () => {
    const o = await load(false)
    expect(o.showAutoSwitchNotice.value).toBe(false)
    expect(o.showSwitcherHint.value).toBe(true)
  })

  it('seeing English, hint already dismissed → neither shows', async () => {
    localStorage.setItem('k2-wiki-i18n-hint-dismissed', '1')
    const o = await load(false)
    expect(o.showAutoSwitchNotice.value).toBe(false)
    expect(o.showSwitcherHint.value).toBe(false)
  })

  it('dismissHint persists the flag and hides the hint', async () => {
    const o = await load(false)
    o.dismissHint()
    expect(o.showSwitcherHint.value).toBe(false)
    expect(localStorage.getItem('k2-wiki-i18n-hint-dismissed')).toBe('1')
  })

  it('keepLanguage persists the current locale and hides the notice', async () => {
    const o = await load(true)
    o.keepLanguage()
    expect(o.showAutoSwitchNotice.value).toBe(false)
    expect(localStorage.getItem('k2-wiki-locale')).toBe('de')
  })

  it('switchToEnglish switches locale and hides the notice', async () => {
    const o = await load(true)
    await o.switchToEnglish()
    expect(setLocale).toHaveBeenCalledWith('en')
    expect(o.showAutoSwitchNotice.value).toBe(false)
  })
})
