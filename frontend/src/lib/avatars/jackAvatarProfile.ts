import assetManifest from '../../../asset-manifest.json';
import { jackIdentityLock } from './identityLock';
import type { AvatarProfile } from './types';

export const jackAvatarProfile: AvatarProfile = {
  actorId: 'jack',
  name: 'Jack',
  title: 'Strategic partner',
  greeting: "Hey. I'm here. What are we working on?",
  accent: '#548CF3',
  secondaryAccent: '#FF6A00',
  gradient: 'linear-gradient(135deg, #548CF3 0%, #0077FF 52%, #FF6A00 100%)',
  voiceId: assetManifest.jack.voice_id,
  media: {
    poster: assetManifest.jack.image,
    idleVideo: assetManifest.jack.idleVideo,
    speakingVideo: assetManifest.jack.speakingVideo,
    ambientVideo: assetManifest.jack.video,
  },
  visualDNA: {
    primaryGlow: '#548CF3',
    secondaryGlow: '#0077FF',
    actionAccent: '#FF6A00',
    baseObsidian: '#0C0A14',
    frostHighlight: '#C0C7C7',
    keyLight: '#D8E4FF',
    rimLight: '#0077FF',
    shadowBase: '#050608',
    typography: {
      display: 'Montserrat, Inter, system-ui, sans-serif',
      body: 'Inter, system-ui, sans-serif',
    },
  },
  referenceSources: [
    {
      kind: 'video',
      path: assetManifest.jack.idleVideo,
      role: 'identity',
      notes: 'Primary likeness and posture source from the production Jack idle asset.',
    },
    {
      kind: 'video',
      path: assetManifest.jack.speakingVideo,
      role: 'motion_fallback',
      notes: 'Fallback motion source used while real-time facial animation is staged.',
    },
    {
      kind: 'image',
      path: assetManifest.jack.image,
      role: 'poster',
      notes: 'High-resolution portrait for reference extraction and premium stage fallback.',
    },
  ],
  identityLock: jackIdentityLock,
  runtimeTargets: {
    animationEngine: 'audio2face',
    renderTarget: 'webgl',
    qualityTier: 'desktop_lod0',
  },
  personaNotes: {
    tone: 'Calm, grounded, confident, direct without sounding corporate.',
    greetingStyle: 'Short, warm, already in the room.',
    emotionalRange: ['steady', 'strategic', 'reassuring', 'focused'],
  },
};
