<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  window.location.href = '/api/auth/logout'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-text-secondary">Signing out…</div>
</template>
