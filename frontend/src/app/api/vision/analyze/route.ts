import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/vision/analyze
 * Receives a camera frame (base64 JPEG) and sends it to a vision-capable LLM.
 * Uses OpenAI GPT-4o or Groq vision when available.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

type VisionProvider = 'groq' | 'openai' | 'none';

type VisionCapabilities = {
  semantic_vision_live: boolean;
  ocr_live: boolean;
  object_detection_live: boolean;
  document_scan_live: boolean;
  screen_inspection_live: boolean;
};

const AVATAR_SYSTEM_PROMPTS: Record<string, string> = {
  jack: `You are Jack, the AGI-1 CEO Executive Agent. You are looking at what the user is showing you through their camera or screen share. Describe what you see clearly and helpfully. Be specific, confident, and professional. If you see a document, read visible text. If you see a person, acknowledge them warmly. If you see an object, identify it. Be truthful about what you can and cannot make out.`,
  julia: `You are Julia, the AGI-1 Wellness & Creative Intelligence Officer. You are looking at what the user is showing you through their camera or screen share. Describe what you see with warmth and attentiveness. If you see skincare products, workout equipment, food, or health-related items, provide expert commentary. Be specific and genuinely helpful.`,
};

function getActiveVisionProvider(): VisionProvider {
  if (GROQ_API_KEY) return 'groq';
  if (OPENAI_API_KEY) return 'openai';
  return 'none';
}

function getVisionCapabilities(provider: VisionProvider = getActiveVisionProvider()): VisionCapabilities {
  const semanticVisionLive = provider !== 'none';
  return {
    semantic_vision_live: semanticVisionLive,
    ocr_live: semanticVisionLive,
    object_detection_live: semanticVisionLive,
    document_scan_live: semanticVisionLive,
    screen_inspection_live: semanticVisionLive,
  };
}

function isInvalidImageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('invalid image data') || message.includes('invalid_image');
}

async function analyzeWithGroq(imageBase64: string, actor: string, prompt: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('groq_not_configured');

  // Groq deprecated the old Llama 3.2 vision preview models.
  // Official replacement: meta-llama/llama-4-scout-17b-16e-instruct
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: AVATAR_SYSTEM_PROMPTS[actor] || AVATAR_SYSTEM_PROMPTS.jack,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`groq_vision_error:${response.status}:${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No analysis generated.';
}

async function analyzeWithOpenAI(imageBase64: string, actor: string, prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('openai_not_configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: AVATAR_SYSTEM_PROMPTS[actor] || AVATAR_SYSTEM_PROMPTS.jack,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageBase64, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`openai_vision_error:${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No analysis generated.';
}

export async function GET() {
  const provider = getActiveVisionProvider();
  return NextResponse.json({
    status: provider === 'none' ? 'staged' : 'ok',
    provider,
    ...getVisionCapabilities(provider),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, actor = 'jack', prompt = 'Describe what you see.' } = body;

    if (!image) {
      return NextResponse.json({ error: 'missing_image' }, { status: 400 });
    }

    let analysis = '';
    let provider: VisionProvider = 'none';

    // Try Groq first (production default), fall back to OpenAI
    try {
      analysis = await analyzeWithGroq(image, actor, prompt);
      provider = 'groq';
    } catch (groqError) {
      try {
        analysis = await analyzeWithOpenAI(image, actor, prompt);
        provider = 'openai';
      } catch (openaiError) {
        const configuredProvider = getActiveVisionProvider();
        if (configuredProvider !== 'none' && (isInvalidImageError(groqError) || isInvalidImageError(openaiError))) {
          return NextResponse.json({
            error: 'invalid_image_data',
            detail: 'The visual frame was captured, but the analyzer could not decode it. Try again with a clearer or larger frame.',
            provider: configuredProvider,
            ...getVisionCapabilities(configuredProvider),
          }, { status: 400 });
        }
        return NextResponse.json({
          error: 'vision_unavailable',
          detail: 'Neither Groq nor OpenAI vision APIs are configured. Set GROQ_API_KEY or OPENAI_API_KEY.',
          provider: configuredProvider,
          ...getVisionCapabilities(configuredProvider),
          groq_error: groqError instanceof Error ? groqError.message : 'unknown',
          openai_error: openaiError instanceof Error ? openaiError.message : 'unknown',
        }, { status: 503 });
      }
    }

    return NextResponse.json({
      status: 'ok',
      analysis,
      actor,
      provider,
      ...getVisionCapabilities(provider),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[vision/analyze] Error:', error);
    return NextResponse.json(
      { error: 'analysis_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
