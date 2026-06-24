import { mount } from '@vue/test-utils'

import LevelPlannerBoosterChip from '@/components/level-planner/LevelPlannerBoosterChip.vue'
import type { Creature } from '@/types'

vi.mock('@/utils/images/creatureImages', () => ({
  getCreatureImage: (c: Creature | undefined) => `mock://${c?.id ?? 'unknown'}.png`,
}))

function makeCreature(id: string, name: string): Creature {
  return {
    id,
    name,
    mainJob: 'chopping',
    description: '',
    image: '',
    tier: 0,
    trait: 'learner',
    types: ['Fire'],
    stats: { power: 1, grit: 1, agility: 1, smarts: 1, looting: 1, luck: 1 },
    jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
    summoningCost: [],
  }
}

describe('LevelPlannerBoosterChip', () => {
  test('renders the creature avatar and name', () => {
    const creature = makeCreature('c1', 'Helper')
    const wrapper = mount(LevelPlannerBoosterChip, { props: { creature } })
    expect(wrapper.text()).toContain('Helper')
    expect(wrapper.find('img').attributes('src')).toBe('mock://c1.png')
  })

  test('emits inspect with the creature when inspected (delegates drawer to parent)', async () => {
    const creature = makeCreature('c1', 'Helper')
    const wrapper = mount(LevelPlannerBoosterChip, { props: { creature } })

    // RightClickHint wraps content in a `div.contents` and listens to native
    // contextmenu on that div before re-emitting its own custom event upward.
    await wrapper.find('div.contents').trigger('contextmenu')

    const events = wrapper.emitted('inspect')
    expect(events).toBeTruthy()
    expect(events!.length).toBe(1)
    expect(events![0][0]).toEqual(creature)
  })

  test('does not emit inspect on plain (left) click — chip is inspect-only', async () => {
    const creature = makeCreature('c1', 'Helper')
    const wrapper = mount(LevelPlannerBoosterChip, { props: { creature } })
    await wrapper.find('div.contents').trigger('click')
    expect(wrapper.emitted('inspect')).toBeFalsy()
  })
})
