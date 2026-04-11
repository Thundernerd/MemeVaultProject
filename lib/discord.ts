import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  Interaction,
} from 'discord.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getSetting } from './db';
import { runYtdlp } from './ytdlp';
import { runGalleryDl } from './gallerydl';
import { logger } from './logger';

// Discord's maximum attachment size (10 MB for standard servers)
const DISCORD_SIZE_LIMIT = 10 * 1024 * 1024;

let client: Client | null = null;

export async function startDiscordBot(): Promise<void> {
  const enabled = getSetting('discord_enabled');
  if (enabled !== 'true') return;

  const token = getSetting('discord_bot_token') ?? '';
  const clientId = getSetting('discord_client_id') ?? '';
  const commandName = getSetting('discord_command_name') || 'get';

  if (!token || !clientId) {
    logger.warn('Discord bot enabled but token or client ID not configured — skipping');
    return;
  }

  try {
    await registerCommand(token, clientId, commandName);
  } catch (err) {
    logger.error(`Discord: failed to register slash command: ${err instanceof Error ? err.message : err}`);
    return;
  }

  client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('clientReady', (c) => {
    logger.info(`Discord bot ready: ${c.user.tag}`);
  });

  client.on('interactionCreate', (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== commandName) return;
    handleCommand(interaction).catch((err) => {
      logger.error(`Discord: unhandled error in command handler: ${err instanceof Error ? err.message : err}`);
    });
  });

  client.on('error', (err) => {
    logger.error(`Discord client error: ${err.message}`);
  });

  try {
    await client.login(token);
  } catch (err) {
    logger.error(`Discord: failed to log in: ${err instanceof Error ? err.message : err}`);
    client = null;
  }
}

export async function restartDiscordBot(): Promise<void> {
  if (client) {
    try {
      await client.destroy();
    } catch {
      // ignore errors during destroy
    }
    client = null;
  }
  await startDiscordBot();
}

async function registerCommand(token: string, clientId: string, commandName: string): Promise<void> {
  const command = new SlashCommandBuilder()
    .setName(commandName)
    .setDescription('Download a video or image and post it here')
    .addStringOption((opt) =>
      opt.setName('url').setDescription('The URL to download').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Type of media to download (default: video)')
        .setRequired(false)
        .addChoices({ name: 'Video', value: 'video' }, { name: 'Image / Album', value: 'image' })
    );

  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: [command.toJSON()] });
  logger.info(`Discord: slash command "/${commandName}" registered`);
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString('url', true);
  const type = (interaction.options.getString('type') ?? 'video') as 'video' | 'image';

  await interaction.deferReply();

  const tmpDir = path.join(os.tmpdir(), `memevault-discord-${randomUUID()}`);

  try {
    if (type === 'video') {
      const result = await runYtdlp(url, () => {}, undefined, tmpDir);
      const stat = fs.statSync(result.filePath);

      if (stat.size > DISCORD_SIZE_LIMIT) {
        const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
        await interaction.editReply(
          `The file is too large to post (${sizeMb} MB). Discord's limit is 10 MB.`
        );
        return;
      }

      await interaction.editReply({ files: [new AttachmentBuilder(result.filePath)] });
    } else {
      const results = await runGalleryDl(url, () => {}, undefined, tmpDir);

      if (results.length === 0) {
        await interaction.editReply('No files were downloaded from that URL.');
        return;
      }

      const valid = results.filter((r) => fs.statSync(r.filePath).size <= DISCORD_SIZE_LIMIT);
      const oversizedCount = results.length - valid.length;

      if (valid.length === 0) {
        await interaction.editReply(
          `All ${results.length} file(s) exceed Discord's 10 MB limit and cannot be posted.`
        );
        return;
      }

      // Post in batches of 10 (Discord's per-message attachment limit)
      const BATCH_SIZE = 10;
      let firstReply = true;

      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);
        const attachments = batch.map((r) => new AttachmentBuilder(r.filePath));

        if (firstReply) {
          await interaction.editReply({ files: attachments });
          firstReply = false;
        } else {
          await interaction.followUp({ files: attachments });
        }
      }

      if (oversizedCount > 0) {
        await interaction.followUp(
          `${oversizedCount} file(s) were skipped because they exceed Discord's 10 MB limit.`
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Discord: download error for url=${url}: ${message}`);
    try {
      const logBuffer = Buffer.from(message, 'utf-8');
      const logAttachment = new AttachmentBuilder(logBuffer, { name: 'error.log' });
      await interaction.editReply({
        content: "Oops, seems like that didn't work!",
        files: [logAttachment],
      });
    } catch {
      // interaction may have already been replied to or expired
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
