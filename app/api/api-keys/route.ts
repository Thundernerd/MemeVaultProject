import { NextRequest, NextResponse } from 'next/server';
import { listApiKeys, createApiKey, type ApiKeyPermission } from '@/lib/db';

export async function GET() {
  return NextResponse.json(listApiKeys());
}

export async function POST(req: NextRequest) {
  let body: { name?: string; permission?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, permission } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  if (permission !== 'read' && permission !== 'read_write') {
    return NextResponse.json(
      { error: 'permission must be "read" or "read_write"' },
      { status: 400 }
    );
  }

  const record = createApiKey(name.trim(), permission as ApiKeyPermission);
  // Return the full key — this is the only time it is sent to the client
  return NextResponse.json(record, { status: 201 });
}
