<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  window.location.href = '/api/auth/login'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-text-secondary">
    Redirecting to login…
  </div>
</template>
