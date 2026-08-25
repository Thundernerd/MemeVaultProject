<script setup lang="ts">
import { useSettings } from './useSettings'

const { settings, save, isOverridden, saved, error } = useSettings()
</script>

<template>
  <form class="flex flex-col gap-4 max-w-xl" @submit.prevent="save(['download_path', 'ytdlp_extra_args', 'gallerydl_extra_args'])">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">Download path {{ isOverridden('download_path') ? '(env)' : '' }}</span>
      <input v-model="settings.download_path" class="bg-surface-2 border border-border rounded-lg px-3 py-2" :disabled="isOverridden('download_path')" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">yt-dlp extra args</span>
      <input v-model="settings.ytdlp_extra_args" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">gallery-dl extra args</span>
      <input v-model="settings.gallerydl_extra_args" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Save</button>
    <p v-if="saved" class="text-xs text-green-400">Saved</p>
    <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
  </form>
</template>
