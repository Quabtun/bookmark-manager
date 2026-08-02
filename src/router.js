import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
