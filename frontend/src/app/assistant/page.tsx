'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Send,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { DigitalHumanStage } from '../../components/avatar/DigitalHumanStage';
import { useAvatarAnimationBridge } from '../../components/avatar/useAvatarAnimationBridge';
import { useAvatarRuntime } from '../../components/avatar/useAvatarRuntime';
import { useVisionCapture } from '../../hooks/useVisionCapture';
import { useGroqVoice } from '../../hooks/useGroqVoice';
import { useRealtimeLipSync } from '../../hooks/useRealtimeLipSync';
import { useLiveKitRoom } from '../../hooks/useLiveKitRoom';
import { getStableBrowserUserId, persistBrowserUserId } from '../../lib/browser-user-id';
import { jackAvatarProfile, juliaAvatarProfile } from '../../lib/avatars';

// ============================================================
// Types
// ============================================================

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
  avatar_identity_locked?: boolean;
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
  audio2face_live?: boolean;
  render_node_live?: boolean;
  render_engine_target?: string;
  render_engine_actual?: string;
  meta_avatar_live?: boolean;
  metahuman_path_live?: boolean;
  body_gesture_live?: boolean;
  facial_expression_live?: boolean;
  cinematic_quality_live?: boolean;
  cinematic_4k_live?: boolean;
  live_4k?: boolean;
  cosmos_world_layer_live?: boolean;
  avatar_resolution_actual?: string;
  wardrobe_swap_live?: boolean;
  scene_initialized_live?: boolean;
  controller_role?: string;
  jack_scene_attached?: boolean;
  julia_scene_attached?: boolean;
  physical_layer_status?: string;
  world_model_active?: boolean;
  blockers?: string[];
};

type SingularityTask = {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'queued';
  progress?: number;
};

// ============================================================
// Constants
// ============================================================

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

const AVATAR_PROFILES = {
  jack: jackAvatarProfile,
  julia: juliaAvatarProfile,
} as const;

// ============================================================
// Utilities
// ============================================================

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSessionStorageKey(actor: ActorId): string {
  return `agi1.assistant.conversation.${actor}`;
}

function readStoredConversationId(actor: ActorId): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(getSessionStorageKey(actor)) || '';
  } catch {
    return '';
  }
}

