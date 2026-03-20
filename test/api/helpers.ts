import { NextRequest } from 'next/server';

/** Build a NextRequest for testing route handlers. */
export function makeReq(
  url: string,
  {
    method = 'GET',
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  return new NextRequest(url, init);
}

/** Parse JSON from a Response. */
export async function json(res: Response): Promise<unknown> {
  return res.json();
}
