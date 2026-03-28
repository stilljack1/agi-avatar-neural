#!/usr/bin/env node
/**
 * xAI Real-Time Voice WebSocket Relay
 *
 * Runs alongside the Next.js server on EC2.
 * Bridges browser WebSocket ↔ xAI wss://api.x.ai/v1/realtime
 *
 * The browser cannot set Authorization headers on WebSocket connections,
 * so this relay adds the header server-side and pipes audio bidirectionally.
 *
 * Port: 3201 (proxied via nginx at /ws/voice)
 * Protocol: JSON frames matching xAI Realtime API event schema
 *
 * Usage:
 *   XAI_API_KEY=xai-... node xai-voice-relay.mjs
 *   pm2 start xai-voice-relay.mjs --name xai-voice-relay
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = parseInt(process.env.XAI_RELAY_PORT || '3201', 10);
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const XAI_REALTIME_URL = process.env.XAI_REALTIME_URL || 'wss://api.x.ai/v1/realtime';
const XAI_REALTIME_MODEL = process.env.XAI_REALTIME_MODEL || 'grok-4.20-realtime';

const VOICE_MAP = { jack: 'Rex', julia: 'Ara' };

if (!XAI_API_KEY) {
  console.error('[xai-relay] FATAL: XAI_API_KEY not set. Exiting.');
  process.exit(1);
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'xai-voice-relay',
    status: 'ok',
    transport: 'websocket',
    model: XAI_REALTIME_MODEL,
    voices: VOICE_MAP,
  }));
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws/voice' });

let connectionCount = 0;

wss.on('connection', (clientWs, req) => {
  connectionCount++;
  const connId = connectionCount;
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const actor = (url.searchParams.get('actor') || 'jack').toLowerCase();
  const voice = VOICE_MAP[actor] || 'Rex';

  console.log(`[xai-relay] #${connId} connected | actor=${actor} voice=${voice}`);

  // Buffer mic audio until session.updated is received from xAI
  let sessionReady = false;
  const audioBuffer = [];

  // Open upstream connection to xAI Realtime
  const xaiWs = new WebSocket(XAI_REALTIME_URL, {
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
  });

  let alive = true;

  function cleanup() {
    if (!alive) return;
    alive = false;
    console.log(`[xai-relay] #${connId} cleanup`);
    try { clientWs.close(); } catch {}
    try { xaiWs.close(); } catch {}
  }

  // ── xAI → Client relay ──
  xaiWs.on('open', () => {
    console.log(`[xai-relay] #${connId} upstream connected to xAI`);

    // Send session.update with voice and VAD config
    const sessionUpdate = {
      type: 'session.update',
      session: {
        model: XAI_REALTIME_MODEL,
        modalities: ['text', 'audio'],
        voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: XAI_REALTIME_MODEL },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        instructions: actor === 'julia'
          ? 'You are Julia from AGI-1. Warm, precise, conversational. Be concise.'
          : 'You are Jack from AGI-1. Confident, clear, professional. Be concise.',
      },
    };
    xaiWs.send(JSON.stringify(sessionUpdate));
  });

  xaiWs.on('message', (data) => {
    if (!alive) return;
    try {
      const event = JSON.parse(data.toString());

      // Detect session.updated → flush buffered audio
      if (event.type === 'session.updated') {
        console.log(`[xai-relay] #${connId} session.updated — flushing ${audioBuffer.length} buffered chunks`);
        sessionReady = true;

        // Flush all buffered audio
        for (const chunk of audioBuffer) {
          xaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: chunk,
          }));
        }
        audioBuffer.length = 0;
      }

      // Forward all xAI events to the client
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    } catch (err) {
      console.warn(`[xai-relay] #${connId} parse error:`, err.message);
    }
  });

  xaiWs.on('error', (err) => {
    console.error(`[xai-relay] #${connId} xAI error:`, err.message);
    cleanup();
  });

  xaiWs.on('close', (code, reason) => {
    console.log(`[xai-relay] #${connId} xAI closed: ${code} ${reason}`);
    cleanup();
  });

  // ── Client → xAI relay ──
  clientWs.on('message', (data) => {
    if (!alive) return;
    try {
      const event = JSON.parse(data.toString());

      // Buffer audio if session not yet ready (mic buffer best practice)
      if (event.type === 'input_audio_buffer.append' && !sessionReady) {
        audioBuffer.push(event.audio);
        return;
      }

      // Forward everything else to xAI
      if (xaiWs.readyState === WebSocket.OPEN) {
        xaiWs.send(data.toString());
      }
    } catch (err) {
      console.warn(`[xai-relay] #${connId} client parse error:`, err.message);
    }
  });

  clientWs.on('error', (err) => {
    console.error(`[xai-relay] #${connId} client error:`, err.message);
    cleanup();
  });

  clientWs.on('close', () => {
    console.log(`[xai-relay] #${connId} client disconnected`);
    cleanup();
  });

  // Heartbeat
  const pingInterval = setInterval(() => {
    if (!alive) { clearInterval(pingInterval); return; }
    try {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      if (xaiWs.readyState === WebSocket.OPEN) xaiWs.ping();
    } catch {}
  }, 30000);
});

httpServer.listen(PORT, () => {
  console.log(`[xai-voice-relay] listening on :${PORT} | model=${XAI_REALTIME_MODEL} | voices=${JSON.stringify(VOICE_MAP)}`);
});

process.on('SIGTERM', () => { console.log('[xai-relay] SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { console.log('[xai-relay] SIGINT'); process.exit(0); });
