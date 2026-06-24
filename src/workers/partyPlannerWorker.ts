import type { PartyPlannerInput, PartyPlannerWorkerMessage } from '@/types'
import { planPartyLevelingPath } from '@/utils/planner/partyPlanner'

self.addEventListener('message', (e: MessageEvent<PartyPlannerInput>) => {
  const result = planPartyLevelingPath(e.data, (progress) => {
    const message: PartyPlannerWorkerMessage = { type: 'progress', progress }
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    self.postMessage(message)
  })
  const message: PartyPlannerWorkerMessage = { type: 'result', result }
  // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
  self.postMessage(message)
})
