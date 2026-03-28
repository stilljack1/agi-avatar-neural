'use client';
// ─────────────────────────────────────────────────────────
//  AGI-1 — Subscription Plans Screen
//  Freemium | Pro | Team | Enterprise
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Suspense } from 'react';

interface Plan {
  tier: string;
  name: string;
  price: number;
  interval: string | null;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const plans: Plan[] = [
  {
    tier: 'free',
    name: 'Freemium',
    price: 0,
    interval: null,
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

function PlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Check for Stripe success/cancel
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccess(true);
      // Set onboarded cookie
      document.cookie = 'agi1_onboarded=true; path=/; max-age=31536000; SameSite=Lax';
      setTimeout(() => router.push('/neural'), 2000);
    }
  }, [searchParams, router]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function selectPlan(tier: string) {
    setLoading(tier);
    setError('');

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to process plan selection');
        return;
      }

      if (data.redirect) {
        // Freemium — set cookie and redirect
        document.cookie = 'agi1_onboarded=true; path=/; max-age=31536000; SameSite=Lax';
        router.push(data.redirect);
      } else if (data.url) {
        // Stripe Checkout — redirect to payment
        window.location.href = data.url;
      } else if (data.enterprise_pending) {
        setError('');
        alert('Thank you! Our enterprise team will contact you within 24 hours.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-[#FF6A00] rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to AGI-1</h1>
          <p className="text-white/60">Your subscription is active. Entering the system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#0077FF]/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#FF6A00]/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-[#FF6A00] to-[#0077FF] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,106,0,0.2)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose Your Plan</h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Start free or unlock the full power of AGI-1 with a premium plan.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Plans grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all hover:scale-[1.02] ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-[#FF6A00]/10 to-transparent border-[#FF6A00]/40 shadow-[0_0_40px_rgba(255,106,0,0.1)]'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#FF6A00] text-white text-xs font-bold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="text-4xl font-black">Free</span>
                  ) : plan.price === -1 ? (
                    <span className="text-2xl font-bold text-white/80">Custom</span>
                  ) : (
                    <>
                      <span className="text-4xl font-black">${plan.price}</span>
                      <span className="text-white/40 text-sm">/{plan.interval}</span>
                    </>
                  )}
                </div>
              </div>

              <ul className="space-y-3 flex-1 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => selectPlan(plan.tier)}
                disabled={loading !== null}
                className={`w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50 ${
                  plan.highlighted
                    ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8A33] text-white hover:opacity-90'
                    : plan.tier === 'enterprise'
                    ? 'bg-white/5 border border-white/20 text-white hover:bg-white/10'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {loading === plan.tier ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Processing...
                  </span>
                ) : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-sm text-white/30">
            All plans include 256-bit encryption and enterprise-grade security.
            Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <PlansContent />
    </Suspense>
  );
}
