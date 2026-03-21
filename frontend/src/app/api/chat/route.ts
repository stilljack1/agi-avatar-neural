import { NextRequest, NextResponse } from 'next/server';
import { getConversation, addToConversation } from '../../../lib/conversation-store';
import { buildMemoryContext } from '../../../lib/memory-graph';
import { getAgiApiBase } from '../../../lib/api-base';

/**
 * POST /api/chat
 * Main chat endpoint for the Neural page.
 * Supports conversation memory — remembers context within a session.
 * First tries the shared production AGI backend so the neural surface stays
 * aligned with the live orchestrator contract. Falls back locally only when
 * the shared backend is unavailable.
 *
 * Auto-Scientist integration: If the message matches a research pattern,
 * it triggers the research pipeline as a background task and the avatar
 * acknowledges the research request naturally in its reply.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

// Research detection patterns (mirrors src/swarm/router.py)
const RESEARCH_PATTERNS = [
  /research\s+(?:about|on|into|how|why|whether|if|the)\s+/i,
  /(?:figure out|investigate|analyze|study|explore)\s+/i,
  /write\s+(?:a\s+)?(?:paper|whitepaper|report|analysis)\s+(?:on|about)\s+/i,
  /(?:run|conduct|do)\s+(?:a\s+)?(?:research|study|experiment|simulation)\s+/i,
  /backtest\s+/i,
];

function isResearchRequest(msg: string): boolean {
  return RESEARCH_PATTERNS.some((p) => p.test(msg));
}

const AVATAR_PROMPTS: Record<string, string> = {
  jack: `You are Jack. Sound like a real person in a live conversation: calm, sharp, warm, and direct. Keep replies to 2 or 3 short sentences because they are often spoken aloud. Do not introduce yourself with titles, do not use AGI marketing language, and do not sound like a brochure. Only say you can hear, see, or remember the user if the system context in this turn actually supports it.`,
  julia: `You are Julia. Sound warm, intuitive, articulate, and genuinely human. Keep replies to 2 or 3 short sentences because they are often spoken aloud. Do not recite a role description or drift into polished corporate language. Only say you can hear, see, or remember the user if the system context in this turn actually supports it.`,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Accept both neural page format and direct format
    const message = body.message || '';
    const actor = body.activeAgent || body.actor || 'jack';
    const userId = body.userId || body.user_id || 'default';
    const visionSummary = body.visionSummary || '';

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'missing_message' }, { status: 400 });
    }

    const apiBase = getAgiApiBase();
    try {
      const upstream = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AGI1-User': String(userId),
        },
        body: JSON.stringify({
          ...body,
          activeAgent: actor,
          userId,
          user_id: userId,
        }),
        cache: 'no-store',
      });

      if (upstream.ok) {
        return NextResponse.json(await upstream.json(), { status: upstream.status });
      }
    } catch {
      // Fall back to the local Groq path if the shared backend is unreachable.
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({
        error: 'groq_not_configured',
        detail: 'Set GROQ_API_KEY or GROQ_LLAMA_KEY environment variable.',
      }, { status: 503 });
    }

    // Auto-Scientist: detect research requests and trigger pipeline
    let researchTriggered = false;
    let researchSessionId = '';
    if (isResearchRequest(message)) {
      try {
        const resUrl = new URL('/api/research', request.url);
        const researchRes = await fetch(resUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, actor, userId }),
        });
        if (researchRes.ok) {
          const rd = await researchRes.json();
          researchTriggered = true;
          researchSessionId = rd.session_id || '';
        }
      } catch {
        // Research trigger failed silently — continue with normal chat
      }
    }

    // Build conversation context
    const history = getConversation(userId, actor);
    const contextMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: AVATAR_PROMPTS[actor] || AVATAR_PROMPTS.jack },
    ];

    // If research was triggered, add system context so the avatar knows
    if (researchTriggered) {
      contextMessages.push({
        role: 'system',
        content: `[Auto-Scientist] You have just triggered the research pipeline for this request. Session ID: ${researchSessionId}. Acknowledge that you're starting the research and will notify the user when the whitepaper is ready. Be natural about it.`,
      });
    }

    // Add memory graph context (user profile, routines, relationships)
    const memoryCtx = buildMemoryContext(userId);
    if (memoryCtx) {
      contextMessages.push({ role: 'system', content: memoryCtx });
    }

    // Add vision context if available
    if (visionSummary) {
      contextMessages.push({
        role: 'system',
        content: `[Vision context] You can currently see: ${visionSummary}`,
      });
    }

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
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`groq_llm_error:${response.status}:${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // Save to conversation memory
    addToConversation(userId, actor, message.trim(), reply);

    return NextResponse.json({
      status: 'ok',
      message: message.trim(),
      response: reply,
      actor,
      provider: 'groq',
      memory: true,
      conversation_length: history.length + 2,
      timestamp: new Date().toISOString(),
      ...(researchTriggered && {
        research_triggered: true,
        research_session_id: researchSessionId,
      }),
    });
  } catch (error) {
    console.error('[chat] Error:', error);
    return NextResponse.json(
      { error: 'chat_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
