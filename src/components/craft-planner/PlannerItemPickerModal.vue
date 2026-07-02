<script setup lang="ts">
/**
 * Modal item picker for the Craft (Single item) planner, mirroring SummonCreaturePicker.
 * Opened from the selection bar / empty state, it offers a search box, item-type filter
 * chips, and a scrollable grid of item cards. Single-select: choosing an item emits
 * `select` and `close`. Selection state is owned by the parent.
 */
import { Search, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ModalDialog from '@/components/shared/ModalDialog.vue'
import type { ItemType } from '@/types'
import { itemTypeColor } from '@/utils/format/format'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


type PlannerItemOption = {
  id: string
  name: string
  type: ItemType
  source: string
  image?: string
}


const props = defineProps<{
  open: boolean
  options: PlannerItemOption[]
  selectedId: string
  /** Modal heading. Falls back to a localized default. */
  title?: string
}>()


const heading = computed(() => props.title ?? t('plannerComponents.itemPicker.choosePlaceholder'))


const emit = defineEmits<{
  select: [id: string]
  close: []
}>()


const query = ref('')
const typeFilter = ref<ItemType | null>(null)


// Distinct item types present in the catalog, for the filter chips.
const availableTypes = computed<ItemType[]>(() => {
  const seen = new Set<ItemType>()
  for (const option of props.options) seen.add(option.type)
  return [...seen].toSorted((a, b) => a.localeCompare(b))
})


const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.options.filter((option) => {
    if (typeFilter.value && option.type !== typeFilter.value) return false
    if (!q) return true
    const haystack = [option.name, option.id, option.type, option.source].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})


// Reset search + type filter each time the modal opens for a clean start.
watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      typeFilter.value = null
    }
  },
)


function choose(itemId: string) {
  emit('select', itemId)
  emit('close')
}
</script>

<template>
  <ModalDialog
    :open="open"
    :aria-label="heading"
    class="surface-card flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
    @close="emit('close')"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-border/60 px-4 py-3">
      <div class="flex items-baseline gap-2">
        <h3 class="text-base font-bold text-foreground">{{ heading }}</h3>
        <span class="text-xs text-muted-foreground">{{
          t('planner.picker.itemCount', { count: filtered.length })
        }}</span>
      </div>
      <button
        class="focus-ring ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        @click="emit('close')"
      >
        <X class="size-3.5" />
        {{ t('common.close') }}
      </button>
    </div>

    <!-- Search (full width) over wrapping type filter chips -->
    <div class="flex flex-col gap-2.5 border-b border-border/40 px-4 py-3">
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="query"
          type="text"
          :placeholder="t('planner.picker.searchPlaceholder')"
          class="focus-ring h-9 w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 text-sm font-medium text-foreground"
        />
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          class="focus-ring inline-flex h-8 items-center rounded-lg border px-2.5 text-2xs font-semibold capitalize transition"
          :class="
            typeFilter === null
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="typeFilter = null"
        >
          {{ t('planner.picker.allTypes') }}
        </button>
        <button
          v-for="type in availableTypes"
          :key="type"
          class="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-semibold capitalize transition"
          :class="
            typeFilter === type
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          "
          @click="typeFilter = typeFilter === type ? null : type"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: itemTypeColor(type) }"
          />
          {{ type }}
        </button>
      </div>
    </div>

    <!-- Scrollable grid -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div v-if="filtered.length > 0" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          v-for="option in filtered"
          :key="option.id"
          type="button"
          class="focus-ring flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
          :class="
            option.id === selectedId
              ? 'border-primary/45 bg-primary/10'
              : 'border-border/60 hover:border-primary/40 hover:bg-background/55'
          "
          @click="choose(option.id)"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70"
            :style="{ color: itemTypeColor(option.type) }"
          >
            <img
              v-if="getItemImage({ id: option.id, image: option.image })"
              :src="getItemImage({ id: option.id, image: option.image })"
              :alt="option.name"
              class="size-8 object-contain"
              loading="lazy"
            />
            <span v-else class="text-sm font-black">{{ option.name.charAt(0) }}</span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-sm font-semibold text-foreground">{{ option.name }}</span>
              <span
                class="size-2 shrink-0 rounded-full"
                :style="{ backgroundColor: itemTypeColor(option.type) }"
              />
            </span>
            <span class="block truncate text-xs text-muted-foreground">{{ option.source }}</span>
          </span>
        </button>
      </div>

      <p v-else class="py-6 text-center text-sm text-muted-foreground">
        {{ t('planner.picker.noMatches') }}
      </p>
    </div>
  </ModalDialog>
</template>
