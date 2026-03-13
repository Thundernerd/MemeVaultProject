import { NextResponse } from 'next/server';
import { listMediaItemsWithTags } from '@/lib/db';

export async function GET() {
  return NextResponse.json(listMediaItemsWithTags());
}
