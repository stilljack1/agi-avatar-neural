'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, Radio, ShieldCheck, Sparkles } from 'lucide-react';

type PresenceState = 'idle' | 'thinking' | 'speaking';
type ThemeName = 'thermal' | 'cryo';

type AvatarProfile = {
  id: string;
  displayName: string;
  title: string;
  speech: string;
  poster?: string;
  idleVideo?: string;
  speakingVideo?: string;
};

type AvatarBrainProps = {
  profile: AvatarProfile;
  state: PresenceState;
  theme: ThemeName;
  taskLabel: string;
  metrics: {
    cpu: number;
    memory: number;
    network: number;
  };
};

export default function AvatarBrain({
  profile,
  state,
  theme,
  taskLabel,
  metrics,
}: AvatarBrainProps) {
  const [videoFailed, setVideoFailed] = useState(false);

  const currentVideo = useMemo(() => {
    if (state === 'speaking' && profile.speakingVideo) {
      return profile.speakingVideo;
    }
    return profile.idleVideo ?? profile.speakingVideo ?? '';
  }, [profile.idleVideo, profile.speakingVideo, state]);

  useEffect(() => {
    setVideoFailed(false);
  }, [currentVideo]);

  return (
    <section className={`avatar-panel avatar-panel--${theme}`}>
      <div className="avatar-panel__frame">
        <div className="avatar-panel__speech">
          <span>{profile.speech}</span>
        </div>

        <div className="avatar-panel__media-shell">
          {!videoFailed && currentVideo ? (
            <video
              key={`${profile.id}-${state}-${currentVideo}`}
              className="avatar-panel__media"
              autoPlay
              muted
              loop
              playsInline
              poster={profile.poster}
              onError={() => setVideoFailed(true)}
            >
              <source src={currentVideo} type="video/mp4" />
            </video>
          ) : profile.poster ? (
            <img
              className="avatar-panel__media"
              src={profile.poster}
              alt={`${profile.displayName} avatar`}
            />
          ) : (
            <div className="avatar-panel__fallback">
              <Sparkles size={32} />
              <div>ASSET LINK ACTIVE</div>
              <div className="avatar-panel__fallback-subtitle">
                Awaiting sovereign portrait file
              </div>
            </div>
          )}

          <div className="avatar-panel__status">
            <div className="avatar-panel__status-badge">
              <Activity size={14} />
              <span>{state.toUpperCase()}</span>
            </div>
            <div className="avatar-panel__status-badge">
              <Radio size={14} />
              <span>VOICE SYNC READY</span>
            </div>
          </div>
        </div>

        <div className="avatar-panel__identity">
          <div>
            <div className="avatar-panel__name">{profile.displayName}</div>
            <div className="avatar-panel__title">{profile.title}</div>
          </div>
          <div className="avatar-panel__chip">{taskLabel}</div>
        </div>
      </div>

      <div className="avatar-panel__telemetry">
        <div className="avatar-panel__telemetry-item">
          <span className="avatar-panel__telemetry-label">
            <ShieldCheck size={14} />
            Sovereign Guard
          </span>
          <strong>LOCKED</strong>
        </div>
        <div className="avatar-panel__telemetry-item">
          <span className="avatar-panel__telemetry-label">
            <Cpu size={14} />
            Cognitive Load
          </span>
          <strong>{metrics.cpu}%</strong>
        </div>
        <div className="avatar-panel__telemetry-grid">
          <MetricBar label="CPU" value={metrics.cpu} />
          <MetricBar label="MEM" value={metrics.memory} />
          <MetricBar label="NET" value={metrics.network} />
        </div>
      </div>
    </section>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="avatar-panel__metric">
      <span>{label}</span>
      <div className="avatar-panel__metric-track">
        <div className="avatar-panel__metric-fill" style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}
