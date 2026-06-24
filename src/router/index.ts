import { createRouter, createWebHistory } from 'vue-router'
import type { LocationQuery } from 'vue-router'

import { t } from '@/i18n'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'beastiary',
      component: () => import('../views/BeastiaryView.vue'),
      meta: { title: 'beastiary' },
    },
    {
      path: '/planner/creature',
      name: 'planner-creature',
      component: () => import('../views/PlannerShellView.vue'),
      meta: { title: 'Planner · Creature', page: 'creature' },
    },
    {
      path: '/planner/:id?',
      name: 'planner',
      component: () => import('../views/PlannerShellView.vue'),
      meta: { title: 'Planner', page: 'crafting' },
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
      meta: { title: 'items' },
    },
    {
      path: '/dungeons',
      name: 'dungeons',
      component: () => import('../views/DungeonsView.vue'),
      meta: { title: 'dungeons' },
    },
    {
      path: '/expeditions',
      name: 'expeditions',
      component: () => import('../views/ExpeditionsView.vue'),
      meta: { title: 'expeditions' },
    },
    {
      path: '/sanctuary',
      name: 'sanctuary',
      component: () => import('../views/SanctuaryView.vue'),
      meta: { title: 'sanctuary' },
    },
    {
      path: '/machines',
      name: 'machines',
      component: () => import('../views/MachinesView.vue'),
      meta: { title: 'machines' },
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('../views/ToolsView.vue'),
      meta: { title: 'tools' },
    },
    {
      path: '/fabrication',
      name: 'fabrication',
      component: () => import('../views/FabricationView.vue'),
      meta: { title: 'fabrication' },
    },
    {
      path: '/garden',
      name: 'garden',
      component: () => import('../views/GardenView.vue'),
      meta: { title: 'garden' },
    },
    {
      path: '/awaken',
      name: 'awaken',
      component: () => import('../views/AwakenView.vue'),
      meta: { title: 'awakenTree' },
    },
    {
      path: '/configs',
      name: 'configs',
      component: () => import('../views/ConfigsView.vue'),
      meta: { title: 'configs' },
    },
    {
      path: '/collection',
      redirect: '/',
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

function getCreatureTitle(query: LocationQuery): string {
  if (query.tab === 'awaken') return t('nav.plannerAwaken')
  if (query.tab === 'prestige') return t('nav.plannerPrestige')
  return t('nav.plannerSummon')
}

function getCraftingTitle(query: LocationQuery): string {
  if (query.tab === 'skills') return t('nav.plannerSkills')
  return t('nav.plannerCraft')
}

router.afterEach((to) => {
  if (to.name === 'planner-creature') {
    document.title = getCreatureTitle(to.query)
  } else if (to.name === 'planner') {
    document.title = getCraftingTitle(to.query)
  } else {
    const titleKey = to.meta.title as string | undefined
    document.title = titleKey ? t(`nav.${titleKey}`) : t('common.k2Wiki')
  }
})
