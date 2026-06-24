import { createApp } from 'vue'

import App from './App.vue'
import i18n, { loadLocaleMessages } from './i18n'
import type { SupportedLocale } from './i18n/locales'
import { router } from './router'

import './assets/styles/global.css'

// i18n already resolved the initial locale via detectLocale() at init; reuse it
// rather than scanning localStorage/navigator a second time.
// The cast is safe: i18n.global.locale was set by detectLocale() which only ever
// returns a SupportedLocale. isSupported() exists in locales.ts but is not exported,
// so a runtime guard is not available here without touching that file.
const initialLocale = i18n.global.locale.value as SupportedLocale
loadLocaleMessages(initialLocale).then(() => {
  createApp(App).use(i18n).use(router).mount('#app')
})
