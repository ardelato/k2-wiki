import { useGameConfig } from '@/composables/useGameConfig'

/** Why a creature isn't freely available for the sanctuary: assigned to another job
 * ("busy"), or user-excluded. `role` is the busy assignment; `excluded` is the flag. */
interface CreatureStatus {
  role: 'sanctuary' | 'helper' | 'machine' | 'expedition' | 'dungeon' | null
  excluded: boolean
}

/** Reads live game state to flag whether a creature is busy elsewhere or excluded.
 * Used to call out such creatures in the sanctuary roster-diff tiles (mirrors the
 * busy logic in useSanctuary.getCreatureStatus, plus the excluded flag). */
export function useCreatureStatus() {
  const {
    sanctuaryCreatureIds,
    helperCreatureIds,
    machineCreatureIds,
    expeditionCreatureIds,
    dungeonParty,
    excludedCreatureIds,
  } = useGameConfig()

  function busyRole(id: string): CreatureStatus['role'] {
    if (sanctuaryCreatureIds.value.includes(id)) return 'sanctuary'
    if (helperCreatureIds.value.includes(id)) return 'helper'
    if (machineCreatureIds.value.includes(id)) return 'machine'
    if (expeditionCreatureIds.value.has(id)) return 'expedition'
    if (dungeonParty.value.includes(id)) return 'dungeon'
    return null
  }

  function statusOf(id: string): CreatureStatus {
    return { role: busyRole(id), excluded: excludedCreatureIds.value.has(id) }
  }

  return { statusOf }
}
