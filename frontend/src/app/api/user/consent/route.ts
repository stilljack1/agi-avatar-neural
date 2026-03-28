// ─────────────────────────────────────────────────────────
//  /api/user/consent
//  POST — Store consent (OAuth signup / initial)
//  GET  — Retrieve latest consent record (for Privacy Center)
//  PATCH — Update optional consents (from Settings)
// ─────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  saveConsent,
  getLatestConsent,
  updateOnboarding,
  createUserProfile,
  getUserProfile,
} from '@/lib/onboarding';
import { CURRENT_POLICY_VERSIONS } from '@/lib/policyVersions';

function getRequestMetadata(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    undefined;

  return {
    ip_address: ip,
    device_metadata: {
      user_agent: req.headers.get('user-agent') || undefined,
      locale: req.headers.get('accept-language') || undefined,
      origin: req.headers.get('origin') || req.nextUrl.origin || undefined,
      platform: req.headers.get('sec-ch-ua-platform') || undefined,
    },
  };
}

function serializeConsent(consent: Awaited<ReturnType<typeof getLatestConsent>>) {
  if (!consent) return null;

  return {
    terms_accepted: consent.terms_accepted,
    privacy_acknowledged: consent.privacy_acknowledged,
    core_processing_acknowledged: consent.core_processing_acknowledged,
    master_consent_granted: consent.master_consent_granted,
    marketing_opt_in: consent.marketing_opt_in,
    personalization_opt_in: consent.personalization_opt_in,
    model_improvement_opt_in: consent.model_improvement_opt_in,
    community_opt_in: consent.community_opt_in,
    privacy_version: consent.privacy_version,
    privacy_policy_version: consent.privacy_policy_version,
    terms_version: consent.terms_version,
    consent_bundle_version: consent.consent_bundle_version,
    data_breakdown_version: consent.data_breakdown_version,
    agreement_text_version: consent.agreement_text_version,
    consent_scopes: consent.consent_scopes,
    consent_timestamp: consent.consent_timestamp,
    updated_at: consent.updated_at,
    consent_source: consent.consent_source,
    withdrawal_timestamp: consent.withdrawal_timestamp || null,
    device_metadata: consent.device_metadata || null,
  };
}

// ── POST: initial consent (OAuth users) ───────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      first_name,
      last_name,
      phone_number,
      master_consent_granted,
      consent_bundle_version,
      data_breakdown_version,
      agreement_text_version,
      marketing_opt_in,
      personalization_opt_in,
      model_improvement_opt_in,
      community_opt_in,
    } = body;

    if (!master_consent_granted) {
      return NextResponse.json(
        { error: 'The AGI-1 consent bundle must be acknowledged.' },
        { status: 400 }
      );
    }

    const email = session.user.email.toLowerCase();

    // Create profile for OAuth users who skip /register
    const existing = await getUserProfile(email);
    if (!existing) {
      await createUserProfile({
        email,
        first_name: first_name || session.user.name?.split(' ')[0] || '',
        last_name: last_name || session.user.name?.split(' ').slice(1).join(' ') || '',
        phone_number: phone_number || '',
        auth_provider: (session.user as Record<string, unknown>).provider as string || 'oauth',
      });
    }

    const requestMetadata = getRequestMetadata(req);

    await saveConsent({
      user_id: email,
      terms_accepted: true,
      privacy_acknowledged: true,
      core_processing_acknowledged: true,
      master_consent_granted: true,
      consent_bundle_version: consent_bundle_version || CURRENT_POLICY_VERSIONS.consent_bundle,
      data_breakdown_version: data_breakdown_version || CURRENT_POLICY_VERSIONS.data_breakdown,
      agreement_text_version: agreement_text_version || CURRENT_POLICY_VERSIONS.agreement_text,
      consent_scopes: [
        'identity_account',
        'biometric_live_interaction_disclosure',
        'device_telemetry_disclosure',
        'execution_background_logs',
        'agentic_memory_behavioral',
        'financial_transactional',
      ],
      marketing_opt_in: marketing_opt_in || false,
      personalization_opt_in: personalization_opt_in || false,
      model_improvement_opt_in: model_improvement_opt_in || false,
      community_opt_in: community_opt_in || false,
      consent_source: 'signup',
      ...requestMetadata,
    });

    await updateOnboarding(email, {
      profile_completed: true,
      consent_given: true,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[consent POST]', error);
    return NextResponse.json({ error: 'Failed to save consent' }, { status: 500 });
  }
}

// ── GET: retrieve latest consent record ───────────────────
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();
    const consent = await getLatestConsent(email);

    if (!consent) {
      return NextResponse.json({ consent: null });
    }

    return NextResponse.json({ consent: serializeConsent(consent) });
  } catch (error: unknown) {
    console.error('[consent GET]', error);
    return NextResponse.json({ error: 'Failed to retrieve consent' }, { status: 500 });
  }
}

// ── PATCH: update optional consents from Settings ─────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const email = session.user.email.toLowerCase();

    // Get current consent to preserve required fields
    const current = await getLatestConsent(email);
    if (!current) {
      return NextResponse.json(
        { error: 'No existing consent record found. Please complete signup first.' },
        { status: 400 }
      );
    }

    const nextOptionalState = {
      marketing_opt_in:
        body.marketing_opt_in !== undefined ? body.marketing_opt_in : current.marketing_opt_in,
      personalization_opt_in:
        body.personalization_opt_in !== undefined
          ? body.personalization_opt_in
          : current.personalization_opt_in,
      model_improvement_opt_in:
        body.model_improvement_opt_in !== undefined
          ? body.model_improvement_opt_in
          : current.model_improvement_opt_in,
      community_opt_in:
        body.community_opt_in !== undefined ? body.community_opt_in : current.community_opt_in,
    };

    const anyWithdrawal =
      (current.marketing_opt_in && !nextOptionalState.marketing_opt_in) ||
      (current.personalization_opt_in && !nextOptionalState.personalization_opt_in) ||
      (current.model_improvement_opt_in && !nextOptionalState.model_improvement_opt_in) ||
      (current.community_opt_in && !nextOptionalState.community_opt_in);

    const requestMetadata = getRequestMetadata(req);

    await saveConsent({
      user_id: email,
      // Required fields preserved (cannot be un-acknowledged)
      terms_accepted: current.terms_accepted,
      privacy_acknowledged: current.privacy_acknowledged,
      core_processing_acknowledged: current.core_processing_acknowledged,
      master_consent_granted: current.master_consent_granted,
      consent_bundle_version: current.consent_bundle_version,
      data_breakdown_version: current.data_breakdown_version,
      agreement_text_version: current.agreement_text_version,
      consent_scopes: current.consent_scopes,
      ...nextOptionalState,
      consent_source: 'settings',
      withdrawal_timestamp: anyWithdrawal ? new Date().toISOString() : current.withdrawal_timestamp,
      ...requestMetadata,
    });

    const latest = await getLatestConsent(email);
    return NextResponse.json({
      success: true,
      message: 'Consent preferences updated.',
      consent: serializeConsent(latest),
    });
  } catch (error: unknown) {
    console.error('[consent PATCH]', error);
    return NextResponse.json({ error: 'Failed to update consent' }, { status: 500 });
  }
}
