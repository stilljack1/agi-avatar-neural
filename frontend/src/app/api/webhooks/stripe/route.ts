// ─────────────────────────────────────────────────────────
//  POST /api/webhooks/stripe — Stripe webhook handler
//  Verifies signature, provisions/revokes entitlements
// ─────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent, getStripe } from '@/lib/stripe';
import { upsertSubscription, provisionEntitlement, revokeEntitlement, updateOnboarding } from '@/lib/onboarding';
import type { PlanTier } from '@/lib/stripe';

// Disable body parsing — Stripe needs raw body
export const runtime = 'nodejs';

function priceToTier(priceId: string): PlanTier {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_TEAM) return 'team';
  return 'pro'; // fallback
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }

    let event;
    try {
      event = constructWebhookEvent(body, signature);
    } catch (err: any) {
      console.error('[webhook] Signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        if (!userId) break;

        // Fetch the subscription to get price info
        if (session.subscription) {
          const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price?.id || '';
          const tier = priceToTier(priceId);

          await upsertSubscription({
            user_id: userId,
            plan_tier: tier,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            current_period_start: new Date((sub as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
          });

          await provisionEntitlement(userId, tier);
          await updateOnboarding(userId, {
            plan_selected: true,
            onboarding_completed: true,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const priceId = sub.items?.data?.[0]?.price?.id || '';
        const tier = priceToTier(priceId);
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;

        await upsertSubscription({
          user_id: userId,
          plan_tier: tier,
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          status,
          current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });

        if (status === 'active') {
          await provisionEntitlement(userId, tier);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await upsertSubscription({
          user_id: userId,
          plan_tier: 'free',
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: null,
          status: 'canceled',
        });

        // Downgrade to free tier
        await provisionEntitlement(userId, 'free');
        break;
      }

      default:
        // Unhandled event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[webhook]', error);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }
}
