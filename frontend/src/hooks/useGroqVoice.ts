'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStableBrowserUserId } from '../lib/browser-user-id';

/**
 * Groq Voice Hook - unified audio + speech hook for the neural surfaces.
 *
 * Truth rules:
 * - audioUnlocked only flips true after the current page has successfully resumed
 *   the shared AudioContext from a real user interaction.
 * - micPermissionGranted reflects an actual successful microphone grant.
 * - speaking state follows real playback end events, not a timer guess.
 */

const AUDIO_PREFS_KEY = 'agi1.neural.audio_prefs';
const MIC_PERMISSION_KEY = 'agi1.neural.mic_permission_granted';

type ActorId = 'jack' | 'julia';

type AudioPrefs = {
  muted: boolean;
  volume: number;
};

type SharedAudioRuntime = {
  context: AudioContext | null;
  gain: GainNode | null;
  source: AudioBufferSourceNode | null;
};

const sharedRuntime: SharedAudioRuntime = {
  context: null,
  gain: null,
  source: null,
};

function loadAudioPrefs(): AudioPrefs {
  if (typeof window === 'undefined') {
    return { muted: false, volume: 1 };
  }
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return { muted: false, volume: 1 };
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed?.muted),
      volume: typeof parsed?.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

function saveAudioPrefs(prefs: Partial<AudioPrefs>) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadAudioPrefs();
    window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {}
}

function loadMicPermissionFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MIC_PERMISSION_KEY) === '1';
}

function saveMicPermissionFlag(granted: boolean) {
  if (typeof window === 'undefined') return;
  if (granted) {
    window.localStorage.setItem(MIC_PERMISSION_KEY, '1');
  } else {
    window.localStorage.removeItem(MIC_PERMISSION_KEY);
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const ContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ContextCtor) return null;
  if (!sharedRuntime.context) {
    sharedRuntime.context = new ContextCtor();
  }
  return sharedRuntime.context;
}

function ensureGainNode(volume: number, muted: boolean): GainNode | null {
  const context = getAudioContext();
  if (!context) return null;
  if (!sharedRuntime.gain) {
    const gain = context.createGain();
    gain.connect(context.destination);
    sharedRuntime.gain = gain;
  }
  sharedRuntime.gain.gain.value = muted ? 0 : volume;
  return sharedRuntime.gain;
}

async function resumeSharedAudioContext(volume: number, muted: boolean): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  ensureGainNode(volume, muted);
  if (context.state !== 'running') {
    await context.resume();
  }

  // Use a real silent buffer instead of invalid bytes so autoplay unlock is legitimate.
  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(sharedRuntime.gain!);
  source.start(0);
  return true;
}

function stopSharedPlayback() {
  if (sharedRuntime.source) {
    try {
      sharedRuntime.source.stop();
    } catch {}
    try {
      sharedRuntime.source.disconnect();
    } catch {}
    sharedRuntime.source = null;
  }
}

function pickSpeechSynthesisVoice(actor: ActorId): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (actor === 'julia') {
    return (
      voices.find((voice) => voice.lang.startsWith('en') && /Samantha|Karen|Female|Natural/i.test(voice.name)) ||
      voices.find((voice) => voice.lang.startsWith('en')) ||
      null
    );
  }
  return (
    voices.find((voice) => voice.lang.startsWith('en') && /Daniel|Aaron|Male|Natural/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith('en')) ||
    null
  );
}

function buildMicConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export type GroqVoiceState = {
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  sttReady: boolean;
  ttsReady: boolean;
  vadReady: boolean;
  transcript: string;
  voiceError: string;
  audioUnlocked: boolean;
  audioCurrentTime: number | null;
  audioReadyState: number | null;
  audioPaused: boolean | null;
  usingSpeechSynthesisFallback: boolean;
  muted: boolean;
  volume: number;
  micPermissionGranted: boolean;
  permissionCacheHydrated: boolean;
  /** The persistent HTML <audio> element used for TTS playback.
   *  Exposed so lip-sync engine can connect an AnalyserNode to it. */
  audioElement: HTMLAudioElement | null;
};

export type GroqVoiceActions = {
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string, actor?: ActorId) => Promise<void>;
  stopSpeaking: () => void;
  sendVoiceMessage: (
    actor: ActorId,
    context?: {
      userId?: string;
      sessionId?: string;
      callSessionId?: string;
      visionSummary?: string;
      mediaState?: Record<string, unknown>;
    }
  ) => Promise<{ transcript: string; response: string; conversationId: string } | null>;
  unlockAudio: () => Promise<void>;
  warmMicrophone: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
};

