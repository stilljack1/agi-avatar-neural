// ─────────────────────────────────────────────────────────
//  AGI-1 — Onboarding + Entitlement State Management
//  Source of truth: DynamoDB
// ─────────────────────────────────────────────────────────
import { putItem, getItem, updateItem, Tables } from './dynamodb';
import { hash } from 'bcryptjs';
import type { PlanTier } from './stripe';
import { CURRENT_POLICY_VERSIONS } from './policyVersions';

// ── Types ────────────────────────────────────────────────
export interface UserProfile {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  auth_provider: string;
  password_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface UserConsent {
  user_id: string;
  privacy_version: string;
  privacy_policy_version: string;
  terms_version: string;
  consent_bundle_version: string;
  data_breakdown_version: string;
  agreement_text_version: string;
  // Required acknowledgements
  terms_accepted: boolean;
  privacy_acknowledged: boolean;
  core_processing_acknowledged: boolean;
  master_consent_granted: boolean;
  consent_scopes: string[];
  // Optional consents
  marketing_opt_in: boolean;
  personalization_opt_in: boolean;
  model_improvement_opt_in: boolean;
  community_opt_in: boolean;
  // Meta
  consent_source: 'signup' | 'settings' | 'upgrade' | 'feature_enablement';
  consent_timestamp: string;
  ip_address?: string;
  device_metadata?: {
    user_agent?: string;
    locale?: string;
    origin?: string;
    platform?: string;
  };
  updated_at: string;
  withdrawal_timestamp?: string;
}

export interface Subscription {
  user_id: string;
  plan_tier: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | 'none';
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entitlement {
  user_id: string;
  plan_tier: PlanTier;
  messages_per_day: number;
  voice_enabled: boolean;
  video_enabled: boolean;
  vision_enabled: boolean;
  workspace_enabled: boolean;
  api_access: boolean;
  team_members: number;
  active: boolean;
  updated_at: string;
}

export interface OnboardingState {
  user_id: string;
  welcome_video_seen: boolean;
  profile_completed: boolean;
  consent_given: boolean;
  plan_selected: boolean;
  onboarding_completed: boolean;
  updated_at: string;
}

// ── Constants ────────────────────────────────────────────
const PRIVACY_VERSION = CURRENT_POLICY_VERSIONS.privacy;
const TERMS_VERSION = CURRENT_POLICY_VERSIONS.terms;

function normalizeConsentRecord(record: Record<string, any> | null): UserConsent | null {
  if (!record) return null;

  const privacyVersion =
    record.privacy_version || record.privacy_policy_version || PRIVACY_VERSION;

  return {
    ...record,
    privacy_version: privacyVersion,
    privacy_policy_version: privacyVersion,
    terms_version: record.terms_version || TERMS_VERSION,
    consent_bundle_version:
      record.consent_bundle_version || CURRENT_POLICY_VERSIONS.consent_bundle,
    data_breakdown_version:
      record.data_breakdown_version || CURRENT_POLICY_VERSIONS.data_breakdown,
    agreement_text_version:
      record.agreement_text_version || CURRENT_POLICY_VERSIONS.agreement_text,
    consent_source: record.consent_source || 'signup',
    consent_timestamp: record.consent_timestamp || record.updated_at || new Date().toISOString(),
    updated_at: record.updated_at || record.consent_timestamp || new Date().toISOString(),
    master_consent_granted: record.master_consent_granted ?? Boolean(
      record.terms_accepted && record.privacy_acknowledged && record.core_processing_acknowledged
    ),
    consent_scopes: Array.isArray(record.consent_scopes) ? record.consent_scopes : [],
  } as UserConsent;
}

// ── Profile ──────────────────────────────────────────────
export async function createUserProfile(data: {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  password?: string;
  auth_provider: string;
}): Promise<UserProfile> {
  const now = new Date().toISOString();
  const email = data.email.trim().toLowerCase();
  const password_hash = data.password ? await hash(data.password, 12) : undefined;

  const profile: UserProfile & { pk: string; sk: string; password_hash?: string } = {
    pk: `USER#${email}`,
    sk: 'PROFILE',
    user_id: email,
    email,
    first_name: data.first_name.trim(),
    last_name: data.last_name.trim(),
    phone_number: data.phone_number.trim(),
    auth_provider: data.auth_provider,
    password_hash,
    created_at: now,
    updated_at: now,
  };

  await putItem(Tables.USER_PROFILES, profile);
  return profile;
}

export async function getUserProfile(email: string): Promise<UserProfile | null> {
  return (await getItem(Tables.USER_PROFILES, `USER#${email.toLowerCase()}`, 'PROFILE')) as UserProfile | null;
}

// ── Consent ──────────────────────────────────────────────
export async function saveConsent(data: {
  user_id: string;
  // Required
  terms_accepted: boolean;
  privacy_acknowledged: boolean;
  core_processing_acknowledged: boolean;
  master_consent_granted?: boolean;
  consent_bundle_version?: string;
  data_breakdown_version?: string;
  agreement_text_version?: string;
  consent_scopes?: string[];
  // Optional
  marketing_opt_in: boolean;
  personalization_opt_in: boolean;
  model_improvement_opt_in: boolean;
  community_opt_in: boolean;
  // Meta
  consent_source?: 'signup' | 'settings' | 'upgrade' | 'feature_enablement';
  ip_address?: string;
  device_metadata?: UserConsent['device_metadata'];
  withdrawal_timestamp?: string;
  privacy_version?: string;
  terms_version?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const privacyVersion = data.privacy_version || PRIVACY_VERSION;
  const termsVersion = data.terms_version || TERMS_VERSION;
  const consentBundleVersion = data.consent_bundle_version || CURRENT_POLICY_VERSIONS.consent_bundle;
  const dataBreakdownVersion = data.data_breakdown_version || CURRENT_POLICY_VERSIONS.data_breakdown;
  const agreementTextVersion = data.agreement_text_version || CURRENT_POLICY_VERSIONS.agreement_text;
  await putItem(Tables.USER_CONSENTS, {
    pk: `USER#${data.user_id}`,
    sk: `CONSENT#${now}`,
    user_id: data.user_id,
    privacy_version: privacyVersion,
    privacy_policy_version: privacyVersion,
    terms_version: termsVersion,
    consent_bundle_version: consentBundleVersion,
    data_breakdown_version: dataBreakdownVersion,
    agreement_text_version: agreementTextVersion,
    // Required acknowledgements
    terms_accepted: data.terms_accepted,
    privacy_acknowledged: data.privacy_acknowledged,
    core_processing_acknowledged: data.core_processing_acknowledged,
    master_consent_granted:
      data.master_consent_granted ?? Boolean(
        data.terms_accepted && data.privacy_acknowledged && data.core_processing_acknowledged
      ),
    consent_scopes: data.consent_scopes || [],
    // Optional consents
    marketing_opt_in: data.marketing_opt_in,
    personalization_opt_in: data.personalization_opt_in,
    model_improvement_opt_in: data.model_improvement_opt_in,
    community_opt_in: data.community_opt_in,
    // Meta
    consent_source: data.consent_source || 'signup',
    consent_timestamp: now,
    ip_address: data.ip_address || 'unknown',
    device_metadata: data.device_metadata,
    updated_at: now,
    withdrawal_timestamp: data.withdrawal_timestamp,
  });
}

// ── Get latest consent record ────────────────────────────
export async function getLatestConsent(userId: string): Promise<UserConsent | null> {
  // Query by pk and sk prefix to get all consent records, return latest
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const { docClient } = await import('./dynamodb');
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: Tables.USER_CONSENTS,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': 'CONSENT#',
        },
        ScanIndexForward: false, // newest first
        Limit: 1,
      })
    );
    return normalizeConsentRecord((result.Items?.[0] as Record<string, any>) || null);
  } catch {
    return null;
  }
}

