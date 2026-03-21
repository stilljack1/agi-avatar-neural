import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/research
 * Triggers the Auto-Scientist pipeline as a background task.
 * Jack/Julia immediately acknowledges and the pipeline runs asynchronously.
 *
 * GET /api/research?session_id=xxx
 * Returns the status of a running research session.
 */

const RESEARCH_PATTERNS = [
  /research\s+(?:about|on|into|how|why|whether|if|the)\s+/i,
  /(?:figure out|investigate|analyze|study|explore)\s+/i,
  /write\s+(?:a\s+)?(?:paper|whitepaper|report|analysis)\s+(?:on|about)\s+/i,
  /(?:run|conduct|do)\s+(?:a\s+)?(?:research|study|experiment|simulation)\s+/i,
  /(?:find|discover|determine)\s+(?:a\s+)?(?:new|novel|better)\s+(?:way|method|approach|strategy)\s+/i,
  /backtest\s+/i,
  /(?:hypothesis|hypothesize|theorize)\s+/i,
];

type ResearchSession = {
  session_id: string;
  topic: string;
  status: 'running' | 'complete' | 'failed';
  phase: string;
  started_at: number;
  error?: string;
};

// In-memory session tracking (the Python backend holds the real state)
const sessions = new Map<string, ResearchSession>();

function isResearchRequest(message: string): boolean {
  return RESEARCH_PATTERNS.some((p) => p.test(message));
}

function extractTopic(message: string): string {
  let topic = message.trim();
  const prefixes = [
    'research ', 'investigate ', 'figure out ', 'analyze ',
    'study ', 'explore ', 'write a paper on ', 'write a whitepaper on ',
    'run a study on ', 'conduct research on ', 'do research on ',
    'can you research ', 'please research ', 'i want you to research ',
    'hey jack ', 'hey julia ', 'jack ', 'julia ',
  ];
  for (const prefix of prefixes) {
    if (topic.toLowerCase().startsWith(prefix)) {
      topic = topic.slice(prefix.length);
    }
  }
  return topic.trim() || message.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, actor = 'jack', userId = 'default' } = body;

    if (!message) {
      return NextResponse.json({ error: 'missing_message' }, { status: 400 });
    }

    const topic = extractTopic(message);
    if (topic.length < 10) {
      return NextResponse.json({ error: 'topic_too_short' }, { status: 400 });
    }

    const sessionId = `research-${userId}-${Date.now()}`;

    // Track session
    sessions.set(sessionId, {
      session_id: sessionId,
      topic,
      status: 'running',
      phase: 'initialized',
      started_at: Date.now(),
    });

    // Fire-and-forget: trigger the Python Auto-Scientist backend
    // In production this would call the Python backend via HTTP or subprocess.
    // For now, we track and return the acknowledgment immediately.
    triggerAutoScientist(sessionId, topic).catch((err) => {
      console.error('[research] Background task error:', err);
      const s = sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        s.error = err instanceof Error ? err.message : 'unknown';
      }
    });

    const acknowledgment =
      actor === 'julia'
        ? `I've started the Auto-Scientist pipeline for "${topic}". I'm pulling the latest research, forming hypotheses, and will run simulations. This might take a few minutes. I'll let you know when the whitepaper is ready. Session: ${sessionId}`
        : `Got it. I've kicked off the research pipeline for "${topic}". Right now I'm pulling papers from arXiv, generating hypotheses, and I'll run simulations to test them. When the whitepaper is done, it goes through peer review before I share it with you. Session: ${sessionId}`;

    return NextResponse.json({
      status: 'ok',
      session_id: sessionId,
      topic,
      acknowledgment,
      actor,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[research] Error:', error);
    return NextResponse.json(
      { error: 'research_trigger_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    // Return all active sessions
    const active = Array.from(sessions.values()).slice(-20);
    return NextResponse.json({ sessions: active });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  }

  return NextResponse.json(session);
}

/**
 * Trigger the Python Auto-Scientist pipeline.
 * In production: calls the Python backend HTTP endpoint or spawns a subprocess.
 * Currently: simulates the pipeline phases for frontend integration testing.
 */
async function triggerAutoScientist(sessionId: string, topic: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  const phases = [
    'literature_review',
    'hypothesis_generation',
    'simulation',
    'analysis',
    'peer_review',
    'complete',
  ];

  // In production, this would be replaced with:
  // const res = await fetch('http://localhost:8100/research/start', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ session_id: sessionId, topic }),
  // });
  //
  // For now, the Python pipeline runs independently via:
  //   python3 -m src.research.director --topic "..." --session-id "..."

  for (const phase of phases) {
    session.phase = phase;
    // Simulate phase duration (real pipeline takes minutes)
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  session.status = 'complete';
}
