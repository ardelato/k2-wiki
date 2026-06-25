<script setup lang="ts">
/**
 * Roster rail for the Prestige Loop tab — the eligible creatures as a sortable
 * list, mirroring the Awaken / Summon plan rails. Each row is a compact portrait
 * + name + tier badge. Once a plan is computed the right side shows the planned
 * role (Anchor / Booster / Leveling), turning the roster into a live legend;
 * before that it shows the creature's level. The ghost row opens the add/remove
 * picker. Inspect a row to open that creature in the shared drawer.
 */
import { Anchor, ArrowDown, ArrowUp, Plus, Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { PrestigeRosterRailEntry } from '@/composables/usePrestigeLoopPlanner'
import type { MemberRole } from '@/utils/planner/prestigeLoopPlanner'

type RailSort = 'level' | 'tier' | 'name'
type RailSortDir = 'asc' | 'desc'


defineProps<{
  entries: PrestigeRosterRailEntry[]
  sort: RailSort
  sortDir: RailSortDir
  sortOptions: { id: RailSort; label: string }[]
}>()


const emit = defineEmits<{
  'update:sort': [sort: RailSort]
  add: []
}>()


const { t } = useI18n()


const ROLE_LABEL: Record<MemberRole, string> = {
  climber: t('levelPlanner.prestigeLoop.roles.climber'),
  booster: t('levelPlanner.prestigeLoop.roles.booster'),
  anchor: t('levelPlanner.prestigeLoop.roles.anchor'),
}


const ROLE_CLASS: Record<MemberRole, string> = {
  climber: 'bg-primary/15 text-primary',
  booster: 'bg-warning/15 text-warning-strong',
  anchor: 'bg-muted-foreground/15 text-muted-foreground',
}


// Inspect any roster row to open that creature in the shared drawer.
const { selectedCreature, drawerOpen, toggleCreatureById, closeDrawer } = useCreatureDrawer()
</script>

<template>
  <div class="surface-card flex max-h-[32rem] min-h-0 flex-col overflow-hidden">
    <div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
      <span class="flex items-center gap-2">
        <Users class="size-4 text-muted-foreground" />
        <span class="text-sm font-semibold text-foreground">{{
          t('levelPlanner.prestigeLoop.roster')
        }}</span>
        <span class="font-mono text-2xs font-bold text-muted-foreground">
          {{ entries.length }}
        </span>
      </span>
      <div
        class="inline-flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/70"
      >
        <button
          v-for="opt in sortOptions"
          :key="opt.id"
          class="focus-ring inline-flex h-7 items-center gap-1 px-2 text-2xs font-semibold transition"
          :class="
            sort === opt.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="emit('update:sort', opt.id)"
        >
          {{ opt.label }}
          <component
            :is="sortDir === 'asc' ? ArrowUp : ArrowDown"
            v-if="sort === opt.id"
            class="size-3"
          />
        </button>
      </div>
    </div>

    <ul class="scrollbar-stable min-h-0 flex-1 overflow-y-auto p-1.5">
      <li v-for="entry in entries" :key="entry.id">
        <RightClickHint @contextmenu="toggleCreatureById(entry.id)">
          <div class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left">
            <span class="size-8 shrink-0 overflow-hidden rounded-full bg-card">
              <img
                v-if="entry.image"
                :src="entry.image"
                :alt="entry.name"
                class="size-full object-contain"
                loading="lazy"
              />
            </span>
            <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span class="truncate text-sm font-semibold text-foreground">{{ entry.name }}</span>
              <span
                class="shrink-0 font-mono text-3xs uppercase tracking-wider text-muted-foreground/50"
              >
                T{{ entry.tier }}
              </span>
            </span>
            <span
              v-if="entry.role"
              class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide"
              :class="ROLE_CLASS[entry.role]"
            >
              <Anchor v-if="entry.role === 'anchor'" class="size-2.5" />
              {{ ROLE_LABEL[entry.role] }}
            </span>
            <span v-else class="shrink-0 font-mono text-2xs font-bold text-muted-foreground">
              LVL {{ entry.level }}
            </span>
          </div>
        </RightClickHint>
      </li>

      <!-- Ghost placeholder doubling as the add/remove control (Summon/Awaken-style). -->
      <li>
        <button
          class="focus-ring flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border/60 px-2 py-2 text-left text-muted-foreground transition hover:border-primary/40 hover:bg-foreground/5 hover:text-primary"
          @click="emit('add')"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border/60 bg-card/50"
          >
            <Plus class="size-4" />
          </span>
          <span class="text-xs font-semibold">{{ t('levelPlanner.rail.addRemoveCreatures') }}</span>
        </button>
      </li>
    </ul>

    <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
  </div>
</template>
