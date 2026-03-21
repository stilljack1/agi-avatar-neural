'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  Eye,
  Mic,
  MicOff,
  Monitor,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import assetManifest from '../../../asset-manifest.json';
import { useVisionCapture } from '../../hooks/useVisionCapture';
import { useGroqVoice } from '../../hooks/useGroqVoice';
import { useRealtimeLipSync } from '../../hooks/useRealtimeLipSync';
import { useLiveKitRoom } from '../../hooks/useLiveKitRoom';
import { getStableBrowserUserId, persistBrowserUserId } from '../../lib/browser-user-id';

type ActorId = 'jack' | 'julia';

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  actor?: ActorId;
};

type RuntimeTruth = {
  avatar_render_live: boolean;
  lip_sync_live: boolean;
  lip_sync_provider?: string;
  lip_sync_realtime_capable?: boolean;
  lip_sync_async_available?: boolean;
  lip_sync_client_integrated?: boolean;
  render_mode?: string;
  voice_output_live: boolean;
  voice_input_live: boolean;
  vision_live: boolean;
  memory_live: boolean;
  llm_live: boolean;
  tts_provider?: string;
  stt_provider?: string;
  vision_provider?: string;
  llm_provider?: string;
  voice_transport?: string;
  full_duplex_live?: boolean;
  personaplex_live?: boolean;
  blockers?: string[];
};

const AVATAR_CONFIG = {
  jack: {
    name: 'Jack',
    title: 'Strategic partner',
    accent: '#00AEEF',
    gradient: 'linear-gradient(135deg, #00AEEF 0%, #0077B6 100%)',
    greeting: "Hey. I'm here. What are we working on?",
  },
  julia: {
    name: 'Julia',
    title: 'Warm operator',
    accent: '#FF6A00',
    gradient: 'linear-gradient(135deg, #FF6A00 0%, #E05500 100%)',
    greeting: "Hi. I'm with you. What's on your mind?",
  },
} as const;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeRuntimeTruth(data: any): RuntimeTruth | null {
  if (!data || typeof data !== 'object') return null;

  if (data.truth && typeof data.truth === 'object') {
    return {
      ...data.truth,
      voice_transport: data.voice_transport,
      full_duplex_live: data.full_duplex_live,
      personaplex_live: data.personaplex_live,
      blockers: Array.isArray(data.blockers) ? data.blockers : [],
    } as RuntimeTruth;
  }

  return {
    avatar_render_live: true,
    lip_sync_live: Boolean(data.audio2face_live),
    lip_sync_provider: data.audio2face_live ? 'audio2face' : 'video_swap',
    render_mode: data.audio2face_live ? 'audio2face' : 'video_swap',
    voice_output_live: data.voice_transport === 'livekit',
    voice_input_live: data.voice_transport === 'livekit',
    vision_live: Boolean(data.semantic_vision_live ?? data.vision_frame_ingest_live),
    memory_live: true,
    llm_live: true,
    tts_provider: data.voice_transport || undefined,
    stt_provider: data.voice_transport || undefined,
    vision_provider: data.semantic_vision_provider || undefined,
    llm_provider: data.voice_engine_target || undefined,
    voice_transport: data.voice_transport || undefined,
    full_duplex_live: Boolean(data.full_duplex_live),
    personaplex_live: Boolean(data.personaplex_live),
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
  };
}

// ============================================================
// Avatar Stage — REAL-TIME LIP-SYNC DIGITAL HUMAN
// Canvas-based mesh warp driven by TTS audio analysis
// ============================================================

