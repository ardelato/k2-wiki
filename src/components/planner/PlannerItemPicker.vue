<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, ChevronsUpDown, Search } from 'lucide-vue-next'
import type { ItemType } from '@/types'
import { itemTypeColor } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'

type PlannerItemOption = {
  id: string
  name: string
  type: ItemType
  source: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: PlannerItemOption[]
  placeholder?: string
  subtle?: boolean
}>(), {
  placeholder: 'Choose an item',
  subtle: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const pickerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')

const selectedOption = computed(() =>
  props.options.find(option => option.id === props.modelValue) ?? null
)

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  if (!query) return props.options

  return props.options.filter((option) => {
    const haystack = [option.name, option.id, option.type, option.source].join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

watch(isOpen, async (open) => {
  if (!open) {
    searchQuery.value = ''
    return
  }

  await nextTick()
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
})

onClickOutside(pickerRef, () => {
  isOpen.value = false
})

function togglePicker() {
  isOpen.value = !isOpen.value
}

function closePicker() {
  isOpen.value = false
}

function selectOption(itemId: string) {
  emit('update:modelValue', itemId)
  closePicker()
}
</script>

<template>
  <div ref="pickerRef" class="relative">
    <button
      type="button"
      class="focus-ring flex w-full items-center justify-between gap-3 rounded-xl text-left transition"
      :class="subtle
        ? 'border border-transparent px-2 py-1.5 hover:border-border/40 hover:bg-muted/15'
        : 'border border-border/70 bg-background/70 px-4 py-3 hover:border-primary/35'"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="togglePicker"
    >
      <span class="flex min-w-0 items-center gap-3">
        <span
          class="shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70"
          :class="subtle ? 'flex size-10' : 'flex size-10 border-border/70 bg-card/65 shadow-inner'"
          :style="{ color: selectedOption ? itemTypeColor(selectedOption.type) : 'var(--color-text-muted)' }"
        >
          <img
            v-if="selectedOption && getItemImage({ id: selectedOption.id })"
            :src="getItemImage({ id: selectedOption.id })"
            :alt="selectedOption.name"
            class="size-7 object-contain"
          />
          <span v-else class="text-sm font-black">
            {{ selectedOption?.name?.charAt(0) ?? '?' }}
          </span>
        </span>

        <span class="min-w-0">
          <span
            class="block truncate font-semibold text-foreground"
            :class="subtle ? 'text-lg font-bold' : 'text-sm'"
          >
            {{ selectedOption?.name ?? placeholder }}
          </span>
          <span v-if="!subtle || !selectedOption" class="block truncate text-xs text-muted-foreground">
            {{ selectedOption ? `${selectedOption.type} · ${selectedOption.source}` : 'Search by item, source, or type' }}
          </span>
          <span
            v-if="subtle && selectedOption"
            class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
            :style="{
              color: itemTypeColor(selectedOption.type),
              backgroundColor: `color-mix(in oklch, ${itemTypeColor(selectedOption.type)} 12%, transparent)`
            }"
          >
            {{ selectedOption.type }}
          </span>
        </span>
      </span>

      <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" :class="subtle ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''" />
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur"
      @keydown.esc.stop.prevent="closePicker"
    >
      <div class="border-b border-border/60 p-3">
        <label class="relative block">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            placeholder="Search planner items"
            class="focus-ring h-11 w-full rounded-lg border border-border/60 bg-background/70 pl-10 pr-4 text-sm font-medium text-foreground"
          />
        </label>
      </div>

      <div class="max-h-80 space-y-1 overflow-y-auto p-2">
        <button
          v-for="option in filteredOptions"
          :key="option.id"
          type="button"
          class="focus-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
          :class="option.id === modelValue ? 'border-primary/45 bg-primary/10' : 'border-transparent hover:border-border/70 hover:bg-background/55'"
          @click="selectOption(option.id)"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70"
            :style="{ color: itemTypeColor(option.type) }"
          >
            <img
              v-if="getItemImage({ id: option.id })"
              :src="getItemImage({ id: option.id })"
              :alt="option.name"
              class="size-7 object-contain"
            />
            <span v-else class="text-sm font-black">
              {{ option.name.charAt(0) }}
            </span>
          </span>

          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-foreground">{{ option.name }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ option.type }} · {{ option.source }}</span>
          </span>

          <Check
            v-if="option.id === modelValue"
            class="size-4 shrink-0 text-primary"
          />
        </button>

        <div
          v-if="!filteredOptions.length"
          class="rounded-lg border border-dashed border-border/60 bg-background/45 px-4 py-5 text-center text-sm text-muted-foreground"
        >
          No items match that search.
        </div>
      </div>
    </div>
  </div>
</template>