export function useGroqVoice(): [GroqVoiceState, GroqVoiceActions] {
  const prefs = loadAudioPrefs();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [sttReady, setSttReady] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const [vadReady] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number | null>(null);
  const [audioReadyState, setAudioReadyState] = useState<number | null>(null);
  const [audioPaused, setAudioPaused] = useState<boolean | null>(true);
  const [usingSpeechSynthesisFallback, setUsingSpeechSynthesisFallback] = useState(false);
  const [muted, setMutedState] = useState(prefs.muted);
  const [volume, setVolumeState] = useState(prefs.volume);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [permissionCacheHydrated, setPermissionCacheHydrated] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const speechFallbackRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackStartedAtRef = useRef<number | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    clearPlaybackTimer();
    stopSharedPlayback();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current.currentTime = 0;
    }
    speechFallbackRef.current = null;
    setIsSpeaking(false);
    setAudioPaused(true);
    setUsingSpeechSynthesisFallback(false);
  }, [clearPlaybackTimer]);

  useEffect(() => {
    const context = getAudioContext();
    if (context) {
      setTtsReady(true);
      ensureGainNode(volume, muted);
      setAudioReadyState(context.state === 'running' ? 4 : 1);
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    // Create persistent HTML <audio> element for TTS playback
    if (typeof window !== 'undefined' && !htmlAudioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('play', () => {
        console.log('[GroqVoice] HTML <audio> PLAY');
        setIsSpeaking(true);
        setAudioPaused(false);
        setUsingSpeechSynthesisFallback(false);
      });
      audio.addEventListener('ended', () => {
        console.log('[GroqVoice] HTML <audio> ENDED');
        setIsSpeaking(false);
        setAudioPaused(true);
      });
      audio.addEventListener('error', (e) => {
        console.warn('[GroqVoice] HTML <audio> ERROR:', e);
        setIsSpeaking(false);
        setAudioPaused(true);
      });
      htmlAudioRef.current = audio;
    }
    return () => {
      clearPlaybackTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.src = '';
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      stopSpeaking();
    };
  }, [clearPlaybackTimer, muted, stopSpeaking, volume]);

  useEffect(() => {
    ensureGainNode(volume, muted);
    saveAudioPrefs({ muted, volume });
  }, [muted, volume]);

  const warmMicrophone = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError('mic_api_unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildMicConstraints());
      stream.getTracks().forEach((track) => track.stop());
      saveMicPermissionFlag(true);
      setMicPermissionGranted(true);
      setSttReady(true);
      setVoiceError('');
    } catch (error) {
      saveMicPermissionFlag(false);
      setMicPermissionGranted(false);
      setSttReady(false);
      if (error instanceof Error) {
        setVoiceError(error.message);
      }
    }
  }, []);

  useEffect(() => {
    const cachedMicPermission = loadMicPermissionFlag();
    setMicPermissionGranted(cachedMicPermission);
    setPermissionCacheHydrated(true);
    if (cachedMicPermission) {
      void warmMicrophone();
    }
  }, [warmMicrophone]);

  const unlockAudio = useCallback(async () => {
    setVoiceError('');
    try {
      const unlocked = await resumeSharedAudioContext(volume, muted);
      setAudioUnlocked(unlocked);
      setAudioPaused(!unlocked);
      setAudioReadyState(unlocked ? 4 : 1);
      // Prime HTML <audio> element in user gesture context
      if (htmlAudioRef.current) {
        htmlAudioRef.current.volume = 0;
        htmlAudioRef.current.play().catch(() => {});
        htmlAudioRef.current.pause();
        htmlAudioRef.current.volume = muted ? 0 : volume;
      }
    } catch (error) {
      setAudioUnlocked(false);
      setAudioPaused(true);
      setVoiceError(error instanceof Error ? error.message : 'audio_unlock_failed');
    }
  }, [muted, volume]);

  const setMuted = useCallback((nextMuted: boolean) => {
    setMutedState(nextMuted);
    ensureGainNode(volume, nextMuted);
    if (nextMuted) {
      stopSpeaking();
    }
  }, [stopSpeaking, volume]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
    ensureGainNode(clamped, muted);
  }, [muted]);

  const startListening = useCallback(async () => {
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildMicConstraints());
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      saveMicPermissionFlag(true);
      setMicPermissionGranted(true);
      setIsListening(true);
      setSttReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mic_access_failed';
      saveMicPermissionFlag(false);
      setMicPermissionGranted(false);
      setVoiceError(message);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  const playDecodedBuffer = useCallback(async (audioData: ArrayBuffer) => {
    const context = getAudioContext();
    const gain = ensureGainNode(volume, muted);
    if (!context || !gain) {
      throw new Error('audio_context_unavailable');
    }
    await resumeSharedAudioContext(volume, muted);

    const decoded = await context.decodeAudioData(audioData.slice(0));
    stopSharedPlayback();
    clearPlaybackTimer();

    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(gain);
    sharedRuntime.source = source;

    setUsingSpeechSynthesisFallback(false);
    setIsSpeaking(true);
    setAudioPaused(false);
    setAudioCurrentTime(0);
    setAudioReadyState(4);
    playbackStartedAtRef.current = context.currentTime;

    playbackTimerRef.current = window.setInterval(() => {
      if (!playbackStartedAtRef.current) return;
      const elapsed = Math.max(0, context.currentTime - playbackStartedAtRef.current);
      setAudioCurrentTime(Math.min(decoded.duration, elapsed));
    }, 100);

    source.onended = () => {
      clearPlaybackTimer();
      if (sharedRuntime.source === source) {
        sharedRuntime.source = null;
      }
      setIsSpeaking(false);
      setAudioPaused(true);
      setAudioCurrentTime(decoded.duration);
    };

    source.start(0);
  }, [clearPlaybackTimer, muted, volume]);

  const speak = useCallback(async (text: string, actor: ActorId = 'jack') => {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (muted) {
      setAudioPaused(true);
      return;
    }

    setVoiceError('');
    console.log('[GroqVoice] speak() called:', cleaned.slice(0, 50));

    // ── PRIMARY: Fetch server TTS → play via HTML <audio> element ──
    // HTML <audio> with blob URL is the MOST RELIABLE cross-browser playback.
    // It works even outside user gesture context (after any prior page interaction).
    // Groq Orpheus TTS is now live and returns real WAV audio.
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned, actor }),
      });

      if (!response.ok) {
        throw new Error(`tts_failed:${response.status}`);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size < 100) {
        throw new Error('tts_empty_audio');
      }

      console.log('[GroqVoice] Server TTS OK, audio size:', audioBlob.size);

      // Revoke old blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }

      const blobUrl = URL.createObjectURL(audioBlob);
      blobUrlRef.current = blobUrl;

      const audio = htmlAudioRef.current;
      if (audio) {
        audio.src = blobUrl;
        audio.volume = Math.max(volume, 0.3);
        audio.currentTime = 0;
        await audio.play();
        console.log('[GroqVoice] HTML <audio> playing server TTS');
        return; // Success — server TTS is playing
      }
    } catch (error) {
      console.warn('[GroqVoice] Server TTS failed:', error instanceof Error ? error.message : error);
    }

    // ── FALLBACK: Browser SpeechSynthesis ──
    // Used only if server TTS fails. Works after any page interaction.
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.volume = Math.max(volume, 0.5);
        utterance.rate = 1.0;
        utterance.pitch = actor === 'julia' ? 1.06 : 0.96;
        const voice = pickSpeechSynthesisVoice(actor);
        if (voice) utterance.voice = voice;
        utterance.onstart = () => {
          console.log('[GroqVoice] SpeechSynthesis fallback STARTED');
          setUsingSpeechSynthesisFallback(true);
          setIsSpeaking(true);
          setAudioPaused(false);
        };
        utterance.onend = () => {
          console.log('[GroqVoice] SpeechSynthesis fallback ENDED');
          setIsSpeaking(false);
          setAudioPaused(true);
          setUsingSpeechSynthesisFallback(false);
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          setAudioPaused(true);
          setUsingSpeechSynthesisFallback(false);
        };
        speechFallbackRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        console.log('[GroqVoice] SpeechSynthesis fallback fired');
      } catch (e) {
        console.warn('[GroqVoice] SpeechSynthesis fallback threw:', e);
        setVoiceError('audio_playback_failed');
      }
    }
  }, [muted, volume]);

  const sendVoiceMessage = useCallback(async (
    actor: ActorId,
    context?: {
      userId?: string;
      sessionId?: string;
      callSessionId?: string;
      visionSummary?: string;
      mediaState?: Record<string, unknown>;
    }
  ): Promise<{ transcript: string; response: string; conversationId: string } | null> => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    if (chunksRef.current.length === 0) {
      return null;
    }

    setIsThinking(true);
    setIsListening(false);

    try {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('actor', actor);
      formData.append('user_id', context?.userId || getStableBrowserUserId());
      if (context?.sessionId) {
        formData.append('session_id', context.sessionId);
        formData.append('conversation_id', context.sessionId);
      }
      if (context?.callSessionId) {
        formData.append('call_session_id', context.callSessionId);
      }
      if (context?.visionSummary) {
        formData.append('vision_summary', context.visionSummary);
      }
      if (context?.mediaState) {
        formData.append('media_state', JSON.stringify(context.mediaState));
      }

      const response = await fetch('/api/voice/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`voice_api_error:${response.status}`);
      }

      const result = await response.json();
      const nextTranscript = result.transcript || '';
      const nextResponse = result.response || '';
      const nextConversationId = result.conversationId || result.sessionId || context?.sessionId || '';
      setTranscript(nextTranscript);
      setIsThinking(false);
      return {
        transcript: nextTranscript,
        response: nextResponse,
        conversationId: nextConversationId,
      };
    } catch (error) {
      setIsThinking(false);
      const message = error instanceof Error ? error.message : 'voice_processing_failed';
      setVoiceError(message);
      return null;
    } finally {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, []);

  return [
    {
      isListening,
      isSpeaking,
      isThinking,
      sttReady,
      ttsReady,
      vadReady,
      transcript,
      voiceError,
      audioUnlocked,
      audioCurrentTime,
      audioReadyState,
      audioPaused,
      usingSpeechSynthesisFallback,
      muted,
      volume,
      micPermissionGranted,
      permissionCacheHydrated,
      audioElement: htmlAudioRef.current,
    },
    {
      startListening,
      stopListening,
      speak,
      stopSpeaking,
      sendVoiceMessage,
      unlockAudio,
      warmMicrophone,
      setMuted,
      setVolume,
    },
  ];
}
