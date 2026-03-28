'use client';
// ─────────────────────────────────────────────────────────
//  AGI-1 — Privacy & Consent Center
//  View agreements, update optional consents,
//  request data export / account deletion,
//  manage connected services and permissions.
// ─────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ConsentState {
  terms_accepted: boolean;
  privacy_acknowledged: boolean;
  core_processing_acknowledged: boolean;
  master_consent_granted: boolean;
  marketing_opt_in: boolean;
  personalization_opt_in: boolean;
  model_improvement_opt_in: boolean;
  community_opt_in: boolean;
  privacy_version: string;
  privacy_policy_version: string;
  terms_version: string;
  consent_bundle_version: string;
  data_breakdown_version: string;
  agreement_text_version: string;
  consent_scopes: string[];
  consent_timestamp: string;
  updated_at: string;
  consent_source: string;
  withdrawal_timestamp: string | null;
  device_metadata: {
    user_agent?: string;
    locale?: string;
    origin?: string;
    platform?: string;
  } | null;
}

interface PrivacyRequest {
  request_id: string;
  request_type: 'data_export' | 'account_deletion';
  status: 'requested' | 'in_review' | 'fulfilled' | 'denied' | 'canceled';
  requested_at: string;
  updated_at: string;
}

interface FeatureConsent {
  feature_name: string;
  granted: boolean;
  denied: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  updated_at: string;
  source: string;
  version: string;
}

