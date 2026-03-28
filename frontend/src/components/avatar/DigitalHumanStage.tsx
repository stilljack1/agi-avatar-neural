'use client';

import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import type {
  AvatarAnimationBridgeState,
  AvatarPresenceState,
  AvatarProfile,
  AvatarRuntimeState,
} from '../../lib/avatars';
import { AvatarFallbackRenderer } from './AvatarFallbackRenderer';
import { AvatarStateRenderer } from './AvatarStateRenderer';

type DigitalHumanStageProps = {
  profile: AvatarProfile;
  presenceState: AvatarPresenceState;
  runtime: AvatarRuntimeState;
  bridge: AvatarAnimationBridgeState;
  primaryActions?: ReactNode;
  cameraPreview?: ReactNode;
  liveCanvas?: HTMLCanvasElement | null;
  liveCanvasActive?: boolean;
  audioLevel?: number;
};

export function DigitalHumanStage({
  profile,
  presenceState,
  runtime,
  bridge,
  primaryActions,
  cameraPreview,
  liveCanvas,
  liveCanvasActive,
  audioLevel,
}: DigitalHumanStageProps) {
  return (
    <section
      className={clsx(
        'digital-human-stage',
        `digital-human-stage--${profile.actorId}`,
        `digital-human-stage--${presenceState}`,
        runtime.fallback_mode_active ? 'digital-human-stage--fallback' : 'digital-human-stage--live',
      )}
      style={{
        '--avatar-accent': profile.accent,
        '--avatar-secondary': profile.secondaryAccent,
        '--avatar-gradient': profile.gradient,
        '--avatar-obsidian': profile.visualDNA.baseObsidian,
      } as CSSProperties}
    >
      <AvatarFallbackRenderer
        profile={profile}
        runtime={runtime}
        bridge={bridge}
        liveCanvas={liveCanvas}
        liveCanvasActive={liveCanvasActive}
        audioLevel={audioLevel}
      />
      <AvatarStateRenderer
        profile={profile}
        runtime={runtime}
        bridge={bridge}
        primaryActions={primaryActions}
        cameraPreview={cameraPreview}
      />
    </section>
  );
}
