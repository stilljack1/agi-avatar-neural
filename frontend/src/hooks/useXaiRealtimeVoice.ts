'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useXaiRealtimeVoice — Native xAI Grok Real-Time Voice WebSocket hook.
 *
 * Connects to the xai-voice-relay server which bridges to wss://api.x.ai/v1/realtime.
 * Implements the "Buffer Microphone Input" best practice:
 *   1. Start capturing mic PCM immediately on mic access
 *   2. Buffer all frames until session.updated fires
 *   3. Flush buffer → then stream live
 *
 * Audio format: base64-encoded PCM16 at 24000Hz (xAI default).
 * VAD: server_vad (natural interruptions handled by xAI).
 * Jack voice: Rex | Julia voice: Ara
 */

type ActorId = 'jack' | 'julia';

export type XaiRealtimeState = {
  connected: boolean;
  sessionReady: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  responseText: string;
  error: string;
  transport: 'xai_realtime' | 'disconnected';
  audioElement: HTMLAudioElement | null;
};

export type XaiRealtimeActions = {
  connect: (actor?: ActorId) => void;
  disconnect: () => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
  sendText: (text: string) => void;
};

const SAMPLE_RATE = 24000;
const RELAY_PATH = '/ws/voice';

function getRelayUrl(actor: ActorId): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${RELAY_PATH}?actor=${actor}`;
}

/**
 * Convert Float32Array audio samples to base64-encoded PCM16.
 */
function float32ToPcm16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Downsample from source sample rate to target sample rate.
 */
function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, buffer.length - 1);
    const frac = srcIndex - low;
    result[i] = buffer[low] * (1 - frac) + buffer[high] * frac;
  }
  return result;
}

export function useXaiRealtimeVoice(): [XaiRealtimeState, XaiRealtimeActions] {
  const [connected, setConnected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const actorRef = useRef<ActorId>('jack');
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Create persistent audio element for lip-sync integration
  useEffect(() => {
    if (typeof window !== 'undefined' && !htmlAudioRef.current) {
      htmlAudioRef.current = new Audio();
      htmlAudioRef.current.preload = 'auto';
    }
    return () => {
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.src = '';
      }
    };
  }, []);

  /**
   * Play base64 PCM16 audio chunk through speakers.
   */
  const playAudioChunk = useCallback(async (base64Pcm: string) => {
    audioQueueRef.current.push(base64Pcm);
    if (isPlayingRef.current) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;
      try {
        const binary = atob(chunk);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 0x8000;
        }

        if (!playbackContextRef.current) {
          playbackContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
        }
        const ctx = playbackContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start(0);
        });
      } catch (err) {
        console.warn('[XaiRealtime] playback error:', err);
      }
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  /**
   * Handle incoming WebSocket events from the xAI relay.
   */
  const handleXaiEvent = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'session.created':
          console.log('[XaiRealtime] session created');
          break;

        case 'session.updated':
          console.log('[XaiRealtime] session ready — mic buffer will flush');
          setSessionReady(true);
          break;

        case 'response.audio.delta':
          // Streaming audio response from xAI
          if (data.delta) {
            playAudioChunk(data.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          // Streaming response transcript
          if (data.delta) {
            setResponseText((prev) => prev + data.delta);
          }
          break;

        case 'response.audio_transcript.done':
          // Full response transcript complete
          if (data.transcript) {
            setResponseText(data.transcript);
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User's speech transcribed
          if (data.transcript) {
            setTranscript(data.transcript);
          }
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[XaiRealtime] VAD: speech started');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[XaiRealtime] VAD: speech stopped');
          break;

        case 'response.done':
          console.log('[XaiRealtime] response complete');
          break;

        case 'error':
          console.error('[XaiRealtime] server error:', data.error);
          setError(data.error?.message || 'xai_realtime_error');
          break;

        default:
          // Forward unhandled events for debugging
          if (data.type) {
            console.log(`[XaiRealtime] event: ${data.type}`);
          }
      }
    } catch {
      // Non-JSON frame — ignore
    }
  }, [playAudioChunk]);

  /**
   * Connect to the xAI realtime relay.
   */
  const connect = useCallback((actor: ActorId = 'jack') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    actorRef.current = actor;
    setError('');
    setSessionReady(false);
    setTranscript('');
    setResponseText('');

    const url = getRelayUrl(actor);
    if (!url) {
      setError('relay_url_unavailable');
      return;
    }

    console.log(`[XaiRealtime] connecting to ${url}`);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[XaiRealtime] connected to relay');
      setConnected(true);
      setError('');
    };

    ws.onmessage = handleXaiEvent;

    ws.onerror = (err) => {
      console.error('[XaiRealtime] WebSocket error:', err);
      setError('websocket_error');
    };

    ws.onclose = (event) => {
      console.log(`[XaiRealtime] disconnected: ${event.code} ${event.reason}`);
      setConnected(false);
      setSessionReady(false);
      setIsListening(false);
      wsRef.current = null;
    };

    wsRef.current = ws;
  }, [handleXaiEvent]);

  /**
   * Disconnect from the relay.
   */
  const disconnect = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setSessionReady(false);
    setIsListening(false);
  }, []);

  /**
   * Start capturing mic audio and streaming PCM to xAI.
   * Implements the "Buffer Microphone Input" best practice:
   * capture begins immediately, but audio is buffered until session.updated fires.
   * The relay server handles the buffer-flush logic.
   */
  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('not_connected');
      return;
    }

    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: SAMPLE_RATE },
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessor for reliable PCM extraction (AudioWorklet would be better but more complex)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // Downsample if AudioContext rate differs from xAI target
        const pcmSamples = downsample(inputData, audioCtx.sampleRate, SAMPLE_RATE);
        const base64 = float32ToPcm16Base64(pcmSamples);

        // Send to relay — the relay handles buffering until session.updated
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64,
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsListening(true);
      console.log('[XaiRealtime] mic capture started | sampleRate=', audioCtx.sampleRate);
    } catch (err) {
      console.error('[XaiRealtime] mic access failed:', err);
      setError(err instanceof Error ? err.message : 'mic_access_failed');
    }
  }, []);

  /**
   * Stop mic capture.
   */
  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Tell xAI to commit the audio buffer
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit',
      }));
    }

    setIsListening(false);
  }, []);

  /**
   * Send a text message (bypassing voice).
   */
  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('not_connected');
      return;
    }

    setResponseText('');
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));

    // Request a response
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return [
    {
      connected,
      sessionReady,
      isListening,
      isSpeaking,
      transcript,
      responseText,
      error,
      transport: connected ? 'xai_realtime' : 'disconnected',
      audioElement: htmlAudioRef.current,
    },
    {
      connect,
      disconnect,
      startListening,
      stopListening,
      sendText,
    },
  ];
}
