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
import { DigitalHumanStage } from '../../components/avatar/DigitalHumanStage';
import { useAvatarAnimationBridge } from '../../components/avatar/useAvatarAnimationBridge';
import { useAvatarRuntime } from '../../components/avatar/useAvatarRuntime';
import { useVisionCapture } from '../../hooks/useVisionCapture';
import { useGroqVoice } from '../../hooks/useGroqVoice';
import { useRealtimeLipSync } from '../../hooks/useRealtimeLipSync';
import { useLiveKitRoom } from '../../hooks/useLiveKitRoom';
import { getStableBrowserUserId, persistBrowserUserId } from '../../lib/browser-user-id';
import { jackAvatarProfile, juliaAvatarProfile } from '../../lib/avatars';

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
  avatar_animation_live?: boolean;
  lip_sync_live: boolean;
  lip_sync_provider?: string;
  lip_sync_realtime_capable?: boolean;
  lip_sync_async_available?: boolean;
  lip_sync_client_integrated?: boolean;
  render_mode?: string;
  render_engine_target?: string;
  render_engine_actual?: string;
  voice_output_live: boolean;
  voice_input_live: boolean;
  vision_live: boolean;
  semantic_vision_live?: boolean;
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
  world_model_live?: boolean;
  scene_initialized_live?: boolean;
  scene_persistence_live?: boolean;
  actor_grounding_live?: boolean;
  controller_role?: string;
  jack_scene_attached?: boolean;
  julia_scene_attached?: boolean;
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

const AVATAR_PROFILES = {
  jack: jackAvatarProfile,
  julia: juliaAvatarProfile,
} as const;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSessionStorageKey(actor: ActorId): string {
  return `agi1.neural.conversation.${actor}`;
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

async function recordFeatureConsent(
  featureName: string,
  action: 'grant' | 'revoke' | 'deny',
  source: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await fetch('/api/user/feature-consents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature_name: featureName,
        action,
        source,
        metadata,
      }),
    });
  } catch {
    // Consent telemetry must not break the realtime UX.
  }
}

