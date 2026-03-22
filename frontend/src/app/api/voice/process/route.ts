import { NextRequest, NextResponse } from 'next/server';
import { getConversation, addToConversation } from '../../../../lib/conversation-store';

/**
 * POST /api/voice/process
 * Groq voice processing pipeline with conversation memory:
 * 1. Receives audio blob from browser MediaRecorder
 * 2. Transcribes via Groq Whisper STT
 * 3. Generates response via Groq LLM (with conversation history)
 * 4. Returns transcript + response text (TTS happens client-side)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

const AVATAR_PROMPTS: Record<string, string> = {
  jack: `You are Jack. Speak like a real person in a live conversation: grounded, calm, warm, and direct. Keep replies to 2 or 3 short sentences. Do not sound like a brochure, do not announce a title, and do not claim audio, vision, or memory capabilities unless the system context supports them.`,
  julia: `You are Julia. Speak naturally, warmly, and with real emotional intelligence. Keep replies to 2 or 3 short sentences. Do not sound scripted or corporate, and do not claim audio, vision, or memory capabilities unless the system context supports them.`,
};

async function transcribeWithGroq(audioBuffer: Buffer): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('groq_not_configured');

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'en');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`groq_stt_error:${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

async function chatWithGroq(transcript: string, actor: string, userId: string, visionSummary?: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('groq_not_configured');

  // Build conversation context with memory
  const history = getConversation(userId, actor);
  const contextMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: AVATAR_PROMPTS[actor] || AVATAR_PROMPTS.jack },
  ];

  if (visionSummary) {
    contextMessages.push({
      role: 'system',
      content: `[Vision context] You can currently see: ${visionSummary}`,
    });
  }

  for (const msg of history) {
    contextMessages.push({ role: msg.role, content: msg.content });
  }

  contextMessages.push({ role: 'user', content: transcript });

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
  addToConversation(userId, actor, transcript, reply);

  return reply;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const actor = (formData.get('actor') as string) || 'jack';
    const userId = (formData.get('user_id') as string) || (formData.get('userId') as string) || 'default';
    const sessionId =
      (formData.get('session_id') as string)
      || (formData.get('sessionId') as string)
      || (formData.get('conversation_id') as string)
      || (formData.get('conversationId') as string)
      || '';
    const callSessionId =
      (formData.get('call_session_id') as string)
      || (formData.get('callSessionId') as string)
      || '';
    const visionSummary =
      (formData.get('vision_summary') as string)
      || (formData.get('visionSummary') as string)
      || '';
    const mediaStateRaw =
      (formData.get('media_state') as string)
      || (formData.get('mediaState') as string)
      || '';

    if (!audioFile) {
      return NextResponse.json({ error: 'missing_audio' }, { status: 400 });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({
        error: 'groq_not_configured',
        detail: 'Set GROQ_API_KEY or GROQ_LLAMA_KEY environment variable.',
      }, { status: 503 });
    }

    // Convert File to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Transcribe
    const transcript = await transcribeWithGroq(buffer);

    if (!transcript.trim()) {
      return NextResponse.json({
        status: 'ok',
        transcript: '',
        response: '',
        detail: 'no_speech_detected',
      });
    }

    // 2. Generate response via Groq LLM with conversation memory
    const response = await chatWithGroq(transcript, actor, userId, visionSummary || undefined);
    const conversationId = sessionId || callSessionId || '';

    return NextResponse.json({
      status: 'ok',
      transcript,
      response,
      actor,
      sessionId: conversationId,
      conversationId,
      callSessionId,
      provider: 'groq',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[voice/process] Error:', error);
    return NextResponse.json(
      { error: 'voice_processing_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
