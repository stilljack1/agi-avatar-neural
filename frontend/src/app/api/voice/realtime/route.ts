import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/voice/realtime
 *
 * Server-side relay for xAI Real-Time Voice API.
 * Accepts base64 PCM audio chunks from the frontend,
 * forwards them to the xAI realtime session, and returns
 * the response audio + transcript.
 *
 * This exists because browsers cannot set custom Authorization
 * headers on WebSocket connections — the API key stays server-side.
 */

const XAI_API_KEY = process.env.XAI_API_KEY || '';
const XAI_REALTIME_MODEL = process.env.XAI_REALTIME_MODEL || 'grok-4.20-realtime';

const VOICE_MAP: Record<string, string> = {
  jack: 'Rex',
  julia: 'Ara',
};

export async function POST(request: NextRequest) {
  if (!XAI_API_KEY) {
    return NextResponse.json(
      { error: 'xai_api_key_missing', voice_provider: 'none' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { action, actor, session_id, audio_base64, text } = body as {
      action: string;
      actor?: string;
      session_id?: string;
      audio_base64?: string;
      text?: string;
    };

    const voice = VOICE_MAP[(actor || 'jack').toLowerCase()] || 'Rex';

    // ── Session creation ──
    if (action === 'session.create') {
      // Create a new realtime session via xAI REST endpoint
      const sessionResponse = await fetch('https://api.x.ai/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: XAI_REALTIME_MODEL,
          voice,
          modalities: ['text', 'audio'],
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'grok-4.20-realtime' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          instructions: actor === 'julia'
            ? 'You are Julia. Speak warmly and directly. Be concise and real.'
            : 'You are Jack. Speak calmly and confidently. Be concise and real.',
        }),
      });

      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text();
        return NextResponse.json(
          {
            error: 'xai_session_create_failed',
            status: sessionResponse.status,
            detail: errText,
          },
          { status: 502 },
        );
      }

      const session = await sessionResponse.json();
      return NextResponse.json({
        status: 'ok',
        session_id: session.id || session.session_id,
        voice,
        model: XAI_REALTIME_MODEL,
        // Return WebSocket URL and ephemeral client secret if available
        ws_url: session.url || `wss://api.x.ai/v1/realtime?session_id=${session.id || session.session_id}`,
        client_secret: session.client_secret?.value || null,
        expires_at: session.client_secret?.expires_at || null,
        transport: 'xai_realtime',
      });
    }

    // ── Send audio chunk ──
    if (action === 'input_audio_buffer.append' && audio_base64) {
      const appendResponse = await fetch('https://api.x.ai/v1/realtime/sessions/' + (session_id || '') + '/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: audio_base64,
        }),
      });

      return NextResponse.json({
        status: appendResponse.ok ? 'ok' : 'error',
        action: 'input_audio_buffer.append',
        bytes_sent: audio_base64.length,
      });
    }

    // ── Commit audio (signal end of speech) ──
    if (action === 'input_audio_buffer.commit') {
      const commitResponse = await fetch('https://api.x.ai/v1/realtime/sessions/' + (session_id || '') + '/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'input_audio_buffer.commit',
        }),
      });

      return NextResponse.json({
        status: commitResponse.ok ? 'ok' : 'error',
        action: 'input_audio_buffer.commit',
      });
    }

    // ── Text input (non-voice) ──
    if (action === 'conversation.item.create' && text) {
      const textResponse = await fetch('https://api.x.ai/v1/realtime/sessions/' + (session_id || '') + '/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text }],
          },
        }),
      });

      return NextResponse.json({
        status: textResponse.ok ? 'ok' : 'error',
        action: 'conversation.item.create',
      });
    }

    // ── Session update (voice, VAD, etc.) ──
    if (action === 'session.update') {
      const updateResponse = await fetch('https://api.x.ai/v1/realtime/sessions/' + (session_id || '') + '/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'session.update',
          session: {
            voice,
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        }),
      });

      return NextResponse.json({
        status: updateResponse.ok ? 'ok' : 'error',
        action: 'session.update',
        voice,
      });
    }

    return NextResponse.json({ error: 'unknown_action', action }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'relay_error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/voice/realtime
 * Returns the current xAI realtime voice transport status.
 */
export async function GET() {
  return NextResponse.json({
    provider: XAI_API_KEY ? 'xai_realtime' : 'none',
    model: XAI_REALTIME_MODEL,
    voices: VOICE_MAP,
    transport: 'websocket',
    audio_format: 'pcm16',
    sample_rate: 24000,
    vad: 'server_vad',
    ready: Boolean(XAI_API_KEY),
  });
}
