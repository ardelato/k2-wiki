<script setup lang="ts">
/**
 * Left rail of the Summon "Plan" view: the selected creatures as an ordered,
 * sortable list — the recommended summon sequence. Each row is a compact
 * portrait + name + status dot + readiness bar. Auto-order only for now
 * (Step order / Most ready / Name); manual drag-to-queue is deferred. Rows are
 * numbered by the planner's completion sequence. Under "Most ready",
 * skill-blocked creatures sink into a "Blocked" group.
 */
import { ArrowDown, ArrowUp, Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import RightClickHint from '@/components/shared/RightClickHint.vue'

const { t } = useI18n()


export interface RailEntry {
  id: string
  name: string
  image: string | null
  tier: number
  readiness: number
  blocked: boolean
  /** 1-based position in the planner's completion sequence (Step order). */
  step?: number
}


type RailSort = 'step' | 'ready' | 'name'
type RailSortDir = 'asc' | 'desc'


const props = defineProps<{
  entries: RailEntry[]
  selectedId: string | null
  sort: RailSort
  sortDir: RailSortDir
  sortOptions: { id: RailSort; label: string }[]
}>()


const emit = defineEmits<{
  select: [id: string]
  inspect: [id: string]
  'update:sort': [sort: RailSort]
  add: []
}>()


// Index where the blocked group starts (entries arrive pre-sorted, blocked last).
// Only render the divider when sorting by readiness and the list actually splits.
const blockedStart = computed(() => {
  if (props.sort !== 'ready') return -1
  const idx = props.entries.findIndex((e) => e.blocked)
  return idx > 0 ? idx : -1
})
</script>

<template>
  <div class="surface-card flex flex-col overflow-hidden">
    <div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
      <span
        class="font-mono text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/70"
      >
        {{ t('summoningPlanner.rail.heading') }}
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
      <template v-for="(entry, index) in entries" :key="entry.id">
        <li
          v-if="index === blockedStart"
          class="px-2 pb-1 pt-2 font-mono text-3xs font-bold uppercase tracking-[0.12em] text-warning-strong/80"
        >
          {{ t('summoningPlanner.rail.blocked') }}
        </li>
        <li>
          <RightClickHint @contextmenu="emit('inspect', entry.id)">
            <button
              class="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition"
              :class="
                selectedId === entry.id
                  ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
                  : 'hover:bg-foreground/5'
              "
              @click="emit('select', entry.id)"
            >
              <span
                v-if="entry.step != null"
                class="grid size-5 shrink-0 place-items-center rounded-full border text-3xs font-bold tabular-nums"
                :class="
                  entry.step === 1
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground'
                "
                >{{ entry.step }}</span
              >
              <span class="relative size-9 shrink-0 overflow-hidden rounded-full bg-card">
                <img
                  v-if="entry.image"
                  :src="entry.image"
                  :alt="entry.name"
                  class="size-full object-cover"
                />
                <span
                  class="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full ring-2 ring-card"
                  :class="
                    entry.blocked
                      ? 'bg-warning'
                      : entry.readiness >= 100
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
                      T{{ entry.tier + 1 }}
                    </span>
                  </span>
                  <span
                    class="shrink-0 font-mono text-2xs font-bold"
                    :class="
                      entry.blocked
                        ? 'text-warning-strong'
                        : entry.readiness >= 100
                          ? 'text-success-strong'
                          : 'text-muted-foreground'
                    "
                    >{{ entry.readiness }}%</span
                  >
                </span>
                <span class="mt-1 block h-1 overflow-hidden rounded-full bg-muted/50">
                  <span
                    class="block h-full rounded-full transition-all"
                    :class="entry.blocked ? 'bg-warning/70' : 'bg-success/80'"
                    :style="{ width: `${entry.readiness}%` }"
                  />
                </span>
              </span>
            </button>
          </RightClickHint>
        </li>
      </template>

      <!-- Ghost placeholder: matches a creature row's volume so the rail keeps
           its shape when nothing is selected, and doubles as the add control. -->
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
          <span class="text-xs font-semibold">{{ t('summoningPlanner.rail.addRemove') }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
