export type AvatarActorId = 'jack' | 'julia';
export type AvatarId = AvatarActorId;

export type AvatarPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AvatarCapabilityStatus = 'live' | 'fallback' | 'staged' | 'offline';
export type AvatarRenderMode = 'video' | 'canvas_2d' | 'audio2face' | 'personaplex' | 'pixel_stream' | 'canvas_2d_live';

export type AvatarReferenceSource = {
  kind: 'video' | 'image';
  path: string;
  role: 'identity' | 'poster' | 'motion_fallback' | 'reference_frame';
  notes?: string;
};

export type AvatarRenderCalibration = {
  jawScale: number;
  mouthWidthScale: number;
  lipPuckerScale: number;
  upperLipScale: number;
  lowerLipScale: number;
  browScale: number;
  gazeScale: number;
  headMotionScale: number;
  breathScale: number;
  mouthCenterY: number;
  eyeLineY: number;
};

export type AvatarIdentityLock = {
  locked: boolean;
  referencePackId: string;
  canonicalFaceId: string;
  likenessGuardVersion: string;
  protectedTraits: string[];
  approvedWardrobes: string[];
  allowedRuntimeFamilies: string[];
  renderCalibration: AvatarRenderCalibration;
};

export type AvatarVisualDNA = {
  primaryGlow: string;
  secondaryGlow: string;
  actionAccent: string;
  baseObsidian: string;
  frostHighlight: string;
  keyLight: string;
  rimLight: string;
  shadowBase: string;
  typography: {
    display: string;
    body: string;
  };
};

export type AvatarProfile = {
  actorId: AvatarActorId;
  name: string;
  title: string;
  greeting: string;
  accent: string;
  secondaryAccent: string;
  gradient: string;
  voiceId: string;
  media: {
    poster: string;
    idleVideo: string;
    speakingVideo: string;
    ambientVideo: string;
  };
  visualDNA: AvatarVisualDNA;
  referenceSources: AvatarReferenceSource[];
  identityLock: AvatarIdentityLock;
  runtimeTargets: {
    animationEngine: 'audio2face' | 'personaplex' | 'video_fallback';
    renderTarget: 'webgl' | 'webgpu' | 'fallback_video';
    qualityTier: 'desktop_lod0' | 'adaptive_mobile';
  };
  personaNotes: {
    tone: string;
    greetingStyle: string;
    emotionalRange: string[];
  };
};

export type AvatarRuntimeState = {
  actorId: AvatarActorId;
  presenceState: AvatarPresenceState;
  avatar_render_live: boolean;
  avatar_identity_locked: boolean;
  avatar_animation_live: boolean;
  lip_sync_live: boolean;
  face_expression_live: boolean;
  facial_expression_live: boolean;
  voice_output_live: boolean;
  voice_input_live: boolean;
  camera_perception_live: boolean;
  memory_loaded: boolean;
  fallback_mode_active: boolean;
  personaplex_live: boolean;
  audio2face_live: boolean;
  semantic_vision_live: boolean;
  frames_receiving: boolean;
  visual_pipeline_ready: boolean;
  room_connected: boolean;
  transport_connected: boolean;
  mic_live: boolean;
  speaker_live: boolean;
  audio_unlocked: boolean;
  controller_role: string;
  world_model_live: boolean;
  scene_initialized_live: boolean;
  render_node_live: boolean;
  render_engine_target: string;
  render_engine_actual: string;
  meta_avatar_live: boolean;
  metahuman_path_live: boolean;
  body_gesture_live: boolean;
  cinematic_quality_live: boolean;
  cinematic_4k_live: boolean;
  live_4k: boolean;
  cosmos_world_layer_live: boolean;
  avatar_resolution_actual: string;
  wardrobe_swap_live: boolean;
  jack_scene_attached: boolean;
  julia_scene_attached: boolean;
  render_mode: 'audio2face' | 'personaplex' | 'canvas_2d_live' | 'video_fallback' | 'poster_fallback';
  animation_status: AvatarCapabilityStatus;
  vision_status: AvatarCapabilityStatus;
  memory_status: AvatarCapabilityStatus;
};

export type AvatarTruthState = {
  avatar_render_live: boolean;
  avatar_identity_locked: boolean;
  avatar_animation_live: boolean;
  lip_sync_live: boolean;
  face_expression_live: boolean;
  facial_expression_live: boolean;
  voice_output_live: boolean;
  voice_input_live: boolean;
  camera_perception_live: boolean;
  memory_loaded: boolean;
  fallback_mode_active: boolean;
};

export type AvatarCapabilityChip = {
  label: string;
  detail: string;
  status: AvatarCapabilityStatus;
  tone?: string;
};

export type AvatarAnimationBridgeState = {
  headline: string;
  subline: string;
  renderBadge: string;
  presenceLabel: string;
  signalTone: string;
  motionScale: number;
  haloOpacity: number;
  speechMeterActive: boolean;
  liveDescriptor: string;
  capabilityChips: AvatarCapabilityChip[];
};
