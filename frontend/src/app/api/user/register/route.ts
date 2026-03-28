// ─────────────────────────────────────────────────────────
//  POST /api/user/register — Create account with profile + consent bundle
//  Master acknowledgement UX backed by structured consent persistence
// ─────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { createUserProfile, getUserProfile, saveConsent, updateOnboarding } from '@/lib/onboarding';
import { CURRENT_POLICY_VERSIONS } from '@/lib/policyVersions';

const CONSENT_SCOPES = [
  'identity_account',
  'biometric_live_interaction_disclosure',
  'device_telemetry_disclosure',
  'execution_background_logs',
  'agentic_memory_behavioral',
  'financial_transactional',
] as const;

function getRequestMetadata(req: NextRequest) {
  return {
    ip_address:
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      undefined,
    device_metadata: {
      user_agent: req.headers.get('user-agent') || undefined,
      locale: req.headers.get('accept-language') || undefined,
      origin: req.headers.get('origin') || req.nextUrl.origin || undefined,
      platform: req.headers.get('sec-ch-ua-platform') || undefined,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      password,
      first_name,
      last_name,
      phone_number,
      master_consent_granted,
      consent_bundle_version,
      data_breakdown_version,
      agreement_text_version,
      // Optional
      marketing_opt_in,
      personalization_opt_in,
      model_improvement_opt_in,
      community_opt_in,
    } = body;

    // ── Field validation ──────────────────────────────────
    if (!email || !password || !first_name || !last_name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, first_name, last_name' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // ── Consent bundle acknowledgement ────────────────────
    if (!master_consent_granted) {
      return NextResponse.json(
        { error: 'You must acknowledge the AGI-1 consent bundle before creating an account.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Duplicate check ───────────────────────────────────
    const existing = await getUserProfile(normalizedEmail);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // ── Create profile ────────────────────────────────────
    await createUserProfile({
      email: normalizedEmail,
      first_name,
      last_name,
      phone_number: phone_number || '',
      password,
      auth_provider: 'credentials',
    });

    // ── Save consent record (all 7 fields) ────────────────
    await saveConsent({
      user_id: normalizedEmail,
      // Required
      terms_accepted: true,
      privacy_acknowledged: true,
      core_processing_acknowledged: true,
      master_consent_granted: true,
      consent_bundle_version: consent_bundle_version || CURRENT_POLICY_VERSIONS.consent_bundle,
      data_breakdown_version: data_breakdown_version || CURRENT_POLICY_VERSIONS.data_breakdown,
      agreement_text_version: agreement_text_version || CURRENT_POLICY_VERSIONS.agreement_text,
      consent_scopes: [...CONSENT_SCOPES],
      // Optional (default false if not sent)
      marketing_opt_in: marketing_opt_in || false,
      personalization_opt_in: personalization_opt_in || false,
      model_improvement_opt_in: model_improvement_opt_in || false,
      community_opt_in: community_opt_in || false,
      // Meta
      consent_source: 'signup',
      ...getRequestMetadata(req),
    });

    // ── Initialize onboarding state ───────────────────────
    await updateOnboarding(normalizedEmail, {
      profile_completed: true,
      consent_given: true,
      welcome_video_seen: false,
      plan_selected: false,
      onboarding_completed: false,
    });

    return NextResponse.json({ success: true, message: 'Account created successfully' });
  } catch (error: unknown) {
    console.error('[register]', error);
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}
