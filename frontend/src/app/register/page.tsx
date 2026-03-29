import RegisterClient, { type AuthMode, type SocialProvider } from './RegisterClient';

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { mode?: string; provider?: string };
}) {
  const initialMode: AuthMode = searchParams?.mode === 'signin' ? 'signin' : 'signup';
  const initialProvider: SocialProvider =
    searchParams?.provider === 'google' || searchParams?.provider === 'apple'
      ? searchParams.provider
      : null;

  return <RegisterClient initialMode={initialMode} initialProvider={initialProvider} />;
}
