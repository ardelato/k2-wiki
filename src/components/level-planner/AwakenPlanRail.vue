<script setup lang="ts">
/**
 * Left rail of the Awaken tab — the queued creatures as a sortable list,
 * mirroring the Summon plan rail. Each row is a compact portrait + name +
 * level-progress bar + ETA. Selecting a row focuses that creature's route in
 * the pane to the right.
 */
import { ArrowDown, ArrowUp, Plus, Sparkles } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import { formatDuration } from '@/utils/format/format'

interface AwakenRailEntry {
  id: string
  name: string
  image: string | null
  tier: number
  fromLevel: number
  toLevel: number
  etaSeconds: number | null
  progress: number
}


type RailSort = 'eta' | 'level' | 'name'
type RailSortDir = 'asc' | 'desc'


defineProps<{
  entries: AwakenRailEntry[]
  selectedId: string | null
  sort: RailSort
  sortDir: RailSortDir
  sortOptions: { id: RailSort; label: string }[]
  computing?: boolean
}>()


const emit = defineEmits<{
  select: [id: string]
  'update:sort': [sort: RailSort]
  add: []
}>()


const { t } = useI18n()


// Inspect any queue row to open that creature in the shared drawer.
const { selectedCreature, drawerOpen, toggleCreatureById, closeDrawer } = useCreatureDrawer()
</script>

<template>
  <div class="surface-card flex flex-col overflow-hidden">
    <div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
      <span class="flex items-center gap-2">
        <Sparkles class="size-4 text-muted-foreground" />
        <span class="text-sm font-semibold text-foreground">{{
          t('levelPlanner.rail.queue')
        }}</span>
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

    <ul class="min-h-0 flex-1 overflow-y-auto p-1.5">
      <li v-for="entry in entries" :key="entry.id">
        <RightClickHint @contextmenu="toggleCreatureById(entry.id)">
          <button
            class="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition"
            :class="
              selectedId === entry.id
                ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
                : 'hover:bg-foreground/5'
            "
            @click="emit('select', entry.id)"
          >
            <span class="relative size-9 shrink-0 overflow-hidden rounded-full bg-card">
              <img
                v-if="entry.image"
                :src="entry.image"
                :alt="entry.name"
                class="size-full object-contain"
                loading="lazy"
              />
              <span
                class="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full ring-2 ring-card"
                :class="
                  computing
                    ? 'animate-pulse bg-muted-foreground/40'
                    : entry.etaSeconds != null
                      ? 'bg-success'
                      : 'bg-muted-foreground/40'
                "
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span class="flex min-w-0 items-baseline gap-1.5">
                  <span class="truncate text-sm font-semibold text-foreground">{{
                    entry.name
                  }}</span>
                  <span
                    class="shrink-0 font-mono text-3xs uppercase tracking-wider text-muted-foreground/50"
                  >
                    T{{ entry.tier }}
                  </span>
                </span>
                <span class="shrink-0 font-mono text-2xs font-bold text-muted-foreground">
                  {{
                    computing
                      ? '···'
                      : entry.etaSeconds != null && entry.etaSeconds > 0
                        ? formatDuration(entry.etaSeconds)
                        : '—'
                  }}
                </span>
              </span>
              <span class="mt-0.5 flex items-center gap-1.5">
                <span class="font-mono text-3xs text-muted-foreground/70">
                  L{{ entry.fromLevel }}<span class="text-muted-foreground/40">→</span
                  >{{ entry.toLevel }}
                </span>
                <span class="block h-1 flex-1 overflow-hidden rounded-full bg-muted/50">
                  <span
                    class="block h-full rounded-full bg-success/80 transition-all"
                    :style="{ width: `${entry.progress}%` }"
                  />
                </span>
              </span>
            </span>
          </button>
        </RightClickHint>
      </li>

      <!-- Ghost placeholder: matches a queue row's volume so the rail keeps its
           shape when empty, and doubles as the add/remove control (Summon-style). -->
      <li>
        <button
          class="focus-ring flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border/60 px-2 py-2 text-left text-muted-foreground transition hover:border-primary/40 hover:bg-foreground/5 hover:text-primary"
          @click="emit('add')"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-border/60 bg-card/50"
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
