import { ref, watch } from 'vue'

import creaturesData from '@/data/creatures.json'
import type { Creature } from '@/types'

const creatures = creaturesData as Creature[]

export function useCreatureDrawer() {
  const selectedCreature = ref<Creature | null>(null)
  const drawerOpen = ref(false)

  watch(selectedCreature, (val) => {
    if (val) drawerOpen.value = true
  })

  function openCreature(creature: Creature) {
    selectedCreature.value = creature
  }

  function toggleCreature(creature: Creature) {
    if (drawerOpen.value && selectedCreature.value?.id === creature.id) {
      closeDrawer()
    } else {
      openCreature(creature)
    }
  }

  function toggleCreatureById(id: string) {
    const creature = creatures.find((c) => c.id === id)
    if (creature) toggleCreature(creature)
  }

  function closeDrawer() {
    drawerOpen.value = false
    selectedCreature.value = null
  }

  return {
    selectedCreature,
    drawerOpen,
    openCreature,
    toggleCreature,
    toggleCreatureById,
    closeDrawer,
  }
}
