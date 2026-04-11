import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting, getEnvOverriddenKeys } from '@/lib/db';
import { restartDiscordBot } from '@/lib/discord';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const settings = getAllSettings();
  const overriddenByEnv = getEnvOverriddenKeys();
  return NextResponse.json({ ...settings, _overridden_by_env: overriddenByEnv });
}

export async function PUT(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowed = [
    'download_path',
    'ytdlp_extra_args',
    'gallerydl_extra_args',
    'ytdlp_bin',
    'gallerydl_bin',
    'ffmpeg_bin',
    'share_default_expiry_days',
    'share_default_allow_download',
    'share_base_url',
    'random_mode',
    'discord_enabled',
    'discord_bot_token',
    'discord_client_id',
    'discord_command_name',
  ];

  const discordKeys = new Set(['discord_enabled', 'discord_bot_token', 'discord_client_id', 'discord_command_name']);
  let discordChanged = false;

  for (const key of allowed) {
    if (key in body && typeof body[key] === 'string') {
      setSetting(key, body[key]);
      if (discordKeys.has(key)) discordChanged = true;
    }
  }

  // Regenerate API key if explicitly requested
  if (body.regenerate_api_key === 'true') {
    setSetting('api_key', uuidv4());
  }

  if (discordChanged) {
    restartDiscordBot().catch(() => {});
  }

  const overriddenByEnv = getEnvOverriddenKeys();
  return NextResponse.json({ ...getAllSettings(), _overridden_by_env: overriddenByEnv });
}
