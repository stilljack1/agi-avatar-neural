import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WelcomeClient from './WelcomeClient';

export default function WelcomePage({
  searchParams,
}: {
  searchParams?: { client?: string; force?: string };
}) {
  const welcomeSeen = cookies().get('agi1_welcome_seen')?.value;
  const isAppClient = searchParams?.client === 'app';
  const forceWelcome = searchParams?.force === '1';

  if (welcomeSeen === 'true' && !isAppClient && !forceWelcome) {
    redirect('/login');
  }

  return <WelcomeClient clientVariant={isAppClient ? 'app' : 'web'} />;
}
