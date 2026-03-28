'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type {
  AvatarAnimationBridgeState,
  AvatarProfile,
  AvatarRuntimeState,
} from '../../lib/avatars';

type AvatarFallbackRendererProps = {
  profile: AvatarProfile;
  runtime: AvatarRuntimeState;
  bridge: AvatarAnimationBridgeState;
  liveCanvas?: HTMLCanvasElement | null;
  liveCanvasActive?: boolean;
  audioLevel?: number;
};

export function AvatarFallbackRenderer({
  profile,
  runtime,
  bridge,
  liveCanvas,
  liveCanvasActive = false,
  audioLevel = 0,
}: AvatarFallbackRendererProps) {
  const [posterError, setPosterError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || !liveCanvas) {
      return;
    }

    liveCanvas.style.width = '100%';
    liveCanvas.style.height = '100%';
    liveCanvas.style.position = 'absolute';
    liveCanvas.style.inset = '0';
    liveCanvas.style.objectFit = 'cover';

    if (!host.contains(liveCanvas)) {
      host.appendChild(liveCanvas);
    }

    return () => {
      if (host.contains(liveCanvas)) {
        host.removeChild(liveCanvas);
      }
    };
  }, [liveCanvas]);

  return (
    <div className="digital-human-stage__render-stack">
      <div className="digital-human-stage__halo" style={{ opacity: bridge.haloOpacity }} />
      <div className="digital-human-stage__scanfield" />

      <div
        className="digital-human-stage__ambient-backdrop"
        style={{ backgroundImage: `url(${profile.media.poster})` }}
      />

      <div
        className={clsx(
          'digital-human-stage__portrait-shell',
          runtime.avatar_animation_live && 'is-live-animation',
          liveCanvasActive && 'has-live-canvas',
        )}
        style={{ transform: `scale(${bridge.motionScale})` }}
      >
        {!liveCanvasActive && !videoError ? (
          <video
            key={`${profile.actorId}-${runtime.presenceState}-hero`}
            className="digital-human-stage__portrait-video"
            poster={profile.media.poster}
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoError(true)}
          >
            <source src={runtime.presenceState === 'speaking' ? profile.media.speakingVideo : profile.media.idleVideo} type="video/mp4" />
          </video>
        ) : !liveCanvasActive && !posterError ? (
          <img
            src={profile.media.poster}
            alt={`${profile.name} portrait reference`}
            className="digital-human-stage__portrait"
            onError={() => setPosterError(true)}
          />
        ) : null}

        <div
          ref={canvasHostRef}
          className={clsx(
            'digital-human-stage__live-canvas-host',
            liveCanvasActive && 'is-visible',
          )}
        />

        {(liveCanvasActive || runtime.voice_output_live) && (
          <div
            className="digital-human-stage__audio-pulse"
            style={{ opacity: Math.max(0.18, Math.min(0.75, audioLevel)) }}
          />
        )}

        <div className="digital-human-stage__portrait-sheen" />
        <div className="digital-human-stage__portrait-outline" />

        <div className="digital-human-stage__speech-meter" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <span
              key={`${profile.actorId}-meter-${index}`}
              className={clsx(
                'digital-human-stage__speech-bar',
                bridge.speechMeterActive && 'is-active',
              )}
              style={{ animationDelay: `${index * 0.08}s` }}
            />
          ))}
        </div>
      </div>

      <div className="digital-human-stage__identity-rail">
        <span className="digital-human-stage__identity-label">Reference identity</span>
        <strong>{profile.name}</strong>
        <small>{bridge.renderBadge}</small>
      </div>

      {runtime.fallback_mode_active && (
        <div className="digital-human-stage__fallback-note">
          {runtime.render_node_live
            ? 'A GPU render node is reporting live, but this surface is still on the truthful local fallback path until the remote avatar feed is bound in.'
            : runtime.avatar_identity_locked
              ? 'Identity lock is active. Full face animation is still staged, while voice, memory, and vision remain truthful where indicated.'
              : 'Full face animation is staged. Voice, memory, and vision remain truthful and live where indicated.'}
        </div>
      )}
    </div>
  );
}
