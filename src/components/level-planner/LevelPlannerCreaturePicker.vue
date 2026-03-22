<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { computed, ref, nextTick, watch } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { typeColor, typeColorVar } from '@/utils/format'

const props = defineProps<{
  modelValue: string
}>()


const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()


const { creatures } = useCreatures()
const { ownedCreatureIds, getLevel, isAwakened } = useCreatureCollection()


const query = ref('')
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})


watch(open, async (isOpen) => {
  if (!isOpen || !triggerRef.value) return
  await nextTick()
  const rect = triggerRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${Math.max(rect.width, 260)}px`,
  }
})


const sortedCreatures = computed(() =>
  [...creatures.value].toSorted((a, b) => {
    const aOwned = ownedCreatureIds.value.has(a.id) ? 0 : 1
    const bOwned = ownedCreatureIds.value.has(b.id) ? 0 : 1
    if (aOwned !== bOwned) return aOwned - bOwned
    return a.name.localeCompare(b.name)
  }),
)


const filtered = computed(() => {
  if (!query.value) return sortedCreatures.value
  const q = query.value.toLowerCase()
  return sortedCreatures.value.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.types.some((t) => t.toLowerCase().includes(q)) ||
      c.trait.toLowerCase().includes(q),
  )
})


const selected = computed(() => creatures.value.find((c) => c.id === props.modelValue) ?? null)


function pick(creature: Creature) {
  emit('update:modelValue', creature.id)
  open.value = false
  query.value = ''
}


function toggle() {
  open.value = !open.value
  if (open.value) query.value = ''
}


function close() {
  open.value = false
  query.value = ''
}
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      class="focus-ring flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-left transition hover:border-primary/40"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <template v-if="selected">
        <img
          :src="getCreatureImage(selected)"
          :alt="selected.name"
          class="size-10 rounded-xl border border-border object-cover"
          :style="{ backgroundColor: `hsl(${typeColorVar(selected.types[0])} / 0.1)` }"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <p
              class="truncate text-base font-semibold"
              :class="isAwakened(selected.id) ? 'text-pink-400' : 'text-foreground'"
            >
              {{ selected.name }}
            </p>
            <span
              v-if="ownedCreatureIds.has(selected.id)"
              class="text-xs"
              :class="isAwakened(selected.id) ? 'text-pink-400' : 'text-amber-400'"
              >★</span
            >
            <span
              v-for="type in selected.types"
              :key="type"
              class="size-2 rounded-full"
              :style="{ backgroundColor: typeColor(type) }"
            />
          </div>
          <p class="text-xs text-muted-foreground/80">
            LVL {{ getLevel(selected.id)
            }}<span v-if="isAwakened(selected.id)" class="ml-1 text-pink-400">★</span>
          </p>
        </div>
      </template>
      <template v-else>
        <div class="size-10 rounded-xl border border-dashed border-border/60 bg-muted/30" />
        <span class="text-sm text-muted-foreground">Choose a creature</span>
      </template>
      <svg
        class="ml-auto size-4 shrink-0 text-muted-foreground"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-50" @click="close" />
      <div
        v-if="open"
        ref="dropdownRef"
        class="fixed z-[51] min-w-[260px] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        :style="dropdownStyle"
      >
        <div class="border-b border-border/60 p-3">
          <label class="relative block">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="query"
              type="text"
              placeholder="Search creatures..."
              class="focus-ring h-12 w-full rounded-lg border border-border/60 bg-background/70 pl-10 pr-4 text-sm font-medium text-foreground"
              @click.stop
            />
          </label>
        </div>

        <div class="max-h-80 space-y-1 overflow-y-auto p-2">
          <p
            v-if="filtered.length === 0"
            class="px-3 py-4 text-center text-sm text-muted-foreground"
          >
            No matches.
          </p>
          <button
            v-for="creature in filtered"
            :key="creature.id"
            class="focus-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
            :class="
              creature.id === modelValue
                ? 'border-primary/45 bg-primary/10'
                : 'border-transparent hover:border-border/50 hover:bg-background/55'
            "
            @click.stop="pick(creature)"
          >
            <img
              :src="getCreatureImage(creature)"
              :alt="creature.name"
              class="size-10 rounded-xl border border-border object-cover"
              :style="{ backgroundColor: `hsl(${typeColorVar(creature.types[0])} / 0.1)` }"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1">
                <p
                  class="truncate text-[15px] font-semibold"
                  :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-foreground'"
                >
                  {{ creature.name }}
                </p>
                <span
                  v-if="ownedCreatureIds.has(creature.id)"
                  class="text-xs"
                  :class="isAwakened(creature.id) ? 'text-pink-400' : 'text-amber-400'"
                  >★</span
                >
              </div>
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span v-if="ownedCreatureIds.has(creature.id)">
                  LVL {{ getLevel(creature.id)
                  }}<span v-if="isAwakened(creature.id)" class="ml-1 text-pink-400">★</span>
                </span>
                <span v-else class="italic">Not summoned</span>
                <span>·</span>
                <span
                  v-for="type in creature.types"
                  :key="type"
                  :style="{ color: typeColor(type) }"
                  >{{ type }}</span
                >
              </div>
            </div>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
