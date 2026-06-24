<script setup lang="ts">
import { Info } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { PLANNER_TERMS, type TermKey } from '../../utils/planner/plannerGlossary'
import AppTooltip from './AppTooltip.vue'

const { t } = useI18n()


const props = defineProps<{
  /** A glossary term key — looks up its label + short definition. */
  term?: TermKey
  /** Freeform tooltip text, used when no `term` is given. */
  text?: string
  /** Tooltip placement; forwarded to AppTooltip. */
  position?: 'top' | 'right' | 'bottom' | 'left'
}>()


const entry = computed(() => (props.term ? PLANNER_TERMS[props.term] : null))
</script>

<template>
  <AppTooltip :text="text" :position="position ?? 'top'">
    <button
      type="button"
      class="focus-ring inline-flex shrink-0 cursor-help items-center align-middle text-muted-foreground/70 transition hover:text-foreground"
      :aria-label="
        entry ? t('shared.infoHint.whatIs', { term: entry.term }) : t('shared.infoHint.moreInfo')
      "
    >
      <Info class="size-3.5" />
    </button>
    <template v-if="entry" #content>
      <span class="block font-semibold text-foreground">{{ entry.term }}</span>
      <span class="mt-0.5 block font-normal text-muted-foreground">{{ entry.short }}</span>
    </template>
  </AppTooltip>
</template>