function normalizeRuntimeTruth(data: any): RuntimeTruth | null {
  if (!data || typeof data !== 'object') return null;
  const physicalLayer = data.physical_layer && typeof data.physical_layer === 'object'
    ? data.physical_layer
    : {};
  const runtimeBlockers = [
    ...(Array.isArray(data.blockers) ? data.blockers : []),
    ...(Array.isArray(physicalLayer.blockers) ? physicalLayer.blockers : []),
    ...(data.truth && Array.isArray(data.truth.blockers) ? data.truth.blockers : []),
  ].filter((value, index, list) => typeof value === 'string' && list.indexOf(value) === index);

  if (data.truth && typeof data.truth === 'object') {
    return {
      ...data.truth,
      voice_transport: data.voice_transport ?? data.truth.voice_transport,
      full_duplex_live: data.full_duplex_live ?? data.truth.full_duplex_live,
      personaplex_live: data.personaplex_live ?? data.truth.personaplex_live,
      audio2face_live: data.audio2face_live ?? data.truth.audio2face_live,
      render_node_live: data.render_node_live ?? data.truth.render_node_live,
      meta_avatar_live: data.meta_avatar_live ?? data.truth.meta_avatar_live,
      body_gesture_live: data.body_gesture_live ?? data.truth.body_gesture_live,
      facial_expression_live: data.facial_expression_live ?? data.truth.facial_expression_live,
      cinematic_quality_live: data.cinematic_quality_live ?? data.truth.cinematic_quality_live,
      cinematic_4k_live: data.cinematic_4k_live ?? data.truth.cinematic_4k_live,
      live_4k: data.live_4k ?? data.truth.live_4k,
      avatar_resolution_actual: data.avatar_resolution_actual ?? data.truth.avatar_resolution_actual,
      wardrobe_swap_live: data.wardrobe_swap_live ?? data.truth.wardrobe_swap_live,
      world_model_live: physicalLayer.world_model_live ?? data.truth.world_model_live,
      cosmos_world_layer_live: data.cosmos_world_layer_live ?? data.truth.cosmos_world_layer_live,
      scene_initialized_live: physicalLayer.scene_initialized_live ?? data.truth.scene_initialized_live,
      scene_persistence_live: physicalLayer.scene_persistence_live ?? data.truth.scene_persistence_live,
      actor_grounding_live: physicalLayer.actor_grounding_live ?? data.truth.actor_grounding_live,
      controller_role: data.controller_role ?? physicalLayer.controller_role ?? data.truth.controller_role,
      avatar_identity_locked: data.avatar_identity_locked ?? data.truth.avatar_identity_locked,
      jack_scene_attached: data.jack_scene_attached ?? data.truth.jack_scene_attached,
      julia_scene_attached: data.julia_scene_attached ?? data.truth.julia_scene_attached,
      metahuman_path_live: data.metahuman_path_live ?? data.truth.metahuman_path_live,
      blockers: runtimeBlockers,
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
    audio2face_live: Boolean(data.audio2face_live),
    render_node_live: Boolean(data.render_node_live),
    render_engine_target: data.render_engine_target || undefined,
    render_engine_actual: data.render_engine_actual || undefined,
    meta_avatar_live: Boolean(data.meta_avatar_live),
    metahuman_path_live: Boolean(data.metahuman_path_live ?? data.meta_avatar_live),
    body_gesture_live: Boolean(data.body_gesture_live),
    facial_expression_live: Boolean(data.facial_expression_live),
    cinematic_quality_live: Boolean(data.cinematic_quality_live),
    cinematic_4k_live: Boolean(data.cinematic_4k_live),
    live_4k: Boolean(data.live_4k ?? data.cinematic_4k_live),
    cosmos_world_layer_live: Boolean(data.cosmos_world_layer_live),
    avatar_resolution_actual: data.avatar_resolution_actual || undefined,
    wardrobe_swap_live: Boolean(data.wardrobe_swap_live),
    world_model_live: Boolean(physicalLayer.world_model_live),
    scene_initialized_live: Boolean(physicalLayer.scene_initialized_live),
    scene_persistence_live: Boolean(physicalLayer.scene_persistence_live),
    actor_grounding_live: Boolean(physicalLayer.actor_grounding_live),
    controller_role: data.controller_role || physicalLayer.controller_role || undefined,
    avatar_identity_locked: Boolean(data.avatar_identity_locked),
    jack_scene_attached: Boolean(data.jack_scene_attached),
    julia_scene_attached: Boolean(data.julia_scene_attached),
    blockers: runtimeBlockers,
  };
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
  const [conversationId, setConversationId] = useState('');

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
  const cameraConsentLoggedRef = useRef(false);
  const cameraDeniedLoggedRef = useRef(false);
  const liveVoiceConsentLoggedRef = useRef(false);

  // Stable canvas ref — getCanvas() returns the same element each time,
  // but calling it in render creates a new object reference for React.
  // Store the result once so the AvatarStage useEffect doesn't re-fire.
  const lipSyncCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!lipSyncCanvasRef.current) {
    lipSyncCanvasRef.current = lipSyncActions.getCanvas();
  }

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
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
    return lastAssistantMessage?.text || cfg.greeting;
  }, [cfg.greeting, messages]);

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
    worldModelLive: runtimeTruth?.world_model_live,
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

  // Load portrait into lip-sync engine when actor changes
  useEffect(() => {
    lipSyncActions.setPortraitSrc(avatarProfile.media.poster);
    lipSyncActions.setRenderCalibration(avatarProfile.identityLock.renderCalibration);
    // Also get the canvas ready
    lipSyncActions.getCanvas();
  }, [avatarProfile.identityLock.renderCalibration, avatarProfile.media.poster, lipSyncActions]);

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
    if (vision.visionMode === 'camera' && vision.visionState === 'camera_live' && !cameraConsentLoggedRef.current) {
      cameraConsentLoggedRef.current = true;
      cameraDeniedLoggedRef.current = false;
      void recordFeatureConsent('camera', 'grant', 'jit_camera_prompt', {
        actor,
        mode: vision.visionMode,
      });
    }

    if (vision.visionState === 'error_camera' && !cameraDeniedLoggedRef.current) {
      cameraDeniedLoggedRef.current = true;
      cameraConsentLoggedRef.current = false;
      void recordFeatureConsent('camera', 'deny', 'jit_camera_prompt', {
        actor,
        error: vision.visionError || 'camera_access_failed',
      });
    }

    if (vision.visionMode === 'off') {
      cameraConsentLoggedRef.current = false;
      if (vision.visionState !== 'error_camera') {
        cameraDeniedLoggedRef.current = false;
      }
    }
  }, [actor, vision.visionError, vision.visionMode, vision.visionState]);

  useEffect(() => {
    if (liveRoom.roomStatus === 'connected' && !liveVoiceConsentLoggedRef.current) {
      liveVoiceConsentLoggedRef.current = true;
      void Promise.all([
        recordFeatureConsent('live_voice', 'grant', 'jit_live_call_prompt', { actor, room_id: liveRoom.roomId || undefined }),
        recordFeatureConsent('microphone', 'grant', 'jit_live_call_prompt', { actor, room_id: liveRoom.roomId || undefined }),
      ]);
    }

    if (liveRoom.roomStatus === 'disconnected') {
      liveVoiceConsentLoggedRef.current = false;
    }
  }, [actor, liveRoom.roomId, liveRoom.roomStatus]);

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
    setConversationId(readStoredConversationId(actor));
  }, [actor]);

  useEffect(() => {
    persistConversationId(actor, conversationId);
  }, [actor, conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('actor') === actor) return;
    url.searchParams.set('actor', actor);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [actor]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    (window as typeof window & { __AGI1_NEURAL_DEBUG__?: Record<string, unknown> }).__AGI1_NEURAL_DEBUG__ = {
      actor,
      presence_state: presenceState,
      room_connected: liveCallActive,
      transport_connected: liveRoom.transportConnected,
      mic_live: liveRoom.micLive || voiceMode === 'recording',
      speaker_live: liveRoom.speakerLive || groq.isSpeaking || liveRoom.isAgentSpeaking,
      avatar_render_live: avatarRuntime.avatar_render_live,
      avatar_identity_locked: avatarRuntime.avatar_identity_locked,
      avatar_animation_live: avatarRuntime.avatar_animation_live,
      lip_sync_live: avatarRuntime.lip_sync_live,
      face_expression_live: avatarRuntime.face_expression_live,
      facial_expression_live: avatarRuntime.facial_expression_live,
      voice_output_live: avatarRuntime.voice_output_live,
      voice_input_live: avatarRuntime.voice_input_live,
      camera_perception_live: avatarRuntime.camera_perception_live,
      semantic_vision_live: avatarRuntime.semantic_vision_live,
      visual_pipeline_ready: avatarRuntime.visual_pipeline_ready,
      frames_receiving: avatarRuntime.frames_receiving,
      memory_loaded: avatarRuntime.memory_loaded,
      fallback_mode_active: avatarRuntime.fallback_mode_active,
      render_mode: avatarRuntime.render_mode,
      lip_sync_provider: runtimeTruth?.lip_sync_provider || 'browser_canvas',
      lip_sync_realtime_capable: runtimeTruth?.lip_sync_realtime_capable ?? lipSyncState.isActive,
      personaplex_live: avatarRuntime.personaplex_live,
      audio2face_live: avatarRuntime.audio2face_live,
      voice_transport: runtimeTruth?.voice_transport || liveRoom.provider || null,
      full_duplex_live: runtimeTruth?.full_duplex_live ?? false,
      controller_role: avatarRuntime.controller_role,
      render_node_live: avatarRuntime.render_node_live,
      render_engine_target: avatarRuntime.render_engine_target,
      render_engine_actual: avatarRuntime.render_engine_actual,
      meta_avatar_live: avatarRuntime.meta_avatar_live,
      metahuman_path_live: avatarRuntime.metahuman_path_live,
      body_gesture_live: avatarRuntime.body_gesture_live,
      cinematic_quality_live: avatarRuntime.cinematic_quality_live,
      cinematic_4k_live: avatarRuntime.cinematic_4k_live,
      live_4k: avatarRuntime.live_4k,
      cosmos_world_layer_live: avatarRuntime.cosmos_world_layer_live,
      avatar_resolution_actual: avatarRuntime.avatar_resolution_actual,
      wardrobe_swap_live: avatarRuntime.wardrobe_swap_live,
      world_model_live: avatarRuntime.world_model_live,
      scene_initialized_live: avatarRuntime.scene_initialized_live,
      jack_scene_attached: avatarRuntime.jack_scene_attached,
      julia_scene_attached: avatarRuntime.julia_scene_attached,
      last_analysis: vision.lastAnalysis || null,
      frame_count: vision.frameCount,
      lip_sync_fps: lipSyncState.fps,
      conversation_id: conversationId || null,
    };
  }, [
    actor,
    avatarRuntime,
    conversationId,
    groq.isSpeaking,
    liveCallActive,
    liveRoom.isAgentSpeaking,
    liveRoom.micLive,
    liveRoom.provider,
    liveRoom.speakerLive,
    liveRoom.transportConnected,
    lipSyncState.fps,
    lipSyncState.isActive,
    presenceState,
    runtimeTruth,
    vision.frameCount,
    vision.lastAnalysis,
    voiceMode,
  ]);

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
        await recordFeatureConsent('microphone', 'grant', 'jit_push_to_talk', { actor });
        await groqActions.startListening();
        setVoiceMode('recording');
      } catch (err) {
        console.error('[Neural] Mic access failed:', err);
        await recordFeatureConsent('microphone', 'deny', 'jit_push_to_talk', {
          actor,
          error: err instanceof Error ? err.message : 'mic_access_failed',
        });
        appendMessage('system', 'Microphone access denied. Allow mic access and try again.');
      }
    }
  }, [actor, appendMessage, groqActions, liveCallActive, speakWithLipSync, userId, vision.lastAnalysis, voiceMode]);

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

  // ============================================================
  // Text chat → Groq LLM → Groq Orpheus TTS + Lip Sync
  // ============================================================

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
    actor,
    appendMessage,
    conversationId,
    draft,
    groqActions,
    liveCallActive,
    lipSyncActions,
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
    setConversationId(readStoredConversationId(nextActor));
    setActor(nextActor);
  }, [actor, groqActions, lipSyncActions, liveRoomActions]);

  const avatarSurfaceLive = lipSyncState.isActive || lipSyncState.isRendering;
  const avatarStatusLabel = lipSyncState.isActive
    ? `Lip-sync live ${lipSyncState.fps}fps`
    : lipSyncState.isRendering
      ? 'Portrait render live'
      : 'Video fallback';
  const avatarStatusAccent = lipSyncState.isActive
    ? '#a855f7'
    : lipSyncState.isRendering
      ? '#22c55e'
      : '#475569';
  const avatarRuntimeDetail = lipSyncState.isActive
    ? `Browser portrait lip-sync live — ${lipSyncState.fps}fps`
    : lipSyncState.isRendering
      ? 'Portrait canvas live — idle motion active'
      : runtimeTruth?.cinematic_4k_live
        ? `GPU avatar live — ${runtimeTruth.avatar_resolution_actual || '4K'}`
        : runtimeTruth?.render_node_live
          ? `GPU render node ready — ${runtimeTruth.render_engine_actual || 'renderer'}`
          : runtimeTruth?.personaplex_live
            ? 'PersonaPlex runtime connected'
            : 'Reference video fallback active — GPU avatar runtime not connected';

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
      label: avatarStatusLabel,
      active: avatarSurfaceLive,
      accent: avatarStatusAccent,
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
            <button key={a} data-testid={`actor-${a}`} onClick={() => switchActor(a)} style={{
              padding: '6px 18px', borderRadius: 999, border: 'none',
              background: a === actor ? AVATAR_CONFIG[a].accent : 'transparent',
              color: a === actor ? '#000' : '#96a0af',
              fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            }}>{AVATAR_CONFIG[a].name}</button>
          ))}
        </div>

        <button data-testid="toggle-status" onClick={() => setShowStatus((c) => !c)} style={{
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
        <div data-testid="status-panel" style={{ padding: '12px 20px', background: 'rgba(10,12,16,0.96)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.75rem', color: '#8b95a3' }}>
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
            label="Avatar Runtime"
            active={avatarRuntime.avatar_render_live}
            detail={
              lipSyncState.isActive
                ? `${avatarRuntimeDetail}, jaw=${lipSyncState.viseme.jawOpen.toFixed(2)}`
                : avatarRuntimeDetail
            }
          />
          <StatusDot label="Animation" active={avatarRuntime.avatar_animation_live} detail={avatarRuntime.avatar_animation_live ? avatarRuntime.render_mode : 'Fallback only'} />
          <StatusDot label="Lip Sync" active={avatarRuntime.lip_sync_live} detail={avatarRuntime.lip_sync_live ? 'Live' : 'Staged'} />
          <StatusDot label="Identity" active={avatarRuntime.avatar_identity_locked} detail={avatarRuntime.avatar_identity_locked ? 'Locked' : 'Not locked'} />
          <StatusDot
            label="Render Node"
            active={Boolean(runtimeTruth?.render_node_live)}
            detail={runtimeTruth?.render_node_live ? (runtimeTruth.render_engine_actual || 'Renderer live') : 'Offline'}
          />
          <StatusDot
            label="Scene"
            active={Boolean(runtimeTruth?.scene_initialized_live)}
            detail={runtimeTruth?.scene_initialized_live ? `war_room_v1 • ${runtimeTruth?.controller_role || 'controller'}` : 'Scene staged'}
          />
          <StatusDot
            label="Resolution"
            active={Boolean(runtimeTruth?.cinematic_4k_live)}
            detail={runtimeTruth?.avatar_resolution_actual || 'Not reported'}
          />
          <StatusDot
            label="Meta Path"
            active={Boolean(runtimeTruth?.metahuman_path_live)}
            detail={runtimeTruth?.metahuman_path_live ? 'Active' : 'Staged'}
          />
          <StatusDot
            label="Cosmos World"
            active={Boolean(runtimeTruth?.cosmos_world_layer_live)}
            detail={runtimeTruth?.cosmos_world_layer_live ? 'Live world layer' : 'Not active'}
          />
          <StatusDot label="Voice Input" active={avatarRuntime.voice_input_live} detail={avatarRuntime.voice_input_live ? 'Live' : 'Waiting'} />
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
          <DigitalHumanStage
            profile={avatarProfile}
            presenceState={presenceState as 'idle' | 'listening' | 'thinking' | 'speaking'}
            runtime={avatarRuntime}
            bridge={avatarBridge}
            liveCanvas={lipSyncCanvasRef.current}
            liveCanvasActive={lipSyncState.isActive || lipSyncState.isRendering}
            audioLevel={audioLevel}
            primaryActions={
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                maxWidth: '100%',
              }}>
                <PrimaryAction
                  label={liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media' ? 'Live call active' : 'Connect voice'}
                  onClick={() => { void handleLiveCallToggle(); }}
                  accent={liveCallActive ? '#22c55e' : '#8b5cf6'}
                  active={liveCallActive || liveRoom.roomStatus === 'connecting' || liveRoom.roomStatus === 'requesting_media'}
                />
                <PrimaryAction
                  label={visualPipelineReady ? 'Camera live' : 'Camera on'}
                  onClick={() => {
                    if (visualPipelineReady || vision.visionState === 'paused') {
                      visionActions.stopVision();
                    } else {
                      void visionActions.startCamera();
                    }
                  }}
                  accent={visualPipelineReady ? cfg.accent : '#3c4657'}
                  active={visualPipelineReady}
                />
                <PrimaryAction
                  label="Scan frame"
                  onClick={() => {
                    void visionActions.captureAndAnalyze(actor, 'Describe what you see right now.', {
                      userId,
                      callSessionId: liveRoom.sessionId || undefined,
                    }).then((analysis) => {
                      if (analysis) {
                        appendMessage('assistant', analysis);
                        void speakWithLipSync(analysis, actor);
                      }
                    });
                  }}
                  accent={Boolean(vision.lastAnalysis) ? cfg.accent : '#FF8A00'}
                  active={visualPipelineReady}
                  disabled={!visualPipelineReady}
                />
              </div>
            }
            cameraPreview={vision.cameraStream ? (
              <div
                data-testid="camera-pip"
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.22)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.36)',
                  background: '#091018',
                }}
              >
                <video
                  ref={cameraVideoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: vision.visionMode === 'camera' ? 'scaleX(-1)' : 'none' }}
                  autoPlay
                  muted
                  playsInline
                />
                <div style={{ position: 'absolute', left: 6, top: 6, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 999, background: 'rgba(5,6,8,0.72)', color: '#F5F7FB', fontSize: '0.6rem', fontWeight: 700 }}>
                  <Eye size={10} />{vision.isAnalyzing ? 'Analyzing' : vision.visionMode === 'screen' ? 'Screen' : 'Camera'}
                </div>
              </div>
            ) : null}
          />
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
            dataTestId="start-live-call"
          />
          <QuickControl icon={groq.muted ? <VolumeX size={16} /> : <Volume2 size={16} />} label={groq.muted ? 'Unmute' : 'Mute'} active={!groq.muted} onClick={() => groqActions.setMuted(!groq.muted)} dataTestId="toggle-output-audio" />
          <QuickControl
            icon={voiceMode === 'recording' ? <MicOff size={16} /> : <Mic size={16} />}
            label={liveCallActive ? 'Push-to-talk off' : voiceMode === 'recording' ? 'Stop' : voiceMode === 'processing' ? 'Processing...' : `Talk to ${cfg.name}`}
            active={voiceMode === 'recording'} accent={voiceMode === 'recording' ? '#ef4444' : cfg.accent}
            onClick={() => { void handleMicToggle(); }} disabled={voiceMode === 'processing' || liveCallActive} large dataTestId="push-to-talk"
          />
          {liveCallActive && (
            <QuickControl
              icon={liveRoom.micLive ? <Mic size={16} /> : <MicOff size={16} />}
              label={liveRoom.micLive ? 'Mute call mic' : 'Unmute call mic'}
              active={liveRoom.micLive}
              accent={cfg.accent}
              onClick={() => { liveRoomActions.toggleMic(); }}
              dataTestId="toggle-call-mic"
            />
          )}
          {liveRoom.speakerBlocked && (
            <QuickControl
              icon={<Volume2 size={16} />}
              label="Enable call audio"
              active={false}
              accent="#22c55e"
              onClick={() => { void liveRoomActions.enableSpeakerAudio(); }}
              dataTestId="enable-call-audio"
            />
          )}
          <QuickControl icon={visualPipelineReady ? <CameraOff size={16} /> : <Camera size={16} />} label={visualPipelineReady ? 'Camera off' : 'Camera on'} active={visualPipelineReady} accent={cfg.accent}
            onClick={() => { if (visualPipelineReady || vision.visionState === 'paused') visionActions.stopVision(); else void visionActions.startCamera(); }} dataTestId="toggle-camera" />
          <QuickControl icon={<Monitor size={16} />} label={vision.visionMode === 'screen' ? 'Stop' : 'Screen'} active={vision.visionMode === 'screen'} accent={cfg.accent}
            onClick={() => { if (vision.visionMode === 'screen') visionActions.stopVision(); else void visionActions.startScreenShare(); }} dataTestId="toggle-screen" />
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
              <div key={msg.id} data-testid={`message-${msg.role}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', padding: '0 4px' }}>
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
              <input data-testid="neural-input" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={`Message ${cfg.name}...`}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#E8E8E8', fontSize: '0.92rem', outline: 'none', fontFamily: 'inherit' }}
            />
            <button data-testid="neural-send" onClick={() => { void handleSend(); }} disabled={!draft.trim() || isTyping}
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

function QuickControl({ icon, label, active, accent, onClick, disabled, large, dataTestId }: {
  icon: React.ReactNode; label: string; active: boolean; accent?: string; onClick: () => void; disabled?: boolean; large?: boolean; dataTestId?: string;
}) {
  const color = accent || '#00AEEF';
  return (
    <button data-testid={dataTestId} onClick={onClick} disabled={disabled} title={label} style={{
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

function PrimaryAction({ label, onClick, accent, active, disabled }: {
  label: string;
  onClick: () => void;
  accent: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? `${accent}80` : 'rgba(255,255,255,0.10)'}`,
        background: active ? `${accent}20` : 'rgba(5,6,8,0.58)',
        color: disabled ? '#687484' : '#F5F7FB',
        backdropFilter: 'blur(12px)',
        fontSize: '0.8rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}
