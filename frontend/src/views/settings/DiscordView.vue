<script setup lang="ts">
import { useSettings } from './useSettings'

const { settings, save, saved, error } = useSettings()
</script>

<template>
  <form
    class="flex flex-col gap-4 max-w-xl"
    @submit.prevent="save(['discord_enabled', 'discord_bot_token', 'discord_client_id', 'discord_command_name', 'discord_post_as_user'])"
  >
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.discord_enabled === 'true'"
        @change="settings.discord_enabled = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Enable Discord bot
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Bot token</span>
      <input v-model="settings.discord_bot_token" type="password" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Client ID</span>
      <input v-model="settings.discord_client_id" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Command name</span>
      <input v-model="settings.discord_command_name" placeholder="get" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.discord_post_as_user === 'true'"
        @change="settings.discord_post_as_user = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Post downloads as the command sender
    </label>
    <p class="text-xs text-text-muted">
      Downloads are posted to Discord only — they are not saved to the vault.
      When posting as the sender, the bot needs <strong>Manage Webhooks</strong>;
      messages use that person's name and avatar but are still webhook messages (not real user messages).
    </p>
    <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Save</button>
    <p v-if="saved" class="text-xs text-green-400">Saved</p>
    <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
  </form>
</template>
