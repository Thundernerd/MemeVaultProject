import path from 'path';
import fs from 'fs';
import { getDataDir } from './db';

export type CookieTool = 'ytdlp' | 'gallerydl';

export interface CookieStatus {
  exists: boolean;
  size: number | null;
  modifiedAt: string | null;
}

export function getCookiesDir(): string {
  return path.join(getDataDir(), 'cookies');
}

export function getCookiePath(tool: CookieTool): string {
  return path.join(getCookiesDir(), `${tool}_cookies.txt`);
}

export function getCookieStatus(tool: CookieTool): CookieStatus {
  const filePath = getCookiePath(tool);
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch {
    return { exists: false, size: null, modifiedAt: null };
  }
}

export function saveCookieFile(tool: CookieTool, content: string): void {
  const dir = getCookiesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getCookiePath(tool), content, 'utf-8');
}

export function deleteCookieFile(tool: CookieTool): void {
  try {
    fs.unlinkSync(getCookiePath(tool));
  } catch {
    // File didn't exist — that's fine
  }
}
