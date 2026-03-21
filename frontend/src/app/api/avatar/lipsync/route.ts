import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/avatar/lipsync
 * Real-time lip-sync video generation.
 *
 * Accepts TTS audio + avatar identity, returns a lip-synced video
 * of Jack or Julia speaking with real mouth movement.
 *
 * Providers (checked in order):
 *   1. D-ID Talks API        — set DID_API_KEY
 *   2. Simli Real-time       — set SIMLI_API_KEY
 *   3. Self-hosted SadTalker — set LIPSYNC_SERVER_URL
 *
 * GET /api/avatar/lipsync?talk_id=xxx
 * Poll for D-ID talk completion.
 */

const DID_API_KEY = process.env.DID_API_KEY || '';
const SIMLI_API_KEY = process.env.SIMLI_API_KEY || '';
const LIPSYNC_SERVER_URL = process.env.LIPSYNC_SERVER_URL || ''; // e.g. http://gpu-server:8765
const AUDIO2FACE_BRIDGE_URL = process.env.AUDIO2FACE_BRIDGE_URL || process.env.NVIDIA_ACE_WS_URL || '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://agi1.org';

// Public URLs for Jack/Julia face references
const AVATAR_FACES: Record<string, string> = {
  jack: `${SITE_URL}/avatars/jack-portrait.png`,
  julia: `${SITE_URL}/avatars/julia-portrait.png`,
};

type LipSyncProvider = 'did' | 'simli' | 'self_hosted' | 'none';

function detectProvider(): LipSyncProvider {
  if (DID_API_KEY) return 'did';
  if (SIMLI_API_KEY) return 'simli';
  if (LIPSYNC_SERVER_URL) return 'self_hosted';
  return 'none';
}

function getCapabilityContract(provider: LipSyncProvider = detectProvider()) {
  const realtimeCapable = provider === 'self_hosted' || provider === 'simli' || Boolean(AUDIO2FACE_BRIDGE_URL);
  const liveRenderable = provider === 'self_hosted';
  const asyncOnly = provider === 'did';
  const clientIntegrated = provider === 'self_hosted';

  return {
    provider,
    configured: provider !== 'none',
    realtime_capable: realtimeCapable,
    live_renderable: liveRenderable,
    async_only: asyncOnly,
    client_integrated: clientIntegrated,
    audio2face_bridge_configured: Boolean(AUDIO2FACE_BRIDGE_URL),
    recommended_mode: liveRenderable
      ? 'generated_video'
      : provider === 'simli'
        ? 'webrtc_avatar'
        : asyncOnly
          ? 'async_video'
          : 'video_swap',
  };
}

// ====================================================================
// D-ID Talks API Integration
// ====================================================================
async function generateWithDID(audioBase64: string, actor: string): Promise<{
  talk_id: string;
  status: string;
}> {
  const faceUrl = AVATAR_FACES[actor] || AVATAR_FACES.jack;

  const response = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${DID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: faceUrl,
      script: {
        type: 'audio',
        audio_url: `data:audio/wav;base64,${audioBase64}`,
      },
      config: {
        fluent: true,
        pad_audio: 0.0,
        stitch: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`did_api_error:${response.status}:${err.slice(0, 300)}`);
  }

  const data = await response.json();
  return {
    talk_id: data.id,
    status: data.status || 'created',
  };
}

