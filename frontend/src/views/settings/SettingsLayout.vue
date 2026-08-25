<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const tabs = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/binaries', label: 'Binaries' },
  { href: '/settings/cookies', label: 'Cookies' },
  { href: '/settings/sharing', label: 'Sharing' },
  { href: '/settings/api', label: 'API' },
  { href: '/settings/discord', label: 'Discord' },
]
</script>

<template>
  <div class="flex flex-col gap-6 pb-12">
    <h1 class="text-2xl font-bold">Settings</h1>
    <nav class="flex gap-1 border-b border-border overflow-x-auto">
      <RouterLink
        v-for="t in tabs"
        :key="t.href"
        :to="t.href"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap"
        :class="route.path === t.href
          ? 'border-accent text-text-primary'
          : 'border-transparent text-text-secondary hover:text-text-primary'"
      >{{ t.label }}</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
