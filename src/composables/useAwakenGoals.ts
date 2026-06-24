/**
 * useAwakenGoals — a small reactive reader over the Awaken planner's persisted
 * queue, so other planners (e.g. the Summon playbook) can tell whether a creature
 * is part of the player's awaken plan.
 *
 * The Awaken Rush tab persists its queue to the `awaken-planner-queue` localStorage
 * key (declared inline in LevelPlanner.vue). `useLocalStorage` shares one reactive
 * source per key across the app, so reading the same key here stays in sync with the
 * Awaken tab without any extra wiring.
 *
 * There is intentionally no creature → awaken-tree-node mapping: the awaken tree is
 * job-based and awakening a creature simply earns one spendable point. The only honest
 * cross-reference is queue membership, which is what this exposes.
 */
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

const AWAKEN_QUEUE_KEY = 'awaken-planner-queue'

export function useAwakenGoals() {
  const awakenQueue = useLocalStorage<string[]>(AWAKEN_QUEUE_KEY, [])
  const awakenQueueSet = computed(() => new Set(awakenQueue.value))
  const isInAwakenQueue = (creatureId: string): boolean => awakenQueueSet.value.has(creatureId)

  return { awakenQueue, awakenQueueSet, isInAwakenQueue }
}
