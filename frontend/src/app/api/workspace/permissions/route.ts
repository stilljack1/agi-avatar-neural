import { NextRequest, NextResponse } from 'next/server';
import {
  listPermissions,
  grantPermission,
  revokePermission,
  syncFromOAuthScopes,
  getConsent,
  type PermissionCategory,
} from '../_lib/permission-vault';
import { getTokens } from '../oauth/store';

/**
 * GET  /api/workspace/permissions — List all permissions for a user
 * POST /api/workspace/permissions — Grant, revoke, or sync permissions
 */

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id') || 'default';
  const permissions = listPermissions(userId);
  const consent = getConsent(userId);

  return NextResponse.json({
    status: 'ok',
    user_id: userId,
    total: permissions.length,
    granted: permissions.filter((p) => p.granted).length,
    permissions,
    consent_created: consent?.created_at || null,
    revocation_log: consent?.revocation_log || [],
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, user_id = 'default', category, reason } = body;

    if (!action) {
      return NextResponse.json({ error: 'missing_action', detail: 'Provide action: grant | revoke | sync_oauth' }, { status: 400 });
    }

    if (action === 'sync_oauth') {
      const tokens = getTokens(user_id);
      if (!tokens) {
        return NextResponse.json({ error: 'not_authenticated', detail: 'No OAuth tokens found.' }, { status: 401 });
      }
      syncFromOAuthScopes(user_id, tokens.scopes || []);
      const permissions = listPermissions(user_id);
      return NextResponse.json({
        status: 'ok',
        action: 'sync_oauth',
        synced_from_scopes: tokens.scopes?.length || 0,
        total_granted: permissions.filter((p) => p.granted).length,
        permissions,
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'grant') {
      if (!category) return NextResponse.json({ error: 'missing_category' }, { status: 400 });
      const grant = grantPermission(user_id, category as PermissionCategory, 'user');
      return NextResponse.json({ status: 'ok', action: 'grant', grant, timestamp: new Date().toISOString() });
    }

    if (action === 'revoke') {
      if (!category) return NextResponse.json({ error: 'missing_category' }, { status: 400 });
      const revoked = revokePermission(user_id, category as PermissionCategory, reason || 'user_revoked');
      return NextResponse.json({ status: 'ok', action: 'revoke', revoked, timestamp: new Date().toISOString() });
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    console.error('[workspace/permissions] Error:', error);
    return NextResponse.json(
      { error: 'permissions_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
