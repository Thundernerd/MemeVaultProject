import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';

export default function LoginPage() {
  const oidcEnabled = !!(
    process.env.MEMEVAULTPROJECT_OIDC_ISSUER &&
    process.env.MEMEVAULTPROJECT_OIDC_CLIENT_ID &&
    process.env.MEMEVAULTPROJECT_OIDC_CLIENT_SECRET
  );

  if (!oidcEnabled) redirect('/');

  return <LoginClient />;
}
