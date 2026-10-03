<script setup lang="ts">
import { useSettings } from './useSettings'

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
  <form class="flex flex-col gap-4 max-w-xl" @submit.prevent="save(keys)">
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.fluxer_enabled === 'true'"
        @change="settings.fluxer_enabled = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Enable Fluxer bot
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Bot token</span>
      <input v-model="settings.fluxer_bot_token" type="password" placeholder="&lt;application_id&gt;.&lt;secret&gt;" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Instance URL</span>
      <input v-model="settings.fluxer_instance_url" placeholder="https://fluxer.app" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
    </label>
    <div class="flex gap-4">
      <label class="flex flex-col gap-1 text-sm flex-1">
        <span>Command prefix</span>
        <input v-model="settings.fluxer_command_prefix" placeholder="!" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm flex-1">
        <span>Command name</span>
        <input v-model="settings.fluxer_command_name" placeholder="get" class="bg-surface-2 border border-border rounded-lg px-3 py-2" />
      </label>
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.fluxer_post_as_user === 'true'"
        @change="settings.fluxer_post_as_user = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Post downloads as the command sender
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="settings.fluxer_delete_command_message !== 'false'"
        @change="settings.fluxer_delete_command_message = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
      />
      Delete the sender's command message
    </label>
    <p class="text-xs text-text-muted">
      Fluxer bots do not have slash commands, so users invoke the bot with a message like
      <code>{{ command() }} &lt;url&gt;</code>. Add <code>image</code> for image sites
      (<code>{{ command() }} image &lt;url&gt;</code>) and any trailing text as a caption.
      Downloads are posted to Fluxer only — they are not saved to the vault. They still appear in
      the Queue (marked Fluxer) so you can track progress and cancel. When posting as the sender,
      the bot needs <strong>Manage Webhooks</strong>; messages use that person's name and avatar
      but are still webhook messages (not real user messages). Deleting the sender's command
      message requires the bot to hold <strong>Manage Messages</strong>; it is skipped in DMs.
    </p>
    <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Save</button>
    <p v-if="saved" class="text-xs text-green-400">Saved</p>
    <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
  </form>
</template>
