import { computed, ref, watchEffect } from 'vue'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'k2-wiki-theme'

const preference = ref<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'system')

const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  systemDark.value = e.matches
})

const isDark = computed(() =>
  preference.value === 'system' ? systemDark.value : preference.value === 'dark',
)

watchEffect(() => {
  const root = document.documentElement
  if (isDark.value) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem(STORAGE_KEY, preference.value)
})

export function useTheme() {
  function cycle() {
    const order: Theme[] = ['system', 'light', 'dark']
    const i = order.indexOf(preference.value)
    preference.value = order[(i + 1) % order.length]
  }

  function setTheme(theme: Theme) {
    preference.value = theme
  }

  return { preference, isDark, cycle, setTheme }
}
