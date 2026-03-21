import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * POST /api/tts
 * Text-to-speech via Groq Orpheus TTS model.
 *
 * If Groq TTS fails (terms not accepted, key missing, etc.), returns 503.
 * The client-side useAvatarAudio hook will use browser SpeechSynthesis as fallback.
 *
 * Returns audio binary stream — played directly by <audio> element on the client.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

// Keep these in sync with the live Groq account's currently accepted voices.
// We only advertise Groq TTS as live when the route can return real audio.
const AVATAR_VOICES: Record<string, string> = {
  jack: 'daniel',
  julia: 'diana',
};

const EDGE_TTS_VOICES: Record<string, string> = {
  jack: 'en-US-AndrewNeural',
  julia: 'en-US-AriaNeural',
};

async function synthesizeWithEdge(text: string, actor: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    EDGE_TTS_VOICES[actor] || EDGE_TTS_VOICES.jack,
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
  );

  const { audioStream } = await tts.toStream(text);
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    audioStream.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('close', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, actor = 'jack' } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'missing_text' }, { status: 400 });
    }

    try {
      if (!GROQ_API_KEY) {
        throw new Error('groq_not_configured');
      }

      const voice = AVATAR_VOICES[actor] || AVATAR_VOICES.jack;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'canopylabs/orpheus-v1-english',
          input: text.trim(),
          voice,
          response_format: 'wav',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`groq_tts_${response.status}:${errorText.slice(0, 500)}`);
      }

      const audioData = Buffer.from(await response.arrayBuffer());

      return new NextResponse(new Uint8Array(audioData), {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(audioData.byteLength),
          'Cache-Control': 'no-cache',
          'X-AGI1-TTS-Provider': 'groq',
        },
      });
    } catch (groqError) {
      console.warn('[tts] Groq TTS unavailable, falling back to Edge TTS:', groqError);
      const fallbackAudio = await synthesizeWithEdge(text.trim(), actor);
      return new NextResponse(new Uint8Array(fallbackAudio), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(fallbackAudio.byteLength),
          'Cache-Control': 'no-cache',
          'X-AGI1-TTS-Provider': 'edge-tts',
        },
      });
    }
  } catch (error) {
    console.error('[tts] Error:', error);
    return NextResponse.json(
      { error: 'tts_error', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
