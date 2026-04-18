import { createRouter, createWebHistory } from 'vue-router'
import type { LocationQuery } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'beastiary',
      component: () => import('../views/BeastiaryView.vue'),
      meta: { title: 'Beastiary' },
    },
    {
      path: '/planner/:id?',
      name: 'planner',
      component: () => import('../views/ItemPlannerView.vue'),
      meta: { title: 'Planner' },
    },
    {
      path: '/items/:id/planner',
      redirect: (to) => ({
        name: 'planner',
        params: { id: typeof to.params.id === 'string' ? to.params.id : undefined },
        query: to.query,
      }),
    },
    {
      path: '/items',
      name: 'items',
      component: () => import('../views/ItemsView.vue'),
      meta: { title: 'Items' },
    },
    {
      path: '/dungeons',
      name: 'dungeons',
      component: () => import('../views/DungeonsView.vue'),
      meta: { title: 'Dungeons' },
    },
    {
      path: '/expeditions',
      name: 'expeditions',
      component: () => import('../views/ExpeditionsView.vue'),
      meta: { title: 'Expeditions' },
    },
    {
      path: '/sanctuary',
      name: 'sanctuary',
      component: () => import('../views/SanctuaryView.vue'),
      meta: { title: 'Sanctuary' },
    },
    {
      path: '/machines',
      name: 'machines',
      component: () => import('../views/MachinesView.vue'),
      meta: { title: 'Machines' },
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('../views/ToolsView.vue'),
      meta: { title: 'Tools' },
    },
    {
      path: '/fabrication',
      name: 'fabrication',
      component: () => import('../views/FabricationView.vue'),
      meta: { title: 'Fabrication' },
    },
    {
      path: '/configs',
      name: 'configs',
      component: () => import('../views/ConfigsView.vue'),
      meta: { title: 'Configs' },
    },
    {
      path: '/collection',
      redirect: '/',
    },
  ],
})

function getPlannerTitle(query: LocationQuery): string {
  const tab = query.tab
  if (tab === 'levelup') {
    const mode = query.mode === 'party' ? 'P' : 'S'
    return `Planner · Level Up (${mode})`
  }
  if (tab === 'summoning') return 'Planner · Summoning'
  return 'Planner · Craft'
}

router.afterEach((to) => {
  if (to.name === 'planner') {
    document.title = getPlannerTitle(to.query)
  } else {
    document.title = (to.meta.title as string) ?? 'K2 Wiki'
  }
})
