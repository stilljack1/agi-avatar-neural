// ─────────────────────────────────────────────────────────
//  GET /api/user/state — Returns onboarding/entitlement state
// ─────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserState } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ authenticated: false });
    }

    const state = await getUserState(session.user.email.toLowerCase());

    return NextResponse.json({
      authenticated: true,
      email: session.user.email,
      ...state,
    });
  } catch (error: any) {
    console.error('[user/state]', error);
    return NextResponse.json({ authenticated: false, error: 'Failed to fetch state' });
  }
}
