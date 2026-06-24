<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import RightClickHint from '@/components/shared/RightClickHint.vue'
import { useCreatureStatus } from '@/composables/useCreatureStatus'
import {
  sanctuaryIcon,
  helpersIcon,
  machinesIcon,
  expeditionsIcon,
  dungeonsIcon,
} from '@/utils/format/icons'
import { getCreatureImage } from '@/utils/images/creatureImages'

/**
 * A creature tile for the sanctuary roster diff (remove / add / keep) — the square
 * image-with-name-overlay tile used elsewhere in the planner (cf. PartyCreatureTile),
 * tinted by variant. An *incoming* (Add) creature that's busy/excluded gets an amber
 * ring + its "currently doing" assignment icon (same icon + tooltip as the Sanctuary
 * page / creature drawer). Remove/Keep are already in the sanctuary, so never flagged.
 * Inspect to open the creature drawer. Job levels are intentionally not shown.
 */
const props = defineProps<{
  id: string
  name: string
  /** Passed by the diff but intentionally not rendered — the tile shows no job levels. */
  contribution: number
  variant: 'remove' | 'add' | 'keep' | 'neutral'
}>()


defineEmits<{
  inspect: [id: string]
}>()


const VARIANT = {
  remove: 'border-rose-500/40',
  add: 'border-success/40',
  keep: 'border-border',
  neutral: 'border-border',
} as const


const ROLE_BADGE = {
  sanctuary: { icon: sanctuaryIcon, label: 'Sanctuary' },
  helper: { icon: helpersIcon, label: 'Helper' },
  machine: { icon: machinesIcon, label: 'Machine' },
  expedition: { icon: expeditionsIcon, label: 'Expedition' },
  dungeon: { icon: dungeonsIcon, label: 'Dungeon' },
} as const


const { t } = useI18n()
const { statusOf } = useCreatureStatus()


const status = computed(() => statusOf(props.id))


/** Only incoming (Add) creatures are flagged — Remove/Keep are already slotted. */
const flagged = computed(
  () => props.variant === 'add' && (status.value.role !== null || status.value.excluded),
)


/** The "currently doing" assignment badge (icon + label), when the creature is busy. */
const assignment = computed(() =>
  props.variant === 'add' && status.value.role ? ROLE_BADGE[status.value.role] : null,
)
</script>

<template>
  <RightClickHint @contextmenu="$emit('inspect', id)">
    <!-- Wrapper isn't clipped, so the assignment badge can sit on the bottom-right
         corner exactly like the Sanctuary page and the creature drawer. -->
    <div class="relative inline-flex">
      <div
        class="relative size-14 shrink-0 cursor-default overflow-hidden rounded-lg border bg-card/50"
        :class="[VARIANT[variant], flagged ? 'ring-1 ring-warning/70' : '']"
        :title="name"
      >
        <img
          v-if="getCreatureImage({ id, image: '' })"
          :src="getCreatureImage({ id, image: '' })"
          :alt="name"
          class="size-full object-cover"
          loading="lazy"
        />
        <div class="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
          <p class="truncate text-center text-3xs font-semibold text-white">{{ name }}</p>
        </div>
      </div>
      <span v-if="assignment" class="absolute -left-1 -top-1 z-10">
        <AppTooltip
          :text="t('beastiary.detail.assignedTo', { label: assignment.label })"
          position="top"
        >
          <img
            :src="assignment.icon"
            :alt="assignment.label"
            class="size-5 rounded-full border border-background bg-background"
            loading="lazy"
          />
        </AppTooltip>
      </span>
    </div>
  </RightClickHint>
</template>