// ── Subscription ─────────────────────────────────────────
export async function getSubscription(userId: string): Promise<Subscription | null> {
  return (await getItem(Tables.SUBSCRIPTIONS, `USER#${userId}`, 'SUBSCRIPTION')) as Subscription | null;
}

export async function upsertSubscription(data: {
  user_id: string;
  plan_tier: PlanTier;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status: Subscription['status'];
  current_period_start?: string | null;
  current_period_end?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await putItem(Tables.SUBSCRIPTIONS, {
    pk: `USER#${data.user_id}`,
    sk: 'SUBSCRIPTION',
    ...data,
    created_at: now,
    updated_at: now,
  });
}

// ── Entitlements ─────────────────────────────────────────
const TIER_ENTITLEMENTS: Record<PlanTier, Omit<Entitlement, 'user_id' | 'updated_at'>> = {
  free: {
    plan_tier: 'free',
    messages_per_day: 50,
    voice_enabled: false,
    video_enabled: false,
    vision_enabled: false,
    workspace_enabled: false,
    api_access: false,
    team_members: 1,
    active: true,
  },
  pro: {
    plan_tier: 'pro',
    messages_per_day: -1,
    voice_enabled: true,
    video_enabled: true,
    vision_enabled: true,
    workspace_enabled: true,
    api_access: false,
    team_members: 1,
    active: true,
  },
  team: {
    plan_tier: 'team',
    messages_per_day: -1,
    voice_enabled: true,
    video_enabled: true,
    vision_enabled: true,
    workspace_enabled: true,
    api_access: true,
    team_members: 10,
    active: true,
  },
  enterprise: {
    plan_tier: 'enterprise',
    messages_per_day: -1,
    voice_enabled: true,
    video_enabled: true,
    vision_enabled: true,
    workspace_enabled: true,
    api_access: true,
    team_members: -1,
    active: true,
  },
};

export async function provisionEntitlement(userId: string, tier: PlanTier): Promise<void> {
  const now = new Date().toISOString();
  const entitlements = TIER_ENTITLEMENTS[tier];

  await putItem(Tables.ENTITLEMENTS, {
    pk: `USER#${userId}`,
    sk: 'ENTITLEMENT',
    user_id: userId,
    ...entitlements,
    updated_at: now,
  });
}

export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  return (await getItem(Tables.ENTITLEMENTS, `USER#${userId}`, 'ENTITLEMENT')) as Entitlement | null;
}

