import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', name: 'vault', component: () => import('@/views/VaultView.vue') },
        { path: 'queue', name: 'queue', component: () => import('@/views/QueueView.vue') },
        { path: 'tags', name: 'tags', component: () => import('@/views/TagsView.vue') },
        {
          path: 'settings',
          component: () => import('@/views/settings/SettingsLayout.vue'),
          redirect: '/settings/general',
          children: [
            { path: 'general', component: () => import('@/views/settings/GeneralView.vue') },
            { path: 'binaries', component: () => import('@/views/settings/BinariesView.vue') },
            { path: 'cookies', component: () => import('@/views/settings/CookiesView.vue') },
            { path: 'sharing', component: () => import('@/views/settings/SharingView.vue') },
            { path: 'api', component: () => import('@/views/settings/ApiView.vue') },
            { path: 'discord', component: () => import('@/views/settings/DiscordView.vue') },
          ],
        },
      ],
    },
    { path: '/auth/login', component: () => import('@/views/auth/LoginView.vue') },
    { path: '/auth/logout', component: () => import('@/views/auth/LogoutView.vue') },
    { path: '/auth/error', component: () => import('@/views/auth/ErrorView.vue') },
  ],
})

export default router
