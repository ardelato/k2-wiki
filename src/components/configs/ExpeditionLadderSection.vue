<script setup lang="ts">
import { Info } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import type { Expedition } from '@/types'
import { itemName } from '@/utils/format/format'
import { expeditionTierIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'
import { TIER_UNLOCK_REQUIREMENTS } from '@/utils/planner/expeditionUnlocks'

interface ExpeditionLadderRow {
  id: string
  name: string
  rewardItemId: string | undefined
  requiredExpeditionCompletions: number
  tiers: { tier: number; cleared: boolean; unlocked: boolean; completions: number }[]
  maxTier: number
  nextTier: number
  pct: number
  have: number
  need: number
  remaining: number
  runs: number
  locked: boolean
  maxed: boolean
}


interface NextExpFrontier {
  name: string
  rewardItemId: string | undefined
  have: number
  need: number
  remaining: number
  pct: number
}


interface TierUpFrontier {
  name: string
  rewardItemId: string | undefined
  fromTier: number
  toTier: number
  have: number
  need: number
  remaining: number
  pct: number
}


interface ExpeditionDisplay {
  unlockedCount: number
  totalTiersUnlocked: number
}


defineProps<{
  allExpeditions: Expedition[]
  expeditionDisplay: ExpeditionDisplay
  expeditionFrontiers: { nextExp: NextExpFrontier | null; tierUps: TierUpFrontier[] }
  expeditionLadderColumns: ExpeditionLadderRow[][]
}>()


const { t } = useI18n()
</script>

<template>
  <div class="rounded-xl border border-border bg-card/50 p-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="flex items-center gap-1.5">
          <h3 class="text-sm font-bold">{{ t('configs.zones.expeditions') }}</h3>
          <AppTooltip :text="t('configs.expeditionsCard.tooltip')">
            <Info class="size-3.5 text-muted-foreground/70 hover:text-foreground" />
          </AppTooltip>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
            {{
              t('configs.expeditions.unlocked', {
                count: expeditionDisplay.unlockedCount,
                total: allExpeditions.length,
              })
            }}
          </span>
          <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
            {{
              t('configs.expeditions.tiers', {
                count: expeditionDisplay.totalTiersUnlocked,
                total: allExpeditions.length * 5,
              })
            }}
          </span>
        </div>
      </div>
    </div>

    <div class="mt-3 space-y-3">
      <!-- Up Next frontier cards -->
      <div
        v-if="expeditionFrontiers.nextExp || expeditionFrontiers.tierUps.length"
        class="space-y-2"
      >
        <div class="text-3xs font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
          {{ t('configs.expeditionsCard.upNext') }}
        </div>
        <div class="grid gap-2 md:grid-cols-3">
          <div
            v-if="expeditionFrontiers.nextExp"
            class="overflow-hidden rounded-xl border border-accent/35 bg-card/60 p-3.5"
          >
            <div class="flex items-stretch gap-3">
              <div
                class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-warning/10"
              >
                <img
                  v-if="
                    expeditionFrontiers.nextExp.rewardItemId &&
                    getItemImage({ id: expeditionFrontiers.nextExp.rewardItemId })
                  "
                  :src="getItemImage({ id: expeditionFrontiers.nextExp.rewardItemId })"
                  :alt="expeditionFrontiers.nextExp.rewardItemId"
                  class="size-9 object-contain"
                  loading="lazy"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="mb-2 flex items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                    {{ expeditionFrontiers.nextExp.name }}
                  </span>
                  <span
                    class="ml-auto shrink-0 text-3xs font-bold uppercase tracking-[0.18em] text-warning-strong"
                  >
                    {{ t('configs.expeditionsCard.next') }}
                  </span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
                  <div
                    class="h-full rounded-full bg-warning transition-all"
                    :style="{ width: `${expeditionFrontiers.nextExp.pct}%` }"
                  />
                </div>
                <div class="mt-1.5 flex items-baseline justify-between gap-2">
                  <span class="font-mono text-xs font-semibold">
                    <span class="text-3xs font-normal text-muted-foreground/50"
                      >{{ t('configs.expeditionsCard.have') }}
                    </span>
                    <span class="text-foreground">{{ expeditionFrontiers.nextExp.have }}</span>
                    <span class="text-muted-foreground/50">
                      / {{ expeditionFrontiers.nextExp.need }}
                    </span>
                    <span class="text-3xs font-normal text-muted-foreground/50">
                      {{ t('configs.expeditionsCard.total') }}
                    </span>
                  </span>
                  <span class="font-mono text-xs font-semibold text-warning-strong">
                    <span class="text-3xs font-normal text-warning-strong/70"
                      >{{ t('configs.expeditionsCard.need') }}
                    </span>
                    {{ expeditionFrontiers.nextExp.remaining }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-for="f in expeditionFrontiers.tierUps"
            :key="f.name"
            class="overflow-hidden rounded-xl border border-border bg-card/60 p-3.5"
          >
            <div class="flex items-stretch gap-3">
              <div
                class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-warning/10"
              >
                <img
                  v-if="f.rewardItemId && getItemImage({ id: f.rewardItemId })"
                  :src="getItemImage({ id: f.rewardItemId })"
                  :alt="f.rewardItemId"
                  class="size-9 object-contain"
                  loading="lazy"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="mb-2 flex items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-semibold text-foreground">
                    {{ f.name }}
                  </span>
                  <span
                    class="ml-auto flex shrink-0 items-center gap-1 font-mono text-3xs font-bold uppercase tracking-[0.18em] text-warning-strong"
                  >
                    <img
                      :src="expeditionTierIcons[f.fromTier]"
                      :alt="`Tier ${f.fromTier}`"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                    <span>→</span>
                    <img
                      :src="expeditionTierIcons[f.toTier]"
                      :alt="`Tier ${f.toTier}`"
                      class="size-3.5 object-contain"
                      loading="lazy"
                    />
                  </span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-border/30">
                  <div
                    class="h-full rounded-full bg-warning transition-all"
                    :style="{ width: `${f.pct}%` }"
                  />
                </div>
                <div class="mt-1.5 flex items-baseline justify-between gap-2">
                  <span class="font-mono text-xs font-semibold">
                    <span class="text-3xs font-normal text-muted-foreground/50"
                      >{{ t('configs.expeditionsCard.have') }}
                    </span>
                    <span class="text-foreground">{{ f.have }}</span>
                    <span class="text-muted-foreground/50"> / {{ f.need }} </span>
                    <span class="text-3xs font-normal text-muted-foreground/50">
                      {{ t('configs.expeditionsCard.loops') }}</span
                    >
                  </span>
                  <span class="font-mono text-xs font-semibold text-warning-strong">
                    <span class="text-3xs font-normal text-warning-strong/70"
                      >{{ t('configs.expeditionsCard.need') }}
                    </span>
                    {{ f.remaining }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Compact 2-col ladder -->
      <div class="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2">
        <div v-for="(col, ci) in expeditionLadderColumns" :key="ci" class="space-y-0.5">
          <div class="grid grid-cols-[1fr_auto_auto_auto] items-end gap-3 px-2 pb-0.5">
            <span />
            <div class="flex gap-0.5">
              <span class="w-4 text-center font-mono text-3xs text-muted-foreground/60" />
              <span
                v-for="t in [2, 3, 4, 5]"
                :key="t"
                class="w-4 text-center font-mono text-3xs text-muted-foreground/60"
              >
                {{ TIER_UNLOCK_REQUIREMENTS[t] }}
              </span>
            </div>
            <span class="w-[92px]" />
            <span class="w-16" />
          </div>
          <div
            v-for="row in col"
            :key="row.id"
            class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md px-2 py-1.5"
            :class="row.locked ? 'opacity-40' : ''"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <img
                v-if="row.rewardItemId && getItemImage({ id: row.rewardItemId })"
                :src="getItemImage({ id: row.rewardItemId })"
                :alt="itemName(row.rewardItemId)"
                class="size-4 shrink-0 object-contain"
                loading="lazy"
              />
              <span
                class="truncate text-xs font-semibold"
                :class="row.locked ? 'italic text-muted-foreground' : ''"
              >
                {{ row.name }}
                <span
                  v-if="row.requiredExpeditionCompletions > 0"
                  class="ml-0.5 font-mono text-3xs font-normal text-muted-foreground/70"
                >
                  ({{ row.requiredExpeditionCompletions }})
                </span>
              </span>
            </div>
            <div class="flex gap-0.5">
              <img
                v-for="t in row.tiers"
                :key="t.tier"
                :src="expeditionTierIcons[t.tier]"
                :alt="`Tier ${t.tier}`"
                class="size-4 object-contain"
                :class="t.cleared ? '' : t.unlocked ? 'opacity-70' : 'opacity-30 grayscale'"
                loading="lazy"
              />
            </div>
            <span
              class="flex w-[92px] items-center justify-end gap-1 font-mono text-3xs font-bold"
              :class="
                row.maxed
                  ? 'text-pink-400'
                  : row.locked
                    ? 'text-muted-foreground/40'
                    : 'text-muted-foreground'
              "
            >
              <template v-if="row.locked">{{ t('configs.ladder.locked') }}</template>
              <template v-else-if="row.maxed">
                <img
                  :src="expeditionTierIcons[5]"
                  alt="Tier 5"
                  class="size-3.5 object-contain"
                  loading="lazy"
                />
                <span>{{ t('configs.ladder.maxed') }}</span>
              </template>
              <template v-else>
                <img
                  :src="expeditionTierIcons[row.maxTier]"
                  :alt="`Tier ${row.maxTier}`"
                  class="size-3.5 object-contain"
                  loading="lazy"
                />
                <span>{{ row.have }}/{{ row.need }}</span>
                <span>→</span>
                <img
                  :src="expeditionTierIcons[row.nextTier]"
                  :alt="`Tier ${row.nextTier}`"
                  class="size-3.5 object-contain"
                  loading="lazy"
                />
              </template>
            </span>
            <span class="w-16 text-right font-mono text-3xs tabular-nums text-muted-foreground/70">
              <template v-if="row.runs > 0">{{
                t('configs.ladder.runs', { n: row.runs }, row.runs)
              }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
