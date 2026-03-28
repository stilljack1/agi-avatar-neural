'use client';
// ─────────────────────────────────────────────────────────
//  AGI-1 — Registration + Consent Bundle + Data Breakdown
//  One primary acknowledgement at signup
//  Structured backend consent persistence remains decomposed
//  Sensitive permissions stay just-in-time
// ─────────────────────────────────────────────────────────
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CURRENT_POLICY_VERSIONS } from '@/lib/policyVersions';

// ── Data Use Summary categories ────────────────────────
const DATA_CATEGORIES = [
  {
    title: 'Identity & Account Data',
    items: ['Name', 'Email address', 'Secure authentication credentials', 'Phone number (if provided)', 'Auth provider', 'Profile settings'],
  },
  {
    title: 'Biometric & Live Interaction Data',
    items: ['Real-time voice streams', 'Real-time video streams', 'Voice interaction metadata', 'Session media state'],
  },
  {
    title: 'Device & Telemetry Data (OpenClaw V2)',
    items: ['Supported device permission states', 'OS/runtime telemetry', 'Hardware utilization', 'Network/runtime status'],
  },
  {
    title: 'Execution & Background Logs (Aegis)',
    items: ['Safety logs', 'Execution state', 'Operational traces', 'Intervention history'],
  },
  {
    title: 'Agentic Memory & Behavioral Data',
    items: ['Task history', 'Chat history', 'Saved preferences', 'Research state', 'Image library metadata', 'Uploads metadata'],
  },
  {
    title: 'Financial & Transactional Data',
    items: ['Subscriptions', 'Tips', 'Donations', 'Receipt metadata', 'Billing state'],
  },
];

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    master_consent_granted: false,
    // Optional consents (NOT pre-checked)
    marketing_opt_in: false,
    personalization_opt_in: false,
    model_improvement_opt_in: false,
    community_opt_in: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [showDataSummary, setShowDataSummary] = useState(false);

  const update = (field: string, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }));

  const masterConsentGranted = form.master_consent_granted;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!masterConsentGranted) {
      setError('You must acknowledge the AGI-1 consent bundle to create an account.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone_number: form.phone_number.trim(),
          master_consent_granted: form.master_consent_granted,
          consent_bundle_version: CURRENT_POLICY_VERSIONS.consent_bundle,
          data_breakdown_version: CURRENT_POLICY_VERSIONS.data_breakdown,
          agreement_text_version: CURRENT_POLICY_VERSIONS.agreement_text,
          // Optional
          marketing_opt_in: form.marketing_opt_in,
          personalization_opt_in: form.personalization_opt_in,
          model_improvement_opt_in: form.model_improvement_opt_in,
          community_opt_in: form.community_opt_in,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      const result = await signIn('credentials', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        router.push('/login');
      } else {
        router.push('/plans');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Checkbox row component ──────────────────────────────
  const Checkbox = ({
    field,
    label,
  }: {
    field: string;
    label: React.ReactNode;
  }) => (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={(form as Record<string, unknown>)[field] as boolean}
          onChange={(e) => update(field, e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-[18px] h-[18px] rounded border-2 transition-all peer-checked:bg-[#0077FF] peer-checked:border-[#0077FF] border-white/25 group-hover:border-white/40 flex items-center justify-center">
          {(form as Record<string, unknown>)[field] && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-[13px] leading-relaxed text-white/60">
        {label}
      </span>
    </label>
  );

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#FF6A00]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#0077FF]/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg py-8">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-[#FF6A00] to-[#0077FF] flex items-center justify-center mb-3 shadow-[0_0_40px_rgba(255,106,0,0.2)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-white/40 mt-1 text-sm">Join the future of AI interaction</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          {/* OAuth */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              onClick={() => signIn('google', { callbackUrl: '/plans' })}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-colors text-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button
              onClick={() => signIn('apple', { callbackUrl: '/plans' })}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Apple
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-black px-4 text-white/25 uppercase tracking-wider">or register with email</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* ══════════ FORM ══════════ */}
          <form onSubmit={handleRegister} className="space-y-4">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">First Name</label>
                <input
                  type="text" value={form.first_name} onChange={e => update('first_name', e.target.value)}
                  placeholder="First" required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Last Name</label>
                <input
                  type="text" value={form.last_name} onChange={e => update('last_name', e.target.value)}
                  placeholder="Last" required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Email</label>
              <input
                type="email" value={form.email} onChange={e => update('email', e.target.value)}
                placeholder="you@company.com" required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Phone <span className="normal-case text-white/25">(optional)</span></label>
              <input
                type="tel" value={form.phone_number} onChange={e => update('phone_number', e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
              />
            </div>

            {/* Password */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password" value={form.password} onChange={e => update('password', e.target.value)}
                  placeholder="Min 8 chars" required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Confirm</label>
                <input
                  type="password" value={form.confirm_password} onChange={e => update('confirm_password', e.target.value)}
                  placeholder="Repeat" required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-white/20 focus:border-[#0077FF]/50 outline-none text-sm"
                />
              </div>
            </div>

            {/* ═══════════════════════════════════════════════
                MASTER CONSENT BUNDLE
                ═══════════════════════════════════════════════ */}
            <div className="pt-3">
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">
                Required to continue
              </p>
              <p className="text-xs text-white/25 mb-3">
                Terms v{CURRENT_POLICY_VERSIONS.terms}, Privacy v{CURRENT_POLICY_VERSIONS.privacy}, bundle v{CURRENT_POLICY_VERSIONS.consent_bundle}.
              </p>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <Checkbox
                  field="master_consent_granted"
                  label={
                    <>
                      I acknowledge and agree to the <a href="/terms" target="_blank" className="text-[#0077FF] underline hover:text-[#0077FF]/80">Fair Group AI Terms of Service</a>,{' '}
                      <a href="/privacy" target="_blank" className="text-[#0077FF] underline hover:text-[#0077FF]/80">Privacy Policy</a>, and the strict Data Collection Breakdown required to power the AGI-1 model,
                      OpenClaw V2 device control, and Aegis background execution.
                    </>
                  }
                />
                <p className="mt-3 text-xs leading-relaxed text-white/35">
                  Camera, microphone, live video, and device-control permissions are requested only when you enable those features. They are not granted by this signup acknowledgement alone.
                </p>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════
                DATA USE SUMMARY PANEL
                ═══════════════════════════════════════════════ */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDataSummary(!showDataSummary)}
                className="flex items-center gap-2 text-[13px] text-[#0077FF] hover:text-[#0077FF]/80 transition-colors"
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`transition-transform ${showDataSummary ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                What we collect — Data Use Summary
              </button>

              {showDataSummary && (
                <div className="mt-3 bg-white/[0.02] border border-white/8 rounded-xl p-4 space-y-1">
                  <p className="text-[11px] text-white/30 mb-3">
                    Data Breakdown v{CURRENT_POLICY_VERSIONS.data_breakdown}. Tap a category to see details. Sensitive features remain just-in-time and are only requested when you enable them.
                  </p>
                  <div className="max-h-72 overflow-y-auto pr-1">
                    {DATA_CATEGORIES.map((cat, i) => (
                    <div key={cat.title} className="border-b border-white/5 last:border-0">
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(expandedCategory === i ? null : i)}
                        className="w-full flex items-center justify-between py-2.5 text-left"
                      >
                        <span className="text-[13px] text-white/50 font-medium">{cat.title}</span>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          className={`text-white/20 transition-transform ${expandedCategory === i ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                      {expandedCategory === i && (
                        <ul className="pb-3 pl-3 space-y-1">
                          {cat.items.map(item => (
                            <li key={item} className="text-[12px] text-white/30 flex items-center gap-2">
                              <span className="w-1 h-1 bg-white/20 rounded-full flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !masterConsentGranted}
              className="w-full bg-gradient-to-r from-[#FF6A00] to-[#FF8A33] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed mt-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-white/40 mt-5">
            Already have an account?{' '}
            <a href="/login" className="text-[#0077FF] hover:underline font-medium">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
