<script setup lang="ts">
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'

const { settings, save, saved, error } = useSettings()
</script>

<template>
  <form
    class="settings-form"
    @submit.prevent="save(['share_default_expiry_days', 'share_default_allow_download', 'share_base_url', 'random_mode'])"
  >
    <label class="field">
      <span class="label">Default expiry (days, empty = never)</span>
      <input v-model="settings.share_default_expiry_days" class="input" />
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.share_default_allow_download !== '0'"
        @change="settings.share_default_allow_download = ($event.target as HTMLInputElement).checked ? '1' : '0'"
      />
      Allow download by default
    </label>
    <label class="field">
      <span class="label">Share base URL (OG embeds)</span>
      <input v-model="settings.share_base_url" placeholder="https://memes.example.com" class="input" />
    </label>
    <label class="field">
      <span class="label">Random mode</span>
      <select v-model="settings.random_mode" class="select">
        <option value="flag">Flagged items</option>
        <option value="shared">Items with share links</option>
      </select>
    </label>
    <SaveRow :saved="saved" :error="error" />
  </form>
</template>
