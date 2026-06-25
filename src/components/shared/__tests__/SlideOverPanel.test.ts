import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import SlideOverPanel from '@/components/shared/SlideOverPanel.vue'

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

describe('SlideOverPanel', () => {
  test('a modal panel closes on Escape', async () => {
    const w = mount(SlideOverPanel, { props: { open: true } })
    await nextTick()
    pressEscape()
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  test('a non-modal panel ignores Escape (page stays interactive)', async () => {
    const w = mount(SlideOverPanel, { props: { open: true, modal: false } })
    await nextTick()
    pressEscape()
    expect(w.emitted('close')).toBeUndefined()
    w.unmount()
  })

  test('a closed panel ignores Escape', async () => {
    const w = mount(SlideOverPanel, { props: { open: false } })
    await nextTick()
    pressEscape()
    expect(w.emitted('close')).toBeUndefined()
    w.unmount()
  })

  test('exposes dialog semantics only when modal', async () => {
    const modal = mount(SlideOverPanel, {
      props: { open: true, ariaLabel: 'Details' },
      attachTo: document.body,
    })
    await nextTick()
    const panel = document.body.querySelector('[role="dialog"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('aria-modal')).toBe('true')
    expect(panel?.getAttribute('aria-label')).toBe('Details')
    modal.unmount()

    const nonModal = mount(SlideOverPanel, {
      props: { open: true, modal: false },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    nonModal.unmount()
  })
})
