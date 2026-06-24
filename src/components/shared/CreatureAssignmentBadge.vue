<script setup lang="ts">
import { computed } from 'vue'

import {
  dungeonsIcon,
  expeditionsIcon,
  helpersIcon,
  machinesIcon,
  sanctuaryIcon,
} from '@/utils/format/icons'

const props = defineProps<{
  creatureId: string
  sanctuaryCreatureIds: string[]
  helperCreatureIds: string[]
  machineCreatureIds: string[]
  expeditionCreatureIds: Set<string>
  dungeonParty: string[]
  imgClass?: string
}>()


interface Assignment {
  icon: string
  label: string
}


const assignment = computed<Assignment | null>(() => {
  const id = props.creatureId
  if (props.sanctuaryCreatureIds.includes(id)) return { icon: sanctuaryIcon, label: 'Sanctuary' }
  if (props.helperCreatureIds.includes(id)) return { icon: helpersIcon, label: 'Helper' }
  if (props.machineCreatureIds.includes(id)) return { icon: machinesIcon, label: 'Machine' }
  if (props.expeditionCreatureIds.has(id)) return { icon: expeditionsIcon, label: 'Expedition' }
  if (props.dungeonParty.includes(id)) return { icon: dungeonsIcon, label: 'Dungeon' }
  return null
})
</script>

<template>
  <img
    v-if="assignment"
    :src="assignment.icon"
    :alt="assignment.label"
    :aria-label="assignment.label"
    :class="imgClass"
    loading="lazy"
  />
</template>
