<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { onMounted, ref } from 'vue'
import { provideTheme } from '@/theme'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'

const { theme } = provideTheme()
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
    <header class="fixed top-0 left-0 right-0 h-16 bg-surface-1/70 backdrop-blur-md border-b border-border z-50">
      <div class="max-w-5xl mx-auto h-full flex items-center gap-6 px-6">
        <div class="flex items-center gap-2.5 shrink-0">
          <img
            src="/safe.png"
            alt="MVP"
            class="w-8 h-8 shrink-0"
            :class="theme === 'dark' ? 'invert mix-blend-screen' : 'mix-blend-multiply'"
          />
          <div class="flex flex-col leading-none gap-0.5">
            <span class="text-base font-bold text-text-primary tracking-tight">MVP</span>
            <span v-if="version" class="text-[10px] text-text-muted">v{{ version }}</span>
          </div>
        </div>
        <nav class="hidden md:flex items-center gap-1">
          <RouterLink
            v-for="l in links"
            :key="l.href"
            :to="l.href"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="isActive(l.href)
              ? 'bg-accent-subtle text-accent'
              : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'"
          >
            {{ l.label }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <ThemeSwitcher />
          <a
            v-if="oidcEnabled"
            href="/api/auth/logout"
            class="hidden md:block px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-2"
          >Sign out</a>
          <button class="md:hidden p-2 text-text-secondary" @click="drawer = !drawer" aria-label="Menu">☰</button>
        </div>
      </div>
    </header>

    <div v-if="drawer" class="fixed inset-0 z-40 md:hidden">
      <div class="absolute inset-0 bg-black/50" @click="drawer = false" />
      <nav class="absolute top-16 left-0 right-0 bg-surface-1 border-b border-border p-4 flex flex-col gap-1">
        <RouterLink
          v-for="l in links"
          :key="l.href"
          :to="l.href"
          class="px-4 py-3 rounded-lg text-sm font-medium"
          :class="isActive(l.href) ? 'bg-accent-subtle text-accent' : 'text-text-secondary'"
          @click="drawer = false"
        >{{ l.label }}</RouterLink>
      </nav>
    </div>

    <main class="flex-1 overflow-y-auto pt-16">
      <div class="max-w-5xl mx-auto px-6 py-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>
