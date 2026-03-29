import RegisterClient, { type AuthMode } from './RegisterClient';

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { mode?: string };
}) {
  const initialMode: AuthMode = searchParams?.mode === 'signin' ? 'signin' : 'signup';
  return <RegisterClient initialMode={initialMode} />;
}
