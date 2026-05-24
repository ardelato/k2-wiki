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
  GitBranch,
  Github,
  Moon,
  Package,
  Sparkles,
  Sun,
  SunMoon,
  TreePine,
  Wrench,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import SteamIcon from '@/components/icons/SteamIcon.vue'
import AppTooltip from '@/components/shared/AppTooltip.vue'
import { useTheme } from '@/composables/useTheme'
import meta from '@/data/meta.json'

const props = defineProps<{
  collapsed: boolean
}>()


const emit = defineEmits<{
  navigate: []
  'toggle-collapse': []
}>()


const route = useRoute()
const { preference, cycle } = useTheme()


const activePath = computed(() => route.path)


function isActive(path: string) {
  if (path === '/') return activePath.value === '/'
  return activePath.value.startsWith(path)
}


const themeLabel = computed(() => {
  if (preference.value === 'system') return 'Theme: System'
  if (preference.value === 'light') return 'Theme: Light'
  return 'Theme: Dark'
})


const navGroups = [
  {
    label: 'Reference',
    items: [
      { label: 'Beastiary', to: '/', icon: BookOpen },
      { label: 'Items', to: '/items', icon: Package },
      { label: 'Dungeons', to: '/dungeons', icon: Swords },
      { label: 'Expeditions', to: '/expeditions', icon: Compass },
      { label: 'Sanctuary', to: '/sanctuary', icon: Fence },
    ],
  },
  {
    label: 'Progression',
    items: [
      { label: 'Garden', to: '/garden', icon: Flower2 },
      { label: 'Awaken Tree', to: '/awaken', icon: TreePine },
      { label: 'Fabrication', to: '/fabrication', icon: Sparkles },
      { label: 'Tools', to: '/tools', icon: Wrench },
      { label: 'Machines', to: '/machines', icon: Cog },
    ],
  },
  {
    label: 'Utilities',
    items: [
      { label: 'Planner', to: '/planner', icon: GitBranch },
      { label: 'Configs', to: '/configs', icon: FileCog },
    ],
  },
]
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Logo -->
    <div class="px-3 py-4" :class="props.collapsed && 'flex justify-center'">
      <RouterLink
        to="/"
        class="focus-ring inline-flex items-center rounded-lg px-1 py-1 text-foreground"
        :title="props.collapsed ? 'Koltera 2 Wiki' : undefined"
        @click="emit('navigate')"
      >
        <template v-if="!props.collapsed">
          <span class="leading-tight">
            <span
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground"
            >
              Koltera 2
              <span
                v-if="meta.gameVersion === meta.latestGameVersion"
                class="rounded-full bg-primary px-1.5 py-0.5 text-[0.5625rem] font-semibold leading-none text-primary-foreground"
                :title="`Content is based on game version ${meta.gameVersion}`"
                >v{{ meta.gameVersion }}</span
              >
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.5625rem] font-semibold leading-none text-amber-600 dark:text-amber-400"
                title="Wiki update in progress"
                >v{{ meta.gameVersion }} · game is v{{ meta.latestGameVersion }}</span
              >
            </span>
            <span class="block text-base font-extrabold text-foreground">Wiki</span>
          </span>
        </template>
        <span v-else class="flex flex-col items-center gap-1">
          <span class="text-base font-extrabold text-foreground">K2</span>
          <span
            v-if="meta.gameVersion === meta.latestGameVersion"
            class="rounded-full bg-primary px-1.5 py-0.5 text-[0.5rem] font-semibold leading-none text-primary-foreground"
            :title="`Content is based on game version ${meta.gameVersion}`"
            >v{{ meta.gameVersion }}</span
          >
          <span
            v-else
            class="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.5rem] font-semibold leading-none text-amber-600 dark:text-amber-400"
            :title="`Wiki: v${meta.gameVersion} · Game: v${meta.latestGameVersion}`"
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
          class="mb-1.5 px-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground/70"
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
          <AppTooltip text="GitHub" :position="props.collapsed ? 'right' : 'top'">
            <a
              href="https://github.com/ardelato/k2-wiki"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            >
              <Github class="size-4" />
            </a>
          </AppTooltip>
          <AppTooltip text="Steam" :position="props.collapsed ? 'right' : 'top'">
            <a
              href="https://store.steampowered.com/app/2834700/Koltera_2/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Koltera 2 on Steam"
              class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            >
              <SteamIcon class="size-4" />
            </a>
          </AppTooltip>
        </div>
        <AppTooltip :text="themeLabel" :position="props.collapsed ? 'right' : 'top'">
          <button
            aria-label="Toggle theme"
            class="focus-ring rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            @click="cycle"
          >
            <SunMoon v-if="preference === 'system'" class="size-4" />
            <Sun v-else-if="preference === 'light'" class="size-4" />
            <Moon v-else class="size-4" />
          </button>
        </AppTooltip>
      </div>

      <!-- Collapse toggle -->
      <AppTooltip
        :text="props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :position="props.collapsed ? 'right' : 'top'"
      >
        <button
          aria-label="Toggle sidebar"
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
