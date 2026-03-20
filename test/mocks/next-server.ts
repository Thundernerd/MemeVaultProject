/**
 * Minimal stub for next/server used in unit/integration tests.
 * NextRequest extends the native Request; NextResponse extends the native Response.
 * Route handlers only use NextResponse.json() and new NextResponse(body, init),
 * both of which are covered here.
 */

export class NextRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
}
