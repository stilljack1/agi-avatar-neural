import assetManifest from '../../../asset-manifest.json';
import { juliaIdentityLock } from './identityLock';
import type { AvatarProfile } from './types';

export const juliaAvatarProfile: AvatarProfile = {
  actorId: 'julia',
  name: 'Julia',
  title: 'Warm operator',
  greeting: "Hi. I'm with you. What's on your mind?",
  accent: '#EF2E6A',
  secondaryAccent: '#FF6A00',
  gradient: 'linear-gradient(135deg, #EF2E6A 0%, #FF6A00 50%, #FFB454 100%)',
  voiceId: assetManifest.julia.voice_id,
  media: {
    poster: assetManifest.julia.image,
    idleVideo: assetManifest.julia.idleVideo,
    speakingVideo: assetManifest.julia.speakingVideo,
    ambientVideo: assetManifest.julia.altVideo || assetManifest.julia.video,
  },
  visualDNA: {
    primaryGlow: '#EF2E6A',
    secondaryGlow: '#548CF3',
    actionAccent: '#FF6A00',
    baseObsidian: '#0C0A14',
    frostHighlight: '#F4E8F0',
    keyLight: '#F6E8FF',
    rimLight: '#EF2E6A',
    shadowBase: '#07050B',
    typography: {
      display: 'Montserrat, Inter, system-ui, sans-serif',
      body: 'Inter, system-ui, sans-serif',
    },
  },
  referenceSources: [
    {
      kind: 'video',
      path: assetManifest.julia.idleVideo,
      role: 'identity',
      notes: 'Primary likeness and expression source from the production Julia idle asset.',
    },
    {
      kind: 'video',
      path: assetManifest.julia.speakingVideo,
      role: 'motion_fallback',
      notes: 'Fallback speaking reference until real-time face animation is live.',
    },
    {
      kind: 'image',
      path: assetManifest.julia.image,
      role: 'poster',
      notes: 'High-resolution portrait for reference extraction and premium stage fallback.',
    },
  ],
  identityLock: juliaIdentityLock,
  runtimeTargets: {
    animationEngine: 'audio2face',
    renderTarget: 'webgl',
    qualityTier: 'adaptive_mobile',
  },
  personaNotes: {
    tone: 'Warm, elegant, emotionally intelligent, polished without sounding scripted.',
    greetingStyle: 'Welcoming, present, and conversational.',
    emotionalRange: ['warm', 'attentive', 'supportive', 'articulate'],
  },
};
