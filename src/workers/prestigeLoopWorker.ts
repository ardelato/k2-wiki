import type { PrestigeLoopInput } from '@/utils/planner/prestigeLoopPlanner'
import { planPrestigeLoop } from '@/utils/planner/prestigeLoopPlanner'

self.addEventListener('message', (e: MessageEvent<PrestigeLoopInput>) => {
  const result = planPrestigeLoop(e.data)
  // eslint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
  self.postMessage(result)
})
