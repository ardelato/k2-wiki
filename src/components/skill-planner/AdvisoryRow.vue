<script setup lang="ts">
import { Circle } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import AdvisoryDisclosureRow from '@/components/shared/AdvisoryDisclosureRow.vue'
import { advisoryPresentation } from '@/components/skill-planner/advisoryPresentation'
import AwakenPointSources from '@/components/skill-planner/AwakenPointSources.vue'
import SanctuaryPartyDiff from '@/components/skill-planner/SanctuaryPartyDiff.vue'
import type { SkillAdvisory } from '@/composables/useSkillPlanner'
import { formatDuration } from '@/utils/format/format'
import { sourceIcons } from '@/utils/format/icons'

/**
 * The Skill planner's "Ways to improve" row. Maps a `SkillAdvisory` onto the shared
 * `AdvisoryDisclosureRow`, supplying the type-specific expanded plan (sanctuary swap,
 * awaken funding, or the per-skill player-level checklist) via the slot. The parent
 * owns the single-open accordion state and passes `open`.
 */
const props = defineProps<{
  advisory: SkillAdvisory
  open: boolean
  /** Gathering job this advisory raises. When set (Summon "Ways to improve", which mixes
   * several skills), the headline names the job and shows its icon inline. */
  job?: string
}>()


defineEmits<{
  toggle: []
  inspect: [id: string]
}>()


const { t } = useI18n()
const route = useRoute()


const view = computed(() => advisoryPresentation(props.advisory, props.job))
const bonus = computed(() => (props.advisory.kind === 'bonus' ? props.advisory : null))
const playerLevel = computed(() => (props.advisory.kind === 'playerLevel' ? props.advisory : null))


// Stable id linking the disclosure button to its expanded region for a11y.
const bodyId = computed(
  () => `advisory-body-${props.advisory.kind === 'bonus' ? props.advisory.lever : 'playerLevel'}`,
)
</script>

<template>
  <AdvisoryDisclosureRow
    :icon-src="view.iconSrc"
    :glyph="view.glyph"
    :headline="view.headline"
    :job="job"
    :cost="view.cost"
    :benefit="view.benefit"
    :time-saved-seconds="advisory.timeSaved"
    :cta-label="view.ctaLabel"
    :cta-link="view.ctaLink"
    :accent="playerLevel ? 'violet' : undefined"
    :open="open"
    :body-id="bodyId"
    @toggle="$emit('toggle')"
  >
    <!-- Sanctuary: the roster swap (remove/add/keep + tier ripple). -->
    <template v-if="bonus && bonus.partyDiff">
      <SanctuaryPartyDiff :diff="bonus.partyDiff" @inspect="$emit('inspect', $event)" />
    </template>

    <!-- Awaken: the player's balance, or the creatures they'd awaken to earn a point. -->
    <template v-else-if="bonus && bonus.awakenSources">
      <AwakenPointSources
        :sources="bonus.awakenSources"
        :available="bonus.awakenPointsAvailable ?? 0"
        :cost="bonus.awakenPointCost ?? 1"
        @inspect="$emit('inspect', $event)"
      />
    </template>

    <!-- Player level: the per-skill checklist (each row links to that skill's planner). -->
    <template v-if="playerLevel">
      <p class="mb-1.5 text-xs font-medium text-muted-foreground">
        {{ t('skillPlanner.advisory.allRequired', { count: playerLevel.steps.length }) }}
      </p>
      <ul class="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60">
        <li
          v-for="step in playerLevel.steps"
          :key="step.skillId"
          class="flex items-center gap-2.5 px-3 py-2 text-xs"
        >
          <Circle class="size-3.5 shrink-0 text-muted-foreground/40" />
          <img
            v-if="sourceIcons[step.skillId]"
            :src="sourceIcons[step.skillId]"
            alt=""
            class="size-4 shrink-0"
            loading="lazy"
          />
          <RouterLink
            :to="{
              path: route.path,
              query: { tab: 'skills', skill: step.skillId.toLowerCase() },
            }"
            class="focus-ring font-medium text-foreground transition hover:text-primary"
          >
            {{ step.skillId }}
          </RouterLink>
          <span class="tabular-nums text-muted-foreground"
            >{{ step.fromLevel }}→{{ step.toLevel }}</span
          >
          <span class="ml-auto font-medium tabular-nums text-foreground">
            ~{{ formatDuration(step.timeSeconds) }}
          </span>
        </li>
      </ul>
    </template>
  </AdvisoryDisclosureRow>
</template>
