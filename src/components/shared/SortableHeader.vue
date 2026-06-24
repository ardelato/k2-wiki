<script setup lang="ts" generic="T extends string">
withDefaults(
  defineProps<{
    sortKey: T
    activeKey: T | null
    direction: 'asc' | 'desc'
    label?: string
    align?: 'left' | 'right' | 'center'
    inactiveArrowClass?: string
    thClass?: string
  }>(),
  {
    label: undefined,
    align: 'left',
    inactiveArrowClass: 'opacity-0',
    thClass: '',
  },
)


const emit = defineEmits<{
  sort: [key: T]
}>()
</script>

<template>
  <th
    class="px-2 py-3 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
    :class="[
      align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
      thClass,
    ]"
    :aria-sort="activeKey === sortKey ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"
  >
    <button
      class="focus-ring inline-flex items-center gap-1 transition hover:text-foreground"
      @click="emit('sort', sortKey)"
    >
      <slot>{{ label }}</slot>
      <span :class="activeKey === sortKey ? 'text-primary' : inactiveArrowClass">{{
        direction === 'asc' ? '▲' : '▼'
      }}</span>
    </button>
  </th>
</template>
