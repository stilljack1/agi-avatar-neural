'use client';

import { useMemo } from 'react';
import type {
  AvatarAnimationBridgeState,
  AvatarProfile,
  AvatarRuntimeState,
} from '../../lib/avatars';

type UseAvatarAnimationBridgeInput = {
  profile: AvatarProfile;
  runtime: AvatarRuntimeState;
  lastAssistantLine?: string;
  visionSummary?: string | null;
};

export function useAvatarAnimationBridge(
  input: UseAvatarAnimationBridgeInput,
): AvatarAnimationBridgeState {
  return useMemo(() => {
    const { profile, runtime, lastAssistantLine, visionSummary } = input;
    const presenceLabel = runtime.presenceState.charAt(0).toUpperCase() + runtime.presenceState.slice(1);
    const signalTone = runtime.presenceState === 'speaking'
      ? '#22c55e'
      : runtime.presenceState === 'thinking'
        ? profile.secondaryAccent
        : runtime.presenceState === 'listening'
          ? profile.accent
          : '#7c8799';

    const headline = runtime.presenceState === 'speaking'
      ? `${profile.name} is speaking`
      : runtime.presenceState === 'thinking'
        ? `${profile.name} is reasoning`
        : runtime.presenceState === 'listening'
          ? `${profile.name} is listening`
          : `${profile.name} is ready`;

    const renderBadge = runtime.avatar_animation_live
      ? runtime.audio2face_live
        ? 'Audio2Face live'
        : runtime.cinematic_4k_live
          ? `${runtime.avatar_resolution_actual} renderer live`
        : runtime.cinematic_quality_live
          ? 'Cinematic avatar live'
        : runtime.render_mode === 'canvas_2d_live'
          ? 'Canvas avatar live'
        : 'PersonaPlex live'
      : runtime.render_mode === 'video_fallback'
        ? 'Motion-video fallback'
        : 'Poster fallback';

    const liveDescriptor = runtime.cinematic_4k_live
      ? `GPU render node is live at ${runtime.avatar_resolution_actual}.`
      : runtime.render_node_live && runtime.meta_avatar_live
        ? `GPU render node is live at ${runtime.avatar_resolution_actual}, but cinematic 4K is not active.`
        : runtime.avatar_animation_live
          ? runtime.render_mode === 'canvas_2d_live'
            ? 'The live browser avatar is rendering in real time with facial motion and speech sync.'
            : 'Real avatar animation is live.'
          : 'The digital-human stage is live, with video/poster fallback while full facial animation is staged.';

    const subline = visionSummary && runtime.semantic_vision_live
      ? visionSummary
      : lastAssistantLine
        ? lastAssistantLine
        : liveDescriptor;

    return {
      headline,
      subline,
      renderBadge,
      presenceLabel,
      signalTone,
      motionScale: runtime.presenceState === 'speaking' ? 1.04 : runtime.presenceState === 'thinking' ? 1.02 : 1,
      haloOpacity: runtime.presenceState === 'idle' ? 0.26 : runtime.presenceState === 'listening' ? 0.44 : 0.6,
      speechMeterActive: runtime.presenceState === 'speaking' && runtime.voice_output_live,
      liveDescriptor,
      capabilityChips: [
        {
          label: 'Voice out',
          detail: runtime.voice_output_live ? 'Live' : 'Waiting',
          status: runtime.voice_output_live ? 'live' : 'offline',
          tone: runtime.voice_output_live ? '#22c55e' : '#64748b',
        },
        {
          label: 'Voice in',
          detail: runtime.voice_input_live ? 'Live' : 'Waiting',
          status: runtime.voice_input_live ? 'live' : 'offline',
          tone: runtime.voice_input_live ? profile.accent : '#64748b',
        },
        {
          label: 'Vision',
          detail: runtime.semantic_vision_live
            ? 'Semantic'
            : runtime.visual_pipeline_ready
              ? 'Frame live'
              : 'Staged',
          status: runtime.vision_status,
          tone: runtime.semantic_vision_live ? '#22c55e' : runtime.visual_pipeline_ready ? profile.accent : '#64748b',
        },
        {
          label: 'Memory',
          detail: runtime.memory_loaded ? 'Loaded' : 'Pending',
          status: runtime.memory_status,
          tone: runtime.memory_loaded ? '#22c55e' : '#64748b',
        },
        {
          label: 'Animation',
          detail: runtime.avatar_animation_live ? 'Live' : 'Fallback',
          status: runtime.animation_status,
          tone: runtime.avatar_animation_live ? '#22c55e' : profile.secondaryAccent,
        },
        {
          label: 'Identity',
          detail: runtime.avatar_identity_locked ? 'Locked' : 'Drifting',
          status: runtime.avatar_identity_locked ? 'live' : 'offline',
          tone: runtime.avatar_identity_locked ? '#22c55e' : '#ef4444',
        },
        {
          label: 'Render',
          detail: runtime.render_node_live ? runtime.avatar_resolution_actual : 'Staged',
          status: runtime.render_node_live ? (runtime.cinematic_4k_live ? 'live' : 'fallback') : 'staged',
          tone: runtime.cinematic_4k_live ? '#22c55e' : runtime.render_node_live ? profile.accent : '#64748b',
        },
        {
          label: 'Quality',
          detail: runtime.live_4k ? '4K' : runtime.cinematic_quality_live ? 'Cinematic' : 'Standard',
          status: runtime.live_4k ? 'live' : runtime.cinematic_quality_live ? 'fallback' : 'staged',
          tone: runtime.live_4k ? '#22c55e' : runtime.cinematic_quality_live ? profile.secondaryAccent : '#64748b',
        },
        {
          label: 'Scene',
          detail: runtime.cosmos_world_layer_live ? 'Cosmos live' : runtime.scene_initialized_live ? 'Anchored' : 'Staged',
          status: runtime.scene_initialized_live ? 'live' : 'staged',
          tone: runtime.scene_initialized_live ? profile.secondaryAccent : '#64748b',
        },
      ],
    };
  }, [input]);
}
