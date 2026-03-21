'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarRuntimeState } from '../../hooks/useAvatarRuntime';

/**
 * DigitalHumanStage — Multi-mode avatar renderer
 *
 * Render modes:
 * 1. 'video'          — Current: HTML5 video with idle/speaking swap
 * 2. '2d_neural'      — Future: Neural lip-sync overlay (Wav2Lip/SyncLabs)
 * 3. '3d_metahuman'   — Future: UE5.7 MetaHuman via Pixel Streaming
 * 4. 'pixel_stream'   — Future: WebRTC pixel stream from UE5.7
 *
 * Truth rule: Only render what is actually available.
 * Never show a "3D" label when only video is running.
 */

type DigitalHumanStageProps = {
  runtime: AvatarRuntimeState;
  mouthOpenness?: number;
  className?: string;
  showTruthBadge?: boolean;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
};

export default function DigitalHumanStage({
  runtime,
  mouthOpenness = 0,
  className = '',
  showTruthBadge = true,
  onVideoRef,
}: DigitalHumanStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Update video source when it changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !runtime.videoSrc) return;

    setVideoError(false);
    setVideoLoaded(false);

    // Only update src if it actually changed
    const currentSrc = video.querySelector('source')?.src || '';
    if (!currentSrc.endsWith(runtime.videoSrc)) {
      video.load();
      void video.play().catch(() => {
        // Autoplay may be blocked — video will still show poster
      });
    }
  }, [runtime.videoSrc]);

  // Expose video ref to parent
  useEffect(() => {
    onVideoRef?.(videoRef.current);
  }, [onVideoRef]);

  const renderModeBadge = () => {
    if (!showTruthBadge) return null;

    const modeLabels: Record<string, string> = {
      video: 'VIDEO',
      '2d_neural': '2D NEURAL',
      '3d_metahuman': '3D METAHUMAN',
      pixel_stream: 'PIXEL STREAM',
    };

    return (
      <div
        className="absolute top-3 left-3 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          color: runtime.accentColor,
          border: `1px solid ${runtime.accentColor}33`,
          backdropFilter: 'blur(4px)',
        }}
      >
        {modeLabels[runtime.renderMode] || 'VIDEO'}
      </div>
    );
  };

  const renderPresenceBadge = () => {
    const presenceColors: Record<string, string> = {
      idle: '#666',
      thinking: '#FFD700',
      speaking: '#00FF88',
      listening: runtime.accentColor,
      analyzing: '#FF6A00',
    };

    return (
      <div
        className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          color: presenceColors[runtime.presence] || '#666',
          border: `1px solid ${(presenceColors[runtime.presence] || '#666')}33`,
          backdropFilter: 'blur(4px)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: presenceColors[runtime.presence],
            boxShadow: runtime.presence !== 'idle' ? `0 0 6px ${presenceColors[runtime.presence]}` : 'none',
          }}
        />
        {runtime.presence}
      </div>
    );
  };

  // Render: Video Mode (current working mode)
  if (runtime.renderMode === 'video') {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: '#000' }}>
        {!videoError && runtime.videoSrc ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster={runtime.posterSrc}
            onError={() => setVideoError(true)}
            onLoadedData={() => setVideoLoaded(true)}
          >
            <source src={runtime.videoSrc} type="video/mp4" />
          </video>
        ) : runtime.posterSrc ? (
          <img
            className="w-full h-full object-cover"
            src={runtime.posterSrc}
            alt={`${runtime.avatarId} avatar`}
          />
        ) : (
          <AvatarFallbackRenderer
            avatarId={runtime.avatarId}
            accentColor={runtime.accentColor}
            presence={runtime.presence}
          />
        )}

        {/* Mouth openness overlay (subtle visual feedback) */}
        {runtime.isSpeaking && mouthOpenness > 0.05 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 70%, ${runtime.accentColor}${Math.round(mouthOpenness * 15).toString(16).padStart(2, '0')} 0%, transparent 50%)`,
            }}
          />
        )}

        {/* Glow ring when speaking */}
        {runtime.isSpeaking && (
          <div
            className="absolute inset-0 pointer-events-none rounded-xl"
            style={{
              boxShadow: `inset 0 0 30px ${runtime.accentColor}22, 0 0 20px ${runtime.accentColor}15`,
            }}
          />
        )}

        {renderModeBadge()}
        {renderPresenceBadge()}
      </div>
    );
  }

  // Render: 2D Neural Lip-Sync (staged — not yet live)
  if (runtime.renderMode === '2d_neural') {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: '#000' }}>
        {/* Canvas for neural lip-sync overlay */}
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'none' }} // Hidden until lip-sync provider is connected
        />
        {/* Fallback to video while 2D neural is staged */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={runtime.posterSrc}
        >
          <source src={runtime.videoSrc} type="video/mp4" />
        </video>
        <div className="absolute top-3 right-3 px-2 py-1 rounded text-[10px] font-mono bg-yellow-900/60 text-yellow-400 border border-yellow-600/30">
          NEURAL LIP-SYNC: STAGED
        </div>
        {renderModeBadge()}
        {renderPresenceBadge()}
      </div>
    );
  }

  // Render: 3D MetaHuman / Pixel Streaming (staged)
  if (runtime.renderMode === '3d_metahuman' || runtime.renderMode === 'pixel_stream') {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: '#0C0A14' }}>
        <AvatarFallbackRenderer
          avatarId={runtime.avatarId}
          accentColor={runtime.accentColor}
          presence={runtime.presence}
          message="3D MetaHuman pipeline staged — UE5.7 Pixel Streaming not yet deployed"
        />
        {renderModeBadge()}
        {renderPresenceBadge()}
      </div>
    );
  }

  // Default fallback
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: '#0C0A14' }}>
      <AvatarFallbackRenderer
        avatarId={runtime.avatarId}
        accentColor={runtime.accentColor}
        presence={runtime.presence}
      />
    </div>
  );
}

/**
 * Fallback renderer when no video/stream is available.
 * Shows an animated presence indicator with the avatar's accent color.
 */
function AvatarFallbackRenderer({
  avatarId,
  accentColor,
  presence,
  message,
}: {
  avatarId: string;
  accentColor: string;
  presence: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8">
      {/* Animated presence ring */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold"
        style={{
          background: `${accentColor}15`,
          border: `2px solid ${accentColor}40`,
          color: accentColor,
          boxShadow: presence !== 'idle' ? `0 0 30px ${accentColor}30` : 'none',
          animation: presence === 'speaking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      >
        {avatarId[0].toUpperCase()}
      </div>
      <div className="text-center">
        <div className="text-white/80 text-sm font-medium capitalize">{avatarId}</div>
        <div className="text-white/40 text-xs mt-1">{message || 'Avatar render mode initializing...'}</div>
      </div>
    </div>
  );
}
