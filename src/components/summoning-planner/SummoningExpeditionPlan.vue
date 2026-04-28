<script setup lang="ts">
import { Compass } from 'lucide-vue-next'

import CreatureDetail from '@/components/beastiary/CreatureDetail.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureDrawer } from '@/composables/useCreatureDrawer'
import type { Expedition } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import type { ExpeditionPlan } from '@/utils/expeditionOptimizer'
import { formatDuration, toTitleCase } from '@/utils/format'
import { expeditionTierIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'

defineProps<{
  plans: { expedition: Expedition; plan: ExpeditionPlan }[]
  bestPlan: ExpeditionPlan
}>()


const { selectedCreature, drawerOpen, toggleCreature, closeDrawer } = useCreatureDrawer()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <Compass class="size-3.5 text-primary" />
      <span class="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
        Expedition Sources
      </span>
    </div>

    <div class="space-y-2">
      <div
        v-for="{ expedition, plan } in plans"
        :key="expedition.id"
        class="rounded-lg border px-4 py-3"
        :class="
          plan.expedition.id === bestPlan.expedition.id
            ? 'border-primary bg-primary/10'
            : 'border-border/55 bg-card/50'
        "
      >
        <!-- Row 1: Total time + Fastest badge + Name | Tier -->
        <div class="flex items-center gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              class="font-mono text-sm font-bold"
              :class="
                plan.expedition.id === bestPlan.expedition.id ? 'text-primary' : 'text-foreground'
              "
            >
              {{ formatDuration(plan.totalTime) }}
            </span>
            <span
              v-if="plan.expedition.id === bestPlan.expedition.id"
              class="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary"
            >
              Fastest
            </span>
            <span class="text-muted-foreground">·</span>
            <img
              v-if="
                expedition.rewards.length > 0 && getItemImage({ id: expedition.rewards[0].itemId })
              "
              :src="getItemImage({ id: expedition.rewards[0].itemId })"
              :alt="expedition.rewards[0].itemId"
              class="size-5 shrink-0 object-contain"
            />
            <p class="truncate text-sm font-semibold text-foreground">{{ expedition.name }}</p>
          </div>
          <img
            :src="expeditionTierIcons[plan.tier]"
            :alt="`Tier ${plan.tier}`"
            class="size-4 shrink-0 object-contain"
          />
        </div>

        <!-- Row 2: Runs × Duration/run | Loot details -->
        <div class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="font-mono">{{ plan.runsNeeded }} runs</span>
          <span>×</span>
          <span class="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
            {{ formatDuration(plan.durationPerRun) }}/run
          </span>
          <div class="ml-auto flex items-center gap-2">
            <span class="font-mono">x{{ plan.lootPerRun }}/run</span>
          </div>
        </div>

        <!-- Row 3: Party + Biome/Trait -->
        <div class="my-2 border-t border-border/40" />

        <div class="flex items-center gap-1.5">
          <div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
            <RightClickHint
              v-for="member in plan.party"
              :key="member.creature.id"
              @contextmenu="toggleCreature(member.creature)"
            >
              <div
                class="inline-flex cursor-default items-center gap-1.5 rounded-lg border border-border bg-muted/35 py-0.5 pl-0.5 pr-2"
              >
                <div class="size-5 overflow-hidden rounded-md bg-card">
                  <img
                    v-if="getCreatureImage(member.creature)"
                    :src="getCreatureImage(member.creature)"
                    :alt="member.creature.name"
                    class="size-full object-cover"
                  />
                </div>
                <span class="text-[10px] font-semibold text-foreground">{{
                  member.creature.name
                }}</span>
              </div>
            </RightClickHint>
          </div>
          <div class="shrink-0 text-right text-[10px] text-muted-foreground">
            <span>{{ toTitleCase(expedition.biome) }}</span>
            <span v-if="expedition.trait"> · {{ toTitleCase(expedition.trait) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <CreatureDetail :creature="selectedCreature" :open="drawerOpen" @close="closeDrawer" />
</template>
