<script setup lang="ts">
import { useSettings } from './useSettings'

const { settings, save, saved, error } = useSettings()
</script>

<template>
  <form
    class="flex flex-col gap-4 max-w-xl"
    @submit.prevent="save(['share_default_expiry_days', 'share_default_allow_download', 'share_base_url', 'random_mode'])"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">Default expiry (days, empty = never)</span>
      <input v-model="settings.share_default_expiry_days" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.share_default_allow_download !== '0'"
        @change="settings.share_default_allow_download = ($event.target as HTMLInputElement).checked ? '1' : '0'"
      />
      Allow download by default
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">Share base URL (OG embeds)</span>
      <input v-model="settings.share_base_url" placeholder="https://memes.example.com" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-text-secondary">Random mode</span>
      <select v-model="settings.random_mode" class="bg-surface-2 border border-border rounded-lg px-3 py-2">
        <option value="flag">Flagged items</option>
        <option value="shared">Items with share links</option>
      </select>
    </label>
    <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Save</button>
    <p v-if="saved" class="text-xs text-green-400">Saved</p>
    <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
  </form>
</template>
