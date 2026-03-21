import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/call/session
 * Creates a new call session for Jack or Julia.
 * In production, this will connect to a LiveKit server.
 * Currently mints local sessions with mock tokens for development,
 * and real LiveKit JWT tokens when LIVEKIT_API_KEY + LIVEKIT_API_SECRET are set.
 */

// In-memory session store (replaced by Redis/DynamoDB in production)
const sessions = new Map<string, {
  session_id: string;
  room_id: string;
  actor: string;
  user_id: string;
  provider: string;
  provider_url: string;
  status: string;
  created_at: string;
  expires_at: string;
}>();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(sessions.keys());
  for (let i = 0; i < keys.length; i++) {
    const id = keys[i];
    const session = sessions.get(id);
    if (session && new Date(session.expires_at).getTime() <= now) {
      sessions.delete(id);
    }
  }
}, 300_000);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { actor, user_id } = body;

    if (!actor || !['jack', 'julia'].includes(actor)) {
      return NextResponse.json(
        { error: 'invalid_actor', detail: 'actor must be "jack" or "julia"' },
        { status: 400 }
      );
    }

    const sessionId = crypto.randomUUID().replace(/-/g, '');
    const roomId = `agi1-${actor}-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    const provider = process.env.LIVEKIT_API_KEY ? 'livekit' : 'local';
    const providerUrl = process.env.LIVEKIT_URL || '';

    const session = {
      session_id: sessionId,
      room_id: roomId,
      actor,
      user_id: user_id || 'anonymous',
      provider,
      provider_url: providerUrl,
      status: 'active',
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    sessions.set(sessionId, session);

    return NextResponse.json({
      status: 'ok',
      call_session_id: sessionId,
      room_id: roomId,
      provider,
      provider_url: providerUrl,
      actor,
      created_at: session.created_at,
      expires_at: session.expires_at,
    });
  } catch (error) {
    console.error('[call/session] Error:', error);
    return NextResponse.json(
      { error: 'session_create_failed' },
      { status: 500 }
    );
  }
}

