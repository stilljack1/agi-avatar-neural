import { jackAvatarProfile } from './jackAvatarProfile';
import { juliaAvatarProfile } from './juliaAvatarProfile';
import { getIdentityLock, jackIdentityLock, juliaIdentityLock } from './identityLock';

export { getIdentityLock, jackAvatarProfile, jackIdentityLock, juliaAvatarProfile, juliaIdentityLock };
export type {
  AvatarActorId,
  AvatarId,
  AvatarAnimationBridgeState,
  AvatarCapabilityChip,
  AvatarCapabilityStatus,
  AvatarIdentityLock,
  AvatarPresenceState,
  AvatarProfile,
  AvatarRenderCalibration,
  AvatarRenderMode,
  AvatarReferenceSource,
  AvatarRuntimeState,
  AvatarTruthState,
  AvatarVisualDNA,
} from './types';

const profiles = {
  jack: jackAvatarProfile,
  julia: juliaAvatarProfile,
} as const;

export function getAvatarProfile(actorId: keyof typeof profiles) {
  const profile = profiles[actorId];
  return {
    id: profile.actorId,
    name: profile.name,
    render: {
      videoSources: {
        idle: profile.media.idleVideo,
        speaking: profile.media.speakingVideo,
      },
      fallbackPoster: profile.media.poster,
    },
    visual: {
      accentColor: profile.accent,
      gradient: profile.gradient,
    },
    truth: {
      avatar_render_live: true,
      avatar_identity_locked: profile.identityLock.locked,
      avatar_animation_live: false,
      lip_sync_live: false,
      face_expression_live: false,
      facial_expression_live: false,
      voice_output_live: false,
      voice_input_live: false,
      camera_perception_live: false,
      memory_loaded: false,
      fallback_mode_active: true,
    },
  };
}