export async function revokeEntitlement(userId: string): Promise<void> {
  await updateItem(Tables.ENTITLEMENTS, `USER#${userId}`, 'ENTITLEMENT', {
    active: false,
    plan_tier: 'free',
    updated_at: new Date().toISOString(),
  });
}

// ── Onboarding state ─────────────────────────────────────
export async function getOnboarding(userId: string): Promise<OnboardingState | null> {
  return (await getItem(Tables.ONBOARDING, `USER#${userId}`, 'ONBOARDING')) as OnboardingState | null;
}

export async function updateOnboarding(
  userId: string,
  updates: Partial<OnboardingState>
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getOnboarding(userId);

  if (!existing) {
    await putItem(Tables.ONBOARDING, {
      pk: `USER#${userId}`,
      sk: 'ONBOARDING',
      user_id: userId,
      welcome_video_seen: false,
      profile_completed: false,
      consent_given: false,
      plan_selected: false,
      onboarding_completed: false,
      ...updates,
      updated_at: now,
    });
  } else {
    await updateItem(Tables.ONBOARDING, `USER#${userId}`, 'ONBOARDING', {
      ...updates,
      updated_at: now,
    });
  }
}

// ── Full user state check (used by middleware) ───────────
export async function getUserState(userId: string) {
  const [profile, subscription, entitlement, onboarding] = await Promise.all([
    getUserProfile(userId),
    getSubscription(userId),
    getEntitlement(userId),
    getOnboarding(userId),
  ]);

  return {
    hasProfile: !!profile,
    hasConsent: onboarding?.consent_given || false,
    hasSubscription: !!subscription && subscription.status === 'active',
    planTier: subscription?.plan_tier || entitlement?.plan_tier || null,
    isEntitled: !!entitlement && entitlement.active,
    isOnboarded: onboarding?.onboarding_completed || false,
    profile,
    subscription,
    entitlement,
    onboarding,
  };
}
