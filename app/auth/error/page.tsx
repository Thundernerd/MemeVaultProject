export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const message =
    error === 'Configuration'
      ? 'Server configuration error. Check OIDC environment variables.'
      : error === 'AccessDenied'
        ? 'Access denied by the identity provider.'
        : error === 'Verification'
          ? 'The sign-in link is invalid or has expired.'
          : 'An authentication error occurred. Please try again.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base">
      <div className="bg-surface-1 border border-border rounded-xl p-8 max-w-md w-full">
        <h1 className="text-xl font-bold text-text-primary mb-2">Authentication Error</h1>
        <p className="text-text-secondary text-sm">{message}</p>
        <a
          href="/auth/login"
          className="mt-6 inline-block px-4 py-2 bg-surface-2 text-text-primary text-sm rounded-lg hover:bg-surface-3 transition-colors"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
