/**
 * Write (or clear, when `value` is null) a localStorage key and fire a same-tab `storage`
 * event so `useLocalStorage` refs elsewhere in the page pick up the change immediately —
 * a native `storage` event only reaches other tabs, so same-tab consumers need this nudge.
 * A null `newValue` makes those refs revert to their in-code default.
 */
export function writeStorageKey(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined' || typeof window === 'undefined') return
  const oldValue = localStorage.getItem(key)
  if (value === null) localStorage.removeItem(key)
  else localStorage.setItem(key, value)
  window.dispatchEvent(
    new StorageEvent('storage', { key, oldValue, newValue: value, storageArea: localStorage }),
  )
}
