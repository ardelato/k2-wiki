<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { Menu, X } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import AppSidebar from '@/components/layout/AppSidebar.vue'

const route = useRoute()
const mobileMenuOpen = ref(false)
const sidebarCollapsed = useLocalStorage('sidebar-collapsed', true)


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
          aria-label="Open menu"
          class="focus-ring -ml-1 rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
          @click="mobileMenuOpen = true"
        >
          <Menu class="size-5" />
        </button>
        <span class="text-sm font-semibold text-foreground">Koltera 2 Wiki</span>
      </header>

      <main class="mx-auto w-full max-w-app flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <RouterView />
      </main>

      <footer
        class="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6"
      >
        This is an unofficial fan project and is not affiliated with or endorsed by Braymen, the
        developer of Koltera 2.
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
                aria-label="Close menu"
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
</style>
