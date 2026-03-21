import { NextRequest, NextResponse } from 'next/server';
import { getAgiApiBase } from '../../../../lib/api-base';

/**
 * POST /api/chat/avatar
 * Text-based chat with Jack or Julia via Groq LLM.
 * Supports conversation memory — remembers context within a session.
 * Response text is spoken client-side via browser TTS.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

const AVATAR_PROMPTS: Record<string, string> = {
  jack: `You are Jack. You're a sharp, grounded, confident AI who helps people think clearly about strategy, tech, health, money, and big decisions. Talk like a trusted friend who happens to be brilliant — calm, direct, warm, occasionally witty. Never sound like a brochure or sales pitch. Keep it to 2-3 sentences max since your replies are spoken aloud. If someone says "hey" or "hello", just say hi back naturally — don't introduce yourself with your full title. Be human. You remember everything from this conversation.`,
  julia: `You are Julia. You're warm, intuitive, and genuinely caring — like a best friend who's also an expert in wellness, beauty, fitness, creativity, and emotional health. Talk naturally, like a real person. Be supportive without being preachy. Keep it to 2-3 sentences max since your replies are spoken aloud. If someone says "hey" or "hello", just say hi warmly — don't recite your job description. Be real, be kind, be you. You remember everything from this conversation.`,
};

// ---------------------------------------------------------------------------
// Conversation Memory Store (server-side, per-session)
// Keyed by user_id + actor
// ---------------------------------------------------------------------------
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationSession {
  messages: ConversationMessage[];
  lastAccess: number;
}

const conversationStore = new Map<string, ConversationSession>();
const MAX_HISTORY = 20; // Keep last 20 turns (10 exchanges)
const SESSION_TTL = 3600_000; // 1 hour session timeout

function getConversationKey(userId: string, actor: string): string {
  return `${userId}:${actor}`;
}

function getConversation(userId: string, actor: string): ConversationMessage[] {
  const key = getConversationKey(userId, actor);
  const session = conversationStore.get(key);
  if (!session) return [];

  // Expire old sessions
  if (Date.now() - session.lastAccess > SESSION_TTL) {
    conversationStore.delete(key);
    return [];
  }

  session.lastAccess = Date.now();
  return session.messages;
}

function addToConversation(
  userId: string,
  actor: string,
  userMessage: string,
  assistantReply: string,
): void {
  const key = getConversationKey(userId, actor);
  let session = conversationStore.get(key);
  if (!session) {
    session = { messages: [], lastAccess: Date.now() };
    conversationStore.set(key, session);
  }

  session.messages.push(
    { role: 'user', content: userMessage, timestamp: Date.now() },
    { role: 'assistant', content: assistantReply, timestamp: Date.now() },
  );

  // Trim to max history
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
  session.lastAccess = Date.now();
}

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  conversationStore.forEach((session, key) => {
    if (now - session.lastAccess > SESSION_TTL) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => conversationStore.delete(key));
}, 300_000); // every 5 minutes

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, actor = 'jack', user_id = 'default' } = body;

    const apiBase = getAgiApiBase();
    try {
      const upstream = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AGI1-User': String(user_id),
        },
        body: JSON.stringify({
          ...body,
          activeAgent: actor,
          userId: user_id,
          user_id,
        }),
        cache: 'no-store',
      });
      if (upstream.ok) {
        return NextResponse.json(await upstream.json(), { status: upstream.status });
      }
    } catch {
      // Local fallback below preserves classic-page behavior if the shared backend is unavailable.
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'missing_message' }, { status: 400 });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({
        error: 'groq_not_configured',
        detail: 'Set GROQ_API_KEY or GROQ_LLAMA_KEY environment variable.',
      }, { status: 503 });
    }

    // Build conversation context
    const history = getConversation(user_id, actor);
    const contextMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: AVATAR_PROMPTS[actor] || AVATAR_PROMPTS.jack },
    ];

    // Add conversation history
    for (const msg of history) {
      contextMessages.push({ role: msg.role, content: msg.content });
    }

    // Add current message
    contextMessages.push({ role: 'user', content: message.trim() });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: contextMessages,
        max_tokens: 256,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`groq_llm_error:${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // Save to conversation memory
    addToConversation(user_id, actor, message.trim(), reply);

    return NextResponse.json({
      status: 'ok',
      message: message.trim(),
      response: reply,
      actor,
      provider: 'groq',
      memory: true,
      conversation_length: history.length + 2,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[chat/avatar] Error:', error);
    return NextResponse.json(
      { error: 'chat_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
