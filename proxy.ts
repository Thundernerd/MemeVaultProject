import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

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
    '/((?!_next/|share/|auth/|api/auth/|api/share/|api/v1/|favicon\\.ico).*)',
  ],
};
