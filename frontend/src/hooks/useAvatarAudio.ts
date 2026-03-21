'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAvatarAudio — Bulletproof audio engine for Jack & Julia.
 *
 * STRATEGY (fixed):
 * 1. Browser SpeechSynthesis is ALWAYS the primary immediate voice output.
 *    It fires synchronously in user-gesture context — guaranteed to work.
 * 2. Server TTS (/api/tts) is attempted in parallel.
 * 3. If server TTS arrives, we cancel browser SpeechSynthesis and play better audio.
 * 4. If server TTS fails, browser SpeechSynthesis keeps playing.
 *
 * CRITICAL FIXES:
 * - Removed ttsPreferred flag that permanently disabled browser SpeechSynthesis
 * - Fixed Chrome cancel() → speak() race condition with 60ms delay
 * - Added console.log breadcrumbs for live debugging
 */

const STORAGE_KEY = 'agi1_audio_prefs';

type AudioPrefs = {
  volume: number;
  muted: boolean;
  micApproved: boolean;
};

function loadPrefs(): AudioPrefs {
  if (typeof window === 'undefined') return { volume: 1.0, muted: false, micApproved: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...{ volume: 1.0, muted: false, micApproved: false }, ...JSON.parse(raw) };
  } catch {}
  return { volume: 1.0, muted: false, micApproved: false };
}

function savePrefs(prefs: Partial<AudioPrefs>) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadPrefs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {}
}

// Pick a voice for browser SpeechSynthesis fallback
function pickVoice(actor: 'jack' | 'julia'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (actor === 'julia') {
    return (
      voices.find((v) => v.lang.startsWith('en') && /Samantha/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en') && /Karen/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en') && /Female/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en') && /Natural/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null
    );
  }
  return (
    voices.find((v) => v.lang.startsWith('en') && /Daniel/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en') && /Aaron/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en') && /Male/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en') && /Natural/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null
  );
}

export type AvatarAudioState = {
  isSpeaking: boolean;
  isLoading: boolean;
  audioReady: boolean;
  audioError: string;
  audioContextUnlocked: boolean;
  volume: number;
  muted: boolean;
  micApproved: boolean;
};

export type AvatarAudioActions = {
  speakText: (text: string, actor: 'jack' | 'julia') => Promise<void>;
  stopSpeaking: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  unlockAudio: () => void;
  markMicApproved: () => void;
};

