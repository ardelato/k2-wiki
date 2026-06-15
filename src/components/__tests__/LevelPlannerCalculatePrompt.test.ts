import { mount } from '@vue/test-utils'

import LevelPlannerCalculatePrompt from '@/components/level-planner/LevelPlannerCalculatePrompt.vue'
import type { Creature } from '@/types'

vi.mock('@/components/beastiary/CreatureDetail.vue', () => ({
  default: { name: 'CreatureDetail', render: () => null },
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

describe('LevelPlannerCalculatePrompt', () => {
  const baseProps = {
    creatureName: 'Target',
    creatureImage: 'mock://target.png',
    fromLevel: 1,
    toLevel: 120,
  }

  test('renders the creature header and the LVL range', () => {
    const wrapper = mount(LevelPlannerCalculatePrompt, { props: baseProps })
    expect(wrapper.text()).toContain('Target')
    // Case-insensitive: the level abbreviation may render "Lvl" or "LVL".
    expect(wrapper.text().toUpperCase()).toContain('LVL 1')
    expect(wrapper.text()).toContain('120')
    expect(wrapper.text().toLowerCase()).toContain('calculate')
  })

  test('clicking Calculate emits the calculate event', async () => {
    const wrapper = mount(LevelPlannerCalculatePrompt, { props: baseProps })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('calculate')).toBeTruthy()
    expect(wrapper.emitted('calculate')!.length).toBe(1)
  })

  test('avatar is wrapped in RightClickHint when creature prop is provided', () => {
    const wrapper = mount(LevelPlannerCalculatePrompt, {
      props: { ...baseProps, creature: makeCreature('target', 'Target') },
    })
    // RightClickHint renders a `div.contents` wrapper around the avatar
    const wrapped = wrapper.find('div.contents')
    expect(wrapped.exists()).toBe(true)
    expect(wrapped.find('img').attributes('src')).toBe('mock://target.png')
  })

  test('avatar renders without RightClickHint when creature prop is missing', () => {
    const wrapper = mount(LevelPlannerCalculatePrompt, { props: baseProps })
    expect(wrapper.find('div.contents').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe('mock://target.png')
  })
})
