'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CURRENT_POLICY_VERSIONS } from '@/lib/policyVersions';

export type AuthMode = 'signup' | 'signin';
export type SocialProvider = 'google' | 'apple' | null;

const DATA_CATEGORIES = [
  {
    title: 'Identity & Account Data',
    items: ['First name', 'Last name', 'Email address', 'Phone number', 'Secure authentication credentials', 'Profile settings'],
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

function AuthModeToggle({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (nextMode: AuthMode) => void;
}) {
  return (
    <div className="mb-6 rounded-full border border-white/10 bg-white/[0.03] p-1">
      <div className="grid grid-cols-2 gap-1">
        {(['signup', 'signin'] as AuthMode[]).map((option) => {
          const active = mode === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onModeChange(option)}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                active ? 'text-white' : 'text-white/45 hover:text-white/70'
              }`}
              style={
                active
                  ? {
                      background:
                        option === 'signup'
                          ? 'linear-gradient(135deg, #FF6A00, #FF8A33)'
                          : 'linear-gradient(135deg, #0077FF, #00A3FF)',
                      boxShadow: '0 0 30px rgba(0,0,0,0.22)',
                    }
                  : undefined
              }
            >
              {option === 'signup' ? 'Sign Up' : 'Sign In'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SocialButtons({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl })}
        className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-100"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => signIn('apple', { callbackUrl })}
        className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
        Continue with Apple
      </button>
    </div>
  );
}

export default function RegisterClient({
  initialMode,
  initialProvider = null,
}: {
  initialMode: AuthMode;
  initialProvider?: SocialProvider;
}) {
  const router = useRouter();
  const autoProviderAttemptRef = useRef<string | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [signInForm, setSignInForm] = useState({
    email: '',
    password: '',
  });
  const [signUpForm, setSignUpForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    master_consent_granted: false,
    marketing_opt_in: false,
    personalization_opt_in: false,
    model_improvement_opt_in: false,
    community_opt_in: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<number | null>(0);
  const [showDataSummary, setShowDataSummary] = useState(true);

  const callbackUrl = '/plans';
  const masterConsentGranted = signUpForm.master_consent_granted;

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!initialProvider) {
      return;
    }

    const attemptKey = `${initialMode}:${initialProvider}`;
    if (autoProviderAttemptRef.current === attemptKey) {
      return;
    }

    autoProviderAttemptRef.current = attemptKey;
    setError('');
    void signIn(initialProvider, { callbackUrl });
  }, [callbackUrl, initialMode, initialProvider]);

  const heading = useMemo(
    () =>
      mode === 'signup'
        ? {
            title: 'Create your AGI-1 account',
            subtitle: 'Sign up with Apple, Google, or register with your first name, last name, phone number, email address, and acknowledgement below.',
            divider: 'or register with your details',
            submit: 'Create Account',
          }
        : {
            title: 'Sign in to AGI-1',
            subtitle: 'Continue with Apple, Google, or sign in with your email address and password.',
            divider: 'or sign in with email',
            submit: 'Sign In',
          },
    [mode],
  );

  const syncMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    const nextUrl = nextMode === 'signin' ? '/register?mode=signin' : '/register?mode=signup';
    window.history.replaceState(null, '', nextUrl);
    setError('');
  };

  const updateSignUp = (field: keyof typeof signUpForm, value: string | boolean) =>
    setSignUpForm((current) => ({ ...current, [field]: value }));

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: signInForm.email.trim().toLowerCase(),
        password: signInForm.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (signUpForm.password !== signUpForm.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    if (signUpForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!masterConsentGranted) {
      setError('You must acknowledge the AGI-1 consent bundle to create an account.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signUpForm.email.trim().toLowerCase(),
          password: signUpForm.password,
          first_name: signUpForm.first_name.trim(),
          last_name: signUpForm.last_name.trim(),
          phone_number: signUpForm.phone_number.trim(),
          master_consent_granted: signUpForm.master_consent_granted,
          consent_bundle_version: CURRENT_POLICY_VERSIONS.consent_bundle,
          data_breakdown_version: CURRENT_POLICY_VERSIONS.data_breakdown,
          agreement_text_version: CURRENT_POLICY_VERSIONS.agreement_text,
          marketing_opt_in: signUpForm.marketing_opt_in,
          personalization_opt_in: signUpForm.personalization_opt_in,
          model_improvement_opt_in: signUpForm.model_improvement_opt_in,
          community_opt_in: signUpForm.community_opt_in,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      const result = await signIn('credentials', {
        email: signUpForm.email.trim().toLowerCase(),
        password: signUpForm.password,
        redirect: false,
      });

      if (result?.error) {
        syncMode('signin');
      } else {
        router.push('/plans');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const Checkbox = ({
    field,
    label,
  }: {
    field: keyof typeof signUpForm;
    label: ReactNode;
  }) => (
    <label className="group flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={Boolean(signUpForm[field])}
          onChange={(e) => updateSignUp(field, e.target.checked)}
          className="peer sr-only"
        />
        <div className="flex h-[18px] w-[18px] items-center justify-center rounded border-2 border-white/25 transition-all group-hover:border-white/40 peer-checked:border-[#0077FF] peer-checked:bg-[#0077FF]">
          {signUpForm[field] ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
        </div>
      </div>
      <span className="text-[13px] leading-relaxed text-white/60">{label}</span>
    </label>
  );

  return (
    <div className="min-h-screen bg-black px-4 py-6 sm:px-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-[#FF6A00]/5 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-96 w-96 rounded-full bg-[#0077FF]/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
              Screen 02
              <span className="h-1 w-1 rounded-full bg-[#FF8A33]" />
              Account Access
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              {heading.title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
              {heading.subtitle}
            </p>

            <div className="mt-8 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Data collection, user agreement & acknowledgement</p>
                  <p className="mt-1 text-xs text-white/35">
                    Bundle v{CURRENT_POLICY_VERSIONS.consent_bundle} · Data Breakdown v{CURRENT_POLICY_VERSIONS.data_breakdown}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDataSummary((current) => !current)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#7eb8ff] transition hover:border-white/20 hover:text-white"
                >
                  {showDataSummary ? 'Hide details' : 'Show details'}
                </button>
              </div>

              {showDataSummary ? (
                <div className="mt-4 max-h-[420px] space-y-1 overflow-y-auto pr-1">
                  {DATA_CATEGORIES.map((category, index) => (
                    <div key={category.title} className="rounded-2xl border border-white/6 bg-black/20 px-4">
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(expandedCategory === index ? null : index)}
                        className="flex w-full items-center justify-between py-3 text-left"
                      >
                        <span className="text-sm font-medium text-white/75">{category.title}</span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`text-white/30 transition-transform ${expandedCategory === index ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                      {expandedCategory === index ? (
                        <ul className="space-y-2 pb-4 pl-1">
                          {category.items.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-white/42">
                              <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-white/25" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-[24px] border border-[#FF8A33]/15 bg-[radial-gradient(circle_at_top,rgba(255,138,51,0.12),rgba(0,0,0,0))] p-5">
              <p className="text-sm font-medium text-white">What happens next</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/45">
                <li>1. Choose Sign Up or Sign In on this second screen.</li>
                <li>2. Continue with Apple, Google, or email.</li>
                <li>3. If you create an account, enter your first name, last name, phone number, and email address.</li>
                <li>4. Acknowledge the AGI-1 data bundle before account creation completes.</li>
              </ul>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6A00] to-[#0077FF] shadow-[0_0_40px_rgba(255,106,0,0.2)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                </svg>
              </div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/30">Welcome back to AGI-1</p>
            </div>

            <AuthModeToggle mode={mode} onModeChange={syncMode} />

            <SocialButtons callbackUrl={callbackUrl} />

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-black px-4 uppercase tracking-wider text-white/25">{heading.divider}</span>
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-400">
                {error}
              </div>
            ) : null}

            {mode === 'signin' ? (
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Email address</label>
                  <input
                    type="email"
                    value={signInForm.email}
                    onChange={(e) => setSignInForm((current) => ({ ...current, email: e.target.value }))}
                    placeholder="you@company.com"
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Password</label>
                  <input
                    type="password"
                    value={signInForm.password}
                    onChange={(e) => setSignInForm((current) => ({ ...current, password: e.target.value }))}
                    placeholder="Your password"
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-[#0077FF] to-[#00A3FF] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">First Name</label>
                    <input
                      type="text"
                      value={signUpForm.first_name}
                      onChange={(e) => updateSignUp('first_name', e.target.value)}
                      placeholder="First"
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Last Name</label>
                    <input
                      type="text"
                      value={signUpForm.last_name}
                      onChange={(e) => updateSignUp('last_name', e.target.value)}
                      placeholder="Last"
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Phone Number</label>
                  <input
                    type="tel"
                    value={signUpForm.phone_number}
                    onChange={(e) => updateSignUp('phone_number', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Email address</label>
                  <input
                    type="email"
                    value={signUpForm.email}
                    onChange={(e) => updateSignUp('email', e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Password</label>
                    <input
                      type="password"
                      value={signUpForm.password}
                      onChange={(e) => updateSignUp('password', e.target.value)}
                      placeholder="Min 8 chars"
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">Confirm Password</label>
                    <input
                      type="password"
                      value={signUpForm.confirm_password}
                      onChange={(e) => updateSignUp('confirm_password', e.target.value)}
                      placeholder="Repeat"
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#0077FF]/50"
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    User Agreement & Acknowledgement
                  </p>
                  <p className="mb-3 text-xs text-white/25">
                    Terms v{CURRENT_POLICY_VERSIONS.terms}, Privacy v{CURRENT_POLICY_VERSIONS.privacy}, bundle v{CURRENT_POLICY_VERSIONS.consent_bundle}.
                  </p>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <Checkbox
                      field="master_consent_granted"
                      label={
                        <>
                          I acknowledge and agree to the{' '}
                          <a href="/terms" target="_blank" className="text-[#0077FF] underline hover:text-[#0077FF]/80" rel="noreferrer">
                            Fair Group AI Terms of Service
                          </a>
                          ,{' '}
                          <a href="/privacy" target="_blank" className="text-[#0077FF] underline hover:text-[#0077FF]/80" rel="noreferrer">
                            Privacy Policy
                          </a>
                          , and the strict Data Collection Breakdown required to power the AGI-1 model, OpenClaw V2 device control, and Aegis background execution.
                        </>
                      }
                    />
                    <p className="mt-3 text-xs leading-relaxed text-white/35">
                      Camera, microphone, live video, and device-control permissions are requested only when you enable those features. They are not granted by this signup acknowledgement alone.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !masterConsentGranted}
                  className="mt-3 w-full rounded-lg bg-gradient-to-r from-[#FF6A00] to-[#FF8A33] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {loading ? 'Creating account...' : heading.submit}
                </button>
              </form>
            )}

            <p className="mt-5 text-center text-sm text-white/40">
              {mode === 'signup' ? 'Already have an account?' : 'Need a new account?'}{' '}
              <button
                type="button"
                onClick={() => syncMode(mode === 'signup' ? 'signin' : 'signup')}
                className="font-medium text-[#0077FF] hover:underline"
              >
                {mode === 'signup' ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
