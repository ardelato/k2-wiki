import { mount } from '@vue/test-utils'

import ItemCard from '@/components/items/ItemCard.vue'
import type { Item } from '@/types'

vi.mock('@/utils/images/itemImages', () => ({
  getItemImage: () => undefined,
}))

const mockItem: Item = {
  id: 'test-item',
  name: 'Test Item',
  type: 'Gathered',
  sources: ['chopping'],
  description: 'A test item',
  recipes: [],
}

describe('ItemCard', () => {
  const defaultProps = { item: mockItem, selected: false }

  test('renders item name', () => {
    const wrapper = mount(ItemCard, { props: { ...defaultProps } })
    expect(wrapper.find('h3').text()).toBe('Test Item')
  })

  test('renders item type badge', () => {
    const wrapper = mount(ItemCard, { props: { ...defaultProps } })
    expect(wrapper.html()).toContain('Gathered')
  })

  test('emits select with item when clicked', async () => {
    const wrapper = mount(ItemCard, { props: { ...defaultProps } })
    await wrapper.find('[role="button"]').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([mockItem])
  })

  test('applies selected styling when selected is true', () => {
    const wrapper = mount(ItemCard, { props: { ...defaultProps, selected: true } })
    expect(wrapper.find('[role="button"]').classes().join(' ')).toMatch(/border-primary/)
  })
})
