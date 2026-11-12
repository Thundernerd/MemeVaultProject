<script setup lang="ts">
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'

const { settings, save, saved, error } = useSettings()
</script>

<template>
  <form
    class="settings-form"
    @submit.prevent="save(['discord_enabled', 'discord_bot_token', 'discord_client_id', 'discord_command_name', 'discord_post_as_user'])"
  >
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.discord_enabled === 'true'"
        @change="settings.discord_enabled = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Enable Discord bot
    </label>
    <label class="field">
      <span class="label">Bot token</span>
      <input v-model="settings.discord_bot_token" type="password" class="input" />
    </label>
    <label class="field">
      <span class="label">Client ID</span>
      <input v-model="settings.discord_client_id" class="input" />
    </label>
    <label class="field">
      <span class="label">Command name</span>
      <input v-model="settings.discord_command_name" placeholder="get" class="input" />
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.discord_post_as_user === 'true'"
        @change="settings.discord_post_as_user = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Post downloads as the command sender
    </label>
    <p class="help">
      Downloads are posted to Discord only — they are not saved to the vault.
      They still appear in the Queue (marked Discord) so you can track progress and cancel.
      When posting as the sender, the bot needs <strong>Manage Webhooks</strong>;
      messages use that person's name and avatar but are still webhook messages (not real user messages).
    </p>
    <SaveRow :saved="saved" :error="error" />
  </form>
</template>
