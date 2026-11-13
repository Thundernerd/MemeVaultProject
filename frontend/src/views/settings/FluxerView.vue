<script setup lang="ts">
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'

const { settings, save, saved, error } = useSettings()

const keys = [
  'fluxer_enabled',
  'fluxer_bot_token',
  'fluxer_instance_url',
  'fluxer_command_name',
  'fluxer_command_prefix',
  'fluxer_post_as_user',
  'fluxer_delete_command_message',
]

const command = () =>
  `${settings.fluxer_command_prefix || '!'}${settings.fluxer_command_name || 'get'}`
</script>

<template>
  <form class="settings-form" @submit.prevent="save(keys)">
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.fluxer_enabled === 'true'"
        @change="settings.fluxer_enabled = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Enable Fluxer bot
    </label>
    <label class="field">
      <span class="label">Bot token</span>
      <input v-model="settings.fluxer_bot_token" type="password" placeholder="&lt;application_id&gt;.&lt;secret&gt;" class="input" />
    </label>
    <label class="field">
      <span class="label">Instance URL</span>
      <input v-model="settings.fluxer_instance_url" placeholder="https://fluxer.app" class="input" />
    </label>
    <div class="two-col">
      <label class="field">
        <span class="label">Command prefix</span>
        <input v-model="settings.fluxer_command_prefix" placeholder="!" class="input" />
      </label>
      <label class="field">
        <span class="label">Command name</span>
        <input v-model="settings.fluxer_command_name" placeholder="get" class="input" />
      </label>
    </div>
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.fluxer_post_as_user === 'true'"
        @change="settings.fluxer_post_as_user = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Post downloads as the command sender
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="settings.fluxer_delete_command_message !== 'false'"
        @change="settings.fluxer_delete_command_message = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Delete the sender's command message
    </label>
    <p class="help">
      Fluxer bots do not have slash commands, so users invoke the bot with a message like
      <code>{{ command() }} &lt;url&gt;</code>. Add <code>image</code> for image sites
      (<code>{{ command() }} image &lt;url&gt;</code>) and any trailing text as a caption.
      Downloads are posted to Fluxer only — they are not saved to the vault. They still appear in
      the Queue (marked Fluxer) so you can track progress and cancel. When posting as the sender,
      the bot needs <strong>Manage Webhooks</strong>; messages use that person's name and avatar
      but are still webhook messages (not real user messages). Deleting the sender's command
      message requires the bot to hold <strong>Manage Messages</strong>; it is skipped in DMs.
    </p>
    <SaveRow :saved="saved" :error="error" />
  </form>
</template>
