<script setup lang="ts">
import {
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Cog,
  Compass,
  Flower2,
  Swords,
  Fence,
  FileCog,
  Github,
  Hammer,
  Moon,
  PawPrint,
  Package,
  Sparkles,
  Sun,
  SunMoon,
  TreePine,
  Wrench,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import SteamIcon from '@/components/icons/SteamIcon.vue'
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import { useTheme } from '@/composables/core/useTheme'
import meta from '@/data/meta.json'

const props = defineProps<{
  collapsed: boolean
}>()


const emit = defineEmits<{
  navigate: []
  'toggle-collapse': []
}>()


const route = useRoute()
const { t } = useI18n()
const { preference, cycle } = useTheme()


const activePath = computed(() => route.path)


// True when `current` is `path` or a descendant segment of it (so `/planner` matches
// `/planner/planks` but not the unrelated `/planners`).
function segmentMatch(current: string, path: string) {
  if (path === '/') return current === '/'
  return current === path || current.startsWith(path + '/')
}


function isActive(path: string) {
  const current = activePath.value
  if (!segmentMatch(current, path)) return false
  // Longest matching prefix wins, so sibling pages that share a prefix — like
  // `/planner` (Crafting) and `/planner/creature` (Creature) — don't both light up.
  return !navGroups.value.some((group) =>
    group.items.some(
      (item) => item.to !== path && item.to.length > path.length && segmentMatch(current, item.to),
    ),
  )
}


const themeLabel = computed(() => {
  if (preference.value === 'system') return t('settings.themeSystem')
  if (preference.value === 'light') return t('settings.themeLight')
  return t('settings.themeDark')
})


const navGroups = computed(() => [
  {
    label: t('nav.reference'),
    items: [
      { label: t('nav.beastiary'), to: '/', icon: BookOpen },
      { label: t('nav.items'), to: '/items', icon: Package },
      { label: t('nav.dungeons'), to: '/dungeons', icon: Swords },
      { label: t('nav.expeditions'), to: '/expeditions', icon: Compass },
      { label: t('nav.sanctuary'), to: '/sanctuary', icon: Fence },
    ],
  },
  {
    label: t('nav.progression'),
    items: [
      { label: t('nav.garden'), to: '/garden', icon: Flower2 },
      { label: t('nav.awakenTree'), to: '/awaken', icon: TreePine },
      { label: t('nav.fabrication'), to: '/fabrication', icon: Sparkles },
      { label: t('nav.tools'), to: '/tools', icon: Wrench },
      { label: t('nav.machines'), to: '/machines', icon: Cog },
    ],
  },
  {
    label: t('nav.utilities'),
    items: [
      { label: t('nav.creaturePlanner'), to: '/planner/creature', icon: PawPrint },
      { label: t('nav.craftingPlanner'), to: '/planner', icon: Hammer },
      { label: t('nav.configs'), to: '/configs', icon: FileCog },
    ],
  },
])
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Logo -->
    <div class="px-3 py-4" :class="props.collapsed && 'flex justify-center'">
      <RouterLink
        to="/"
        class="focus-ring inline-flex items-center rounded-lg px-1 py-1 text-foreground"
        :title="props.collapsed ? t('common.koltera2Wiki') : undefined"
        @click="emit('navigate')"
      >
        <template v-if="!props.collapsed">
          <span class="leading-tight">
            <span
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground"
            >
              {{ t('common.koltera2') }}
              <span
                v-if="meta.gameVersion === meta.latestGameVersion"
                class="rounded-full bg-primary px-1.5 py-0.5 text-3xs font-semibold leading-none text-primary-foreground"
                :title="t('meta.gameVersionTooltip', { v: meta.gameVersion })"
                >v{{ meta.gameVersion }}</span
              >
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-3xs font-semibold leading-none text-warning-strong"
                :title="t('meta.wikiUpdateInProgress')"
                >v{{ meta.gameVersion }} · game is v{{ meta.latestGameVersion }}</span
              >
            </span>
            <span class="block text-base font-extrabold text-foreground">{{
              t('common.wiki')
            }}</span>
          </span>
        </template>
        <span v-else class="flex flex-col items-center gap-1">
          <span class="text-base font-extrabold text-foreground">{{ t('common.k2') }}</span>
          <span
            v-if="meta.gameVersion === meta.latestGameVersion"
            class="rounded-full bg-primary px-1.5 py-0.5 text-3xs font-semibold leading-none text-primary-foreground"
            :title="t('meta.gameVersionTooltip', { v: meta.gameVersion })"
            >v{{ meta.gameVersion }}</span
          >
          <span
            v-else
            class="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-3xs font-semibold leading-none text-warning-strong"
            :title="
              t('meta.versionMismatch', {
                wikiVersion: meta.gameVersion,
                gameVersion: meta.latestGameVersion,
              })
            "
            >v{{ meta.gameVersion }}</span
          >
        </span>
      </RouterLink>
    </div>

    <!-- Nav groups -->
    <nav class="flex-1 space-y-4 overflow-y-auto" :class="props.collapsed ? 'px-1.5' : 'px-3'">
      <div v-for="group in navGroups" :key="group.label">
        <h3
          v-if="!props.collapsed"
          class="mb-1.5 px-2 text-3xs font-semibold uppercase tracking-widest text-muted-foreground/70"
        >
          {{ group.label }}
        </h3>
        <div v-else class="mb-1 border-t border-border/40" />
        <div class="space-y-0.5">
          <AppTooltip
            v-for="item in group.items"
            :key="item.to"
            :text="item.label"
            position="right"
            :disabled="!props.collapsed"
          >
            <RouterLink
              :to="item.to"
              class="focus-ring flex items-center rounded-lg text-sm font-medium transition"
              :class="[
                props.collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2',
                isActive(item.to)
                  ? 'bg-primary text-primary-foreground shadow-glow'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              ]"
              @click="emit('navigate')"
            >
              <component :is="item.icon" class="size-4 shrink-0" />
              <span v-if="!props.collapsed">{{ item.label }}</span>
            </RouterLink>
          </AppTooltip>
        </div>
      </div>
    </nav>

    <!-- Bottom actions -->
    <div class="border-t border-border/70 px-2 py-2">
      <div
        class="flex items-center"
        :class="props.collapsed ? 'flex-col gap-0.5' : 'justify-between'"
      >
        <div class="flex items-center" :class="props.collapsed ? 'flex-col gap-0.5' : 'gap-0.5'">
          <AppTooltip :text="t('settings.github')" :position="props.collapsed ? 'right' : 'top'">
            <a
              href="https://github.com/ardelato/k2-wiki"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('settings.githubRepo')"
              class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            >
              <Github class="size-4" />
            </a>
          </AppTooltip>
          <AppTooltip :text="t('settings.steam')" :position="props.collapsed ? 'right' : 'top'">
            <a
              href="https://store.steampowered.com/app/2834700/Koltera_2/"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('settings.koltera2Steam')"
              class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            >
              <SteamIcon class="size-4" />
            </a>
          </AppTooltip>
        </div>

        <div class="flex items-center" :class="props.collapsed ? 'flex-col gap-0.5' : 'gap-0.5'">
          <!-- Language switcher -->
          <LanguageSwitcher :collapsed="props.collapsed" />

          <AppTooltip :text="themeLabel" :position="props.collapsed ? 'right' : 'top'">
            <button
              :aria-label="t('settings.toggleTheme')"
              class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
              @click="cycle"
            >
              <SunMoon v-if="preference === 'system'" class="size-4" />
              <Sun v-else-if="preference === 'light'" class="size-4" />
              <Moon v-else class="size-4" />
            </button>
          </AppTooltip>
        </div>
      </div>

      <!-- Collapse toggle -->
      <AppTooltip
        :text="props.collapsed ? t('settings.expandSidebar') : t('settings.collapseSidebar')"
        :position="props.collapsed ? 'right' : 'top'"
      >
        <button
          :aria-label="t('settings.toggleSidebar')"
          class="focus-ring mt-1 flex w-full items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
          @click="emit('toggle-collapse')"
        >
          <ChevronsLeft v-if="!props.collapsed" class="size-4" />
          <ChevronsRight v-else class="size-4" />
        </button>
      </AppTooltip>
    </div>
  </div>
</template>
