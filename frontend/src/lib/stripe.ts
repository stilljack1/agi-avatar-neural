// ─────────────────────────────────────────────────────────
//  AGI-1 — Stripe Billing Integration
// ─────────────────────────────────────────────────────────
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// Alias for convenience
export const stripe = { get: getStripe };

// ── Plan definitions ─────────────────────────────────────
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  price: number;
  interval: 'month' | 'year' | null;
  stripePriceId: string | null;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const PLANS: PlanConfig[] = [
  {
    tier: 'free',
    name: 'Freemium',
    price: 0,
    interval: null,
    stripePriceId: null,
    features: [
      'Access to Jack & Julia AI Assistants',
      '50 messages per day',
      'Text-based interaction',
      'Basic task execution',
      'Community support',
    ],
    cta: 'Start Free',
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 49,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_PRO || null,
    features: [
      'Unlimited messages',
      'Voice & video interaction',
      'Full-duplex real-time conversation',
      'Vision & screen analysis',
      'Google Workspace integration',
      'Priority support',
      'Advanced task orchestration',
    ],
    cta: 'Upgrade to Pro',
    highlighted: true,
  },
  {
    tier: 'team',
    name: 'Team',
    price: 149,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
    features: [
      'Everything in Pro',
      'Up to 10 team members',
      'Shared workspace & memory',
      'Team analytics dashboard',
      'Admin controls & audit logs',
      'Custom agent personas',
      'API access',
    ],
    cta: 'Start Team Plan',
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: -1,
    interval: null,
    stripePriceId: null,
    features: [
      'Everything in Team',
      'Unlimited members',
      'Dedicated infrastructure',
      'Custom model fine-tuning',
      'SLA guarantee',
      'Dedicated account manager',
      'On-premise deployment option',
      'SOC 2 compliance',
    ],
    cta: 'Contact Sales',
  },
];

// ── Checkout session ─────────────────────────────────────
export async function createCheckoutSession({
  userId,
  email,
  priceId,
  successUrl,
  cancelUrl,
}: {
  userId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },
  });

  return session;
}

// ── Customer portal ──────────────────────────────────────
export async function createPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session;
}

// ── Webhook signature verification ───────────────────────
export function constructWebhookEvent(body: string, signature: string) {
  return getStripe().webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
