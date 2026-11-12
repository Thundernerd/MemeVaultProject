<script setup lang="ts">
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'

const { settings, save, isOverridden, saved, error } = useSettings()
</script>

<template>
  <form class="settings-form" @submit.prevent="save(['download_path', 'ytdlp_extra_args', 'gallerydl_extra_args'])">
    <label class="field">
      <span class="label">Download path<span v-if="isOverridden('download_path')" class="env-badge">env</span></span>
      <input v-model="settings.download_path" class="input" :disabled="isOverridden('download_path')" />
    </label>
    <label class="field">
      <span class="label">yt-dlp extra args</span>
      <input v-model="settings.ytdlp_extra_args" class="input" />
    </label>
    <label class="field">
      <span class="label">gallery-dl extra args</span>
      <input v-model="settings.gallerydl_extra_args" class="input" />
    </label>
    <SaveRow :saved="saved" :error="error" />
  </form>
</template>
