<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { onMounted, ref } from 'vue'
import { provideTheme } from '@/theme'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'

provideTheme()
const route = useRoute()
const oidcEnabled = ref(false)
const drawer = ref(false)
const version = ref('')

onMounted(async () => {
  try {
    const s = await fetch('/api/auth/session').then((r) => r.json())
    oidcEnabled.value = !!s.oidcEnabled
    version.value = s.version || ''
  } catch { /* ignore */ }
})

const links = [
  { href: '/', label: 'Vault' },
  { href: '/queue', label: 'Queue' },
  { href: '/tags', label: 'Tags' },
  { href: '/settings', label: 'Settings' },
]

function isActive(href: string) {
  if (href === '/') return route.path === '/'
  return route.path === href || route.path.startsWith(href + '/')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="header">
      <div class="header-inner">
        <div class="logo">
          <span class="logo-mark">MVP</span>
          <span v-if="version" class="logo-ver">v{{ version }}</span>
        </div>
        <nav class="nav" aria-label="Main">
          <RouterLink
            v-for="l in links"
            :key="l.href"
            :to="l.href"
            class="nav-link"
            :class="{ active: isActive(l.href) }"
            :aria-current="isActive(l.href) ? 'page' : undefined"
          >
            {{ l.label }}
          </RouterLink>
        </nav>
        <div class="header-tools">
          <ThemeSwitcher />
          <a v-if="oidcEnabled" href="/api/auth/logout" class="signout">Sign out</a>
          <button
            type="button"
            class="btn btn-sm btn-icon menu-btn"
            aria-label="Menu"
            aria-controls="drawer"
            :aria-expanded="drawer"
            @click="drawer = !drawer"
          >{{ drawer ? '✕' : '☰' }}</button>
        </div>
      </div>
    </header>

    <div v-if="drawer" id="drawer" class="drawer">
      <div class="drawer-backdrop" @click="drawer = false" />
      <nav class="drawer-panel" aria-label="Main">
        <RouterLink
          v-for="l in links"
          :key="l.href"
          :to="l.href"
          class="nav-link"
          :class="{ active: isActive(l.href) }"
          :aria-current="isActive(l.href) ? 'page' : undefined"
          @click="drawer = false"
        >{{ l.label }}</RouterLink>
      </nav>
    </div>

    <main class="flex-1 overflow-y-auto pt-[calc(var(--header-h)+var(--bw))]">
      <div class="main-column">
        <RouterView />
      </div>
    </main>
  </div>
</template>
