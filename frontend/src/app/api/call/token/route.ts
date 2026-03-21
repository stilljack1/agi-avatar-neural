import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/call/token
 * Mints a LiveKit JWT token for an active call session.
 * Falls back to mock tokens when LiveKit is not configured.
 */

// Import the shared session store
// In Next.js API routes with standalone output, we recreate a minimal store
const TOKEN_SECRET = process.env.CALL_TOKEN_SECRET || 'agi1-sovereign-call-token-secret';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

function base64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

function mintLiveKitToken(roomId: string, userId: string, role: string): string {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('livekit_not_configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: userId,
    iat: now,
    nbf: now - 5,
    exp: now + 300,
    jti: crypto.randomUUID(),
    video: {
      roomJoin: true,
      room: roomId,
      canPublish: role === 'publisher',
      canSubscribe: true,
    },
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', LIVEKIT_API_SECRET)
    .update(signingInput)
    .digest();

  return `${headerB64}.${payloadB64}.${base64url(signature)}`;
}

function mintMockToken(roomId: string, userId: string, role: string): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${roomId}:${userId}:${role}:${now}:${nonce}`;
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('hex');
  return `v1.${now}.${nonce}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { call_session_id, role = 'publisher' } = body;

    if (!call_session_id) {
      return NextResponse.json(
        { error: 'missing_session_id' },
        { status: 400 }
      );
    }

    // For the MVP, we generate tokens without session validation
    // since session store is per-process and may not share across hot reloads
    const roomId = `agi1-call-${call_session_id.slice(0, 12)}`;
    const userId = 'local-user';
    const provider = LIVEKIT_API_KEY ? 'livekit' : 'local';

    let token: string;
    try {
      token = LIVEKIT_API_KEY
        ? mintLiveKitToken(roomId, userId, role)
        : mintMockToken(roomId, userId, role);
    } catch {
      token = mintMockToken(roomId, userId, role);
    }

    return NextResponse.json({
      status: 'ok',
      provider,
      provider_url: LIVEKIT_URL,
      room_id: roomId,
      token,
      expires_in: 300,
      role,
      actor: 'jack',
    });
  } catch (error) {
    console.error('[call/token] Error:', error);
    return NextResponse.json(
      { error: 'token_mint_failed' },
      { status: 500 }
    );
  }
}
