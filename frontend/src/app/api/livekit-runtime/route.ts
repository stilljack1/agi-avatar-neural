import { NextRequest, NextResponse } from 'next/server';
import { getAgiApiBase } from '../../../lib/api-base';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const apiBase = getAgiApiBase();

  try {
    const upstream = await fetch(`${apiBase}/api/livekit-runtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (upstream.ok) {
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    }
  } catch {
    // Fall through to a local compatibility response so the neural
    // surface stays live even when the shared API edge is degraded.
  }

  return NextResponse.json({
    status: 'ok',
    call_session_id: body.call_session_id || null,
    room_connected: Boolean(body.room_connected),
    transport_connected: Boolean(body.transport_connected),
    mic_live: Boolean(body.mic_live),
    speaker_live: Boolean(body.speaker_live),
    stream_connected: Boolean(body.stream_connected),
    stt_ready: body.stt_ready ?? null,
    tts_ready: body.tts_ready ?? null,
    vad_ready: body.vad_ready ?? null,
    agent_joined: Boolean(body.agent_joined),
    camera_live: Boolean(body.camera_live),
    visual_pipeline_ready: Boolean(body.visual_pipeline_ready),
    frames_receiving: Boolean(body.frames_receiving),
    provider: 'local_compat',
    timestamp: new Date().toISOString(),
  });
}