export default function PrivacyCenterPage() {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [featureConsents, setFeatureConsents] = useState<FeatureConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingFeature, setRevokingFeature] = useState<string | null>(null);
  const [requestingType, setRequestingType] = useState<'data_export' | 'account_deletion' | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [marketing, setMarketing] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  const [modelImprovement, setModelImprovement] = useState(false);
  const [community, setCommunity] = useState(false);

  const loadPrivacyCenter = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [consentResponse, requestResponse, featureConsentResponse] = await Promise.all([
        fetch('/api/user/consent'),
        fetch('/api/user/privacy-requests'),
        fetch('/api/user/feature-consents'),
      ]);

      const consentPayload = await consentResponse.json();
      const requestPayload = await requestResponse.json();
      const featureConsentPayload = await featureConsentResponse.json();

      if (!consentResponse.ok) {
        throw new Error(consentPayload.error || 'Failed to load consent data.');
      }
      if (!requestResponse.ok) {
        throw new Error(requestPayload.error || 'Failed to load privacy requests.');
      }
      if (!featureConsentResponse.ok) {
        throw new Error(featureConsentPayload.error || 'Failed to load feature consents.');
      }

      if (consentPayload.consent) {
        setConsent(consentPayload.consent);
        setMarketing(consentPayload.consent.marketing_opt_in);
        setPersonalization(consentPayload.consent.personalization_opt_in);
        setModelImprovement(consentPayload.consent.model_improvement_opt_in);
        setCommunity(consentPayload.consent.community_opt_in);
      } else {
        setConsent(null);
      }

      setRequests(requestPayload.requests || []);
      setFeatureConsents(featureConsentPayload.feature_consents || []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load consent data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const revokeFeatureConsent = useCallback(async (featureName: string) => {
    setRevokingFeature(featureName);
    setError('');
    try {
      const response = await fetch('/api/user/feature-consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_name: featureName,
          action: 'revoke',
          source: 'privacy_center',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke feature consent.');
      }
      setFeatureConsents((current) =>
        current.map((record) =>
          record.feature_name === featureName ? data.feature_consent : record
        )
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to revoke feature consent.');
    } finally {
      setRevokingFeature(null);
    }
  }, []);

  useEffect(() => {
    void loadPrivacyCenter();
  }, [loadPrivacyCenter]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/user/consent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketing_opt_in: marketing,
          personalization_opt_in: personalization,
          model_improvement_opt_in: modelImprovement,
          community_opt_in: community,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update.');
      } else {
        if (data.consent) {
          setConsent(data.consent);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [marketing, personalization, modelImprovement, community]);

  const submitPrivacyRequest = useCallback(
    async (requestType: 'data_export' | 'account_deletion') => {
      if (
        requestType === 'account_deletion' &&
        !window.confirm(
          'Create an account deletion request? This starts the review flow. Your account will not be deleted instantly.'
        )
      ) {
        return;
      }

      setRequestingType(requestType);
      setError('');
      try {
        const res = await fetch('/api/user/privacy-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_type: requestType }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to create request.');
          return;
        }

        setRequests((current) => [data.request, ...current]);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setRequestingType(null);
      }
    },
    []
  );

  const hasChanges = Boolean(
    consent &&
      (marketing !== consent.marketing_opt_in ||
        personalization !== consent.personalization_opt_in ||
        modelImprovement !== consent.model_improvement_opt_in ||
        community !== consent.community_opt_in)
  );

  const hasActiveRequest = useCallback(
    (requestType: 'data_export' | 'account_deletion') =>
      requests.some(
        (request) =>
          request.request_type === requestType &&
          (request.status === 'requested' || request.status === 'in_review')
      ),
    [requests]
  );

  const Toggle = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-white/5 last:border-0">
      <div className="flex-1">
        <p className="text-sm text-white/80 font-medium">{label}</p>
        <p className="text-xs text-white/35 mt-1 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${
          checked ? 'bg-[#0077FF]' : 'bg-white/10'
        }`}
      >
        <div
          className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full" />
      </div>
    );
  }

  if (!consent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-white/60 mb-4">No consent record found. Please complete signup first.</p>
          <button onClick={() => router.push('/register')} className="text-[#0077FF] underline text-sm">
            Go to signup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#0077FF]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#FF6A00]/3 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10 md:py-16">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-white/30 hover:text-white/60 text-sm flex items-center gap-1 mb-4 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold">Privacy & Consent</h1>
          <p className="text-white/40 text-sm mt-1">
            Review legal acknowledgements, update optional consents, and manage data-access controls.
          </p>
        </div>

        <section className="bg-white/[0.03] border border-white/8 rounded-xl p-5 mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Required Agreements
              </h2>
              <p className="text-xs text-white/25 mt-1">
                These were accepted when you created your account and remain recorded while the account is active.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/35">
              Source: {consent.consent_source}
              <br />
              Last updated: {new Date(consent.updated_at).toLocaleString()}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white/70">Terms of Service</p>
                <p className="text-[11px] text-white/25">
                  Version {consent.terms_version} — accepted {new Date(consent.consent_timestamp).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white/70">Privacy Policy & Data Use Summary</p>
                <p className="text-[11px] text-white/25">
                  Version {consent.privacy_version} — acknowledged {new Date(consent.consent_timestamp).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white/70">Core Service Data Processing</p>
                <p className="text-[11px] text-white/25">
                  Acknowledged {new Date(consent.consent_timestamp).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 mt-5">
            <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/30">Consent Bundle</p>
              <p className="text-sm text-white/70 mt-1">{consent.consent_bundle_version}</p>
              <p className="text-[11px] text-white/30 mt-1">
                Master acknowledgement {consent.master_consent_granted ? 'active' : 'missing'}
              </p>
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/30">Data Breakdown</p>
              <p className="text-sm text-white/70 mt-1">{consent.data_breakdown_version}</p>
              <p className="text-[11px] text-white/30 mt-1">Agreement text {consent.agreement_text_version}</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/30">Client Context</p>
              <p className="text-sm text-white/70 mt-1">
                {consent.device_metadata?.platform || 'Unknown platform'}
              </p>
              <p className="text-[11px] text-white/30 mt-1">
                {consent.device_metadata?.locale || 'Locale not provided'}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/30">Recorded consent scopes</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(consent.consent_scopes || []).map((scope) => (
                <span
                  key={scope}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wide text-white/45"
                >
                  {scope.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-white/25 mt-3">
              Recorded {new Date(consent.consent_timestamp).toLocaleString()}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/30">Latest Withdrawal</p>
            <p className="text-sm text-white/70 mt-1">
              {consent.withdrawal_timestamp
                ? new Date(consent.withdrawal_timestamp).toLocaleString()
                : 'No optional withdrawal on record'}
            </p>
          </div>

          <div className="mt-4 flex gap-3">
            <a href="/terms" target="_blank" className="text-xs text-[#0077FF] hover:underline">View Terms</a>
            <a href="/privacy" target="_blank" className="text-xs text-[#0077FF] hover:underline">View Privacy Policy</a>
          </div>
        </section>

        <section className="bg-white/[0.03] border border-white/8 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Just-In-Time Feature Permissions
              </h2>
              <p className="text-xs text-white/25 mt-1">
                Live camera, microphone, and OpenClaw device-control permissions are granted later when you explicitly use those features.
              </p>
            </div>
            <button
              onClick={() => router.push('/settings/privacy/connections')}
              className="text-xs text-white/80 border border-white/10 px-4 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Manage Connections
            </button>
          </div>

          {featureConsents.length === 0 ? (
            <p className="text-sm text-white/30">No just-in-time feature permissions have been recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {featureConsents.map((record) => (
                <div
                  key={record.feature_name}
                  className="flex flex-col gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm text-white/75">{record.feature_name.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-white/30 mt-1">
                      {record.granted
                        ? `Granted ${record.granted_at ? new Date(record.granted_at).toLocaleString() : 'recently'}`
                        : `Revoked ${record.revoked_at ? new Date(record.revoked_at).toLocaleString() : 'recently'}`}
                    </p>
                    <p className="text-[11px] text-white/20 mt-1">Source: {record.source} • v{record.version}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wide text-white/45">
                      {record.granted ? 'granted' : 'revoked'}
                    </span>
                    {record.granted && (
                      <button
                        onClick={() => void revokeFeatureConsent(record.feature_name)}
                        disabled={revokingFeature === record.feature_name}
                        className="text-xs text-red-400 border border-red-400/30 px-3 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-40"
                      >
                        {revokingFeature === record.feature_name ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white/[0.03] border border-white/8 rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-1">
            Optional Preferences
          </h2>
          <p className="text-xs text-white/25 mb-2">
            These are independent of account creation and can be changed any time. Withdrawals are timestamped.
          </p>

          <Toggle
            label="Product updates & offers"
            description="Receive product updates, launch news, and offers via email."
            checked={marketing}
            onChange={setMarketing}
          />
          <Toggle
            label="Personalization & memory"
            description="Allow AGI-1 to remember your preferences, task history, and prior interactions to personalize your experience."
            checked={personalization}
            onChange={setPersonalization}
          />
          <Toggle
            label="Model improvement"
            description="Allow your content to be used to improve AGI-1."
            checked={modelImprovement}
            onChange={setModelImprovement}
          />
          <Toggle
            label="Community & AGI-1 family updates"
            description="Receive community news, events, and AGI-1 family updates."
            checked={community}
            onChange={setCommunity}
          />

          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          {saved && <p className="text-green-400 text-sm mt-3">Preferences saved successfully.</p>}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="mt-4 px-6 py-2.5 bg-[#0077FF] text-white text-sm font-semibold rounded-lg hover:bg-[#0066DD] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </section>

        <section className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Data & Account
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/70">Request data export</p>
                <p className="text-xs text-white/25">Create a tracked export request for your account data.</p>
              </div>
              <button
                onClick={() => submitPrivacyRequest('data_export')}
                disabled={requestingType === 'data_export' || hasActiveRequest('data_export')}
                className="text-xs text-[#0077FF] border border-[#0077FF]/30 px-4 py-1.5 rounded-lg hover:bg-[#0077FF]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {requestingType === 'data_export'
                  ? 'Submitting...'
                  : hasActiveRequest('data_export')
                    ? 'Request Pending'
                    : 'Request Export'}
              </button>
            </div>

            <div className="border-t border-white/5" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/70">Connected services</p>
                <p className="text-xs text-white/25">View or revoke Gmail, Drive, Calendar, Sheets, and device permissions.</p>
              </div>
              <button
                onClick={() => router.push('/settings/privacy/connections')}
                className="text-xs text-white/80 border border-white/10 px-4 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                Manage
              </button>
            </div>

            <div className="border-t border-white/5" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-red-400/80">Delete my account</p>
                <p className="text-xs text-white/25">Start a deletion request review. This is logged and not executed instantly.</p>
              </div>
              <button
                onClick={() => submitPrivacyRequest('account_deletion')}
                disabled={requestingType === 'account_deletion' || hasActiveRequest('account_deletion')}
                className="text-xs text-red-400 border border-red-400/30 px-4 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {requestingType === 'account_deletion'
                  ? 'Submitting...'
                  : hasActiveRequest('account_deletion')
                    ? 'Request Pending'
                    : 'Request Deletion'}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Recent privacy requests</h3>
            {requests.length === 0 ? (
              <p className="text-sm text-white/30">No export or deletion requests have been submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div
                    key={request.request_id}
                    className="flex flex-col gap-2 rounded-lg border border-white/5 bg-black/20 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm text-white/75">
                        {request.request_type === 'data_export' ? 'Data export request' : 'Account deletion request'}
                      </p>
                      <p className="text-[11px] text-white/30 mt-1">
                        Submitted {new Date(request.requested_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wide text-white/45">
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-xs text-white/20 mt-8">
          AGI-1 by Fair Group AI — <a href="https://www.fairgroupai.com" target="_blank" className="underline">fairgroupai.com</a>
        </p>
      </div>
    </div>
  );
}
