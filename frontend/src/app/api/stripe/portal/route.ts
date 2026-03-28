// ─────────────────────────────────────────────────────────
//  POST /api/stripe/portal — Stripe Customer Portal session
// ─────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createPortalSession } from '@/lib/stripe';
import { getSubscription } from '@/lib/onboarding';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sub = await getSubscription(session.user.email.toLowerCase());
    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://agi1.org';

    const portalSession = await createPortalSession({
      customerId: sub.stripe_customer_id,
      returnUrl: `${origin}/neural`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error('[stripe/portal]', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
