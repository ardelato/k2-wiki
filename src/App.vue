<script setup lang="ts">
import { BookOpen, Compass, FileCog, GitBranch, Github, Package } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import SteamIcon from '@/components/icons/SteamIcon.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { cn } from '@/lib/utils'

const route = useRoute()


const navItems = [
  { label: 'Beastiary', to: '/', icon: BookOpen },
  { label: 'Items', to: '/items', icon: Package },
  { label: 'Planner', to: '/planner', icon: GitBranch },
  { label: 'Expeditions', to: '/expeditions', icon: Compass },
  { label: 'Configs', to: '/configs', icon: FileCog },
]


const activePath = computed(() => route.path)


function isActive(path: string) {
  if (path === '/') return activePath.value === '/'
  return activePath.value.startsWith(path)
}
</script>

<template>
  <div class="min-h-screen pb-20 lg:pb-0">
    <header class="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div
        class="mx-auto flex h-[var(--header-height)] max-w-app items-center justify-between gap-5 px-4 sm:px-6"
      >
        <RouterLink
          to="/"
          class="focus-ring inline-flex items-center gap-3 rounded-lg px-2 py-1.5 text-foreground"
        >
          <span class="leading-tight">
            <span
              class="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted-foreground"
            >
              Koltera 2
              <span
                class="rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-primary-foreground"
                title="Content is based on this game version"
                >v3.0</span
              >
            </span>
            <span class="block text-lg font-extrabold text-foreground">Wiki</span>
          </span>
        </RouterLink>

        <nav
          class="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 p-1 md:flex"
        >
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
            :class="
              isActive(item.to)
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            "
          >
            <component :is="item.icon" class="size-4" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="flex items-center gap-1">
          <a
            href="https://github.com/ardelato/k2-wiki"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
          >
            <Github class="size-5" />
          </a>
          <a
            href="https://store.steampowered.com/app/2834700/Koltera_2/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Koltera 2 on Steam"
            class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
          >
            <SteamIcon class="size-5" />
          </a>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-app px-4 py-6 sm:px-6 lg:py-8">
      <RouterView />
    </main>

    <AppFooter />

    <nav
      class="bg-background/94 fixed inset-x-0 bottom-0 z-50 border-t border-border/70 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 backdrop-blur-xl md:hidden"
    >
      <div class="mx-auto grid max-w-lg grid-cols-5 gap-1.5">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="
            cn(
              'focus-ring inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
              isActive(item.to)
                ? 'border-primary/55 bg-primary text-primary-foreground shadow-glow'
                : 'border-border bg-card/55 text-muted-foreground hover:border-accent/35 hover:text-foreground',
            )
          "
        >
          <component :is="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </div>
    </nav>
  </div>
</template>