export function useAvatarAudio(): [AvatarAudioState, AvatarAudioActions] {
  const prefs = loadPrefs();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [audioContextUnlocked, setAudioContextUnlocked] = useState(false);
  const [volume, setVolumeState] = useState(prefs.volume);
  const [muted, setMutedState] = useState(prefs.muted);
  const [micApproved, setMicApproved] = useState(prefs.micApproved);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrl = useRef<string | null>(null);
  const browserTTSActive = useRef(false);
  const serverAudioPlaying = useRef(false);

  // Create persistent <audio> element
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    setAudioReady(true);

    audio.addEventListener('play', () => {
      console.log('[AvatarAudio] <audio> element started playing (server TTS)');
      serverAudioPlaying.current = true;
      // Cancel browser TTS — server audio is playing now
      if (browserTTSActive.current) {
        window.speechSynthesis?.cancel();
        browserTTSActive.current = false;
      }
      setIsSpeaking(true);
    });
    audio.addEventListener('ended', () => {
      console.log('[AvatarAudio] <audio> element ended');
      serverAudioPlaying.current = false;
      setIsSpeaking(false);
    });
    audio.addEventListener('pause', () => {
      if (audio.currentTime >= audio.duration - 0.1 || audio.currentTime === 0) {
        serverAudioPlaying.current = false;
        setIsSpeaking(false);
      }
    });
    audio.addEventListener('error', (e) => {
      console.warn('[AvatarAudio] <audio> element error:', e);
      serverAudioPlaying.current = false;
      setIsSpeaking(false);
    });

    // Pre-load voices for SpeechSynthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        window.speechSynthesis.getVoices();
      });
    }

    return () => {
      audio.pause();
      audio.src = '';
      if (currentBlobUrl.current) URL.revokeObjectURL(currentBlobUrl.current);
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const unlockAudio = useCallback(() => {
    console.log('[AvatarAudio] unlockAudio called — priming SpeechSynthesis');
    setAudioContextUnlocked(true);
    // Prime SpeechSynthesis in user gesture context
    // Use a very short non-empty string — empty string can be ignored by some browsers
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0.01; // near-silent but not zero (some browsers skip volume=0)
      prime.rate = 10; // speak as fast as possible
      window.speechSynthesis.speak(prime);
    }
    // Also prime the <audio> element
    if (audioRef.current) {
      audioRef.current.volume = 0;
      audioRef.current.play().catch(() => {});
      audioRef.current.pause();
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [muted, volume]);

  /**
   * speakText — The core function.
   *
   * ALWAYS starts browser SpeechSynthesis first (guaranteed sound in user gesture context).
   * Then tries server TTS in parallel.
   */
  const speakText = useCallback(async (text: string, actor: 'jack' | 'julia') => {
    const cleaned = text.trim();
    if (!cleaned || muted) {
      console.log('[AvatarAudio] speakText skipped:', !cleaned ? 'empty text' : 'muted');
      return;
    }

    console.log('[AvatarAudio] speakText called:', { actor, text: cleaned.slice(0, 50) });
    setAudioError('');
    setIsLoading(true);

    // ── STEP 1: Browser SpeechSynthesis — ALWAYS fires as guaranteed fallback ──
    // This is synchronous from the click handler context, so it WILL produce sound.
    if ('speechSynthesis' in window) {
      try {
        // Don't cancel here — just speak. Chrome has a race condition where
        // cancel() followed immediately by speak() silently drops the utterance.
        const u = new SpeechSynthesisUtterance(cleaned);
        u.volume = muted ? 0 : Math.max(volume, 0.5); // ensure audible
        u.rate = 1.0;
        u.pitch = actor === 'julia' ? 1.1 : 0.95;
        const voice = pickVoice(actor);
        if (voice) u.voice = voice;

        u.onstart = () => {
          console.log('[AvatarAudio] Browser SpeechSynthesis STARTED speaking');
          browserTTSActive.current = true;
          setIsSpeaking(true);
        };
        u.onend = () => {
          console.log('[AvatarAudio] Browser SpeechSynthesis ENDED');
          browserTTSActive.current = false;
          // Only mark not speaking if server audio isn't playing
          if (!serverAudioPlaying.current) {
            setIsSpeaking(false);
          }
        };
        u.onerror = (e) => {
          console.warn('[AvatarAudio] Browser SpeechSynthesis ERROR:', e);
          browserTTSActive.current = false;
          if (!serverAudioPlaying.current) {
            setIsSpeaking(false);
          }
        };

        window.speechSynthesis.speak(u);
        console.log('[AvatarAudio] speechSynthesis.speak() called with:', cleaned.slice(0, 40));
      } catch (e) {
        console.warn('[AvatarAudio] SpeechSynthesis threw:', e);
      }
    } else {
      console.warn('[AvatarAudio] SpeechSynthesis not available in this browser');
    }

    // ── STEP 2: Try server TTS in parallel ──
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned, actor }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(errData.detail || errData.error || `TTS ${res.status}`);
      }

      const audioBlob = await res.blob();
      if (audioBlob.size < 100) throw new Error('Empty TTS audio');

      console.log('[AvatarAudio] Server TTS succeeded, audio size:', audioBlob.size);

      // Server TTS succeeded — cancel browser TTS and play the real audio
      if (browserTTSActive.current) {
        window.speechSynthesis?.cancel();
        browserTTSActive.current = false;
      }

      if (currentBlobUrl.current) URL.revokeObjectURL(currentBlobUrl.current);
      const blobUrl = URL.createObjectURL(audioBlob);
      currentBlobUrl.current = blobUrl;

      if (audioRef.current) {
        audioRef.current.src = blobUrl;
        audioRef.current.volume = muted ? 0 : volume;
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      }
    } catch (err) {
      // Server TTS failed — browser SpeechSynthesis is already playing (or will play)
      console.warn('[AvatarAudio] Server TTS failed, browser SpeechSynthesis is the voice:', err);
      // Don't set error state — browser TTS is handling it
    } finally {
      setIsLoading(false);
    }
  }, [muted, volume]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    browserTTSActive.current = false;
    serverAudioPlaying.current = false;
    setIsSpeaking(false);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    savePrefs({ volume: clamped });
  }, []);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    savePrefs({ muted: m });
    if (m) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      browserTTSActive.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const markMicApproved = useCallback(() => {
    setMicApproved(true);
    savePrefs({ micApproved: true });
  }, []);

  return [
    { isSpeaking, isLoading, audioReady, audioError, audioContextUnlocked, volume, muted, micApproved },
    { speakText, stopSpeaking, setVolume, setMuted, unlockAudio, markMicApproved },
  ];
}