function AvatarStage({
  actor,
  accent,
  presenceState,
  isSpeaking,
  isListening,
  audioLevel,
  avatarMedia,
  lipSyncCanvas,
  lipSyncActive,
  lipSyncFps,
}: {
  actor: ActorId;
  accent: string;
  presenceState: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
  avatarMedia: { idle: string; speaking: string; poster: string };
  lipSyncCanvas: HTMLCanvasElement | null;
  lipSyncActive: boolean;
  lipSyncFps: number;
}) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);

  // Mount the lip-sync canvas into the DOM
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !lipSyncCanvas) return;

    // Style the canvas
    lipSyncCanvas.style.width = '100%';
    lipSyncCanvas.style.height = '100%';
    lipSyncCanvas.style.objectFit = 'cover';
    lipSyncCanvas.style.position = 'absolute';
    lipSyncCanvas.style.inset = '0';

    // Mount if not already child
    if (!container.contains(lipSyncCanvas)) {
      container.appendChild(lipSyncCanvas);
    }

    return () => {
      if (container.contains(lipSyncCanvas)) {
        container.removeChild(lipSyncCanvas);
      }
    };
  }, [lipSyncCanvas]);

  // Show canvas (lip-sync) when active, fallback to video when not
  const showCanvas = lipSyncActive || lipSyncCanvas !== null;

  return (
    <div style={{
      position: 'relative',
      borderRadius: 24,
      overflow: 'hidden',
      background: '#0B0E14',
      border: `1px solid ${presenceState === 'speaking' ? `${accent}66` : 'rgba(255,255,255,0.06)'}`,
      boxShadow: presenceState === 'speaking'
        ? `0 0 40px ${accent}26, inset 0 0 40px rgba(255,255,255,0.02)`
        : 'inset 0 0 30px rgba(255,255,255,0.02)',
      transition: 'border-color 0.4s, box-shadow 0.4s',
      aspectRatio: '16 / 9',
      maxHeight: 430,
    }}>
      {/* Fallback idle video — only visible when canvas is not active */}
      <video
        ref={idleVideoRef}
        key={`idle-${actor}`}
        poster={avatarMedia.poster}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: showCanvas ? 0 : 1,
          transition: 'opacity 0.5s ease',
          zIndex: 1,
        }}
        autoPlay muted loop playsInline
      >
        <source src={avatarMedia.idle} type="video/mp4" />
      </video>

      {/* REAL-TIME LIP-SYNC CANVAS — The living digital human */}
      <div
        ref={canvasContainerRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          opacity: showCanvas ? 1 : 0,
          transition: 'opacity 0.5s ease',
          zIndex: 2,
        }}
      />

      {/* Render mode badge */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 999,
        background: 'rgba(5,6,8,0.72)', backdropFilter: 'blur(14px)',
        border: `1px solid ${lipSyncActive ? `${accent}40` : 'rgba(255,255,255,0.08)'}`,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: lipSyncActive ? '#a855f7' : showCanvas ? '#22c55e' : '#64748b',
          boxShadow: lipSyncActive ? '0 0 8px #a855f780' : 'none',
          animation: lipSyncActive ? 'pulse-dot 1.4s infinite' : 'none',
        }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#F5F7FB', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {lipSyncActive ? `NEURAL LIP-SYNC ${lipSyncFps}fps` : showCanvas ? 'DIGITAL HUMAN' : 'VIDEO'}
        </span>
      </div>

      {/* Audio-reactive border glow */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 4,
        borderRadius: 24,
        boxShadow: isSpeaking
          ? `inset 0 0 ${30 + audioLevel * 40}px ${accent}${Math.round(audioLevel * 40).toString(16).padStart(2, '0')}`
          : isListening
            ? `inset 0 0 20px #ef444430`
            : 'none',
        transition: 'box-shadow 0.1s',
        pointerEvents: 'none',
      }} />

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 5,
        background: 'linear-gradient(180deg, rgba(5,6,8,0.15) 0%, rgba(5,6,8,0) 30%, rgba(5,6,8,0.2) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Audio waveform bar at bottom when speaking */}
      {(isSpeaking || isListening) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, zIndex: 6,
        }}>
          <div style={{
            height: '100%',
            background: isSpeaking ? accent : '#ef4444',
            width: `${Math.max(5, audioLevel * 100)}%`,
            transition: 'width 0.05s',
            borderRadius: 999,
            boxShadow: `0 0 12px ${isSpeaking ? accent : '#ef4444'}80`,
          }} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function NeuralPage() {
  const [actor, setActor] = useState<ActorId>('jack');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [runtimeTruth, setRuntimeTruth] = useState<RuntimeTruth | null>(null);

  // Voice mode: 'idle' | 'recording' | 'processing'
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'processing'>('idle');

  const [vision, visionActions] = useVisionCapture();
  const [groq, groqActions] = useGroqVoice();
  const [lipSyncState, lipSyncActions] = useRealtimeLipSync();
  const [liveRoom, liveRoomActions] = useLiveKitRoom();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const lastRoomStatusRef = useRef<string>('disconnected');

  const userId = persistBrowserUserId(getStableBrowserUserId());
  const cfg = AVATAR_CONFIG[actor];

  const visualPipelineReady = vision.visionState === 'camera_live' || vision.visionState === 'analyzing';
  const liveCallActive = liveRoom.roomStatus === 'connected' || liveRoom.roomStatus === 'reconnecting';

  const presenceState = groq.isSpeaking || liveRoom.isAgentSpeaking
    ? 'speaking'
    : groq.isThinking || isTyping || voiceMode === 'processing'
      ? 'thinking'
      : groq.isListening || voiceMode === 'recording' || liveCallActive
        ? 'listening'
        : 'idle';

  const avatarMedia = useMemo(() => ({
    idle: actor === 'jack' ? assetManifest.jack.idleVideo : assetManifest.julia.idleVideo,
    speaking: actor === 'jack' ? assetManifest.jack.speakingVideo : assetManifest.julia.speakingVideo,
    poster: actor === 'jack' ? assetManifest.jack.image : assetManifest.julia.image,
  }), [actor]);

  // Load portrait into lip-sync engine when actor changes
  useEffect(() => {
    const portraitSrc = actor === 'jack'
      ? '/avatars/jack-portrait.png'
      : '/avatars/julia-portrait.png';
    lipSyncActions.setPortraitSrc(portraitSrc);
    // Also get the canvas ready
    lipSyncActions.getCanvas();
  }, [actor, lipSyncActions]);

  const appendMessage = useCallback((role: Message['role'], text: string, messageActor?: ActorId) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role, text, timestamp: Date.now(), actor: role === 'assistant' ? (messageActor || actor) : undefined },
    ]);
  }, [actor]);

  // Drive the digital-human stage from whichever audio path is actually live:
  // local TTS playback for text/push-to-talk, or the remote LiveKit track for
  // full-duplex sessions.
  useEffect(() => {
    const activeAudioElement =
      liveRoom.isAgentSpeaking && liveRoom.remoteAudioElement
        ? liveRoom.remoteAudioElement
        : groq.isSpeaking && groq.audioElement
          ? groq.audioElement
          : null;

    if (activeAudioElement) {
      lipSyncActions.startLipSync(activeAudioElement);
    } else if (!groq.isSpeaking) {
      lipSyncActions.stopLipSync();
    }
  }, [
    groq.isSpeaking,
    groq.audioElement,
    lipSyncActions,
    liveRoom.isAgentSpeaking,
    liveRoom.remoteAudioElement,
  ]);

  // Audio level: mic input
  useEffect(() => {
    if (voiceMode !== 'recording' || !micStreamRef.current) {
      if (voiceMode !== 'recording' && !groq.isSpeaking) setAudioLevel(0);
      return;
    }
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(micStreamRef.current);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf: number;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(1, avg / 128));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); void audioCtx.close(); };
  }, [voiceMode, groq.isSpeaking]);

  // Audio level: use real viseme data from lip-sync engine when speaking
  useEffect(() => {
    if (groq.isSpeaking || liveRoom.isAgentSpeaking) {
      // Derive audio level from the lip-sync engine's viseme jawOpen
      let raf: number;
      const pulse = () => {
        const jaw = lipSyncState.viseme.jawOpen;
        setAudioLevel(jaw > 0.05 ? 0.4 + jaw * 0.6 : Math.sin(Date.now() / 600) * 0.05 + 0.05);
        raf = requestAnimationFrame(pulse);
      };
      pulse();
      return () => cancelAnimationFrame(raf);
    } else if (voiceMode !== 'recording') {
      setAudioLevel(0);
    }
  }, [groq.isSpeaking, liveRoom.isAgentSpeaking, voiceMode, lipSyncState.viseme.jawOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (cameraVideoRef.current && vision.cameraStream) {
      cameraVideoRef.current.srcObject = vision.cameraStream;
    }
  }, [vision.cameraStream]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/neural/runtime', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setRuntimeTruth(normalizeRuntimeTruth(data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeTruth(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previous = lastRoomStatusRef.current;
    if (previous === liveRoom.roomStatus) {
      return;
    }

    if (liveRoom.roomStatus === 'connected') {
      appendMessage('system', `${cfg.name} is live on the realtime channel${liveRoom.roomId ? ` (${liveRoom.roomId})` : ''}.`);
    } else if (previous === 'connected' && liveRoom.roomStatus === 'disconnected') {
      appendMessage('system', 'Realtime session ended.');
    } else if (liveRoom.roomStatus === 'error' && liveRoom.roomError) {
      appendMessage('system', `Realtime connection issue: ${liveRoom.roomError}`);
    }

    lastRoomStatusRef.current = liveRoom.roomStatus;
  }, [appendMessage, cfg.name, liveRoom.roomError, liveRoom.roomId, liveRoom.roomStatus]);

  // Unlock audio on first interaction
  useEffect(() => {
    const handler = () => {
      void groqActions.unlockAudio();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => { document.removeEventListener('click', handler); document.removeEventListener('touchstart', handler); };
  }, [groqActions]);

  // URL actor param
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('actor');
    if (p === 'jack' || p === 'julia') setActor(p);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('actor') === actor) return;
    url.searchParams.set('actor', actor);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [actor]);

  // ============================================================
  // Speak — TTS audio drives real-time lip-sync automatically
  // The lip-sync engine hooks into the audio element via useEffect above
  // ============================================================

  const speakWithLipSync = useCallback(async (text: string, currentActor: ActorId) => {
    // Simply speak — the lip-sync engine auto-connects when groq.isSpeaking flips true
    await groqActions.speak(text, currentActor);
  }, [groqActions]);

  // ============================================================
  // REAL Voice: Mic → Groq Whisper STT → LLM → Groq Orpheus TTS + Lip Sync
  // ============================================================

  const handleMicToggle = useCallback(async () => {
    if (liveCallActive) {
      appendMessage('system', 'Realtime call is already active. Use the live call controls instead of push-to-talk.');
      return;
    }

    await groqActions.unlockAudio();

    if (voiceMode === 'recording') {
      setVoiceMode('processing');
      groqActions.stopListening();

      const result = await groqActions.sendVoiceMessage(actor, {
        userId,
        visionSummary: vision.lastAnalysis || undefined,
      });

      if (result && result.transcript) {
        appendMessage('user', result.transcript);
        if (result.response) {
          appendMessage('assistant', result.response);
          await speakWithLipSync(result.response, actor);
        }
        setMemoryLoaded(true);
      }
      setVoiceMode('idle');
      micStreamRef.current = null;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        micStreamRef.current = stream;
        await groqActions.startListening();
        setVoiceMode('recording');
      } catch (err) {
        console.error('[Neural] Mic access failed:', err);
        appendMessage('system', 'Microphone access denied. Allow mic access and try again.');
      }
    }
  }, [actor, appendMessage, groqActions, liveCallActive, speakWithLipSync, userId, vision.lastAnalysis, voiceMode]);

  const handleLiveCallToggle = useCallback(async () => {
    await groqActions.unlockAudio();

    if (liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media' || liveRoom.roomStatus === 'reconnecting') {
      await liveRoomActions.disconnect();
      return;
    }

    await liveRoomActions.connect(actor);
  }, [actor, groqActions, liveCallActive, liveRoom.roomStatus, liveRoomActions]);

  // ============================================================
  // Text chat → Groq LLM → Groq Orpheus TTS + Lip Sync
  // ============================================================

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    appendMessage('user', text);

    const isVisionQuery = /can you see|what do you see|scan|read this|look at|check this|what.?s (this|that|wrong|here)|notice/i.test(text);

    if (isVisionQuery && !visualPipelineReady) {
      const fallback = 'Turn on the camera or share your screen first, then I can look at it with you.';
      appendMessage('assistant', fallback);
      await speakWithLipSync(fallback, actor);
      return;
    }

    if (isVisionQuery && visualPipelineReady) {
      setIsTyping(true);
      const analysis = await visionActions.captureAndAnalyze(actor, text, {
        userId,
        callSessionId: liveRoom.sessionId || undefined,
      });
      appendMessage('assistant', analysis);
      await speakWithLipSync(analysis, actor);
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    try {
      await groqActions.unlockAudio();
      const recentHistory = messages
        .filter((message) => message.role !== 'system')
        .slice(-12)
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.text,
        }));
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          activeAgent: actor,
          userId,
          sessionId: liveRoom.sessionId || undefined,
          conversationId: liveRoom.sessionId || undefined,
          callSessionId: liveRoom.sessionId || undefined,
          mode: liveCallActive ? 'voice' : 'text',
          mediaMode: visualPipelineReady ? 'video' : liveCallActive ? 'voice' : 'text',
          mediaState: {
            realtime_call_active: liveCallActive,
            room_connected: liveRoom.transportConnected,
            agent_joined: liveRoom.isAgentConnected,
            mic_live: liveRoom.micLive,
            speaker_live: liveRoom.speakerLive,
            camera_live: visualPipelineReady,
          },
          history: recentHistory,
          visionSummary: vision.lastAnalysis || undefined,
        }),
      });
      if (!response.ok) throw new Error(`chat_failed:${response.status}`);
      const data = await response.json();
      const reply = data.response || cfg.greeting;
      appendMessage('assistant', reply);
      await speakWithLipSync(reply, actor);
      setMemoryLoaded(true);
    } catch {
      appendMessage('system', 'Connection issue. Try again in a moment.');
    }
    setIsTyping(false);
  }, [
    actor,
    appendMessage,
    draft,
    groqActions,
    liveCallActive,
    liveRoom.isAgentConnected,
    liveRoom.micLive,
    liveRoom.sessionId,
    liveRoom.speakerLive,
    liveRoom.transportConnected,
    messages,
    speakWithLipSync,
    userId,
    vision.lastAnalysis,
    visionActions,
    visualPipelineReady,
  ]);

  const switchActor = useCallback((nextActor: ActorId) => {
    if (nextActor === actor) return;
    groqActions.stopSpeaking();
    lipSyncActions.stopLipSync();
    void liveRoomActions.disconnect();
    setMessages([]);
    setMemoryLoaded(false);
    setVoiceMode('idle');
    setActor(nextActor);
  }, [actor, groqActions, lipSyncActions, liveRoomActions]);

  const topStatusPills = [
    {
      label: liveCallActive
        ? `Live call ${liveRoom.isAgentConnected ? 'active' : 'connecting'}`
        : liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'
          ? 'Starting live call'
          : 'Live call ready',
      active: liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media',
      accent: liveCallActive ? '#22c55e' : liveRoom.roomStatus === 'error' ? '#ef4444' : '#8b5cf6',
    },
    {
      label: voiceMode === 'recording' ? 'Listening' : voiceMode === 'processing' ? 'Processing' : groq.isSpeaking ? 'Speaking' : 'Voice ready',
      active: voiceMode === 'recording' || groq.isSpeaking,
      accent: voiceMode === 'recording' ? '#ef4444' : groq.isSpeaking ? '#22c55e' : cfg.accent,
    },
    {
      label: visualPipelineReady ? 'Vision live' : 'Vision off',
      active: visualPipelineReady,
      accent: visualPipelineReady ? cfg.accent : '#475569',
    },
    {
      label: lipSyncState.isActive
        ? `Lip-sync live ${lipSyncState.fps}fps`
        : lipSyncState.isRendering
          ? 'Digital human active'
          : memoryLoaded ? 'Memory active' : 'Digital human ready',
      active: lipSyncState.isActive || lipSyncState.isRendering || memoryLoaded,
      accent: lipSyncState.isActive ? '#a855f7' : lipSyncState.isRendering ? '#22c55e' : memoryLoaded ? '#22c55e' : '#475569',
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050608',
      color: '#E8E8E8',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        background: 'rgba(5, 6, 8, 0.94)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={18} color={cfg.accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '1.02rem', fontWeight: 600, letterSpacing: '0.06em' }}>AGI-1 Neural</span>
            <span style={{ fontSize: '0.72rem', color: '#7b8696' }}>{cfg.title}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['jack', 'julia'] as ActorId[]).map((a) => (
            <button key={a} onClick={() => switchActor(a)} style={{
              padding: '6px 18px', borderRadius: 999, border: 'none',
              background: a === actor ? AVATAR_CONFIG[a].accent : 'transparent',
              color: a === actor ? '#000' : '#96a0af',
              fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            }}>{AVATAR_CONFIG[a].name}</button>
          ))}
        </div>

        <button onClick={() => setShowStatus((c) => !c)} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, color: '#96a0af', fontSize: '0.74rem', cursor: 'pointer',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: presenceState !== 'idle' ? '#22c55e' : '#64748b', boxShadow: presenceState !== 'idle' ? '0 0 8px #22c55e80' : 'none' }} />
          {showStatus ? 'Hide' : 'Status'}
          <ChevronDown size={12} style={{ transform: showStatus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </header>

      {showStatus && (
        <div style={{ padding: '12px 20px', background: 'rgba(10,12,16,0.96)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.75rem', color: '#8b95a3' }}>
          <StatusDot
            label="Realtime"
            active={liveCallActive || Boolean(runtimeTruth?.full_duplex_live)}
            detail={
              liveCallActive
                ? `${liveRoom.provider || runtimeTruth?.voice_transport || 'livekit'} • ${liveRoom.roomId || 'room pending'}`
                : liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'
                  ? 'Connecting'
                  : runtimeTruth?.full_duplex_live
                    ? `${runtimeTruth.voice_transport || 'live'} ready`
                    : 'Not connected'
            }
          />
          <StatusDot label="Voice" active={voiceMode === 'recording' || groq.isSpeaking || liveCallActive} detail={liveCallActive ? 'LiveKit duplex' : voiceMode === 'recording' ? 'Recording (Whisper)' : groq.isSpeaking ? 'Speaking (TTS)' : 'Ready'} />
          <StatusDot label="STT" active={groq.sttReady || Boolean(runtimeTruth?.full_duplex_live)} detail={runtimeTruth?.stt_provider || (groq.sttReady ? 'Groq Whisper v3' : 'Pending')} />
          <StatusDot label="TTS" active={groq.ttsReady || Boolean(runtimeTruth?.full_duplex_live)} detail={runtimeTruth?.tts_provider || 'Groq Orpheus'} />
          <StatusDot label="LLM" active={runtimeTruth?.llm_live ?? true} detail={runtimeTruth?.llm_provider ? `${runtimeTruth.llm_provider} live` : 'Groq Llama-3.3-70b'} />
          <StatusDot
            label="Digital Human"
            active={lipSyncState.isRendering}
            detail={
              lipSyncState.isActive
                ? `Real-time lip-sync live — ${lipSyncState.fps}fps, jaw=${lipSyncState.viseme.jawOpen.toFixed(2)}`
                : lipSyncState.isRendering
                  ? 'Canvas render active — idle animation running'
                  : 'Ready — portrait loaded, waiting for speech'
            }
          />
          <StatusDot label="Camera" active={visualPipelineReady} detail={vision.visionState.replace(/_/g, ' ')} />
          <StatusDot label="Vision AI" active={Boolean(vision.lastAnalysis) || Boolean(runtimeTruth?.vision_live)} detail={vision.lastAnalysis ? 'Live semantic vision' : (runtimeTruth?.vision_provider || 'Waiting')} />
          <StatusDot label="Memory" active={memoryLoaded || Boolean(runtimeTruth?.memory_live)} detail={memoryLoaded ? 'Active in session' : (runtimeTruth?.memory_live ? 'Ready' : 'Pending')} />
          {runtimeTruth?.blockers?.[0] && (
            <StatusDot label="Blocker" active={false} detail={runtimeTruth.blockers[0]} />
          )}
          {groq.voiceError && <StatusDot label="Error" active={false} detail={groq.voiceError} />}
          {liveRoom.roomError && <StatusDot label="Call error" active={false} detail={liveRoom.roomError} />}
        </div>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 980, width: '100%', margin: '0 auto', padding: '0 16px 16px', overflow: 'hidden', minHeight: 0 }}>
        {/* Status Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 0 6px' }}>
          {topStatusPills.map((pill) => (
            <div key={pill.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
              background: pill.active ? `${pill.accent}18` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${pill.active ? `${pill.accent}40` : 'rgba(255,255,255,0.08)'}`,
              color: pill.active ? '#f5f7fb' : '#8d97a6', fontSize: '0.76rem', fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: pill.active ? pill.accent : '#667085', boxShadow: pill.active ? `0 0 10px ${pill.accent}80` : 'none' }} />
              {pill.label}
            </div>
          ))}
        </div>

        {/* Avatar Stage */}
        <div style={{ marginTop: 10, position: 'relative' }}>
          <AvatarStage
            actor={actor}
            accent={cfg.accent}
            presenceState={presenceState}
            isSpeaking={groq.isSpeaking}
            isListening={voiceMode === 'recording'}
            audioLevel={audioLevel}
            avatarMedia={avatarMedia}
            lipSyncCanvas={lipSyncActions.getCanvas()}
            lipSyncActive={lipSyncState.isActive}
            lipSyncFps={lipSyncState.fps}
          />

          {/* Presence badge */}
          <div style={{
            position: 'absolute', top: 24, left: 24, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 999,
            background: 'rgba(5,6,8,0.72)', backdropFilter: 'blur(14px)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 999,
              background: presenceState === 'speaking' ? '#22c55e' : presenceState === 'thinking' ? '#FF8A00' : presenceState === 'listening' ? '#ef4444' : '#64748b',
              boxShadow: presenceState !== 'idle' ? `0 0 10px ${presenceState === 'speaking' ? '#22c55e' : presenceState === 'thinking' ? '#FF8A00' : '#ef4444'}70` : 'none',
              animation: presenceState === 'idle' ? 'none' : 'pulse-dot 1.4s infinite',
            }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#F5F7FB' }}>
              {presenceState === 'speaking' && `${cfg.name} is speaking`}
              {presenceState === 'thinking' && `${cfg.name} is thinking...`}
              {presenceState === 'listening' && `${cfg.name} is listening`}
              {presenceState === 'idle' && cfg.name}
            </span>
          </div>

          {/* Camera PiP */}
          {vision.cameraStream && (
            <div style={{
              position: 'absolute', top: 24, right: 24, zIndex: 10,
              width: 144, height: 104, borderRadius: 14, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 10px 30px rgba(0,0,0,0.36)', background: '#091018',
            }}>
              <video ref={cameraVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: vision.visionMode === 'camera' ? 'scaleX(-1)' : 'none' }} autoPlay muted playsInline />
              <div style={{ position: 'absolute', left: 6, top: 6, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 999, background: 'rgba(5,6,8,0.72)', color: '#F5F7FB', fontSize: '0.6rem', fontWeight: 700 }}>
                <Eye size={10} />{vision.isAnalyzing ? 'Analyzing' : vision.visionMode === 'screen' ? 'Screen' : 'Camera'}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '14px 0 10px' }}>
          <QuickControl
            icon={liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media' ? <PhoneOff size={16} /> : <PhoneCall size={16} />}
            label={
              liveCallActive
                ? 'End live call'
                : liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'
                  ? 'Connecting...'
                  : `Call ${cfg.name}`
            }
            active={liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'}
            accent={liveCallActive ? '#ef4444' : '#8b5cf6'}
            onClick={() => { void handleLiveCallToggle(); }}
            disabled={liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'}
            large
          />
          <QuickControl icon={groq.muted ? <VolumeX size={16} /> : <Volume2 size={16} />} label={groq.muted ? 'Unmute' : 'Mute'} active={!groq.muted} onClick={() => groqActions.setMuted(!groq.muted)} />
          <QuickControl
            icon={voiceMode === 'recording' ? <MicOff size={16} /> : <Mic size={16} />}
            label={liveCallActive ? 'Push-to-talk off' : voiceMode === 'recording' ? 'Stop' : voiceMode === 'processing' ? 'Processing...' : `Talk to ${cfg.name}`}
            active={voiceMode === 'recording'} accent={voiceMode === 'recording' ? '#ef4444' : cfg.accent}
            onClick={() => { void handleMicToggle(); }} disabled={voiceMode === 'processing' || liveCallActive} large
          />
          {liveCallActive && (
            <QuickControl
              icon={liveRoom.micLive ? <Mic size={16} /> : <MicOff size={16} />}
              label={liveRoom.micLive ? 'Mute call mic' : 'Unmute call mic'}
              active={liveRoom.micLive}
              accent={cfg.accent}
              onClick={() => { liveRoomActions.toggleMic(); }}
            />
          )}
          {liveRoom.speakerBlocked && (
            <QuickControl
              icon={<Volume2 size={16} />}
              label="Enable call audio"
              active={false}
              accent="#22c55e"
              onClick={() => { void liveRoomActions.enableSpeakerAudio(); }}
            />
          )}
          <QuickControl icon={visualPipelineReady ? <CameraOff size={16} /> : <Camera size={16} />} label={visualPipelineReady ? 'Camera off' : 'Camera on'} active={visualPipelineReady} accent={cfg.accent}
            onClick={() => { if (visualPipelineReady || vision.visionState === 'paused') visionActions.stopVision(); else void visionActions.startCamera(); }} />
          <QuickControl icon={<Monitor size={16} />} label={vision.visionMode === 'screen' ? 'Stop' : 'Screen'} active={vision.visionMode === 'screen'} accent={cfg.accent}
            onClick={() => { if (vision.visionMode === 'screen') visionActions.stopVision(); else void visionActions.startScreenShare(); }} />
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#5d6674', textAlign: 'center', padding: '40px 20px' }}>
                <Sparkles size={28} color={cfg.accent} style={{ opacity: 0.6 }} />
                <p style={{ fontSize: '1rem', color: '#C9D0DA', maxWidth: 380 }}>{cfg.greeting}</p>
                <p style={{ fontSize: '0.8rem', color: '#728091' }}>Tap the mic to talk, or type below.</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', padding: '0 4px' }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: 18, fontSize: '0.92rem', lineHeight: 1.55,
                  ...(msg.role === 'user' ? { background: 'rgba(255,255,255,0.08)', borderBottomRightRadius: 6, color: '#E8ECF2' }
                    : msg.role === 'system' ? { background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.15)', color: '#FFD066', fontSize: '0.82rem' }
                    : { background: `${AVATAR_CONFIG[msg.actor || actor].accent}12`, border: `1px solid ${AVATAR_CONFIG[msg.actor || actor].accent}28`, borderBottomLeftRadius: 6, color: '#E8ECF2' }),
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: AVATAR_CONFIG[msg.actor || actor].accent, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {AVATAR_CONFIG[msg.actor || actor].name}
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', padding: '0 4px' }}>
                <div style={{ padding: '12px 16px', borderRadius: 18, background: `${cfg.accent}12`, border: `1px solid ${cfg.accent}28`, borderBottomLeftRadius: 6 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map((i) => (<span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: cfg.accent, opacity: 0.6, animation: `dot-bounce 1s ${i * 0.15}s infinite` }} />))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={`Message ${cfg.name}...`}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#E8E8E8', fontSize: '0.92rem', outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => { void handleSend(); }} disabled={!draft.trim() || isTyping}
              style={{ padding: '12px 16px', borderRadius: 14, border: 'none', background: draft.trim() ? cfg.accent : 'rgba(255,255,255,0.06)', color: draft.trim() ? '#000' : '#5d6674', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes dot-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatusDot({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? '#22c55e' : '#475569', boxShadow: active ? '0 0 6px #22c55e80' : 'none' }} />
      <span style={{ fontWeight: 600 }}>{label}:</span>
      <span style={{ color: '#646e7d' }}>{detail}</span>
    </div>
  );
}

function QuickControl({ icon, label, active, accent, onClick, disabled, large }: {
  icon: React.ReactNode; label: string; active: boolean; accent?: string; onClick: () => void; disabled?: boolean; large?: boolean;
}) {
  const color = accent || '#00AEEF';
  return (
    <button onClick={onClick} disabled={disabled} title={label} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: large ? '14px 20px' : '10px 14px', borderRadius: 14,
      border: `1px solid ${active ? `${color}55` : 'rgba(255,255,255,0.08)'}`,
      background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
      color: active ? '#f5f7fb' : '#8d97a6',
      cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
      opacity: disabled ? 0.5 : 1, transform: large ? 'scale(1.05)' : 'none',
    }}>
      {icon}
      <span style={{ fontSize: '0.66rem', fontWeight: 600 }}>{label}</span>
    </button>
  );
}
