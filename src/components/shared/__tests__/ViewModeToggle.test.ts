import { mount } from '@vue/test-utils'

import ViewModeToggle from '@/components/shared/ViewModeToggle.vue'

describe('ViewModeToggle', () => {
  test('emits update:modelValue for the clicked mode', async () => {
    const w = mount(ViewModeToggle, { props: { modelValue: 'grid' } })
    const [grid, table] = w.findAll('button')

    await table.trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['table'])

    await grid.trigger('click')
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['grid'])
  })

  test('reflects the active mode via aria-checked', () => {
    const w = mount(ViewModeToggle, { props: { modelValue: 'table' } })
    const [grid, table] = w.findAll('button')
    expect(grid.attributes('aria-checked')).toBe('false')
    expect(table.attributes('aria-checked')).toBe('true')
  })
})
