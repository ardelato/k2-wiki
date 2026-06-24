<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AdvisoryDisclosureRow from '@/components/shared/AdvisoryDisclosureRow.vue'
import AwakenPointSources from '@/components/skill-planner/AwakenPointSources.vue'
import SanctuaryPartyDiff from '@/components/skill-planner/SanctuaryPartyDiff.vue'
import { sanctuaryIcon, upgradesIcon } from '@/utils/format/icons'
import type { GatherAdvisory } from '@/utils/planner/gatherAdvisories'

/**
 * The Summon "Ways to improve" list: one disclosure row per gather advisory (raise a
 * Sanctuary tier / buy an awaken node to speed up this creature's still-needed gathers).
 * Maps each `GatherAdvisory` onto the shared `AdvisoryDisclosureRow`. Shared by the
 * Action plan and the Plan view's focus pane. Single-open accordion, self-contained.
 */
defineProps<{
  advisories: GatherAdvisory[]
}>()


defineEmits<{
  inspect: [id: string]
}>()


const { t } = useI18n()


const openKey = ref<string | null>(null)
function advisoryKey(a: GatherAdvisory): string {
  return `${a.job}:${a.lever}`
}
function toggle(a: GatherAdvisory): void {
  const key = advisoryKey(a)
  openKey.value = openKey.value === key ? null : key
}
function advisoryLink(a: GatherAdvisory) {
  return a.routeName === 'sanctuary'
    ? { name: 'sanctuary', query: { job: a.partyDiff?.target.job, target: a.partyDiff?.target.to } }
    : { name: 'awaken', query: { tree: a.awakenTreeId, node: a.awakenNodeId } }
}
function costLine(a: GatherAdvisory): string | undefined {
  if (!a.awakenPointCost) return undefined
  return t(
    'summoningPlanner.gatherAdvisory.awakenPointCost',
    { n: a.awakenPointCost },
    a.awakenPointCost,
  )
}
</script>

<template>
  <ul
    class="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40"
  >
    <li v-for="a in advisories" :key="advisoryKey(a)">
      <AdvisoryDisclosureRow
        :icon-src="a.lever === 'sanctuary' ? sanctuaryIcon : upgradesIcon"
        :headline="a.headline"
        :job="a.job"
        :cost="costLine(a)"
        :benefit="a.detail"
        :time-saved-seconds="a.timeSavedSeconds"
        :for-items="a.forItems"
        :cta-label="
          t('summoningPlanner.gatherAdvisory.openIn', {
            feature: a.lever === 'sanctuary' ? 'Sanctuary' : 'Awaken Tree',
          })
        "
        :cta-link="advisoryLink(a)"
        :open="openKey === advisoryKey(a)"
        @toggle="toggle(a)"
      >
        <SanctuaryPartyDiff
          v-if="a.lever === 'sanctuary' && a.partyDiff"
          :diff="a.partyDiff"
          @inspect="$emit('inspect', $event)"
        />
        <!-- Awaken levers cost a point: surface the player's balance, or the owned
             creatures they'd awaken to earn one (inspect a chip). -->
        <AwakenPointSources
          v-else-if="a.awakenSources"
          :sources="a.awakenSources"
          :available="a.awakenPointsAvailable ?? 0"
          :cost="a.awakenPointCost ?? 1"
          @inspect="$emit('inspect', $event)"
        />
      </AdvisoryDisclosureRow>
    </li>
  </ul>
</template>
