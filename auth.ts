import NextAuth from 'next-auth';

export const oidcEnabled = !!(
  process.env.MEMEVAULTPROJECT_OIDC_ISSUER &&
  process.env.MEMEVAULTPROJECT_OIDC_CLIENT_ID &&
  process.env.MEMEVAULTPROJECT_OIDC_CLIENT_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: oidcEnabled
    ? [
        {
          id: 'oidc',
          name: 'OIDC',
          type: 'oidc',
          issuer: process.env.MEMEVAULTPROJECT_OIDC_ISSUER,
          clientId: process.env.MEMEVAULTPROJECT_OIDC_CLIENT_ID,
          clientSecret: process.env.MEMEVAULTPROJECT_OIDC_CLIENT_SECRET,
        },
      ]
    : [],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
  },
  callbacks: {
    authorized({ auth }) {
      return oidcEnabled ? !!auth : true;
    },
  },
});
