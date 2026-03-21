'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAvatarProfile, type AvatarId, type AvatarRenderMode, type AvatarTruthState } from '../lib/avatars';

/**
 * Avatar Runtime Hook
 * Manages the avatar rendering lifecycle: which mode is active (video, 2D neural,
 * 3D metahuman, pixel streaming), what state the avatar is in, and the truth
 * contract for what is actually live.
 */

export type AvatarPresence = 'idle' | 'thinking' | 'speaking' | 'listening' | 'analyzing';

export type AvatarRuntimeState = {
  avatarId: AvatarId;
  presence: AvatarPresence;
  renderMode: AvatarRenderMode;
  truth: AvatarTruthState;
  videoSrc: string;
  posterSrc: string;
  accentColor: string;
  gradient: string;
  isSpeaking: boolean;
  isListening: boolean;
  isAnalyzing: boolean;
};

export type AvatarRuntimeActions = {
  setPresence: (p: AvatarPresence) => void;
  setRenderMode: (m: AvatarRenderMode) => void;
  switchAvatar: (id: AvatarId) => void;
};

export function useAvatarRuntime(initialAvatar: AvatarId = 'jack'): [AvatarRuntimeState, AvatarRuntimeActions] {
  const [avatarId, setAvatarId] = useState<AvatarId>(initialAvatar);
  const [presence, setPresence] = useState<AvatarPresence>('idle');
  const [renderMode, setRenderMode] = useState<AvatarRenderMode>('video');

  const profile = getAvatarProfile(avatarId);

  // Resolve current video source based on presence state
  const videoSrc = (() => {
    if (renderMode !== 'video') return '';
    if (presence === 'speaking') return profile.render.videoSources.speaking;
    return profile.render.videoSources.idle;
  })();

  const state: AvatarRuntimeState = {
    avatarId,
    presence,
    renderMode,
    truth: { ...profile.truth },
    videoSrc,
    posterSrc: profile.render.fallbackPoster,
    accentColor: profile.visual.accentColor,
    gradient: profile.visual.gradient,
    isSpeaking: presence === 'speaking',
    isListening: presence === 'listening',
    isAnalyzing: presence === 'analyzing',
  };

  const switchAvatar = useCallback((id: AvatarId) => {
    setAvatarId(id);
    setPresence('idle');
  }, []);

  return [
    state,
    { setPresence, setRenderMode, switchAvatar },
  ];
}
