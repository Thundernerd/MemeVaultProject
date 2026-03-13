import { NextResponse } from 'next/server';
import { checkBinary } from '@/lib/binaries';

export async function GET() {
  const ytdlp = checkBinary('ytdlp');
  const gallerydl = checkBinary('gallery-dl');
  const ffmpeg = checkBinary('ffmpeg');
  return NextResponse.json({ ytdlp, 'gallery-dl': gallerydl, ffmpeg });
}
