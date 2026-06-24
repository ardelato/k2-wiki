<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Badge from '@/components/shared/Badge.vue'
import FloatingPanel from '@/components/shared/FloatingPanel.vue'
import { usePopover } from '@/composables/core/usePopover'
import type { AwakenSummonCandidate } from '@/composables/useSkillPlanner'
import { formatNumber } from '@/utils/format/format'
import { getCreatureImage } from '@/utils/images/creatureImages'
import { getItemImage } from '@/utils/images/itemImages'

/**
 * A "summon then awaken" suggestion chip with a hover popover that breaks down the
 * materials you're still short on (and the skill gate, if any) — mirroring the
 * summoning cost card. Inspect opens the creature drawer.
 */
defineProps<{
  candidate: AwakenSummonCandidate
}>()


defineEmits<{
  inspect: [id: string]
}>()


const { t } = useI18n()


const pop = usePopover({ width: 240, gap: 8, hAlign: 'left' })


function onEnter(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  pop.open(target)
}


function onLeave() {
  pop.close()
}


const fmt = (n: number) => formatNumber(n)
</script>

<template>
  <Badge
    :variant="candidate.affordable ? 'success' : candidate.reachable ? 'warning' : 'danger'"
    :pill="false"
    size="xs"
    class="cursor-default"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @contextmenu.prevent="$emit('inspect', candidate.id)"
  >
    <div class="size-5 shrink-0 overflow-hidden rounded-md bg-card">
      <img
        v-if="getCreatureImage({ id: candidate.id, image: '' })"
        :src="getCreatureImage({ id: candidate.id, image: '' })"
        :alt="candidate.name"
        class="size-full object-cover"
        loading="lazy"
      />
    </div>
    <span class="font-semibold text-foreground">{{ candidate.name }}</span>
    <span class="font-medium tabular-nums">
      {{
        candidate.affordable
          ? t('skillPlanner.summonChip.canSummon')
          : candidate.reachable
            ? t('skillPlanner.summonChip.matsShort', { count: candidate.missingTypes })
            : t('skillPlanner.summonChip.needsSkill', {
                skill: candidate.blockSkill,
                level: candidate.blockLevel,
              })
      }}
    </span>
  </Badge>

  <FloatingPanel
    :is-open="pop.isOpen"
    :el-ref="pop.setPanelEl"
    :style="pop.style"
    class="pointer-events-none z-50 w-60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/30"
  >
    <!-- Header: creature name + tier -->
    <div class="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
      <div class="size-7 shrink-0 overflow-hidden rounded-lg bg-muted/40">
        <img
          v-if="getCreatureImage({ id: candidate.id, image: '' })"
          :src="getCreatureImage({ id: candidate.id, image: '' })"
          :alt="candidate.name"
          class="size-full object-cover"
          loading="lazy"
        />
      </div>
      <div class="min-w-0">
        <span class="block text-sm font-bold leading-tight text-foreground">
          {{ candidate.name }}
        </span>
        <span class="block text-2xs leading-tight text-muted-foreground">
          {{ t('skillPlanner.summonChip.tierSummonThenAwaken', { tier: candidate.tier + 1 }) }}
        </span>
      </div>
    </div>

    <div class="mx-3.5 border-t border-border/40" />

    <!-- Missing materials -->
    <div v-if="candidate.missing.length" class="flex flex-col gap-1 px-3.5 pb-2.5 pt-2">
      <p class="mb-0.5 text-2xs font-medium text-muted-foreground">
        {{ t('skillPlanner.summonChip.stillNeed') }}
      </p>
      <div v-for="m in candidate.missing" :key="m.id" class="flex items-center gap-1.5">
        <img
          v-if="getItemImage({ id: m.id })"
          :src="getItemImage({ id: m.id })"
          :alt="m.name"
          class="size-4 shrink-0 object-contain"
          loading="lazy"
        />
        <span class="min-w-0 flex-1 truncate text-xs text-foreground/90">{{ m.name }}</span>
        <span class="shrink-0 text-xs font-semibold tabular-nums text-warning-strong">
          {{ fmt(m.short) }}
        </span>
      </div>
    </div>
    <div v-else class="px-3.5 pb-2.5 pt-2">
      <p class="text-xs font-medium text-success-strong">
        {{ t('skillPlanner.summonChip.allInInventory') }}
      </p>
    </div>

    <!-- Skill gate, when blocked -->
    <div
      v-if="!candidate.reachable"
      class="mx-3.5 mb-2.5 rounded-md bg-danger/10 px-2 py-1 text-2xs font-medium text-danger-strong"
    >
      {{
        t('skillPlanner.summonChip.blockedNeeds', {
          skill: candidate.blockSkill,
          level: candidate.blockLevel,
        })
      }}
    </div>

    <div class="border-t border-border/40 px-3.5 py-1.5">
      <span class="text-3xs text-muted-foreground">{{ t('skillPlanner.summonChip.inspect') }}</span>
    </div>
  </FloatingPanel>
</template>
