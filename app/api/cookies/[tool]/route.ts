import { NextRequest, NextResponse } from 'next/server';
import { getCookieStatus, saveCookieFile, deleteCookieFile, CookieTool } from '@/lib/cookies';

function resolveTool(params: { tool: string }): CookieTool | null {
  if (params.tool === 'ytdlp' || params.tool === 'gallerydl') return params.tool;
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const tool = resolveTool(await params);
  if (!tool) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
  return NextResponse.json(getCookieStatus(tool));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const tool = resolveTool(await params);
  if (!tool) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const content = await (file as Blob).text();
  saveCookieFile(tool, content);
  return NextResponse.json(getCookieStatus(tool));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const tool = resolveTool(await params);
  if (!tool) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
  deleteCookieFile(tool);
  return NextResponse.json(getCookieStatus(tool));
}
