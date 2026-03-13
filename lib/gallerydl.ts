import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getSetting } from './db';
import { getGalleryDlPath } from './binaries';
import { getCookiePath } from './cookies';
import { buildErrorDetail } from './utils';

export interface GalleryDlFile {
  filePath: string;
  thumbnailPath: string | null;
  metadata: GalleryDlMetadata;
}

export interface GalleryDlMetadata {
  title?: string;
  description?: string;
  uploader?: string;
  author?: string;
  width?: number;
  height?: number;
  filename?: string;
  extension?: string;
  category?: string;
  subcategory?: string;
  [key: string]: unknown;
}

export async function runGalleryDl(
  url: string,
  onProgress: (filesDownloaded: number) => void,
  signal?: AbortSignal
): Promise<GalleryDlFile[]> {
  const downloadPath = getSetting('download_path') ?? '.';
  const extraArgs = getSetting('gallerydl_extra_args') ?? '';

  fs.mkdirSync(downloadPath, { recursive: true });

  const jobDir = path.join(downloadPath, `gallerydl_${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });

  const cookiePath = getCookiePath('gallerydl');
  const args = [
    '--write-metadata',
    '--directory', jobDir,
    ...(fs.existsSync(cookiePath) ? ['--cookies', cookiePath] : []),
    ...(extraArgs ? extraArgs.split(/\s+/).filter(Boolean) : []),
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(getGalleryDlPath(), args);

    if (signal) {
      signal.addEventListener('abort', () => proc.kill('SIGTERM'));
    }

    let filesDownloaded = 0;
    const stderrLines: string[] = [];
    const errorLines: string[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // gallery-dl prints error/warning lines starting with [error] or [warning]
        if (/^\[(error|warning)\]/i.test(trimmed)) {
          errorLines.push(trimmed);
        }

        // gallery-dl outputs downloaded file paths to stdout
        if (trimmed.startsWith('/') || trimmed.startsWith(jobDir)) {
          if (
            fs.existsSync(trimmed) &&
            !trimmed.endsWith('.json') &&
            !trimmed.endsWith('.part')
          ) {
            filesDownloaded++;
            onProgress(filesDownloaded);
          }
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
        return reject(new Error(`gallery-dl exited with code ${code}${detail}`));
      }

      try {
        const results = collectGalleryDlOutput(jobDir);
        onProgress(results.length);
        resolve(results);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn gallery-dl: ${err.message}`));
    });
  });
}


const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif',
  '.bmp', '.tiff', '.tif', '.svg',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv',
]);

function collectGalleryDlOutput(jobDir: string): GalleryDlFile[] {
  // Collect raw media entries first
  const raw: { filePath: string; metaPath: string | null; metadata: GalleryDlMetadata }[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) continue;

      const metaPath = fullPath + '.json';
      let metadata: GalleryDlMetadata = {};
      if (fs.existsSync(metaPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as GalleryDlMetadata;
        } catch {
          // keep defaults
        }
      }

      raw.push({ filePath: fullPath, metaPath: fs.existsSync(metaPath) ? metaPath : null, metadata });
    }
  }

  walk(jobDir);

  // Sort by original path for stable gallery order
  raw.sort((a, b) => a.filePath.localeCompare(b.filePath));

  return renameGalleryDlFiles(raw);
}

function renameGalleryDlFiles(
  raw: { filePath: string; metaPath: string | null; metadata: GalleryDlMetadata }[],
): GalleryDlFile[] {
  const pad = raw.length > 999 ? 4 : 3;
  return raw.map((entry, i) => {
    const index = String(i + 1).padStart(pad, '0');
    const ext = path.extname(entry.filePath).toLowerCase();
    const dir = path.dirname(entry.filePath);
    const baseName = `image_${index}${ext}`;
    const newFilePath = path.join(dir, baseName);

    fs.renameSync(entry.filePath, newFilePath);

    if (entry.metaPath) {
      fs.renameSync(entry.metaPath, path.join(dir, `${baseName}.json`));
    }

    const isImage = IMAGE_EXTENSIONS.has(ext);
    return {
      filePath: newFilePath,
      thumbnailPath: isImage ? newFilePath : null,
      metadata: entry.metadata,
    };
  });
}
