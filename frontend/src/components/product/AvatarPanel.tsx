'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  Cpu,
  ExternalLink,
  ShieldCheck,
  User,
  Video,
} from 'lucide-react';
import { AGI_CONFIG } from '@/lib/config';

type PresenceState = 'idle' | 'thinking' | 'speaking';

interface AvatarPanelProps {
  name: 'jack' | 'julia';
  apiUrl?: string;
  launchUrl?: string;
}

const AVATAR_CONFIG = {
  jack: {
    displayName: 'Jack',
    title: 'Strategy and execution',
    color: 'yellow' as const,
    idleVideo: '/avatars/jack-idle.mp4',
    speakingVideo: '/avatars/jack-speaking.mp4',
    idleText:
      'Strategic intelligence channel linked to the AGI-1 product shell.',
    thinkingText: 'Checking Jack neural route...',
    speakingText:
      'Jack is ready for live reasoning, planning, and execution leadership.',
    wakePhrase: 'Hey Jack',
  },
  julia: {
    displayName: 'Julia',
    title: 'Product and communication',
    color: 'green' as const,
    idleVideo: '/avatars/julia-idle.mp4',
    speakingVideo: '/avatars/julia-speaking.mp4',
    idleText:
      'Creative and product intelligence channel linked to the AGI-1 product shell.',
    thinkingText: 'Checking Julia neural route...',
    speakingText:
      'Julia is ready for design, UX, and communication workflows.',
    wakePhrase: 'Hi Julia',
  },
};

const presenceMeta: Record<PresenceState, { label: string; dot: string }> = {
  idle: { label: 'Linked', dot: 'bg-gray-400' },
  thinking: { label: 'Checking', dot: 'bg-yellow-400 animate-pulse' },
  speaking: { label: 'Ready', dot: 'bg-green-400 animate-pulse' },
};

export function AvatarPanel({
  name,
  apiUrl = AGI_CONFIG.backendUrl,
  launchUrl,
}: AvatarPanelProps) {
  const config = AVATAR_CONFIG[name];
  const resolvedLaunchUrl =
    launchUrl || AGI_CONFIG.avatarRoutes[name];
  const accent = config.color;

  const [presence, setPresence] = useState<PresenceState>('thinking');
  const [speechText, setSpeechText] = useState(config.idleText);
  const [health, setHealth] = useState<{
    api: string;
    llm: string;
    route: string;
  }>({
    api: 'Checking',
    llm: 'Unknown',
    route: 'Checking',
  });

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        setPresence('thinking');
        setSpeechText(config.thinkingText);

        const [healthResponse, routeResponse] = await Promise.all([
          fetch(`${apiUrl}/health`),
          fetch(resolvedLaunchUrl, { method: 'HEAD' }),
        ]);

        if (!healthResponse.ok) {
          throw new Error(
            `Backend health returned ${healthResponse.status}`
          );
        }

        const data = await healthResponse.json();
        if (cancelled) return;

        setHealth({
          api: data.ok ? 'Live' : 'Degraded',
          llm: data.status || 'Connected',
          route: routeResponse.ok ? 'Live route' : 'Pending deploy',
        });
        setPresence(routeResponse.ok ? 'speaking' : 'idle');
        setSpeechText(
          routeResponse.ok ? config.speakingText : config.idleText
        );
      } catch {
        if (cancelled) return;
        setPresence('idle');
        setSpeechText(
          `${config.displayName} is linked here, but the neural route still needs final deployment alignment.`
        );
        setHealth({
          api: 'Offline',
          llm: 'Unavailable',
          route: 'Pending deploy',
        });
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, resolvedLaunchUrl, config]);

  const openRoute = (target: string) => {
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const accentBorder =
    accent === 'yellow' ? 'border-yellow-500/30' : 'border-green-500/30';
  const accentText =
    accent === 'yellow' ? 'text-yellow-500' : 'text-green-400';
  const accentBg =
    accent === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';
  const accentBgLight =
    accent === 'yellow' ? 'bg-yellow-500/20' : 'bg-green-500/20';
  const accentRing =
    accent === 'yellow' ? 'ring-yellow-500/40' : 'ring-green-500/40';
  const accentHover =
    accent === 'yellow' ? 'hover:bg-yellow-400' : 'hover:bg-green-400';
  const accentGhost =
    accent === 'yellow'
      ? 'hover:border-yellow-400/50 hover:text-yellow-100'
      : 'hover:border-green-400/50 hover:text-green-100';
  const activeVideo =
    presence === 'speaking' ? config.speakingVideo : config.idleVideo;

  const metrics = [
    { label: 'API', value: health.api, icon: Cpu },
    { label: 'LLM', value: health.llm, icon: ShieldCheck },
    { label: 'Wake', value: config.wakePhrase, icon: Video },
    { label: 'Route', value: health.route, icon: ExternalLink },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`relative rounded-2xl border ${accentBorder} bg-black/70 backdrop-blur-xl p-5 text-left shadow-2xl overflow-hidden`}
    >
      {/* Gradient glow line */}
      <div
        className={`absolute top-0 left-0 right-0 h-[1px] ${
          accent === 'yellow'
            ? 'bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent'
            : 'bg-gradient-to-r from-transparent via-green-500/60 to-transparent'
        }`}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-11 h-11 rounded-full ${accentBgLight} flex items-center justify-center ring-2 ${accentRing}`}
        >
          <User className={`w-5 h-5 ${accentText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={`text-lg font-bold ${accentText} tracking-tight leading-tight`}
          >
            {config.displayName}
          </h3>
          <p className="text-[11px] text-gray-500 uppercase tracking-widest font-medium">
            {config.title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${presenceMeta[presence].dot}`}
          />
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">
            {presenceMeta[presence].label}
          </span>
        </div>
      </div>

      {/* Video */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/70">
        <div className="relative aspect-[4/5] bg-black">
          <video
            key={`${name}-${activeVideo}`}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src={activeVideo} type="video/mp4" />
          </video>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/55 to-transparent p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400">
              agi-avatar-neural
            </div>
            <div className={`mt-1 text-lg font-semibold ${accentText}`}>
              {config.displayName} Avatar Channel
            </div>
          </div>
        </div>
      </div>

      {/* Speech Bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={speechText}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.3 }}
          className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 leading-relaxed"
        >
          <span className="text-gray-500 mr-1 font-mono text-xs">&gt;</span>
          {speechText}
        </motion.div>
      </AnimatePresence>

      {/* Telemetry Metrics */}
      <div className="space-y-2 mb-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-2 text-[11px] rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
          >
            <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
            <span className="text-gray-500 w-14 font-mono">{label}</span>
            <span className="text-gray-300 font-mono text-right ml-auto">
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => openRoute(resolvedLaunchUrl)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${accentBg} text-black ${accentHover}`}
        >
          <ExternalLink className="w-3 h-3" />
          Open Interface
        </button>
        <button
          onClick={() => openRoute(AGI_CONFIG.taskInterfaceUrl)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border border-white/10 text-gray-300 ${accentGhost}`}
        >
          <ArrowUpRight className="w-3 h-3" />
          Open Tasks
        </button>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-gray-400 leading-relaxed">
        Dedicated neural interface:{' '}
        <a
          href={resolvedLaunchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium ${accentText}`}
        >
          {resolvedLaunchUrl}
        </a>
      </div>
    </motion.div>
  );
}
