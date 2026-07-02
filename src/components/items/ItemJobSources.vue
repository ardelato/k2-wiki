<script setup lang="ts">
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ContainerSource, ItemType, JobActivitySource } from '@/types'
import { formatChance } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

interface JobSourceGroup {
  jobId: string
  sources: JobActivitySource[]
  count: number
  levelRange: [number, number]
  chanceRange: [number, number]
}


defineProps<{
  itemType: ItemType
  groupedJobSources: JobSourceGroup[]
  containerSources: ContainerSource[]
}>()


const emit = defineEmits<{
  'select-item': [id: string]
}>()


const { t } = useI18n()


const expandedJobs = ref<Set<string>>(new Set())


function toggleJobGroup(jobId: string) {
  if (expandedJobs.value.has(jobId)) expandedJobs.value.delete(jobId)
  else expandedJobs.value.add(jobId)
}


const jobColorMap: Record<string, string> = {
  Chopping: 'var(--color-job-chopping)',
  Mining: 'var(--color-job-mining)',
  Digging: 'var(--color-job-digging)',
  Exploring: 'var(--color-job-exploring)',
  Fishing: 'var(--color-job-fishing)',
  Farming: 'var(--color-job-farming)',
}
</script>

<template>
  <section class="detail-section">
    <h3 class="section-title mb-3">
      {{ t('items.detail.obtainedFrom') }}
    </h3>
    <div class="space-y-2">
      <!-- Job activity sources -->
      <template v-for="group in groupedJobSources" :key="group.jobId">
        <!-- Single source: render flat (no collapse) -->
        <div
          v-if="group.count === 1"
          class="-mx-1 flex items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
        >
          <img
            v-if="sourceIcons[group.jobId]"
            :src="sourceIcons[group.jobId]"
            alt=""
            class="size-4 shrink-0"
            loading="lazy"
          />
          <span
            v-else
            class="size-1.5 shrink-0 rounded-full"
            :style="{ backgroundColor: jobColorMap[group.jobId] ?? 'var(--color-text-muted)' }"
          />
          <div class="min-w-0 flex-1">
            <span class="text-sm font-semibold" :style="{ color: jobColorMap[group.jobId] }">{{
              group.jobId
            }}</span>
            <span v-if="itemType !== 'Container'" class="text-sm text-muted-foreground">
              &middot; {{ group.sources[0].activityName }}</span
            >
          </div>
          <span
            v-if="itemType !== 'Container'"
            class="shrink-0 font-mono text-sm"
            style="color: var(--color-primary)"
            >{{ t('items.detail.levelShort') }}{{ group.sources[0].levelRequirement }}</span
          >
          <span
            v-if="itemType !== 'Container'"
            class="shrink-0 font-mono text-sm"
            style="color: var(--color-green)"
            >{{ formatChance(group.sources[0].chance) }}</span
          >
        </div>

        <!-- Multiple sources: collapsible group -->
        <template v-else>
          <div
            class="-mx-1 flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
            @click="toggleJobGroup(group.jobId)"
          >
            <img
              v-if="sourceIcons[group.jobId]"
              :src="sourceIcons[group.jobId]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span
              v-else
              class="size-1.5 shrink-0 rounded-full"
              :style="{
                backgroundColor: jobColorMap[group.jobId] ?? 'var(--color-text-muted)',
              }"
            />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-semibold" :style="{ color: jobColorMap[group.jobId] }">{{
                group.jobId
              }}</span>
              <span class="text-sm text-muted-foreground">
                &middot; {{ t('items.detail.variants', { count: group.count }) }}</span
              >
            </div>
            <span class="shrink-0 font-mono text-sm" style="color: var(--color-primary)">
              {{ t('items.detail.levelShort') }}{{ group.levelRange[0]
              }}{{ group.levelRange[0] !== group.levelRange[1] ? `–${group.levelRange[1]}` : '' }}
            </span>
            <span class="shrink-0 font-mono text-sm" style="color: var(--color-green)">
              {{ formatChance(group.chanceRange[0])
              }}{{
                group.chanceRange[0] !== group.chanceRange[1]
                  ? `–${formatChance(group.chanceRange[1])}`
                  : ''
              }}
            </span>
            <component
              :is="expandedJobs.has(group.jobId) ? ChevronDown : ChevronRight"
              class="size-4 shrink-0 text-muted-foreground"
            />
          </div>

          <!-- Expanded children -->
          <template v-if="expandedJobs.has(group.jobId)">
            <div
              v-for="(js, idx) in group.sources"
              :key="`${group.jobId}-${idx}`"
              class="-mx-1 flex items-center gap-3 rounded-lg py-1 pl-8 pr-3 transition hover:bg-muted/20"
            >
              <div class="min-w-0 flex-1">
                <span class="text-sm text-muted-foreground">{{ js.activityName }}</span>
              </div>
              <span class="shrink-0 font-mono text-sm" style="color: var(--color-primary)"
                >{{ t('items.detail.levelShort') }}{{ js.levelRequirement }}</span
              >
              <span class="shrink-0 font-mono text-sm" style="color: var(--color-green)">{{
                formatChance(js.chance)
              }}</span>
            </div>
          </template>
        </template>
      </template>

      <!-- Container sources -->
      <div
        v-for="(cs, idx) in containerSources"
        :key="`container-${idx}`"
        class="-mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-muted/20"
        @click="emit('select-item', cs.containerId)"
      >
        <img
          v-if="getItemImage({ id: cs.containerId })"
          :src="getItemImage({ id: cs.containerId })"
          :alt="cs.containerName"
          class="size-5 shrink-0 object-contain"
          loading="lazy"
        />
        <span
          v-else
          class="size-1.5 shrink-0 rounded-full"
          style="background-color: var(--color-item-container)"
        />
        <span class="flex-1 text-sm font-semibold text-foreground">{{ cs.containerName }}</span>
        <span class="font-mono text-sm" style="color: var(--color-yellow)">x{{ cs.amount }}</span>
        <span class="font-mono text-sm" style="color: var(--color-green)">{{
          formatChance(cs.chance)
        }}</span>
      </div>
    </div>
  </section>
</template>
