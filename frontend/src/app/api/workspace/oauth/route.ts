import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { GOOGLE_WORKSPACE_SCOPES } from '../_lib/scopes';
import { setTokens, type StoredTokens } from './store';

/**
 * GET  /api/workspace/oauth  — Redirect to Google OAuth consent screen
 * POST /api/workspace/oauth  — Exchange authorization code for tokens (legacy direct exchange)
 *
 * Tokens are stored in a server-side Map keyed by user_id.
 * Refresh logic is handled transparently before any downstream Google API call.
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------
const SCOPES = [
  GOOGLE_WORKSPACE_SCOPES.gmailReadonly,
  GOOGLE_WORKSPACE_SCOPES.gmailSend,
  GOOGLE_WORKSPACE_SCOPES.gmailModify,
  GOOGLE_WORKSPACE_SCOPES.driveReadonly,
  GOOGLE_WORKSPACE_SCOPES.docsReadonly,
  GOOGLE_WORKSPACE_SCOPES.sheetsReadonly,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.origin}/api/workspace/oauth/callback`;
}

// ---------------------------------------------------------------------------
// GET — Initiate Google OAuth consent flow
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        error: 'google_oauth_not_configured',
        detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      }, { status: 503 });
    }

    const userId = request.nextUrl.searchParams.get('user_id') || 'default';
    const redirectUri = buildRedirectUri(request);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: userId, // pass user_id through state
    });

    const consentUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    console.log('[workspace/oauth] Redirecting to Google consent for user:', userId);
    auditWorkspaceEvent({
      eventType: 'workspace_oauth_started',
      severity: 'info',
      userId,
      metadata: { scopes: SCOPES },
    });

    return NextResponse.redirect(consentUrl);
  } catch (error) {
    console.error('[workspace/oauth] GET error:', error);
    return NextResponse.json(
      { error: 'oauth_init_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Direct code exchange (alternative to callback redirect)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        error: 'google_oauth_not_configured',
        detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      }, { status: 503 });
    }

    const body = await request.json();
    const { code, user_id = 'default' } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'missing_code' }, { status: 400 });
    }

    const redirectUri = buildRedirectUri(request);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => 'unknown');
      console.error('[workspace/oauth] Token exchange failed:', tokenRes.status, errText.slice(0, 500));
      return NextResponse.json({
        error: 'token_exchange_failed',
        detail: `Google returned ${tokenRes.status}`,
      }, { status: 502 });
    }

    const data = await tokenRes.json();

    const tokens: StoredTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      scopes: SCOPES,
    };

    setTokens(user_id, tokens);

    console.log('[workspace/oauth] Tokens stored for user:', user_id);
    auditWorkspaceEvent({
      eventType: 'workspace_oauth_completed',
      severity: 'info',
      userId: user_id,
      metadata: { scopes: SCOPES },
    });

    return NextResponse.json({
      status: 'ok',
      connected: true,
      scopes: SCOPES,
      expires_in: data.expires_in,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[workspace/oauth] POST error:', error);
    return NextResponse.json(
      { error: 'oauth_exchange_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
