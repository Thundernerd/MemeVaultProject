import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting, getEnvOverriddenKeys } from '@/lib/db';
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
  ];

  for (const key of allowed) {
    if (key in body && typeof body[key] === 'string') {
      setSetting(key, body[key]);
    }
  }

  // Regenerate API key if explicitly requested
  if (body.regenerate_api_key === 'true') {
    setSetting('api_key', uuidv4());
  }

  const overriddenByEnv = getEnvOverriddenKeys();
  return NextResponse.json({ ...getAllSettings(), _overridden_by_env: overriddenByEnv });
}
