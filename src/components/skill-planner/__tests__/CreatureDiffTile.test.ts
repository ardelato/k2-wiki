import { mount } from '@vue/test-utils'

import CreatureDiffTile from '@/components/skill-planner/CreatureDiffTile.vue'

vi.mock('@/utils/images/creatureImages', () => ({ getCreatureImage: () => undefined }))

vi.mock('@/utils/format/icons', () => ({
  sanctuaryIcon: 'sanctuary.webp',
  helpersIcon: 'helper.webp',
  machinesIcon: 'machine.webp',
  expeditionsIcon: 'expedition.webp',
  dungeonsIcon: 'dungeon.webp',
}))

vi.mock('@/components/shared/AppTooltip.vue', () => ({
  default: { name: 'AppTooltip', props: ['text', 'position'], template: '<span><slot /></span>' },
}))

vi.mock('@/components/shared/RightClickHint.vue', () => ({
  default: {
    name: 'RightClickHint',
    emits: ['contextmenu'],
    template: `<div class="rch" @contextmenu="$emit('contextmenu')"><slot /></div>`,
  },
}))

// id 'busy' → assigned as a helper; id 'excl' → excluded; anything else → available.
vi.mock('@/composables/useCreatureStatus', () => ({
  useCreatureStatus: () => ({
    statusOf: (id: string) => ({
      role: id === 'busy' ? 'helper' : null,
      excluded: id === 'excl',
    }),
  }),
}))

function mountTile(id: string, variant: 'remove' | 'add' | 'keep' = 'add') {
  return mount(CreatureDiffTile, {
    props: { id, name: 'Cuddles', contribution: 5, variant },
  })
}

describe('CreatureDiffTile', () => {
  test('available creature: no ring, no assignment icon', () => {
    const w = mountTile('ok')
    expect(w.html()).not.toContain('ring-warning')
    expect(w.find('img[alt="Helper"]').exists()).toBe(false)
  })

  test('excluded incoming creature: warning ring, no assignment icon', () => {
    const w = mountTile('excl')
    expect(w.html()).toContain('ring-warning')
    expect(w.find('img[alt="Helper"]').exists()).toBe(false)
  })

  test('busy incoming creature: warning ring + assignment icon', () => {
    const w = mountTile('busy')
    expect(w.html()).toContain('ring-warning')
    expect(w.find('img[alt="Helper"]').exists()).toBe(true)
  })

  test('does not flag creatures already in the sanctuary (remove/keep)', () => {
    expect(mountTile('excl', 'remove').html()).not.toContain('ring-warning')
    expect(mountTile('busy', 'keep').html()).not.toContain('ring-warning')
    expect(mountTile('busy', 'keep').find('img[alt="Helper"]').exists()).toBe(false)
  })

  test('emits inspect with the id on inspect', async () => {
    const w = mountTile('ok')
    await w.find('.rch').trigger('contextmenu')
    expect(w.emitted('inspect')?.[0]).toEqual(['ok'])
  })
})
