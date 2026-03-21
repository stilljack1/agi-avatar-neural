import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '../../../../lib/conversation-store';
import { getAgiApiBase } from '../../../../lib/api-base';

/**
 * GET /api/chat/history
 * Returns recent conversation history for a user+actor pair.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const actor = searchParams.get('avatar') || searchParams.get('actor') || 'jack';
    const userId = searchParams.get('user_id') || 'default';
    const sessionId = searchParams.get('session_id') || '';
    const limit = Math.min(Number(searchParams.get('limit')) || 18, 50);

    const apiBase = getAgiApiBase();
    try {
      const params = new URLSearchParams({
        avatar: actor,
        user_id: userId,
        limit: String(limit),
      });
      if (sessionId) {
        params.set('session_id', sessionId);
      }
      const upstream = await fetch(`${apiBase}/api/chat/history?${params.toString()}`, {
        headers: {
          'X-AGI1-User': userId,
        },
        cache: 'no-store',
      });
      if (upstream.ok) {
        return NextResponse.json(await upstream.json(), { status: upstream.status });
      }
    } catch {
      // Fall back to local in-memory history if the shared backend is unreachable.
    }

    const history = getConversation(userId, actor);

    const records = history.slice(-limit).map((msg, index) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      activeAgent: actor,
      conversationId: `${userId}:${actor}`,
      index,
    }));

    return NextResponse.json(records);
  } catch (error) {
    console.error('[chat/history] Error:', error);
    return NextResponse.json([], { status: 200 });
  }
}
