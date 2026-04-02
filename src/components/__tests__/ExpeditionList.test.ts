import { mount } from '@vue/test-utils'

import ExpeditionList from '@/components/expeditions/ExpeditionList.vue'
import type { Expedition } from '@/types'

const mockExpeditions: Expedition[] = [
  {
    id: 'exp-1',
    name: 'Forest Hunt',
    description: '',
    image: '',
    baseRating: 100,
    baseDuration: 600,
    baseXP: 50,
    maxPartySize: 3,
    trait: 'brave',
    biome: 'forest',
    requiredExpeditionCompletions: 0,
    statWeights: { power: 2, grit: 1, agility: 0, smarts: 0, looting: 0, luck: 0 },
    rewards: [],
  },
  {
    id: 'exp-2',
    name: 'Cave Dive',
    description: '',
    image: '',
    baseRating: 200,
    baseDuration: 900,
    baseXP: 80,
    maxPartySize: 4,
    trait: '',
    biome: 'cave',
    requiredExpeditionCompletions: 5,
    statWeights: { power: 0, grit: 2, agility: 1, smarts: 0, looting: 0, luck: 0 },
    rewards: [],
  },
]

describe('ExpeditionList', () => {
  const defaultProps = {
    expeditions: mockExpeditions,
    selectedId: null,
    sortField: 'rating',
    sortDirection: 'desc',
  } as const

  test('renders "Expeditions" header', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    expect(wrapper.find('.list-title').text()).toBe('Expeditions')
  })

  test('renders all expedition rows (2 rows)', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    expect(wrapper.findAll('.exp-row')).toHaveLength(2)
  })

  test('renders expedition names', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    const names = wrapper.findAll('.exp-name').map((n) => n.text())
    expect(names).toContain('Forest Hunt')
    expect(names).toContain('Cave Dive')
  })

  test('renders expedition ratings', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    const ratings = wrapper.findAll('.exp-rating').map((r) => r.text())
    expect(ratings).toContain('100')
    expect(ratings).toContain('200')
  })

  test('renders biome title-cased', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    const biomes = wrapper.findAll('.exp-biome').map((b) => b.text())
    expect(biomes).toContain('Forest')
    expect(biomes).toContain('Cave')
  })

  test('emits select when row clicked', async () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    await wrapper.findAll('.exp-row')[0].trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([mockExpeditions[0]])
  })

  test('emits sort when Rating sort button clicked', async () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    const sortBtns = wrapper.findAll('.sort-btn')
    await sortBtns[0].trigger('click')
    expect(wrapper.emitted('sort')).toHaveLength(1)
    expect(wrapper.emitted('sort')![0]).toEqual(['rating'])
  })

  test('emits sort when Time sort button clicked', async () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps } })
    const sortBtns = wrapper.findAll('.sort-btn')
    await sortBtns[1].trigger('click')
    expect(wrapper.emitted('sort')).toHaveLength(1)
    expect(wrapper.emitted('sort')![0]).toEqual(['time'])
  })

  test('applies selected class to matching selectedId row', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps, selectedId: 'exp-1' } })
    const rows = wrapper.findAll('.exp-row')
    expect(rows[0].classes()).toContain('selected')
    expect(rows[1].classes()).not.toContain('selected')
  })

  test('shows empty message when expeditions array is empty', () => {
    const wrapper = mount(ExpeditionList, { props: { ...defaultProps, expeditions: [] } })
    expect(wrapper.find('.empty').text()).toBe('No expeditions found.')
  })
})
