import fs from 'fs';
import path from 'path';
import https from 'https';
import { execFileSync } from 'child_process';
import { getSetting, getDataDir } from './db';

export type BinaryName = 'ytdlp' | 'gallery-dl' | 'ffmpeg';

// ── Paths ────────────────────────────────────────────────────────────────────

export function getBinDir(): string {
  return path.join(getDataDir(), 'bin');
}

function defaultBinaryPath(name: BinaryName): string {
  const dir = getBinDir();
  if (name === 'ytdlp') return path.join(dir, ytdlpFilename());
  if (name === 'gallery-dl') return path.join(dir, galleryDlFilename());
  return path.join(dir, ffmpegFilename());
}

export function getYtdlpPath(): string {
  const override = getSetting('ytdlp_bin');
  return override?.trim() || defaultBinaryPath('ytdlp');
}

export function getGalleryDlPath(): string {
  const override = getSetting('gallerydl_bin');
  return override?.trim() || defaultBinaryPath('gallery-dl');
}

export function getFfmpegPath(): string {
  const override = getSetting('ffmpeg_bin');
  return override?.trim() || defaultBinaryPath('ffmpeg');
}

export function getFfprobePath(): string {
  const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  return path.join(getBinDir(), ffprobeName);
}

// ── Platform helpers ─────────────────────────────────────────────────────────

function ytdlpFilename(): string {
  if (process.platform === 'win32') return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.arch === 'arm64' || process.arch === 'arm') return 'yt-dlp_linux_aarch64';
  return 'yt-dlp';
}

function galleryDlFilename(): string {
  if (process.platform === 'win32') return 'gallery-dl.exe';
  if (process.platform === 'darwin') return 'gallery-dl';
  return 'gallery-dl.bin'; // Linux
}

function ffmpegFilename(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function ytdlpDownloadUrl(): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpFilename()}`;
}

function galleryDlDownloadUrl(): string {
  return `https://github.com/mikf/gallery-dl/releases/latest/download/${galleryDlFilename()}`;
}

function ffmpegArchiveUrl(): string {
  if (process.platform === 'darwin') {
    // evermeet.cx provides a zip containing just the ffmpeg binary
    return 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip';
  }
  if (process.platform === 'win32') {
    return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
  }
  // Linux
  if (process.arch === 'arm64' || process.arch === 'arm') {
    return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz';
  }
  return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz';
}

