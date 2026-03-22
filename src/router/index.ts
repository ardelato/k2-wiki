import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'beastiary',
      component: () => import('../views/BeastiaryView.vue'),
    },
    {
      path: '/planner/:id?',
      name: 'planner',
      component: () => import('../views/ItemPlannerView.vue'),
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
    },
    {
      path: '/expeditions',
      name: 'expeditions',
      component: () => import('../views/ExpeditionsView.vue'),
    },
    {
      path: '/collection',
      redirect: '/',
    },
  ],
})
