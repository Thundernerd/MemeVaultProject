import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getSetting } from './db';
import { getYtdlpPath, getFfmpegPath, checkBinary } from './binaries';
import { getCookiePath } from './cookies';
import { buildErrorDetail } from './utils';

export interface YtdlpResult {
  filePath: string;
  thumbnailPath: string | null;
  metadata: YtdlpMetadata;
}

export interface YtdlpMetadata {
  title?: string;
  description?: string;
  uploader?: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  webpage_url?: string;
  [key: string]: unknown;
}

export async function runYtdlp(
  url: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<YtdlpResult> {
  const downloadPath = getSetting('download_path') ?? '.';
  const extraArgs = getSetting('ytdlp_extra_args') ?? '';

  fs.mkdirSync(downloadPath, { recursive: true });

  // Use a temp directory per job to isolate output files
  const jobDir = path.join(downloadPath, `ytdlp_${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });

  const ffmpegStatus = checkBinary('ffmpeg');
  const cookiePath = getCookiePath('ytdlp');
  const args = [
    '--write-thumbnail',
    '--write-info-json',
    '--newline',
    ...(ffmpegStatus.exists ? ['--ffmpeg-location', getFfmpegPath()] : []),
    ...(fs.existsSync(cookiePath) ? ['--cookies', cookiePath] : []),
    '-o', path.join(jobDir, '%(title)s.%(ext)s'),
    ...(extraArgs ? extraArgs.split(/\s+/).filter(Boolean) : []),
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(getYtdlpPath(), args);

    if (signal) {
      signal.addEventListener('abort', () => proc.kill('SIGTERM'));
    }

    const stderrLines: string[] = [];
    const errorLines: string[] = []; // yt-dlp error lines also appear on stdout

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        const pct = parseYtdlpProgress(line);
        if (pct !== null) {
          onProgress(pct);
        }
        // Capture ERROR lines from stdout for the error message
        if (line.startsWith('ERROR:') || line.includes('[error]')) {
          errorLines.push(line.trim());
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) stderrLines.push(trimmed);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        fs.rmSync(jobDir, { recursive: true, force: true });
        const detail = buildErrorDetail(errorLines, stderrLines);
        return reject(new Error(`yt-dlp exited with code ${code}${detail}`));
      }

      try {
        const result = collectYtdlpOutput(jobDir, url);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}


function parseYtdlpProgress(line: string): number | null {
  // [download]  42.3% of ...
  const m = line.match(/\[download\]\s+([\d.]+)%/);
  if (!m) return null;
  return parseFloat(m[1]);
}

function collectYtdlpOutput(jobDir: string, originalUrl: string): YtdlpResult {
  const files = fs.readdirSync(jobDir);

  const THUMBNAIL_EXTS = new Set(['.jpg', '.jpeg', '.webp', '.png', '.avif']);
  const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.wmv', '.m4v', '.ts']);
  const infoJsonFile = files.find((f) => f.endsWith('.info.json'));
  const thumbnailFile = files.find((f) => THUMBNAIL_EXTS.has(path.extname(f).toLowerCase()));
  const mediaFile = files.find((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()));

  if (!mediaFile) {
    throw new Error(`yt-dlp produced no media file in ${jobDir}`);
  }

  // Read metadata before renaming
  let metadata: YtdlpMetadata = { webpage_url: originalUrl };
  if (infoJsonFile) {
    try {
      const raw = fs.readFileSync(path.join(jobDir, infoJsonFile), 'utf-8');
      metadata = JSON.parse(raw) as YtdlpMetadata;
    } catch {
      // keep defaults
    }
  }

  // Rename to stable, character-safe filenames
  const { filePath, thumbnailPath } = renameYtdlpFiles(
    jobDir,
    mediaFile,
    thumbnailFile ?? null,
    infoJsonFile ?? null,
  );

  return { filePath, thumbnailPath, metadata };
}

function renameYtdlpFiles(
  jobDir: string,
  mediaFile: string,
  thumbnailFile: string | null,
  infoJsonFile: string | null,
): { filePath: string; thumbnailPath: string | null } {
  const mediaExt = path.extname(mediaFile).toLowerCase();
  const newMediaPath = path.join(jobDir, `video${mediaExt}`);
  fs.renameSync(path.join(jobDir, mediaFile), newMediaPath);

  let newThumbnailPath: string | null = null;
  if (thumbnailFile) {
    const thumbExt = path.extname(thumbnailFile).toLowerCase();
    newThumbnailPath = path.join(jobDir, `thumbnail${thumbExt}`);
    fs.renameSync(path.join(jobDir, thumbnailFile), newThumbnailPath);
  }

  if (infoJsonFile) {
    fs.renameSync(path.join(jobDir, infoJsonFile), path.join(jobDir, 'data.json'));
  }

  return { filePath: newMediaPath, thumbnailPath: newThumbnailPath };
}
