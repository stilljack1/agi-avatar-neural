'use client';

import { useMemo } from 'react';
import type {
  AvatarActorId,
  AvatarIdentityLock,
  AvatarPresenceState,
  AvatarRuntimeState,
} from '../../lib/avatars';

type UseAvatarRuntimeInput = {
  actorId: AvatarActorId;
  identityLock: AvatarIdentityLock;
  presenceState: AvatarPresenceState;
  roomConnected: boolean;
  transportConnected: boolean;
  micLive: boolean;
  speakerLive: boolean;
  audioUnlocked: boolean;
  visualPipelineReady: boolean;
  framesReceiving: boolean;
  semanticVisionLive: boolean;
  memoryLoaded: boolean;
  personaplexLive: boolean;
  audio2faceLive: boolean;
  controllerRole?: string;
  worldModelLive?: boolean;
  sceneInitializedLive?: boolean;
  renderNodeLive?: boolean;
  renderEngineTarget?: string;
  renderEngineActual?: string;
  metaAvatarLive?: boolean;
  metahumanPathLive?: boolean;
  bodyGestureLive?: boolean;
  cosmosWorldLayerLive?: boolean;
  cinematic4kLive?: boolean;
  avatarResolutionActual?: string;
  wardrobeSwapLive?: boolean;
  jackSceneAttached?: boolean;
  juliaSceneAttached?: boolean;
  browserCanvasLive?: boolean;
  browserCanvasLipSyncLive?: boolean;
};

export function useAvatarRuntime(input: UseAvatarRuntimeInput): AvatarRuntimeState {
  return useMemo(() => {
    const browserCanvasLive = Boolean(input.browserCanvasLive);
    const avatarAnimationLive = Boolean(browserCanvasLive || input.audio2faceLive || input.personaplexLive);
    const lipSyncLive = Boolean(input.browserCanvasLipSyncLive || input.audio2faceLive);
    const faceExpressionLive = Boolean(browserCanvasLive || input.personaplexLive || input.audio2faceLive);
    const voiceOutputLive = Boolean(input.speakerLive && input.audioUnlocked);
    const voiceInputLive = Boolean(input.micLive && input.transportConnected);
    const cameraPerceptionLive = Boolean(
      input.visualPipelineReady && input.framesReceiving && input.semanticVisionLive,
    );
    const fallbackModeActive = !(browserCanvasLive || input.audio2faceLive || input.personaplexLive);
    const renderMode = input.audio2faceLive
      ? 'audio2face'
      : input.personaplexLive
        ? 'personaplex'
        : browserCanvasLive
          ? 'canvas_2d_live'
          : 'video_fallback';

    return {
      actorId: input.actorId,
      presenceState: input.presenceState,
      avatar_render_live: true,
      avatar_identity_locked: Boolean(input.identityLock.locked),
      avatar_animation_live: avatarAnimationLive,
      lip_sync_live: lipSyncLive,
      face_expression_live: faceExpressionLive,
      facial_expression_live: faceExpressionLive,
      voice_output_live: voiceOutputLive,
      voice_input_live: voiceInputLive,
      camera_perception_live: cameraPerceptionLive,
      memory_loaded: input.memoryLoaded,
      fallback_mode_active: fallbackModeActive,
      personaplex_live: input.personaplexLive,
      audio2face_live: input.audio2faceLive,
      semantic_vision_live: input.semanticVisionLive,
      frames_receiving: input.framesReceiving,
      visual_pipeline_ready: input.visualPipelineReady,
      room_connected: input.roomConnected,
      transport_connected: input.transportConnected,
      mic_live: input.micLive,
      speaker_live: input.speakerLive,
      audio_unlocked: input.audioUnlocked,
      controller_role: input.controllerRole || 'm1_controller_spatial_anchor',
      world_model_live: Boolean(input.worldModelLive),
      scene_initialized_live: Boolean(input.sceneInitializedLive),
      render_node_live: Boolean(input.renderNodeLive),
      render_engine_target: input.renderEngineTarget || 'high_quality_avatar_runtime',
      render_engine_actual: input.renderEngineActual || renderMode,
      meta_avatar_live: Boolean(input.metaAvatarLive),
      metahuman_path_live: Boolean(input.metahumanPathLive ?? input.metaAvatarLive),
      body_gesture_live: Boolean(input.bodyGestureLive),
      cinematic_quality_live: Boolean(avatarAnimationLive || input.renderNodeLive),
      cinematic_4k_live: Boolean(input.cinematic4kLive),
      live_4k: Boolean(input.cinematic4kLive),
      cosmos_world_layer_live: Boolean(input.cosmosWorldLayerLive),
      avatar_resolution_actual: input.avatarResolutionActual || (browserCanvasLive ? 'browser_canvas' : 'reference_video'),
      wardrobe_swap_live: Boolean(input.wardrobeSwapLive),
      jack_scene_attached: Boolean(input.jackSceneAttached),
      julia_scene_attached: Boolean(input.juliaSceneAttached),
      render_mode: renderMode,
      animation_status: avatarAnimationLive ? 'live' : fallbackModeActive ? 'fallback' : 'staged',
      vision_status: input.semanticVisionLive
        ? 'live'
        : input.visualPipelineReady
          ? 'fallback'
          : 'staged',
      memory_status: input.memoryLoaded ? 'live' : 'offline',
    };
  }, [input]);
}
