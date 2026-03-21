/**
 * Avatar Profile Registry
 * Central export for all avatar configurations.
 */

export { jackAvatarProfile } from './jackAvatarProfile';
export { juliaAvatarProfile } from './juliaAvatarProfile';
export type { JackAvatarProfile } from './jackAvatarProfile';
export type { JuliaAvatarProfile } from './juliaAvatarProfile';

import { jackAvatarProfile } from './jackAvatarProfile';
import { juliaAvatarProfile } from './juliaAvatarProfile';

export type AvatarId = 'jack' | 'julia';

export type AvatarRenderMode = 'video' | '2d_neural' | '3d_metahuman' | 'pixel_stream';

export type AvatarTruthState = {
  avatar_render_live: boolean;
  lip_sync_live: boolean;
  audio2face_live: boolean;
  pixel_streaming_live: boolean;
  voice_output_live: boolean;
  voice_input_live: boolean;
  vision_live: boolean;
  memory_live: boolean;
  research_live: boolean;
};

export function getAvatarProfile(id: AvatarId) {
  return id === 'julia' ? juliaAvatarProfile : jackAvatarProfile;
}

export const avatarProfiles = {
  jack: jackAvatarProfile,
  julia: juliaAvatarProfile,
} as const;
