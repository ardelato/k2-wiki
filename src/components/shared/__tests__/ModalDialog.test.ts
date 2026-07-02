import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ModalDialog from '@/components/shared/ModalDialog.vue'

describe('ModalDialog', () => {
  test('closes on Escape', async () => {
    const w = mount(ModalDialog, { props: { open: true } })
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  test('closes on a backdrop click but not a click inside the panel', async () => {
    const w = mount(ModalDialog, {
      props: { open: true },
      slots: { default: '<button class="inner">x</button>' },
      attachTo: document.body,
    })
    await nextTick()
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement

    // A click inside the panel must NOT dismiss (@click.self only fires on the backdrop).
    ;(document.body.querySelector('.inner') as HTMLElement).click()
    expect(w.emitted('close')).toBeUndefined()

    // A click on the backdrop itself dismisses.
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})
