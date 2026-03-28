import type { AvatarActorId, AvatarIdentityLock } from './types';

export const jackIdentityLock: AvatarIdentityLock = {
  locked: true,
  referencePackId: 'jack_reference_pack_v1',
  canonicalFaceId: 'jack_sovereign_face_v1',
  likenessGuardVersion: '2026-03-22',
  protectedTraits: [
    'brow_line_focused',
    'jawline_structured',
    'eye_shape_calm_authoritative',
    'hair_silhouette_locked',
    'electric_blue_brand_palette',
  ],
  approvedWardrobes: ['executive', 'war_room', 'security'],
  allowedRuntimeFamilies: ['browser_canvas_bust', 'audio2face_shell', 'metahuman_shell'],
  renderCalibration: {
    jawScale: 1.08,
    mouthWidthScale: 0.92,
    lipPuckerScale: 0.88,
    upperLipScale: 0.95,
    lowerLipScale: 1.12,
    browScale: 0.82,
    gazeScale: 0.92,
    headMotionScale: 0.94,
    breathScale: 0.9,
    mouthCenterY: 0.695,
    eyeLineY: 0.448,
  },
};

export const juliaIdentityLock: AvatarIdentityLock = {
  locked: true,
  referencePackId: 'julia_reference_pack_v1',
  canonicalFaceId: 'julia_sovereign_face_v1',
  likenessGuardVersion: '2026-03-22',
  protectedTraits: [
    'facial_curve_soft',
    'eye_emphasis_warm',
    'hair_frame_locked',
    'magenta_orange_brand_palette',
    'expression_range_elegant',
  ],
  approvedWardrobes: ['executive', 'doctor', 'war_room'],
  allowedRuntimeFamilies: ['browser_canvas_bust', 'audio2face_shell', 'metahuman_shell'],
  renderCalibration: {
    jawScale: 0.92,
    mouthWidthScale: 1.06,
    lipPuckerScale: 1.04,
    upperLipScale: 1.08,
    lowerLipScale: 0.94,
    browScale: 1.12,
    gazeScale: 1.08,
    headMotionScale: 1.04,
    breathScale: 1.04,
    mouthCenterY: 0.686,
    eyeLineY: 0.443,
  },
};

export function getIdentityLock(actorId: AvatarActorId): AvatarIdentityLock {
  return actorId === 'julia' ? juliaIdentityLock : jackIdentityLock;
}