function persistConversationId(actor: ActorId, conversationId: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getSessionStorageKey(actor);
    if (conversationId) {
      window.localStorage.setItem(key, conversationId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

function normalizeRuntimeTruth(data: any): RuntimeTruth | null {
  if (!data || typeof data !== 'object') return null;

  if (data.truth && typeof data.truth === 'object') {
    return {
      ...data.truth,
      voice_transport: data.voice_transport,
      full_duplex_live: data.full_duplex_live,
      personaplex_live: data.personaplex_live,
      physical_layer_status: data.physical_layer_status || data.truth.physical_layer_status,
      world_model_active: data.world_model_active || data.truth.world_model_active,
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
    physical_layer_status: data.physical_layer_status || undefined,
    world_model_active: Boolean(data.world_model_active),
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
  };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Main Page
// ============================================================

export default function AssistantPage() {
  // ---- Core state ----
  const [actor, setActor] = useState<ActorId>('jack');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [runtimeTruth, setRuntimeTruth] = useState<RuntimeTruth | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'processing'>('idle');

  // ---- Panel state ----
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [tasks] = useState<SingularityTask[]>([]);

  // ---- Hooks ----
  const [vision, visionActions] = useVisionCapture();
  const [groq, groqActions] = useGroqVoice();
  const [lipSyncState, lipSyncActions] = useRealtimeLipSync();
  const [liveRoom, liveRoomActions] = useLiveKitRoom();

  // ---- Refs ----
  const chatEndRef = useRef<HTMLDivElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const lastRoomStatusRef = useRef<string>('disconnected');

  const lipSyncCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!lipSyncCanvasRef.current) {
    lipSyncCanvasRef.current = lipSyncActions.getCanvas();
  }

  // ---- Derived ----
  const userId = persistBrowserUserId(getStableBrowserUserId());
  const cfg = AVATAR_CONFIG[actor];
  const avatarProfile = AVATAR_PROFILES[actor];

  const visualPipelineReady = vision.visionState === 'camera_live' || vision.visionState === 'analyzing';
  const liveCallActive = liveRoom.roomStatus === 'connected' || liveRoom.roomStatus === 'reconnecting';

  const presenceState = groq.isSpeaking || liveRoom.isAgentSpeaking
    ? 'speaking'
    : groq.isThinking || isTyping || voiceMode === 'processing'
      ? 'thinking'
      : groq.isListening || voiceMode === 'recording' || liveCallActive
        ? 'listening'
        : 'idle';

  const latestAssistantLine = useMemo(() => {
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
    return lastAssistantMessage?.text || cfg.greeting;
  }, [cfg.greeting, messages]);

  // ---- Avatar runtime + bridge ----
  const avatarRuntime = useAvatarRuntime({
    actorId: actor,
    identityLock: avatarProfile.identityLock,
    presenceState: presenceState as 'idle' | 'listening' | 'thinking' | 'speaking',
    roomConnected: liveCallActive,
    transportConnected: liveRoom.transportConnected || liveCallActive,
    micLive: liveRoom.micLive || voiceMode === 'recording',
    speakerLive: liveRoom.speakerLive || groq.isSpeaking || liveRoom.isAgentSpeaking,
    audioUnlocked: groq.audioUnlocked,
    visualPipelineReady,
    framesReceiving: vision.frameCount > 0 || Boolean(vision.lastAnalysis),
    semanticVisionLive: Boolean(vision.lastAnalysis) || Boolean(runtimeTruth?.vision_live),
    memoryLoaded: memoryLoaded || Boolean(runtimeTruth?.memory_live),
    personaplexLive: Boolean(runtimeTruth?.personaplex_live),
    audio2faceLive: Boolean(runtimeTruth?.audio2face_live || (runtimeTruth?.lip_sync_provider === 'audio2face' && runtimeTruth?.lip_sync_live)),
    controllerRole: runtimeTruth?.controller_role,
    worldModelLive: Boolean(runtimeTruth?.world_model_active),
    sceneInitializedLive: runtimeTruth?.scene_initialized_live,
    renderNodeLive: runtimeTruth?.render_node_live,
    renderEngineTarget: runtimeTruth?.render_engine_target,
    renderEngineActual: runtimeTruth?.render_engine_actual,
    metaAvatarLive: runtimeTruth?.meta_avatar_live,
    metahumanPathLive: runtimeTruth?.metahuman_path_live,
    bodyGestureLive: runtimeTruth?.body_gesture_live,
    cosmosWorldLayerLive: runtimeTruth?.cosmos_world_layer_live,
    cinematic4kLive: runtimeTruth?.cinematic_4k_live,
    avatarResolutionActual: runtimeTruth?.avatar_resolution_actual,
    wardrobeSwapLive: runtimeTruth?.wardrobe_swap_live,
    jackSceneAttached: runtimeTruth?.jack_scene_attached,
    juliaSceneAttached: runtimeTruth?.julia_scene_attached,
    browserCanvasLive: lipSyncState.isRendering,
    browserCanvasLipSyncLive: lipSyncState.isActive,
  });

  const avatarBridge = useAvatarAnimationBridge({
    profile: avatarProfile,
    runtime: avatarRuntime,
    lastAssistantLine: latestAssistantLine,
    visionSummary: vision.lastAnalysis || '',
  });

  // ============================================================
  // Effects
  // ============================================================

  // Load portrait into lip-sync engine when actor changes
  useEffect(() => {
    lipSyncActions.setPortraitSrc(avatarProfile.media.poster);
    lipSyncActions.setRenderCalibration(avatarProfile.identityLock.renderCalibration);
    lipSyncActions.getCanvas();
  }, [avatarProfile.identityLock.renderCalibration, avatarProfile.media.poster, lipSyncActions]);

  // Attention state
  useEffect(() => {
    lipSyncActions.setAttentionState({
      mode: vision.isAnalyzing
        ? 'analyzing'
        : presenceState === 'listening'
          ? 'listening'
          : presenceState === 'thinking'
            ? 'thinking'
            : presenceState === 'speaking'
              ? 'speaking'
              : 'idle',
      engaged: liveCallActive || voiceMode === 'recording' || groq.isSpeaking || liveRoom.isAgentSpeaking || isTyping,
      listeningIntensity: voiceMode === 'recording' || liveCallActive ? 1 : groq.isListening ? 0.7 : 0.2,
      targetX: vision.visionMode === 'screen' ? 0.48 : 0.5,
      targetY: vision.isAnalyzing ? 0.56 : presenceState === 'thinking' ? 0.5 : 0.42,
    });
  }, [
    groq.isListening,
    groq.isSpeaking,
    isTyping,
    lipSyncActions,
    liveCallActive,
    liveRoom.isAgentSpeaking,
    presenceState,
    vision.isAnalyzing,
    vision.visionMode,
    voiceMode,
  ]);

  const appendMessage = useCallback((role: Message['role'], text: string, messageActor?: ActorId) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role, text, timestamp: Date.now(), actor: role === 'assistant' ? (messageActor || actor) : undefined },
    ]);
  }, [actor]);

  // Drive lip-sync from active audio source
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

  // Audio level: viseme-driven when speaking
  useEffect(() => {
    if (groq.isSpeaking || liveRoom.isAgentSpeaking) {
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Camera video ref
  useEffect(() => {
    if (cameraVideoRef.current && vision.cameraStream) {
      cameraVideoRef.current.srcObject = vision.cameraStream;
    }
  }, [vision.cameraStream]);

  // Fetch runtime truth
  useEffect(() => {
    let cancelled = false;
    const fetchRuntime = () => {
      fetch('/api/neural/runtime', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setRuntimeTruth(normalizeRuntimeTruth(data));
        })
        .catch(() => {
          if (!cancelled) setRuntimeTruth(null);
        });
    };
    fetchRuntime();
    const interval = setInterval(fetchRuntime, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // LiveKit room status messages
  useEffect(() => {
    const previous = lastRoomStatusRef.current;
    if (previous === liveRoom.roomStatus) return;

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

  // Conversation ID persistence
  useEffect(() => {
    setConversationId(readStoredConversationId(actor));
  }, [actor]);

  useEffect(() => {
    persistConversationId(actor, conversationId);
  }, [actor, conversationId]);

  // Sync actor to URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('actor') === actor) return;
    url.searchParams.set('actor', actor);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [actor]);

  // Debug object
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as typeof window & { __AGI1_ASSISTANT_DEBUG__?: Record<string, unknown> }).__AGI1_ASSISTANT_DEBUG__ = {
      actor,
      presence_state: presenceState,
      room_connected: liveCallActive,
      transport_connected: liveRoom.transportConnected,
      mic_live: liveRoom.micLive || voiceMode === 'recording',
      speaker_live: liveRoom.speakerLive || groq.isSpeaking || liveRoom.isAgentSpeaking,
      avatar_render_live: avatarRuntime.avatar_render_live,
      lip_sync_live: avatarRuntime.lip_sync_live,
      voice_output_live: avatarRuntime.voice_output_live,
      voice_input_live: avatarRuntime.voice_input_live,
      camera_perception_live: avatarRuntime.camera_perception_live,
      semantic_vision_live: avatarRuntime.semantic_vision_live,
      memory_loaded: avatarRuntime.memory_loaded,
      render_mode: avatarRuntime.render_mode,
      lip_sync_fps: lipSyncState.fps,
      conversation_id: conversationId || null,
    };
  }, [
    actor, avatarRuntime, conversationId, groq.isSpeaking, liveCallActive,
    liveRoom.isAgentSpeaking, liveRoom.micLive, liveRoom.speakerLive,
    liveRoom.transportConnected, lipSyncState.fps, presenceState,
    runtimeTruth, voiceMode,
  ]);

  // ============================================================
  // Actions
  // ============================================================

  const speakWithLipSync = useCallback(async (text: string, currentActor: ActorId) => {
    await groqActions.speak(text, currentActor);
  }, [groqActions]);

  const handleMicToggle = useCallback(async () => {
    if (liveCallActive) {
      appendMessage('system', 'Realtime call is active. Use the live call controls instead of push-to-talk.');
      return;
    }

    await groqActions.unlockAudio();

    if (voiceMode === 'recording') {
      setVoiceMode('processing');
      groqActions.stopListening();

      const result = await groqActions.sendVoiceMessage(actor, {
        userId,
        sessionId: conversationId || undefined,
        visionSummary: vision.lastAnalysis || undefined,
      });

      if (result && result.transcript) {
        appendMessage('user', result.transcript);
        if (result.response) {
          appendMessage('assistant', result.response);
          await speakWithLipSync(result.response, actor);
        }
        if (result.conversationId) {
          setConversationId(result.conversationId);
        }
        setMemoryLoaded(true);
      }
      setVoiceMode('idle');
      micStreamRef.current = null;
    } else {
      try {
        groqActions.stopSpeaking();
        lipSyncActions.stopLipSync();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        micStreamRef.current = stream;
        await groqActions.startListening();
        setVoiceMode('recording');
      } catch (err) {
        console.error('[Assistant] Mic access failed:', err);
        appendMessage('system', 'Microphone access denied. Allow mic access and try again.');
      }
    }
  }, [actor, appendMessage, conversationId, groqActions, liveCallActive, lipSyncActions, speakWithLipSync, userId, vision.lastAnalysis, voiceMode]);

  const handleLiveCallToggle = useCallback(async () => {
    await groqActions.unlockAudio();
    groqActions.stopSpeaking();
    lipSyncActions.stopLipSync();

    if (liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media' || liveRoom.roomStatus === 'reconnecting') {
      await liveRoomActions.disconnect();
      return;
    }

    await liveRoomActions.connect(actor);
  }, [actor, groqActions, lipSyncActions, liveCallActive, liveRoom.roomStatus, liveRoomActions]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    groqActions.stopSpeaking();
    lipSyncActions.stopLipSync();
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
        .filter((m) => m.role !== 'system')
        .slice(-12)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text,
        }));
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          activeAgent: actor,
          userId,
          sessionId: conversationId || liveRoom.sessionId || undefined,
          conversationId: conversationId || liveRoom.sessionId || undefined,
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
      const nextConversationId = data.conversationId || data.sessionId || conversationId || liveRoom.sessionId || '';
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }
      appendMessage('assistant', reply);
      await speakWithLipSync(reply, actor);
      setMemoryLoaded(true);
    } catch {
      appendMessage('system', 'Connection issue. Try again in a moment.');
    }
    setIsTyping(false);
  }, [
    actor, appendMessage, conversationId, draft, groqActions, liveCallActive,
    lipSyncActions, liveRoom.isAgentConnected, liveRoom.micLive, liveRoom.sessionId,
    liveRoom.speakerLive, liveRoom.transportConnected, messages, speakWithLipSync,
    userId, vision.lastAnalysis, visionActions, visualPipelineReady,
  ]);

  const switchActor = useCallback((nextActor: ActorId) => {
    if (nextActor === actor) return;
    groqActions.stopSpeaking();
    lipSyncActions.stopLipSync();
    void liveRoomActions.disconnect();
    setMessages([]);
    setMemoryLoaded(false);
    setVoiceMode('idle');
    setConversationId(readStoredConversationId(nextActor));
    setActor(nextActor);
  }, [actor, groqActions, lipSyncActions, liveRoomActions]);

  // ---- Derived display values ----
  const avatarSurfaceLive = lipSyncState.isActive || lipSyncState.isRendering;
  const isConnecting = liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media';
  const callStatusLabel = liveCallActive
    ? `Live ${liveRoom.isAgentConnected ? '' : '(connecting agent)'}`
    : isConnecting ? 'Connecting...' : '';

  const systemSubsystems = useMemo(() => [
    { label: 'Avatar', live: avatarRuntime.avatar_render_live, detail: avatarSurfaceLive ? `Lip-sync ${lipSyncState.fps}fps` : 'Fallback' },
    { label: 'Voice', live: groq.ttsReady || liveCallActive, detail: liveCallActive ? 'LiveKit duplex' : 'Groq Orpheus' },
    { label: 'STT', live: groq.sttReady || Boolean(runtimeTruth?.full_duplex_live), detail: runtimeTruth?.stt_provider || 'Groq Whisper' },
    { label: 'LLM', live: runtimeTruth?.llm_live ?? true, detail: runtimeTruth?.llm_provider || 'Groq Llama-3.3-70b' },
    { label: 'Vision', live: Boolean(vision.lastAnalysis) || Boolean(runtimeTruth?.vision_live), detail: vision.lastAnalysis ? 'Semantic live' : 'Ready' },
    { label: 'Memory', live: memoryLoaded || Boolean(runtimeTruth?.memory_live), detail: memoryLoaded ? 'Active' : 'Ready' },
    { label: 'Realtime', live: liveCallActive || Boolean(runtimeTruth?.full_duplex_live), detail: liveCallActive ? 'Connected' : 'Ready' },
  ], [avatarRuntime, avatarSurfaceLive, groq.sttReady, groq.ttsReady, liveCallActive, lipSyncState.fps, memoryLoaded, runtimeTruth, vision.lastAnalysis]);

  const liveCount = systemSubsystems.filter((s) => s.live).length;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div style={{
      height: '100vh',
      background: '#050608',
      color: '#E8E8E8',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ---- Header ---- */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: 'rgba(5, 6, 8, 0.92)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        zIndex: 100,
        flexShrink: 0,
      }}>
        {/* Left: branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: cfg.gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.04em', color: '#F5F7FB' }}>
              AGI-1 Assistant
            </div>
            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 1 }}>
              {cfg.name} &middot; {cfg.title}
              {callStatusLabel && (
                <span style={{ color: '#22c55e', marginLeft: 8 }}>{callStatusLabel}</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: actor switcher */}
        <div style={{
          display: 'flex', gap: 2, padding: 3,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {(['jack', 'julia'] as ActorId[]).map((a) => (
            <button
              key={a}
              data-testid={`actor-${a}`}
              onClick={() => switchActor(a)}
              style={{
                padding: '5px 20px',
                borderRadius: 999,
                border: 'none',
                background: a === actor ? AVATAR_CONFIG[a].accent : 'transparent',
                color: a === actor ? '#000' : '#7B8696',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {AVATAR_CONFIG[a].name}
            </button>
          ))}
        </div>

        {/* Right: status + settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 999,
            background: liveCallActive ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${liveCallActive ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
            fontSize: '0.7rem', fontWeight: 600,
            color: liveCallActive ? '#22c55e' : '#6B7280',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 999,
              background: liveCallActive ? '#22c55e' : presenceState !== 'idle' ? cfg.accent : '#475569',
              boxShadow: liveCallActive ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
              animation: liveCallActive ? 'pulse-dot 2s infinite' : 'none',
            }} />
            {liveCallActive ? 'LIVE' : `${liveCount}/${systemSubsystems.length}`}
          </div>

          <button
            onClick={() => setShowSystemStatus((c) => !c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: showSystemStatus ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#7B8696', cursor: 'pointer',
            }}
            title="System status"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* ---- Main layout ---- */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* ==== LEFT: Avatar Stage ==== */}
        <div style={{
          flex: '0 0 60%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}>
          {/* Avatar */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <DigitalHumanStage
              profile={avatarProfile}
              presenceState={presenceState as 'idle' | 'listening' | 'thinking' | 'speaking'}
              runtime={avatarRuntime}
              bridge={avatarBridge}
              liveCanvas={lipSyncCanvasRef.current}
              liveCanvasActive={lipSyncState.isActive || lipSyncState.isRendering}
              audioLevel={audioLevel}
              primaryActions={null}
              cameraPreview={null}
            />

            {/* Camera PiP overlay */}
            {vision.cameraStream && (
              <div
                data-testid="camera-pip"
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  width: 140,
                  height: 105,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  background: '#0A0C10',
                  zIndex: 10,
                }}
              >
                <video
                  ref={cameraVideoRef}
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: vision.visionMode === 'camera' ? 'scaleX(-1)' : 'none',
                  }}
                  autoPlay
                  muted
                  playsInline
                />
                <div style={{
                  position: 'absolute', bottom: 4, left: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 999,
                  background: 'rgba(5,6,8,0.75)', color: '#F5F7FB',
                  fontSize: '0.58rem', fontWeight: 700,
                }}>
                  <Eye size={8} />
                  {vision.isAnalyzing ? 'Analyzing' : vision.visionMode === 'screen' ? 'Screen' : 'Camera'}
                </div>
              </div>
            )}

            {/* Presence indicator overlay */}
            {presenceState !== 'idle' && (
              <div style={{
                position: 'absolute',
                top: 16,
                left: 16,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999,
                background: 'rgba(5,6,8,0.7)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${cfg.accent}40`,
                zIndex: 10,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: presenceState === 'speaking' ? '#22c55e' : presenceState === 'listening' ? '#ef4444' : cfg.accent,
                  boxShadow: `0 0 10px ${presenceState === 'speaking' ? '#22c55e' : presenceState === 'listening' ? '#ef4444' : cfg.accent}80`,
                  animation: 'pulse-dot 1.5s infinite',
                }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#E8ECF2', textTransform: 'capitalize' }}>
                  {presenceState === 'speaking' ? `${cfg.name} speaking` : presenceState === 'listening' ? 'Listening' : 'Thinking'}
                </span>
              </div>
            )}
          </div>

          {/* ==== Bottom Voice Controls ==== */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '14px 20px',
            background: 'rgba(5,6,8,0.95)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}>
            {/* Live call */}
            <CallButton
              icon={liveCallActive || isConnecting ? <PhoneOff size={18} /> : <Phone size={18} />}
              label={liveCallActive ? 'End call' : isConnecting ? 'Connecting' : `Call ${cfg.name}`}
              active={liveCallActive}
              connecting={isConnecting}
              accent={liveCallActive ? '#ef4444' : '#8b5cf6'}
              onClick={() => { void handleLiveCallToggle(); }}
              disabled={isConnecting}
              primary
              dataTestId="start-live-call"
            />

            {/* Mute output */}
            <CallButton
              icon={groq.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              label={groq.muted ? 'Unmute' : 'Speaker'}
              active={!groq.muted}
              accent="#6B7280"
              onClick={() => groqActions.setMuted(!groq.muted)}
              dataTestId="toggle-output-audio"
            />

            {/* Push-to-talk */}
            <CallButton
              icon={voiceMode === 'recording' ? <MicOff size={18} /> : <Mic size={18} />}
              label={
                liveCallActive ? 'PTT off'
                  : voiceMode === 'recording' ? 'Stop'
                    : voiceMode === 'processing' ? 'Processing'
                      : 'Talk'
              }
              active={voiceMode === 'recording'}
              accent={voiceMode === 'recording' ? '#ef4444' : cfg.accent}
              onClick={() => { void handleMicToggle(); }}
              disabled={voiceMode === 'processing' || liveCallActive}
              primary
              dataTestId="push-to-talk"
            />

            {/* Call mic toggle (only during live call) */}
            {liveCallActive && (
              <CallButton
                icon={liveRoom.micLive ? <Mic size={16} /> : <MicOff size={16} />}
                label={liveRoom.micLive ? 'Mic on' : 'Mic off'}
                active={liveRoom.micLive}
                accent={cfg.accent}
                onClick={() => { liveRoomActions.toggleMic(); }}
                dataTestId="toggle-call-mic"
              />
            )}

            {/* Enable speaker when blocked */}
            {liveRoom.speakerBlocked && (
              <CallButton
                icon={<Volume2 size={16} />}
                label="Enable audio"
                active={false}
                accent="#22c55e"
                onClick={() => { void liveRoomActions.enableSpeakerAudio(); }}
                dataTestId="enable-call-audio"
              />
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

            {/* Camera */}
            <CallButton
              icon={visualPipelineReady ? <CameraOff size={16} /> : <Camera size={16} />}
              label={visualPipelineReady ? 'Cam off' : 'Camera'}
              active={visualPipelineReady}
              accent={cfg.accent}
              onClick={() => {
                if (visualPipelineReady || vision.visionState === 'paused') visionActions.stopVision();
                else void visionActions.startCamera();
              }}
              dataTestId="toggle-camera"
            />

            {/* Screen share */}
            <CallButton
              icon={<Monitor size={16} />}
              label={vision.visionMode === 'screen' ? 'Stop share' : 'Screen'}
              active={vision.visionMode === 'screen'}
              accent={cfg.accent}
              onClick={() => {
                if (vision.visionMode === 'screen') visionActions.stopVision();
                else void visionActions.startScreenShare();
              }}
              dataTestId="toggle-screen"
            />
          </div>
        </div>

        {/* ==== RIGHT: Chat + Panels ==== */}
        <div style={{
          flex: '0 0 40%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(8,10,14,0.6)',
        }}>
          {/* System status collapsible */}
          {showSystemStatus && (
            <div
              data-testid="system-status-panel"
              style={{
                padding: '12px 16px',
                background: 'rgba(5,6,8,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexShrink: 0,
                overflow: 'auto',
                maxHeight: 200,
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} color={cfg.accent} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#A0A8B4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    System Status
                  </span>
                </div>
                <span style={{ fontSize: '0.66rem', color: '#5d6674' }}>
                  {liveCount}/{systemSubsystems.length} live
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {systemSubsystems.map((sub) => (
                  <div key={sub.label} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0',
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                      background: sub.live ? '#22c55e' : '#475569',
                      boxShadow: sub.live ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                    }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#C0C8D4', minWidth: 60 }}>{sub.label}</span>
                    <span style={{ fontSize: '0.68rem', color: '#5d6674' }}>{sub.detail}</span>
                  </div>
                ))}
                {/* Physical layer */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 4, paddingTop: 8,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                    background: runtimeTruth?.world_model_active ? '#a855f7' : '#475569',
                    boxShadow: runtimeTruth?.world_model_active ? '0 0 6px rgba(168,85,247,0.5)' : 'none',
                  }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#C0C8D4', minWidth: 60 }}>World Model</span>
                  <span style={{ fontSize: '0.68rem', color: '#5d6674' }}>
                    {runtimeTruth?.physical_layer_status || (runtimeTruth?.world_model_active ? 'Active' : 'Standby')}
                  </span>
                </div>
                {runtimeTruth?.blockers?.[0] && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, flexShrink: 0, background: '#ef4444' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#C0C8D4', minWidth: 60 }}>Blocker</span>
                    <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{runtimeTruth.blockers[0]}</span>
                  </div>
                )}
                {groq.voiceError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, flexShrink: 0, background: '#ef4444' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#C0C8D4', minWidth: 60 }}>Error</span>
                    <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{groq.voiceError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task panel collapsible */}
          <button
            onClick={() => setShowTaskPanel((c) => !c)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: 'transparent',
              border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
              color: '#7B8696', cursor: 'pointer',
              fontSize: '0.7rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              flexShrink: 0,
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Zap size={11} color={tasks.some((t) => t.status === 'running') ? '#22c55e' : '#475569'} />
            Tasks
            {tasks.length > 0 && (
              <span style={{
                padding: '1px 6px', borderRadius: 999,
                background: 'rgba(255,255,255,0.06)', fontSize: '0.62rem',
              }}>
                {tasks.length}
              </span>
            )}
            <ChevronRight
              size={10}
              style={{
                marginLeft: 'auto',
                transform: showTaskPanel ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>

          {showTaskPanel && (
            <div style={{
              padding: '8px 16px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              flexShrink: 0,
              maxHeight: 140,
              overflow: 'auto',
            }}>
              {tasks.length === 0 ? (
                <div style={{ fontSize: '0.72rem', color: '#475569', padding: '8px 0', textAlign: 'center' }}>
                  No active tasks. Singularity executor idle.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tasks.map((task) => (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                        background: task.status === 'running' ? '#22c55e' : task.status === 'completed' ? '#3b82f6' : task.status === 'failed' ? '#ef4444' : '#475569',
                      }} />
                      <span style={{ fontSize: '0.72rem', color: '#C0C8D4', flex: 1 }}>{task.label}</span>
                      {task.progress !== undefined && (
                        <span style={{ fontSize: '0.62rem', color: '#5d6674' }}>{task.progress}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==== Chat messages ==== */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            {/* Chat header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              flexShrink: 0,
            }}>
              <MessageSquare size={13} color={cfg.accent} />
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#A0A8B4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Conversation
              </span>
              {conversationId && (
                <span style={{ fontSize: '0.6rem', color: '#3B4452', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {conversationId.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {messages.length === 0 && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', flex: 1, gap: 10,
                  color: '#4B5563', textAlign: 'center', padding: '40px 16px',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 16,
                    background: `${cfg.accent}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={22} color={cfg.accent} style={{ opacity: 0.7 }} />
                  </div>
                  <p style={{ fontSize: '0.94rem', color: '#C9D0DA', maxWidth: 320, lineHeight: 1.5 }}>
                    {cfg.greeting}
                  </p>
                  <p style={{ fontSize: '0.76rem', color: '#5d6674', maxWidth: 280 }}>
                    Talk, type, or start a live call. {cfg.name} can see through your camera and share your screen.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  data-testid={`message-${msg.role}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '88%',
                    padding: '10px 14px',
                    borderRadius: 16,
                    fontSize: '0.88rem',
                    lineHeight: 1.55,
                    ...(msg.role === 'user'
                      ? {
                        background: 'rgba(255,255,255,0.07)',
                        borderBottomRightRadius: 4,
                        color: '#E8ECF2',
                      }
                      : msg.role === 'system'
                        ? {
                          background: 'rgba(255,200,0,0.06)',
                          border: '1px solid rgba(255,200,0,0.12)',
                          color: '#FFD066',
                          fontSize: '0.78rem',
                        }
                        : {
                          background: `${AVATAR_CONFIG[msg.actor || actor].accent}0D`,
                          border: `1px solid ${AVATAR_CONFIG[msg.actor || actor].accent}22`,
                          borderBottomLeftRadius: 4,
                          color: '#E8ECF2',
                        }),
                  }}>
                    {msg.role === 'assistant' && (
                      <div style={{
                        fontSize: '0.62rem', fontWeight: 700,
                        color: AVATAR_CONFIG[msg.actor || actor].accent,
                        marginBottom: 3, textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}>
                        {AVATAR_CONFIG[msg.actor || actor].name}
                      </div>
                    )}
                    {msg.text}
                  </div>
                  <span style={{
                    fontSize: '0.58rem', color: '#3B4452',
                    marginTop: 3,
                    padding: '0 4px',
                  }}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              ))}

              {isTyping && (
                <div style={{ display: 'flex' }}>
                  <div style={{
                    padding: '10px 14px', borderRadius: 16, borderBottomLeftRadius: 4,
                    background: `${cfg.accent}0D`, border: `1px solid ${cfg.accent}22`,
                  }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{
                          width: 5, height: 5, borderRadius: 999,
                          background: cfg.accent, opacity: 0.6,
                          animation: `dot-bounce 1s ${i * 0.15}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick actions */}
            {messages.length === 0 && (
              <div style={{
                display: 'flex', gap: 6, padding: '0 16px 8px',
                flexWrap: 'wrap', flexShrink: 0,
              }}>
                {[
                  { label: 'Check my screen', action: () => { void visionActions.startScreenShare(); } },
                  { label: 'What can you do?', action: () => { setDraft('What can you do?'); setTimeout(() => inputRef.current?.focus(), 50); } },
                  { label: 'Start a task', action: () => { setDraft('I need help with '); setTimeout(() => inputRef.current?.focus(), 50); } },
                ].map((q) => (
                  <button
                    key={q.label}
                    onClick={q.action}
                    style={{
                      padding: '7px 12px', borderRadius: 999,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: '#8B95A3', fontSize: '0.74rem', fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{
              display: 'flex', gap: 8,
              padding: '10px 16px 14px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
              background: 'rgba(5,6,8,0.5)',
            }}>
              <input
                data-testid="assistant-input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={`Message ${cfg.name}...`}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#E8E8E8',
                  fontSize: '0.88rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                data-testid="assistant-send"
                onClick={() => { void handleSend(); }}
                disabled={!draft.trim() || isTyping}
                style={{
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: draft.trim() ? cfg.accent : 'rgba(255,255,255,0.05)',
                  color: draft.trim() ? '#000' : '#4B5563',
                  cursor: draft.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Animations ---- */}
      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes dot-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
      `}</style>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function CallButton({ icon, label, active, connecting, accent, onClick, disabled, primary, dataTestId }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  connecting?: boolean;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  dataTestId?: string;
}) {
  const size = primary ? 48 : 40;
  return (
    <button
      data-testid={dataTestId}
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active
          ? accent
          : connecting
            ? `${accent}40`
            : 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${active ? accent : connecting ? `${accent}60` : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#fff' : '#A0A8B4',
        transition: 'all 0.2s',
        boxShadow: active ? `0 0 20px ${accent}40` : 'none',
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: '0.58rem',
        fontWeight: 600,
        color: active ? '#E8ECF2' : '#5d6674',
        maxWidth: 56,
        textAlign: 'center',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </button>
  );
}
