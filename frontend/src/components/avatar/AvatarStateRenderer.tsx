'use client';

import type { ReactNode } from 'react';
import type {
  AvatarAnimationBridgeState,
  AvatarProfile,
  AvatarRuntimeState,
} from '../../lib/avatars';

type AvatarStateRendererProps = {
  profile: AvatarProfile;
  runtime: AvatarRuntimeState;
  bridge: AvatarAnimationBridgeState;
  primaryActions?: ReactNode;
  cameraPreview?: ReactNode;
};

function chipTone(detail: string, fallback: string) {
  if (detail === 'Live' || detail === 'Loaded' || detail === 'Semantic') return '#22c55e';
  if (detail === 'Fallback' || detail === 'Frame live') return fallback;
  return '#64748b';
}

export function AvatarStateRenderer({
  profile,
  runtime,
  bridge,
  primaryActions,
  cameraPreview,
}: AvatarStateRendererProps) {
  return (
    <>
      <div className="digital-human-stage__hero-copy">
        <div
          className="digital-human-stage__presence-pill"
          style={{ borderColor: `${bridge.signalTone}55` }}
        >
          <span
            className="digital-human-stage__presence-dot"
            style={{ background: bridge.signalTone, boxShadow: `0 0 18px ${bridge.signalTone}88` }}
          />
          {bridge.presenceLabel}
        </div>
        <div className="digital-human-stage__headline-block">
          <p className="digital-human-stage__eyebrow">{profile.title}</p>
          <h2>{bridge.headline}</h2>
          <p>{bridge.subline}</p>
        </div>
      </div>

      <div className="digital-human-stage__capability-rail">
        {bridge.capabilityChips.map((chip) => (
          <div key={`${profile.actorId}-${chip.label}`} className="digital-human-stage__capability-chip">
            <span>{chip.label}</span>
            <strong style={{ color: chipTone(chip.detail, chip.tone || profile.accent) }}>{chip.detail}</strong>
          </div>
        ))}
      </div>

      <div className="digital-human-stage__insight-panel">
        <span className="digital-human-stage__insight-label">Runtime truth</span>
        <strong>{bridge.liveDescriptor}</strong>
        <small>
          {runtime.avatar_identity_locked
            ? 'Identity lock is active for this actor. '
            : 'Identity lock is not active. '}
          {runtime.scene_initialized_live
            ? `Scene anchor is live on ${runtime.controller_role}. `
            : 'Scene anchor is staged. '}
          {runtime.render_node_live
            ? `Renderer reports ${runtime.render_engine_actual} at ${runtime.avatar_resolution_actual}. `
            : 'GPU render node is not reporting live yet. '}
          {runtime.metahuman_path_live
            ? 'A Meta-compatible avatar path is active. '
            : 'Meta avatar runtime is still staged. '}
          {runtime.semantic_vision_live
            ? 'Semantic vision is live for valid frames.'
            : runtime.visual_pipeline_ready
              ? 'Camera and frame transport are live. Semantic seeing is still staged or pending.'
              : 'Voice, memory, and controls are available without overclaiming visual perception.'}
        </small>
      </div>

      {primaryActions ? (
        <div className="digital-human-stage__action-row">
          {primaryActions}
        </div>
      ) : null}

      {cameraPreview ? (
        <div className="digital-human-stage__preview-shell">
          {cameraPreview}
        </div>
      ) : null}
    </>
  );
}
