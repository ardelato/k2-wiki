import { mount } from '@vue/test-utils'

import CreatureCard from '@/components/beastiary/CreatureCard.vue'
import type { Creature } from '@/types'

vi.mock('@/utils/images/creatureImages', () => ({
  getCreatureImage: () => undefined,
}))

vi.mock('@/utils/format/icons', () => ({
  jobIcons: {},
  jobColors: {},
}))

const mockCreature: Creature = {
  id: 'test-creature',
  name: 'Test Creature',
  mainJob: 'chopping',
  description: 'A test creature',
  image: 'test.png',
  tier: 0,
  trait: 'learner',
  types: ['Fire', 'Water'],
  stats: { power: 10, grit: 8, agility: 6, smarts: 4, looting: 2, luck: 1 },
  jobs: { chopping: 5, mining: 3, digging: 2, exploring: 4, fishing: 1, farming: 6 },
  summoningCost: [],
}

describe('CreatureCard', () => {
  const defaultProps = { creature: mockCreature }

  test('renders creature name in h3', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    expect(wrapper.find('h3').text()).toBe('Test Creature')
  })

  test('renders tier badge as T1 (tier 0 + 1)', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    expect(wrapper.find('.tier-badge').text()).toBe('T1')
  })

  test('renders all element types', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    const typeTags = wrapper.findAll('.type-tag')
    expect(typeTags).toHaveLength(2)
    expect(typeTags[0].text()).toBe('Fire')
    expect(typeTags[1].text()).toBe('Water')
  })

  test('renders trait title-cased as Learner', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    expect(wrapper.find('.trait-value').text()).toBe('Learner')
  })

  test('renders 6 job cells in job grid', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    const jobCells = wrapper.findAll('.job-cell')
    expect(jobCells).toHaveLength(6)
  })

  test('emits click when card clicked', async () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    await wrapper.find('.card').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  test('does not render checkbox when selectable is false', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps, selectable: false } })
    expect(wrapper.find('.checkbox').exists()).toBe(false)
  })

  test('does not render checkbox when selectable is undefined', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps } })
    expect(wrapper.find('.checkbox').exists()).toBe(false)
  })

  test('renders checkbox when selectable is true', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps, selectable: true } })
    expect(wrapper.find('.checkbox').exists()).toBe(true)
  })

  test('applies selected class when selected prop is true', () => {
    const wrapper = mount(CreatureCard, { props: { ...defaultProps, selected: true } })
    expect(wrapper.find('.card').classes()).toContain('selected')
  })
})
