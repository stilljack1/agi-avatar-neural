import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WelcomeClient from './WelcomeClient';

export default function WelcomePage() {
  const welcomeSeen = cookies().get('agi1_welcome_seen')?.value;

  if (welcomeSeen === 'true') {
    redirect('/login');
  }

  return <WelcomeClient />;
}
