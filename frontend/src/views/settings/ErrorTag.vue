<script setup lang="ts">
/** The solid danger tag a settings tab shows when an action fails. Renders nothing while `message` is empty. */
defineProps<{ message: string }>()
</script>

<template>
  <p v-if="message" class="label save-error" role="status">{{ message }}</p>
</template>
