<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  step?: number
  decreaseLabel: string
  increaseLabel: string
  inputLabel: string
  inputClass?: string
  buttonClass?: string
}>()


const emit = defineEmits<{
  'update:modelValue': [value: number]
  step: [delta: number]
  normalize: [event: FocusEvent]
}>()


const resolvedStep = computed(() => props.step ?? 1)


function onStep(delta: number) {
  emit('step', delta)
}


function onNormalize(event: FocusEvent) {
  emit('normalize', event)
}
</script>

<template>
  <div
    class="inline-flex items-center overflow-hidden rounded-md border border-input bg-background/85"
  >
    <button
      :class="[
        'focus-ring inline-flex items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        buttonClass ?? 'h-7 w-7',
      ]"
      :disabled="modelValue <= min"
      :aria-label="decreaseLabel"
      @click="onStep(-resolvedStep)"
    >
      <Minus class="size-3" />
    </button>
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :class="[
        'focus-ring border-x border-input bg-transparent text-center font-mono',
        inputClass ?? 'h-7 w-11 text-xs',
      ]"
      :value="modelValue"
      :aria-label="inputLabel"
      @blur="onNormalize($event)"
    />
    <button
      :class="[
        'focus-ring inline-flex items-center justify-center text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        buttonClass ?? 'h-7 w-7',
      ]"
      :disabled="modelValue >= max"
      :aria-label="increaseLabel"
      @click="onStep(resolvedStep)"
    >
      <Plus class="size-3" />
    </button>
  </div>
</template>
