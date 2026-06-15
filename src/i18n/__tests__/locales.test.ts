import { detectLocale, getStoredLocale, STORAGE_KEY, storeLocale } from '../locales'

describe('locale storage helpers', () => {
  afterEach(() => localStorage.clear())

  it('getStoredLocale returns null when nothing is saved', () => {
    expect(getStoredLocale()).toBeNull()
  })

  it('getStoredLocale returns a saved, supported locale', () => {
    localStorage.setItem(STORAGE_KEY, 'de')
    expect(getStoredLocale()).toBe('de')
  })

  it('getStoredLocale ignores an unsupported saved value', () => {
    localStorage.setItem(STORAGE_KEY, 'xx')
    expect(getStoredLocale()).toBeNull()
  })

  it('storeLocale persists under the shared storage key', () => {
    storeLocale('fr')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fr')
    expect(getStoredLocale()).toBe('fr')
  })

  it('detectLocale prefers a saved locale over the browser language', () => {
    storeLocale('es')
    expect(detectLocale()).toBe('es')
  })

  it('detectLocale falls back to English when nothing is saved', () => {
    // jsdom reports an English navigator language, so with no saved preference
    // the browser match resolves to 'en'.
    expect(detectLocale()).toBe('en')
  })
})
