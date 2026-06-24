<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AwakenSummonChip from '@/components/skill-planner/AwakenSummonChip.vue'
import CreatureDiffTile from '@/components/skill-planner/CreatureDiffTile.vue'
import type { AwakenPointSources } from '@/composables/useSkillPlanner'

/**
 * Mini awaken-planner shown under an awaken node's "Requires 1 Awaken Point" line.
 * If you already hold enough unspent points, it just nudges you to allocate one;
 * otherwise it surfaces the cheapest way to *earn* a point as a prioritized cascade:
 *   1. a creature you already own but haven't awakened,
 *   2. otherwise the closest creature to summon then awaken.
 */
defineProps<{
  sources: AwakenPointSources
  /** Unspent Awaken Points the player is holding. */
  available: number
  /** Points this node costs. */
  cost: number
}>()


defineEmits<{
  inspect: [id: string]
}>()


const { t } = useI18n()
</script>

<template>
  <!-- Already banked enough points: no need to earn one, just allocate it. -->
  <p v-if="available >= cost" class="mt-2 text-xs text-muted-foreground">
    <i18n-t keypath="skillPlanner.awakenSources.banked" tag="span" scope="global">
      <template #count>
        <span class="font-medium text-success-strong">{{ available }}</span>
      </template>
      <template #points>{{ available > 1 ? 'Awaken Points' : 'Awaken Point' }}</template>
    </i18n-t>
  </p>

  <div v-else-if="sources.owned.length || sources.summon.length" class="mt-2 space-y-1.5">
    <!-- Tier 1: awaken one you already own -->
    <template v-if="sources.owned.length">
      <p class="text-xs text-muted-foreground">
        {{ t('skillPlanner.awakenSources.awakenOwned', { point: 'Awaken Point' }) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <!-- Same square tile the Sanctuary roster diff uses, with a ready/level badge
             below (matches PartyCreatureTile). Inspect the tile to open the drawer. -->
        <div
          v-for="c in sources.owned"
          :key="c.id"
          class="flex flex-col items-center gap-1"
          :title="
            c.ready
              ? t('skillPlanner.awakenSources.readyTitle')
              : t('skillPlanner.awakenSources.levelFirstTitle')
          "
        >
          <CreatureDiffTile
            :id="c.id"
            :name="c.name"
            :contribution="c.contribution"
            variant="neutral"
            @inspect="$emit('inspect', $event)"
          />
          <span
            class="rounded-full px-1.5 py-0.5 text-3xs font-semibold tabular-nums"
            :class="
              c.ready ? 'bg-success/10 text-success-strong' : 'bg-warning/10 text-warning-strong'
            "
          >
            {{ c.ready ? 'LVL 70 ✓' : `LVL ${c.level}/70` }}
          </span>
        </div>
      </div>
    </template>

    <!-- Tier 2: summon then awaken (only when nothing owned to awaken) -->
    <template v-else-if="sources.summon.length">
      <p class="text-xs text-muted-foreground">
        {{ t('skillPlanner.awakenSources.summonThenAwaken', { point: 'Awaken Point' }) }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <AwakenSummonChip
          v-for="c in sources.summon"
          :key="c.id"
          :candidate="c"
          @inspect="$emit('inspect', $event)"
        />
      </div>
    </template>
  </div>
</template>
