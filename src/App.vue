<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { Languages, Menu, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useLocaleOnboarding } from '@/composables/core/useLocaleOnboarding'

const route = useRoute()
const { t } = useI18n()
const { showAutoSwitchNotice, currentLocaleName, switchToEnglish, keepLanguage } =
  useLocaleOnboarding()
const mobileMenuOpen = ref(false)
const sidebarCollapsed = useLocalStorage('sidebar-collapsed', true)


const showMoveBanner = computed(() => {
  if (import.meta.env.DEV) return true
  return /\.github\.io$/i.test(window.location.hostname)
})


// Close mobile menu on route change
watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false
  },
)
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Desktop sidebar -->
    <aside
      class="sidebar-rail fixed inset-y-0 left-0 z-30 hidden border-r border-border/70 bg-background md:block"
      :class="sidebarCollapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]'"
    >
      <AppSidebar
        :collapsed="sidebarCollapsed"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      />
    </aside>

    <!-- Main content area -->
    <div
      class="sidebar-push flex min-h-screen w-full flex-col"
      :class="
        sidebarCollapsed ? 'md:pl-[var(--sidebar-width-collapsed)]' : 'md:pl-[var(--sidebar-width)]'
      "
    >
      <!-- Mobile top bar -->
      <header
        class="sticky top-0 z-40 flex h-[var(--header-height)] items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl md:hidden"
      >
        <button
          :aria-label="t('common.openMenu')"
          class="focus-ring -ml-1 rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
          @click="mobileMenuOpen = true"
        >
          <Menu class="size-5" />
        </button>
        <span class="text-sm font-semibold text-foreground">{{ t('common.koltera2Wiki') }}</span>
      </header>

      <div
        v-if="showMoveBanner"
        class="border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-center text-sm text-warning-strong sm:px-6"
        role="status"
      >
        <span class="mx-auto block max-w-app">
          {{ t('common.moveBannerBefore') }}
          <a
            href="https://k2-wiki.pages.dev"
            class="font-semibold underline underline-offset-2 hover:no-underline"
          >
            k2-wiki.pages.dev </a
          >{{ t('common.moveBannerAfter') }}
        </span>
      </div>

      <main class="mx-auto w-full max-w-app flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <RouterView />
      </main>

      <footer
        class="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6"
      >
        {{ t('common.footer') }}
      </footer>
    </div>

    <!-- Mobile overlay -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="mobileMenuOpen" class="fixed inset-0 z-50 md:hidden">
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-background/80 backdrop-blur-sm"
            @click="mobileMenuOpen = false"
          />

          <!-- Sidebar panel -->
          <aside
            class="absolute inset-y-0 left-0 w-[280px] border-r border-border/70 bg-background shadow-xl"
          >
            <div class="flex h-full flex-col">
              <!-- Close button -->
              <button
                :aria-label="t('common.closeMenu')"
                class="focus-ring absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted-foreground transition hover:text-foreground"
                @click="mobileMenuOpen = false"
              >
                <X class="size-5" />
              </button>

              <AppSidebar :collapsed="false" @navigate="mobileMenuOpen = false" />
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- First-run notice for users auto-switched into a translated UI.
         Entrance-only CSS rather than <Transition>: this mounts with v-if
         already true, and a Teleport+Transition whose enter hook never runs
         then fails to fire its leave hook, so the notice wouldn't dismiss.
         (The switcher hint can use <Transition> because it mounts false→true.) -->
    <Teleport to="body">
      <div
        v-if="showAutoSwitchNotice"
        class="locale-notice fixed inset-x-0 bottom-4 z-[60] mx-auto flex w-max max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-xl border border-border/70 bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur"
        role="status"
      >
        <Languages class="size-4 shrink-0 text-muted-foreground" />
        <span class="text-sm text-foreground">{{
          t('localeNotice.shownIn', { language: currentLocaleName })
        }}</span>
        <button
          type="button"
          class="focus-ring rounded-lg px-2.5 py-1 text-sm font-semibold text-primary transition hover:bg-primary/10"
          @click="switchToEnglish"
        >
          {{ t('localeNotice.viewInEnglish') }}
        </button>
        <button
          type="button"
          :aria-label="t('localeNotice.dismiss')"
          class="focus-ring rounded-lg p-1 text-muted-foreground transition hover:text-foreground"
          @click="keepLanguage"
        >
          <X class="size-4" />
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sidebar-rail {
  transition: width 0.2s ease;
}

.sidebar-push {
  transition: padding-left 0.2s ease;
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-active aside,
.overlay-leave-active aside {
  transition: transform 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.overlay-enter-from aside,
.overlay-leave-to aside {
  transform: translateX(-100%);
}

@keyframes locale-notice-in {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.locale-notice {
  animation: locale-notice-in 0.2s ease;
}
</style>
