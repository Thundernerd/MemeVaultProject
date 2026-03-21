import { auth, oidcEnabled } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const authMiddleware = auth((req) => {
  if (!req.auth) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export default oidcEnabled
  ? authMiddleware
  : (_req: NextRequest) => NextResponse.next();

export const config = {
  matcher: [
    // Protect everything EXCEPT:
    //   /_next/*       Next.js internals
    //   /share/*       Public share viewer pages
    //   /auth/*        Login/logout/error pages
    //   /api/auth/*    Auth.js own handler
    //   /api/share/*   Public token-based file API
    //   /api/v1/*      External API (keeps API key auth)
    //   favicon.ico
    //   safe.png        App icon used in pages
    '/((?!_next/|share/|auth/|api/auth/|api/share/|api/v1/|favicon\\.ico|safe\\.png).*)',
  ],
};
