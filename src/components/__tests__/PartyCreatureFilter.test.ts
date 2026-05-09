import { mount } from '@vue/test-utils'

import PartyCreatureFilter from '@/components/level-planner/PartyCreatureFilter.vue'
import type { Creature } from '@/types'

vi.mock('@/components/level-planner/PartyCreatureTile.vue', () => ({
  default: {
    name: 'PartyCreatureTile',
    props: ['creature', 'chipState', 'level', 'awakened', 'titleSuffix'],
    emits: ['toggle'],
    template: `<button :data-id="creature.id" @click="$emit('toggle')">{{ creature.name }}</button>`,
  },
}))

function makeCreature(id: string, name: string, tier = 0): Creature {
  return {
    id,
    name,
    mainJob: 'chopping',
    description: '',
    image: '',
    tier,
    trait: 'learner',
    types: ['Fire'],
    stats: { power: 1, grit: 1, agility: 1, smarts: 1, looting: 1, luck: 1 },
    jobs: { chopping: 1, mining: 1, digging: 1, exploring: 1, fishing: 1, farming: 1 },
    summoningCost: [],
  }
}

describe('PartyCreatureFilter — single-select mode', () => {
  const creatures = [makeCreature('a', 'Alpha'), makeCreature('b', 'Beta')]

  function mountFilter(selectedId = '') {
    return mount(PartyCreatureFilter, {
      props: {
        creatures,
        getLevel: () => 1,
        isAwakened: () => false,
        selectMode: true,
        selectedId,
      },
    })
  }

  test('clicking an unselected tile emits its id', async () => {
    const wrapper = mountFilter('')
    await wrapper.find('[data-id="a"]').trigger('click')
    const events = wrapper.emitted('select')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe('a')
  })

  test('clicking a different tile while one is selected emits the new id', async () => {
    const wrapper = mountFilter('a')
    await wrapper.find('[data-id="b"]').trigger('click')
    const events = wrapper.emitted('select')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe('b')
  })

  test('clicking the already-selected tile emits empty string to deselect', async () => {
    const wrapper = mountFilter('a')
    await wrapper.find('[data-id="a"]').trigger('click')
    const events = wrapper.emitted('select')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe('')
  })
})
