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
  { href: '/settings/fluxer', label: 'Fluxer' },
]
</script>

<template>
  <div class="flex flex-col gap-6 pb-12">
    <h1>Settings</h1>
    <nav class="tabs" aria-label="Settings">
      <RouterLink
        v-for="t in tabs"
        :key="t.href"
        :to="t.href"
        class="tab"
        :class="{ active: route.path === t.href }"
      >{{ t.label }}</RouterLink>
    </nav>
    <div class="tab-body">
      <RouterView />
    </div>
  </div>
</template>
