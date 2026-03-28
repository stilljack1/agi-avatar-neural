import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listPermissions,
  revokePermission,
  type PermissionCategory,
} from '@/app/api/workspace/_lib/permission-vault';

type ConnectedServiceKey =
  | 'gmail'
  | 'drive'
  | 'calendar'
  | 'sheets'
  | 'contacts'
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications';

const SERVICE_PERMISSION_MAP: Record<ConnectedServiceKey, PermissionCategory[]> = {
  gmail: ['email_read', 'email_write', 'email_send'],
  drive: ['drive_read', 'drive_write', 'docs_read', 'docs_write'],
  calendar: ['calendar_read', 'calendar_write'],
  sheets: ['sheets_read', 'sheets_write'],
  contacts: ['contacts_read'],
  camera: ['camera'],
  microphone: ['microphone'],
  location: ['location'],
  notifications: ['notifications'],
};

function buildServiceSnapshot(userId: string) {
  const permissions = listPermissions(userId);
  return (Object.entries(SERVICE_PERMISSION_MAP) as [ConnectedServiceKey, PermissionCategory[]][])
    .map(([service, categories]) => {
      const matched = permissions.filter((permission) => categories.includes(permission.category));
      const grantedPermissions = matched.filter((permission) => permission.granted);

      return {
        service,
        status: grantedPermissions.length > 0 ? 'enabled' : 'disabled',
        granted_permissions: grantedPermissions.map((permission) => permission.category),
        categories,
        last_granted_at: [...grantedPermissions]
          .map((permission) => permission.granted_at || '')
          .filter((timestamp): timestamp is string => Boolean(timestamp))
          .sort()
          .at(-1) || null,
      };
    });
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email.toLowerCase();
    const services = buildServiceSnapshot(userId);

    return NextResponse.json({
      services,
      just_in_time_permissions: true,
      message:
        'Connected services and device permissions are granted only when you enable a feature that needs them.',
    });
  } catch (error: unknown) {
    console.error('[connected-services GET]', error);
    return NextResponse.json({ error: 'Failed to load connected services' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const service = body.service as ConnectedServiceKey;
    const action = body.action as 'revoke';

    if (!service || !(service in SERVICE_PERMISSION_MAP)) {
      return NextResponse.json({ error: 'Unknown service.' }, { status: 400 });
    }
    if (action !== 'revoke') {
      return NextResponse.json({ error: 'Only revoke is supported from this screen.' }, { status: 400 });
    }

    const userId = session.user.email.toLowerCase();
    const categories = SERVICE_PERMISSION_MAP[service];
    const revoked = categories
      .map((category) => revokePermission(userId, category, 'privacy_center_revoked'))
      .some(Boolean);

    return NextResponse.json({
      success: true,
      revoked,
      services: buildServiceSnapshot(userId),
    });
  } catch (error: unknown) {
    console.error('[connected-services POST]', error);
    return NextResponse.json({ error: 'Failed to update connected services' }, { status: 500 });
  }
}
