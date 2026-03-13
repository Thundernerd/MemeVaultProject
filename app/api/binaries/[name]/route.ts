import { NextRequest, NextResponse } from 'next/server';
import { downloadBinary, type BinaryName } from '@/lib/binaries';

const VALID: BinaryName[] = ['ytdlp', 'gallery-dl', 'ffmpeg'];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  if (!VALID.includes(name as BinaryName)) {
    return NextResponse.json(
      { error: `Unknown binary "${name}". Valid values: ${VALID.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const status = await downloadBinary(name as BinaryName);
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
