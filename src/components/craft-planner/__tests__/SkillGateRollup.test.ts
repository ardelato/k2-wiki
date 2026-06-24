import { mount } from '@vue/test-utils'

import SkillGateRollup from '@/components/craft-planner/SkillGateRollup.vue'
import type { PlannerSkillGateSummary } from '@/types'

vi.mock('vue-router', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, useRoute: () => ({ path: '/planner' }) }
})

const stubs = {
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}

function mountRollup(summary: PlannerSkillGateSummary | null) {
  return mount(SkillGateRollup, { props: { summary }, global: { stubs } })
}

describe('SkillGateRollup (#2)', () => {
  test('summarizes count + worst gate and links to it', () => {
    const w = mountRollup({ count: 3, highest: { skill: 'Digging', level: 80 } })
    expect(w.text()).toContain('3 resources need a higher skill level')
    expect(w.text()).toContain('Digging L80')

    const link = w.findComponent({ name: 'RouterLink' })
    expect(link.props('to')).toEqual({
      name: 'planner',
      query: { tab: 'skills', skill: 'digging', target: '80' },
    })
  })

  test('uses singular wording for a single locked resource', () => {
    const w = mountRollup({ count: 1, highest: { skill: 'Mining', level: 30 } })
    expect(w.text()).toContain('1 resource need')
    expect(w.text()).not.toContain('1 resources')
  })

  test('renders nothing when no resource is locked', () => {
    const w = mountRollup(null)
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
    expect(w.text()).toBe('')
  })
})
