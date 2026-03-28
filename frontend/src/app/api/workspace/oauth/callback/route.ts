import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../../_lib/audit';
import { GOOGLE_WORKSPACE_SCOPES } from '../../_lib/scopes';
import { setTokens, type StoredTokens } from '../store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspace/oauth/callback
 * Google redirects here after user grants consent.
 * Exchanges the authorization code for tokens, stores them, then redirects
 * the browser back to the workspace UI.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const SCOPES = [
  GOOGLE_WORKSPACE_SCOPES.gmailReadonly,
  GOOGLE_WORKSPACE_SCOPES.gmailSend,
  GOOGLE_WORKSPACE_SCOPES.gmailModify,
  GOOGLE_WORKSPACE_SCOPES.driveReadonly,
  GOOGLE_WORKSPACE_SCOPES.docsReadonly,
  GOOGLE_WORKSPACE_SCOPES.sheetsReadonly,
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state') || 'default'; // user_id passed via state
    const error = searchParams.get('error');

    // Google may redirect with an error param if user denied consent
    if (error) {
      console.error('[workspace/oauth/callback] Google returned error:', error);
      const origin = new URL(request.url).origin;
      return NextResponse.redirect(`${origin}/workspace?oauth_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.json({ error: 'missing_code' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        error: 'google_oauth_not_configured',
        detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      }, { status: 503 });
    }

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/workspace/oauth/callback`;

    // Exchange code for tokens
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
      console.error('[workspace/oauth/callback] Token exchange failed:', tokenRes.status, errText.slice(0, 500));
      return NextResponse.redirect(`${origin}/workspace?oauth_error=token_exchange_failed`);
    }

    const data = await tokenRes.json();

    const tokens: StoredTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      scopes: SCOPES,
    };

    setTokens(state, tokens);

    console.log('[workspace/oauth/callback] Tokens stored for user:', state);
    auditWorkspaceEvent({
      eventType: 'workspace_oauth_callback_completed',
      severity: 'info',
      userId: state,
      metadata: { scopes: SCOPES },
    });

    // Redirect back to the workspace UI with success indicator
    return NextResponse.redirect(`${origin}/workspace?oauth=success&user_id=${encodeURIComponent(state)}`);
  } catch (error) {
    console.error('[workspace/oauth/callback] Error:', error);
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(
      `${origin}/workspace?oauth_error=${encodeURIComponent(error instanceof Error ? error.message : 'unknown')}`,
    );
  }
}
