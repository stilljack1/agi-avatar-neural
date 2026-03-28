import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listFeatureConsents,
  upsertFeatureConsent,
  revokeFeatureConsent,
  type FeatureConsentName,
} from '@/lib/featureConsents';
import {
  grantPermission,
  revokePermission,
  type PermissionCategory,
} from '@/app/api/workspace/_lib/permission-vault';

const FEATURE_PERMISSION_MAP: Partial<Record<FeatureConsentName, PermissionCategory[]>> = {
  camera: ['camera'],
  microphone: ['microphone'],
  openclaw_device_control: ['browser_control'],
  gmail: ['email_read', 'email_write', 'email_send'],
  drive: ['drive_read', 'drive_write'],
  calendar: ['calendar_read', 'calendar_write'],
  docs: ['docs_read', 'docs_write'],
  sheets: ['sheets_read', 'sheets_write'],
  payments: ['finance_write'],
  financial_account_linking: ['finance_read'],
};

function getUserId(session: unknown): string | null {
  const email = (session as { user?: { email?: string | null } } | null)?.user?.email;
  return email ? email.toLowerCase() : null;
}

export async function GET() {
  try {
    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const records = await listFeatureConsents(userId);
    return NextResponse.json({ feature_consents: records });
  } catch (error) {
    console.error('[feature-consents GET]', error);
    return NextResponse.json({ error: 'Failed to load feature consents.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const featureName = body.feature_name as FeatureConsentName;
    const action = (body.action || 'grant') as 'grant' | 'revoke' | 'deny';
    const source = (body.source || 'jit_feature_prompt') as string;
    const metadata = body.metadata as Record<string, unknown> | undefined;

    if (!featureName) {
      return NextResponse.json({ error: 'Missing feature_name.' }, { status: 400 });
    }

    let record;
    if (action === 'revoke' || action === 'deny') {
      record = await revokeFeatureConsent({
        user_id: userId,
        feature_name: featureName,
        source,
        metadata,
      });
      for (const permission of FEATURE_PERMISSION_MAP[featureName] || []) {
        revokePermission(userId, permission, source);
      }
    } else {
      record = await upsertFeatureConsent({
        user_id: userId,
        feature_name: featureName,
        granted: true,
        source,
        metadata,
      });
      for (const permission of FEATURE_PERMISSION_MAP[featureName] || []) {
        grantPermission(userId, permission, 'user');
      }
    }

    return NextResponse.json({ success: true, feature_consent: record });
  } catch (error) {
    console.error('[feature-consents POST]', error);
    return NextResponse.json({ error: 'Failed to update feature consent.' }, { status: 500 });
  }
}
