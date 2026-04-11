export interface Settings {
  download_path: string;
  ytdlp_extra_args: string;
  gallerydl_extra_args: string;
  api_key: string;
  ytdlp_bin: string;
  gallerydl_bin: string;
  ffmpeg_bin: string;
  share_default_expiry_days: string;
  share_default_allow_download: string;
  share_base_url: string;
  random_mode: string;
  discord_enabled: string;
  discord_bot_token: string;
  discord_client_id: string;
  discord_command_name: string;
  _overridden_by_env: string[];
}

export interface BinaryStatus {
  name: string;
  path: string;
  exists: boolean;
  version: string | null;
}

export interface BinariesState {
  ytdlp: BinaryStatus | null;
  'gallery-dl': BinaryStatus | null;
  ffmpeg: BinaryStatus | null;
}

export interface CookieStatus {
  exists: boolean;
  size: number | null;
  modifiedAt: string | null;
}

export interface CookiesState {
  ytdlp: CookieStatus | null;
  gallerydl: CookieStatus | null;
}