function ffmpegArchiveExt(): string {
  return process.platform === 'linux' ? '.tar.xz' : '.zip';
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface BinaryStatus {
  name: BinaryName;
  path: string;
  exists: boolean;
  version: string | null;
}

export function checkBinary(name: BinaryName): BinaryStatus {
  const binPath =
    name === 'ytdlp' ? getYtdlpPath() :
    name === 'gallery-dl' ? getGalleryDlPath() :
    getFfmpegPath();

  const exists = fs.existsSync(binPath);
  let version: string | null = null;

  if (exists) {
    try {
      // ffmpeg uses -version (single dash), others use --version
      const versionFlag = name === 'ffmpeg' ? '-version' : '--version';
      const out = execFileSync(binPath, [versionFlag], {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      // ffmpeg: "ffmpeg version 7.1 Copyright..."  — take first token after "version "
      // others: first line is just the version string
      if (name === 'ffmpeg') {
        const m = out.match(/version\s+(\S+)/);
        version = m ? m[1] : out.split('\n')[0].trim();
      } else {
        version = out.split('\n')[0].trim();
      }
    } catch (err) {
      console.warn(`[memevaultproject] checkBinary(${name}): version check failed:`, err instanceof Error ? err.message : err);
    }
  }

  return { name, path: binPath, exists, version };
}

// ── Download ─────────────────────────────────────────────────────────────────

export async function downloadBinary(name: BinaryName): Promise<BinaryStatus> {
  if (name === 'ffmpeg') return downloadFfmpeg();

  const url = name === 'ytdlp' ? ytdlpDownloadUrl() : galleryDlDownloadUrl();
  const binDir = getBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  const destPath = defaultBinaryPath(name);
  const tmpPath = destPath + '.tmp';

  await downloadFile(url, tmpPath);

  if (process.platform !== 'win32') {
    fs.chmodSync(tmpPath, 0o755);
  }

  fs.renameSync(tmpPath, destPath);
  return checkBinary(name);
}

async function downloadFfmpeg(): Promise<BinaryStatus> {
  const binDir = getBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  const archiveExt = ffmpegArchiveExt();
  const tmpArchive = path.join(binDir, `ffmpeg_download${archiveExt}`);
  const tmpExtractDir = path.join(binDir, 'ffmpeg_extract_tmp');
  const destPath = defaultBinaryPath('ffmpeg');

  try {
    // 1. Download the archive
    await downloadFile(ffmpegArchiveUrl(), tmpArchive);

    // 2. Extract to a temp directory
    fs.mkdirSync(tmpExtractDir, { recursive: true });
    extractArchive(tmpArchive, tmpExtractDir);

    // 3. Find the ffmpeg binary inside the extracted tree
    const found = findFile(tmpExtractDir, ffmpegFilename());
    if (!found) {
      throw new Error(`Could not find ${ffmpegFilename()} in the downloaded archive`);
    }

    // 4. Move to final destination and make executable
    fs.copyFileSync(found, destPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(destPath, 0o755);
    }

    // 5. Also extract ffprobe if present in the archive
    const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const ffprobeDestPath = path.join(binDir, ffprobeName);
    const foundFfprobe = findFile(tmpExtractDir, ffprobeName);
    if (foundFfprobe) {
      fs.copyFileSync(foundFfprobe, ffprobeDestPath);
      if (process.platform !== 'win32') {
        fs.chmodSync(ffprobeDestPath, 0o755);
      }
    }
  } finally {
    // Clean up temp files regardless of success/failure
    try { fs.rmSync(tmpArchive, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(tmpExtractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return checkBinary('ffmpeg');
}

function extractArchive(archivePath: string, destDir: string): void {
  const ext = archivePath.endsWith('.tar.xz') ? '.tar.xz' : '.zip';

  if (ext === '.tar.xz') {
    execFileSync('tar', ['-xf', archivePath, '-C', destDir]);
  } else if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-Command',
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`,
    ]);
  } else {
    // macOS / Linux with zip
    execFileSync('unzip', ['-o', archivePath, '-d', destDir]);
  }
}

/** Recursively find the first file matching `filename` inside `dir`. */
function findFile(dir: string, filename: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return full;
    }
  }
  return null;
}

/** Follow redirects and download a URL to a file path. */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);

    function get(currentUrl: string, redirects = 0) {
      if (redirects > 10) return reject(new Error('Too many redirects'));

      https
        .get(currentUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            get(res.headers.location, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            out.destroy();
            fs.unlink(dest, () => {});
            return reject(new Error(`HTTP ${res.statusCode} downloading ${currentUrl}`));
          }

          res.pipe(out);
          out.on('finish', () => out.close(() => resolve()));
          out.on('error', (err) => {
            out.destroy();
            fs.unlink(dest, () => {});
            reject(err);
          });
        })
        .on('error', (err) => {
          out.destroy();
          fs.unlink(dest, () => {});
          reject(err);
        });
    }

    get(url);
  });
}

// ── Startup helper ───────────────────────────────────────────────────────────

/**
 * Called at server startup. Auto-downloads any managed binary that is missing
 * (i.e. no custom path override is set and the default path doesn't exist).
 * Runs in the background — never throws.
 */
export async function ensureBinaries(): Promise<void> {
  const entries: { name: BinaryName; settingKey: string }[] = [
    { name: 'ytdlp',       settingKey: 'ytdlp_bin' },
    { name: 'gallery-dl',  settingKey: 'gallerydl_bin' },
    { name: 'ffmpeg',      settingKey: 'ffmpeg_bin' },
  ];

  for (const { name, settingKey } of entries) {
    const hasOverride = !!getSetting(settingKey)?.trim();
    if (hasOverride) continue;

    const status = checkBinary(name);
    if (!status.exists) {
      console.log(`[memevaultproject] ${name} not found, downloading…`);
      try {
        const result = await downloadBinary(name);
        console.log(`[memevaultproject] ${name} downloaded: ${result.path} (${result.version})`);
      } catch (err) {
        console.error(`[memevaultproject] Failed to download ${name}:`, err);
      }
    }
  }
}
