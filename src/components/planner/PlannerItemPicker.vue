<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Search } from 'lucide-vue-next'
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
}>(), {
  placeholder: 'Choose an item',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const triggerRef = ref<HTMLButtonElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const dropdownStyle = ref<Record<string, string>>({})

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
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect()
    dropdownStyle.value = {
      top: `${rect.bottom + 8}px`,
      left: `${rect.left}px`,
      width: `${Math.max(rect.width, 300)}px`,
    }
  }
  await nextTick()
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
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
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="focus-ring flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-left transition hover:border-primary/40"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="togglePicker"
    >
      <template v-if="selectedOption">
        <img
          v-if="getItemImage({ id: selectedOption.id })"
          :src="getItemImage({ id: selectedOption.id })"
          :alt="selectedOption.name"
          class="size-10 rounded-xl border border-border object-contain"
          :style="{ backgroundColor: `color-mix(in oklch, ${itemTypeColor(selectedOption.type)} 10%, transparent)` }"
        />
        <span
          v-else
          class="flex size-10 items-center justify-center rounded-xl border border-border text-sm font-black"
          :style="{ color: itemTypeColor(selectedOption.type), backgroundColor: `color-mix(in oklch, ${itemTypeColor(selectedOption.type)} 10%, transparent)` }"
        >
          {{ selectedOption.name.charAt(0) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-base font-semibold text-foreground">
              {{ selectedOption.name }}
            </span>
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: itemTypeColor(selectedOption.type) }"
            />
          </span>
          <span class="block truncate text-xs text-muted-foreground/80">
            {{ selectedOption.type }} · {{ selectedOption.source }}
          </span>
        </span>
      </template>
      <template v-else>
        <span class="flex size-10 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-sm font-black text-muted-foreground">
          ?
        </span>
        <span class="text-sm text-muted-foreground">{{ placeholder }}</span>
      </template>
      <svg class="ml-auto size-4 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-50" @click="closePicker" />
      <div
        v-if="isOpen"
        class="fixed z-[51] overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur"
        :style="dropdownStyle"
        @keydown.esc.stop.prevent="closePicker"
      >
        <div class="border-b border-border/60 p-3">
          <label class="relative block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              placeholder="Search planner items"
              class="focus-ring h-12 w-full rounded-lg border border-border/60 bg-background/70 pl-10 pr-4 text-sm font-medium text-foreground"
              @click.stop
            />
          </label>
        </div>

        <div class="max-h-80 space-y-1 overflow-y-auto p-2">
          <button
            v-for="option in filteredOptions"
            :key="option.id"
            type="button"
            class="focus-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
            :class="option.id === modelValue ? 'border-primary/45 bg-primary/10' : 'border-transparent hover:border-border/50 hover:bg-background/55'"
            @click.stop="selectOption(option.id)"
          >
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70"
              :style="{ color: itemTypeColor(option.type) }"
            >
              <img
                v-if="getItemImage({ id: option.id })"
                :src="getItemImage({ id: option.id })"
                :alt="option.name"
                class="size-8 object-contain"
              />
              <span v-else class="text-sm font-black">
                {{ option.name.charAt(0) }}
              </span>
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-semibold text-foreground">{{ option.name }}</span>
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
    </Teleport>
  </div>
</template>
