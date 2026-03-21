'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Neural Video Hook — 2D Neural Lip-Sync Bridge
 *
 * This hook manages the pipeline for audio-driven lip-sync on a reference video.
 *
 * Architecture:
 * 1. Audio buffer from TTS → sent to lip-sync provider
 * 2. Provider returns video frames with synchronized lip movement
 * 3. Frames rendered to canvas overlaid on the avatar stage
 *
 * Current status: STAGED (provider not yet connected)
 * Planned providers: Wav2Lip (self-hosted), SyncLabs API, Simli API
 *
 * When no provider is available, falls back to video-swap mode
 * (idle video ↔ speaking video based on audio playback state).
 */

export type LipSyncProvider = 'none' | 'wav2lip' | 'synclabs' | 'simli' | 'audio2face';

export type NeuralVideoState = {
  provider: LipSyncProvider;
  isProcessing: boolean;
  isReady: boolean;
  latencyMs: number;
  error: string;
  framesProcessed: number;
};

export type NeuralVideoActions = {
  initProvider: (provider: LipSyncProvider, config?: Record<string, string>) => Promise<boolean>;
  processAudioChunk: (audioData: ArrayBuffer, mimeType?: string) => Promise<void>;
  getOutputCanvas: () => HTMLCanvasElement | null;
  reset: () => void;
};

export function useNeuralVideo(): [NeuralVideoState, NeuralVideoActions] {
  const [provider, setProvider] = useState<LipSyncProvider>('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [error, setError] = useState('');
  const [framesProcessed, setFramesProcessed] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const configRef = useRef<Record<string, string>>({});

  const getOutputCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 512;
      canvasRef.current.height = 512;
    }
    return canvasRef.current;
  }, []);

  /**
   * Initialize a lip-sync provider.
   * Each provider has a different connection method:
   * - wav2lip: WebSocket to self-hosted inference server
   * - synclabs: REST API with API key
   * - simli: WebSocket stream
   * - audio2face: gRPC to NVIDIA ACE (via WebSocket bridge)
   */
  const initProvider = useCallback(async (
    newProvider: LipSyncProvider,
    config?: Record<string, string>,
  ): Promise<boolean> => {
    setError('');

    if (newProvider === 'none') {
      setProvider('none');
      setIsReady(false);
      return true;
    }

    configRef.current = config || {};

    try {
      switch (newProvider) {
        case 'wav2lip': {
          // Connect to self-hosted Wav2Lip WebSocket server
          const wsUrl = config?.wsUrl || 'ws://localhost:8765/wav2lip';
          const ws = new WebSocket(wsUrl);

          await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error('wav2lip_ws_connect_failed'));
            setTimeout(() => reject(new Error('wav2lip_ws_timeout')), 5000);
          });

          wsRef.current = ws;
          ws.onmessage = handleWsMessage;
          setProvider('wav2lip');
          setIsReady(true);
          return true;
        }

        case 'synclabs': {
          // Verify SyncLabs API key
          const apiKey = config?.apiKey || '';
          if (!apiKey) {
            throw new Error('synclabs_api_key_required');
          }
          // SyncLabs uses REST, no persistent connection needed
          setProvider('synclabs');
          setIsReady(true);
          return true;
        }

        case 'simli': {
          // Connect to Simli WebSocket
          const wsUrl = config?.wsUrl || 'wss://api.simli.ai/stream';
          const ws = new WebSocket(wsUrl);

          await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error('simli_ws_connect_failed'));
            setTimeout(() => reject(new Error('simli_ws_timeout')), 5000);
          });

          wsRef.current = ws;
          ws.onmessage = handleWsMessage;
          setProvider('simli');
          setIsReady(true);
          return true;
        }

        case 'audio2face': {
          // NVIDIA ACE Audio2Face via gRPC bridge
          const bridgeUrl = config?.bridgeUrl || 'ws://localhost:9090/audio2face';
          const ws = new WebSocket(bridgeUrl);

          await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error('audio2face_bridge_connect_failed'));
            setTimeout(() => reject(new Error('audio2face_bridge_timeout')), 5000);
          });

          wsRef.current = ws;
          ws.onmessage = handleWsMessage;
          setProvider('audio2face');
          setIsReady(true);
          return true;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'provider_init_failed';
      setError(msg);
      setProvider('none');
      setIsReady(false);
      return false;
    }

    return false;
  }, []);

  /**
   * Handle incoming video frames from WebSocket providers.
   * Frames arrive as binary blobs (JPEG/PNG) that we render to canvas.
   */
  const handleWsMessage = useCallback((event: MessageEvent) => {
    const start = performance.now();

    if (event.data instanceof Blob) {
      const canvas = getOutputCanvas();
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      const url = URL.createObjectURL(event.data);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        setFramesProcessed((c) => c + 1);
        setLatencyMs(Math.round(performance.now() - start));
      };
      img.src = url;
    }
  }, [getOutputCanvas]);

  /**
   * Send an audio chunk to the lip-sync provider for processing.
   */
  const processAudioChunk = useCallback(async (
    audioData: ArrayBuffer,
    mimeType = 'audio/wav',
  ): Promise<void> => {
    if (!isReady || provider === 'none') return;

    setIsProcessing(true);

    try {
      if (provider === 'synclabs') {
        // SyncLabs uses REST API
        const apiKey = configRef.current.apiKey || '';
        const response = await fetch('https://api.synclabs.so/v2/generate', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio: btoa(Array.from(new Uint8Array(audioData), (b) => String.fromCharCode(b)).join('')),
            audio_format: mimeType,
            video_url: configRef.current.referenceVideoUrl || '',
          }),
        });

        if (!response.ok) {
          throw new Error(`synclabs_error:${response.status}`);
        }
        // SyncLabs returns async — poll for result
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        // WebSocket providers: send raw audio binary
        wsRef.current.send(audioData);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'audio_process_failed';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [isReady, provider]);

  const reset = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setProvider('none');
    setIsReady(false);
    setIsProcessing(false);
    setError('');
    setFramesProcessed(0);
    setLatencyMs(0);
  }, []);

  return [
    { provider, isProcessing, isReady, latencyMs, error, framesProcessed },
    { initProvider, processAudioChunk, getOutputCanvas, reset },
  ];
}
