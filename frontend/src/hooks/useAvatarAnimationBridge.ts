'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarPresence } from './useAvatarRuntime';

/**
 * Avatar Animation Bridge
 * Connects audio output to avatar animation state.
 *
 * Current: Switches between idle/speaking video based on audio playback.
 * Future: Drives Audio2Face blendshapes via NVIDIA ACE, or neural lip-sync
 *         via Wav2Lip/SyncLabs/Simli.
 *
 * The bridge monitors:
 * 1. HTML <audio> element playback state → speaking/idle
 * 2. Audio analyser node amplitude → mouth openness (for future use)
 * 3. MediaRecorder state → listening
 */

export type AnimationBridgeState = {
  mouthOpenness: number;      // 0.0-1.0, from audio amplitude
  isAudioPlaying: boolean;
  blendshapes: Record<string, number>;  // future: ARKit blendshape values
  animationFps: number;
};

export type AnimationBridgeActions = {
  connectAudioElement: (el: HTMLAudioElement) => void;
  disconnectAudio: () => void;
  setManualPresence: (p: AvatarPresence) => void;
};

export function useAvatarAnimationBridge(
  onPresenceChange: (p: AvatarPresence) => void,
): [AnimationBridgeState, AnimationBridgeActions] {
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [animationFps, setAnimationFps] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  const analyzeFrame = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    // Calculate RMS amplitude
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    const openness = Math.min(1, rms * 4); // Scale to 0-1

    setMouthOpenness(openness);

    // FPS counter
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setAnimationFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    rafRef.current = requestAnimationFrame(analyzeFrame);
  }, []);

  const connectAudioElement = useCallback((el: HTMLAudioElement) => {
    // Avoid double-connecting
    if (connectedElementRef.current === el) return;

    // Cleanup previous
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
    }

    connectedElementRef.current = el;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      sourceRef.current = source;
      analyserRef.current = analyser;

      // Start animation loop
      rafRef.current = requestAnimationFrame(analyzeFrame);
    } catch {
      // MediaElementSource can only be created once per element
      // Fall back to event-based detection
    }

    // Event-based speaking detection (always works)
    const handlePlay = () => {
      setIsAudioPlaying(true);
      onPresenceChange('speaking');
    };
    const handlePause = () => {
      setIsAudioPlaying(false);
      onPresenceChange('idle');
      setMouthOpenness(0);
    };
    const handleEnded = () => {
      setIsAudioPlaying(false);
      onPresenceChange('idle');
      setMouthOpenness(0);
    };

    el.addEventListener('play', handlePlay);
    el.addEventListener('pause', handlePause);
    el.addEventListener('ended', handleEnded);

    // Return cleanup (stored for disconnect)
    (el as any).__agi_cleanup = () => {
      el.removeEventListener('play', handlePlay);
      el.removeEventListener('pause', handlePause);
      el.removeEventListener('ended', handleEnded);
    };
  }, [analyzeFrame, onPresenceChange]);

  const disconnectAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const el = connectedElementRef.current;
    if (el && (el as any).__agi_cleanup) {
      (el as any).__agi_cleanup();
    }
    connectedElementRef.current = null;
    setMouthOpenness(0);
    setIsAudioPlaying(false);
  }, []);

  const setManualPresence = useCallback((p: AvatarPresence) => {
    onPresenceChange(p);
  }, [onPresenceChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      disconnectAudio();
    };
  }, [disconnectAudio]);

  return [
    {
      mouthOpenness,
      isAudioPlaying,
      blendshapes: {
        jawOpen: mouthOpenness,
        mouthSmile: mouthOpenness * 0.3,
        // Future: full ARKit 52 blendshape set from Audio2Face
      },
      animationFps,
    },
    {
      connectAudioElement,
      disconnectAudio,
      setManualPresence,
    },
  ];
}
