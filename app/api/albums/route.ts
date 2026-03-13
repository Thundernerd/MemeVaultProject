import { NextResponse } from 'next/server';
import { listAlbumsWithMedia } from '@/lib/db';

export async function GET() {
  return NextResponse.json(listAlbumsWithMedia());
}
