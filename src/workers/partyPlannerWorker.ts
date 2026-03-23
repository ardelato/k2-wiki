import type { PartyPlanCreature } from '@/types'
import { planPartyLevelingPath } from '@/utils/partyPlanner'

self.addEventListener('message', (e: MessageEvent<PartyPlanCreature[]>) => {
  const result = planPartyLevelingPath(e.data)
  // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
  self.postMessage(result)
})
