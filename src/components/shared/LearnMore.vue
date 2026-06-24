<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { PLANNER_TERMS, type GlossaryTerm, type TermKey } from '../../utils/planner/plannerGlossary'

const { t } = useI18n()


const props = defineProps<{
  /** Disclosure label. */
  label?: string
  /** Optional glossary term — renders its `long` (or `short`) text when expanded. */
  term?: TermKey
}>()


const open = ref(false)


const termText = computed(() => {
  if (!props.term) return null
  const entry: GlossaryTerm = PLANNER_TERMS[props.term]
  return entry.long ?? entry.short
})
</script>

<template>
  <div>
    <button
      type="button"
      class="focus-ring inline-flex items-center gap-0.5 rounded text-xs font-semibold text-primary transition hover:text-primary/80"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ label ?? t('shared.learnMore.label') }}
      <ChevronDown class="size-3.5 transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <div
      v-if="open"
      class="mt-3 space-y-2 border-t border-border/40 pt-3 text-sm leading-relaxed text-muted-foreground"
    >
      <slot>
        <p v-if="termText">{{ termText }}</p>
      </slot>
    </div>
  </div>
</template>
