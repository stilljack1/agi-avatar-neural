import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, putItem, Tables } from './dynamodb';
import { CURRENT_POLICY_VERSIONS } from './policyVersions';

export type FeatureConsentName =
  | 'camera'
  | 'microphone'
  | 'live_voice'
  | 'live_video'
  | 'openclaw_device_control'
  | 'gmail'
  | 'drive'
  | 'calendar'
  | 'docs'
  | 'sheets'
  | 'payments'
  | 'financial_account_linking';

export interface FeatureConsentRecord {
  user_id: string;
  feature_name: FeatureConsentName;
  granted: boolean;
  denied: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  updated_at: string;
  source: string;
  version: string;
  metadata?: Record<string, unknown>;
}

function normalizeFeatureConsent(record: Record<string, any>): FeatureConsentRecord {
  return {
    user_id: record.user_id,
    feature_name: record.feature_name,
    granted: Boolean(record.granted),
    denied: Boolean(record.denied),
    granted_at: record.granted_at || null,
    revoked_at: record.revoked_at || null,
    updated_at: record.updated_at || new Date().toISOString(),
    source: record.source || 'unknown',
    version: record.version || CURRENT_POLICY_VERSIONS.consent_bundle,
    metadata: record.metadata || undefined,
  };
}

export async function listFeatureConsents(userId: string): Promise<FeatureConsentRecord[]> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: Tables.FEATURE_CONSENTS,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': 'FEATURE#',
        },
      })
    );

    return (result.Items || [])
      .map((item) => normalizeFeatureConsent(item as Record<string, any>))
      .sort((a, b) => a.feature_name.localeCompare(b.feature_name));
  } catch {
    return [];
  }
}

export async function upsertFeatureConsent(data: {
  user_id: string;
  feature_name: FeatureConsentName;
  granted: boolean;
  source: string;
  version?: string;
  metadata?: Record<string, unknown>;
}): Promise<FeatureConsentRecord> {
  const now = new Date().toISOString();
  const record = {
    pk: `USER#${data.user_id}`,
    sk: `FEATURE#${data.feature_name}`,
    user_id: data.user_id,
    feature_name: data.feature_name,
    granted: data.granted,
    denied: !data.granted,
    granted_at: data.granted ? now : null,
    revoked_at: data.granted ? null : now,
    updated_at: now,
    source: data.source,
    version: data.version || CURRENT_POLICY_VERSIONS.consent_bundle,
    metadata: data.metadata,
  };

  await putItem(Tables.FEATURE_CONSENTS, record);
  return normalizeFeatureConsent(record);
}

export async function revokeFeatureConsent(data: {
  user_id: string;
  feature_name: FeatureConsentName;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<FeatureConsentRecord> {
  return upsertFeatureConsent({
    user_id: data.user_id,
    feature_name: data.feature_name,
    granted: false,
    source: data.source,
    metadata: data.metadata,
  });
}
