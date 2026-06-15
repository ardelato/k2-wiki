<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import { formatDuration } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

interface QueuedItem {
  id: string
  name: string
  amount: number
}


interface QueuedStation {
  station: string
  items: QueuedItem[]
}


defineProps<{
  queuedStationCount: number
  queuedByStation: QueuedStation[]
  queuedTimes: Record<string, number>
  saveFileName: string
}>()


const { t } = useI18n()
</script>

<template>
  <div class="rounded-2xl border border-border bg-card/50 p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-2 text-left">
        <div>
          <h3 class="text-sm font-extrabold">{{ t('configs.sections.workstationQueues') }}</h3>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
          {{ t('configs.queued.items', { n: queuedStationCount }, queuedStationCount) }}
        </span>
      </div>
    </div>

    <div class="mt-3 space-y-2.5">
      <div v-if="queuedByStation.length > 0" class="space-y-2.5">
        <div
          v-for="group in queuedByStation"
          :key="group.station"
          class="bg-bg/40 rounded-xl border border-border/70 p-3"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <img
                v-if="sourceIcons[`crafting_${group.station.toLowerCase()}`]"
                :src="sourceIcons[`crafting_${group.station.toLowerCase()}`]"
                :alt="group.station"
                class="size-3.5 shrink-0 object-contain"
                loading="lazy"
              />
              <span class="text-[13px] font-extrabold">{{ group.station }}</span>
            </div>
            <div class="flex items-center gap-1.5 font-mono text-[10px]">
              <span
                v-if="queuedTimes[group.station]"
                class="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1 font-semibold leading-none text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <span
                  class="text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-amber-700/80 dark:text-amber-300/70"
                >
                  {{ t('configs.queued.eta') }}
                </span>
                <span class="leading-none">
                  {{ formatDuration(queuedTimes[group.station]) }}
                </span>
              </span>
              <span
                class="inline-flex items-center rounded-md bg-muted/50 px-2 py-1 font-medium leading-none text-muted-foreground"
              >
                {{ t('configs.queued.inQueue', { n: group.items.length }) }}
              </span>
            </div>
          </div>

          <div class="flex flex-wrap items-stretch gap-1.5">
            <div
              class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-2 ring-1 ring-accent/20"
            >
              <img
                v-if="getItemImage({ id: group.items[0].id })"
                :src="getItemImage({ id: group.items[0].id })"
                :alt="group.items[0].name"
                class="size-7 shrink-0 object-contain"
                loading="lazy"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1 text-[11px] font-extrabold">
                  <span class="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  <span class="truncate">{{ group.items[0].name }}</span>
                </div>
                <div class="font-mono text-[9px] text-muted-foreground">
                  ×{{ group.items[0].amount.toLocaleString() }}
                </div>
              </div>
            </div>

            <template v-if="group.items.length > 1">
              <div class="flex items-center text-muted-foreground/40">
                <ChevronRight class="size-3.5" />
              </div>
              <div
                v-for="item in group.items.slice(1)"
                :key="`q-${group.station}-${item.id}`"
                class="flex w-[120px] items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5"
              >
                <img
                  v-if="getItemImage({ id: item.id })"
                  :src="getItemImage({ id: item.id })"
                  :alt="item.name"
                  class="size-5 shrink-0 object-contain"
                  loading="lazy"
                />
                <span class="flex-1 truncate text-[10px] font-bold">{{ item.name }}</span>
                <span class="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
                  ×{{ item.amount }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <p
        v-else
        class="rounded-lg border border-dashed border-border/50 px-3 py-6 text-center text-xs text-muted-foreground"
      >
        {{ saveFileName ? t('configs.queued.noQueued') : t('configs.queued.noQueuedConfig') }}
      </p>
    </div>
  </div>
</template>
