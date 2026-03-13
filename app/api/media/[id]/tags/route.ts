import { NextRequest, NextResponse } from 'next/server';
import { getMediaItem, getTagsForMedia, setTagsForMedia, upsertTag, addTagToMedia } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getMediaItem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(getTagsForMedia(id));
}

/** PUT body: { tags: string[] }  — replaces all tags on the item. */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getMediaItem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: { tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
  const result = setTagsForMedia(id, tags);
  return NextResponse.json(result);
}

/** POST body: { name: string }  — add a single tag. */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getMediaItem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name: string = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const tag = upsertTag(name);
  addTagToMedia(id, tag.id);
  return NextResponse.json(tag, { status: 201 });
}
