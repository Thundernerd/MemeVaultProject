import { NextRequest, NextResponse } from 'next/server';
import { listAllTags, deleteTag } from '@/lib/db';

export async function GET() {
  return NextResponse.json(listAllTags());
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  deleteTag(id);
  return new NextResponse(null, { status: 204 });
}
