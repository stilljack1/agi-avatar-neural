// ─────────────────────────────────────────────────────────
//  POST /api/stripe/checkout — Create Stripe Checkout session
// ─────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCheckoutSession, PLANS } from '@/lib/stripe';
import { upsertSubscription, provisionEntitlement, updateOnboarding } from '@/lib/onboarding';
import type { PlanTier } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tier } = body as { tier: PlanTier };

    const email = session.user.email.toLowerCase();
    const userId = email;

    // Handle freemium — no Stripe needed
    if (tier === 'free') {
      await upsertSubscription({
        user_id: userId,
        plan_tier: 'free',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        status: 'active',
      });

      await provisionEntitlement(userId, 'free');

      await updateOnboarding(userId, {
        plan_selected: true,
        onboarding_completed: true,
      });

      return NextResponse.json({ success: true, redirect: '/neural' });
    }

    // Handle enterprise — contact sales
    if (tier === 'enterprise') {
      await updateOnboarding(userId, { plan_selected: true });
      return NextResponse.json({
        success: true,
        redirect: null,
        message: 'Our team will be in touch within 24 hours.',
        enterprise_pending: true,
      });
    }

    // Handle paid plans (pro, team)
    const plan = PLANS.find(p => p.tier === tier);
    if (!plan || !plan.stripePriceId) {
      return NextResponse.json(
        { error: 'Plan not available. Please set STRIPE_PRICE_PRO and STRIPE_PRICE_TEAM environment variables.' },
        { status: 400 }
      );
    }

    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://agi1.org';

    const checkoutSession = await createCheckoutSession({
      userId,
      email,
      priceId: plan.stripePriceId,
      successUrl: `${origin}/plans?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/plans?canceled=true`,
    });

    return NextResponse.json({ success: true, url: checkoutSession.url });
  } catch (error: any) {
    console.error('[stripe/checkout]', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