async function pollDIDTalk(talkId: string): Promise<{
  status: string;
  video_url?: string;
}> {
  const response = await fetch(`https://api.d-id.com/talks/${talkId}`, {
    headers: {
      'Authorization': `Basic ${DID_API_KEY}`,
    },
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`did_poll_error:${response.status}:${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    status: data.status,
    video_url: data.result_url || undefined,
  };
}

// ====================================================================
// Simli Real-time Integration
// ====================================================================
async function createSimliSession(actor: string): Promise<{
  session_id: string;
  ice_servers: unknown[];
  sdp_offer: string;
}> {
  const faceUrl = AVATAR_FACES[actor] || AVATAR_FACES.jack;

  const response = await fetch('https://api.simli.ai/startE2ESession', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-simli-api-key': SIMLI_API_KEY,
    },
    body: JSON.stringify({
      faceId: actor,
      faceURL: faceUrl,
      voiceProvider: 'custom', // we provide our own audio
      handleSilence: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`simli_session_error:${response.status}:${err.slice(0, 300)}`);
  }

  return response.json();
}

// ====================================================================
// Self-hosted SadTalker/Wav2Lip Integration
// ====================================================================
async function generateWithSelfHosted(audioBase64: string, actor: string): Promise<Buffer> {
  const faceUrl = AVATAR_FACES[actor] || AVATAR_FACES.jack;

  const response = await fetch(`${LIPSYNC_SERVER_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64: audioBase64,
      face_url: faceUrl,
      actor,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`lipsync_server_error:${response.status}:${err.slice(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ====================================================================
// Unified API: Generate lip-synced speech from text
// ====================================================================

async function generateTTSAudio(text: string, actor: string): Promise<Buffer> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
  const voices: Record<string, string> = { jack: 'daniel', julia: 'diana' };

  const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'canopylabs/orpheus-v1-english',
      input: text.trim(),
      voice: voices[actor] || 'daniel',
      response_format: 'wav',
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`tts_error:${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ====================================================================
// POST handler — Generate lip-synced video
// ====================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, actor = 'jack', audio_base64 } = body;

    if (!text && !audio_base64) {
      return NextResponse.json({ error: 'missing_text_or_audio' }, { status: 400 });
    }

    const provider = detectProvider();
    console.log(`[avatar/lipsync] Provider: ${provider}, actor: ${actor}`);

    // If no provider configured, return capability info
    if (provider === 'none') {
      return NextResponse.json({
        status: 'no_provider',
        ...getCapabilityContract(provider),
        detail: 'No lip-sync provider configured. Set DID_API_KEY, SIMLI_API_KEY, or LIPSYNC_SERVER_URL.',
        setup_guide: {
          did: 'Sign up at https://www.d-id.com — Free trial gives 20 credits. Set DID_API_KEY env var.',
          simli: 'Sign up at https://www.simli.com — Free tier gives 10 min/month. Set SIMLI_API_KEY env var.',
          self_hosted: 'Deploy SadTalker on a GPU server. Set LIPSYNC_SERVER_URL=http://your-gpu:8765',
        },
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }

    // Generate TTS audio if only text was provided
    let audioBuffer: Buffer;
    if (audio_base64) {
      audioBuffer = Buffer.from(audio_base64, 'base64');
    } else {
      audioBuffer = await generateTTSAudio(text, actor);
    }
    const audioB64 = audioBuffer.toString('base64');

    // ── D-ID: Async generation ──
    if (provider === 'did') {
      const result = await generateWithDID(audioB64, actor);
      console.log(`[avatar/lipsync] D-ID talk created: ${result.talk_id}`);

      // Return audio immediately + talk_id for polling
      return new NextResponse(new Uint8Array(audioBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(audioBuffer.byteLength),
          'X-AGI1-Lipsync-Provider': 'did',
          'X-AGI1-Lipsync-TalkId': result.talk_id,
          'X-AGI1-Lipsync-Status': 'generating',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // ── Simli: Return session info for WebRTC connection ──
    if (provider === 'simli') {
      const session = await createSimliSession(actor);

      return NextResponse.json({
        status: 'session_created',
        provider: 'simli',
        session,
        audio_base64: audioB64,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Self-hosted: Synchronous generation ──
    if (provider === 'self_hosted') {
      const videoBuffer = await generateWithSelfHosted(audioB64, actor);
      console.log(`[avatar/lipsync] Self-hosted generated: ${videoBuffer.byteLength} bytes`);

      return new NextResponse(new Uint8Array(videoBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(videoBuffer.byteLength),
          'X-AGI1-Lipsync-Provider': 'self_hosted',
          'X-AGI1-Lipsync-Status': 'ready',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return NextResponse.json({ error: 'unknown_provider' }, { status: 500 });
  } catch (error) {
    console.error('[avatar/lipsync] Error:', error);
    return NextResponse.json(
      { error: 'lipsync_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ====================================================================
// GET handler — Poll D-ID talk status
// ====================================================================
export async function GET(request: NextRequest) {
  const talkId = request.nextUrl.searchParams.get('talk_id');

  if (!talkId) {
    // Return capability status
    const provider = detectProvider();
    return NextResponse.json({
      status: 'ok',
      ...getCapabilityContract(provider),
      providers: {
        did: Boolean(DID_API_KEY),
        simli: Boolean(SIMLI_API_KEY),
        self_hosted: Boolean(LIPSYNC_SERVER_URL),
        audio2face_bridge: Boolean(AUDIO2FACE_BRIDGE_URL),
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (!DID_API_KEY) {
    return NextResponse.json({ error: 'did_not_configured' }, { status: 503 });
  }

  try {
    const result = await pollDIDTalk(talkId);
    return NextResponse.json({
      status: 'ok',
      talk_id: talkId,
      talk_status: result.status,
      video_url: result.video_url,
      ready: result.status === 'done',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[avatar/lipsync] Poll error:', error);
    return NextResponse.json(
      { error: 'poll_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
