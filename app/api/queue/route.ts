import { NextResponse } from 'next/server';
import { listQueueItems } from '@/lib/db';

export async function GET() {
  const items = listQueueItems();
  return NextResponse.json(items);
}
