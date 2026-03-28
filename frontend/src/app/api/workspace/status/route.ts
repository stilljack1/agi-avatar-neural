import { NextRequest, NextResponse } from 'next/server';
import { getTokens } from '../oauth/store';
import { deriveCapabilities } from '../_lib/scopes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspace/status
 * Returns which Google Workspace integrations are connected,
 * active scopes, and token health for the given user.
 */

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id') || 'default';
    const tokens = getTokens(userId);

    if (!tokens) {
      return NextResponse.json({
        status: 'ok',
        connected: false,
        user_id: userId,
        integrations: {
          gmail: false,
          drive: false,
          docs: false,
          sheets: false,
        },
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(userId)}`,
        timestamp: new Date().toISOString(),
      });
    }

    const now = Date.now();
    const expiresIn = Math.max(0, Math.round((tokens.expires_at - now) / 1000));
    const isExpired = now >= tokens.expires_at;
    const hasRefresh = Boolean(tokens.refresh_token);

    // Derive integration status from scopes
    const scopes = tokens.scopes || [];
    const capabilities = deriveCapabilities(scopes);

    const tokenHealth: 'healthy' | 'expiring_soon' | 'expired' | 'refresh_available' =
      isExpired
        ? hasRefresh ? 'refresh_available' : 'expired'
        : expiresIn < 300
          ? 'expiring_soon'
          : 'healthy';

    console.log(`[workspace/status] user: ${userId}, health: ${tokenHealth}`);

    return NextResponse.json({
      status: 'ok',
      connected: true,
      user_id: userId,
      integrations: {
        gmail: capabilities.gmailRead,
        drive: capabilities.driveRead,
        docs: capabilities.docsRead,
        sheets: capabilities.sheetsRead,
      },
      capabilities,
      scopes,
      token_health: tokenHealth,
      expires_in_seconds: expiresIn,
      has_refresh_token: hasRefresh,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[workspace/status] Error:', error);
    return NextResponse.json(
      { error: 'status_check_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
