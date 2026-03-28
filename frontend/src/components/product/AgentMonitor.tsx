'use client';

import { useEffect, useState } from 'react';
import { AGI_CONFIG } from '@/lib/config';

type SurfaceState = 'live' | 'pending' | 'offline';

type SurfaceStatus = {
  label: string;
  state: SurfaceState;
  detail: string;
};

async function probeSurface(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

export function AgentMonitor() {
  const [logs, setLogs] = useState<SurfaceStatus[]>([]);
  const [status, setStatus] = useState('Checking surfaces...');

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const [healthResponse, jackReady, juliaReady, singularityReady] =
          await Promise.all([
            fetch(`${AGI_CONFIG.backendUrl}/health`),
            probeSurface(AGI_CONFIG.avatarRoutes.jack),
            probeSurface(AGI_CONFIG.avatarRoutes.julia).catch(() => false),
            probeSurface(AGI_CONFIG.taskInterfaceUrl),
          ]);

        if (cancelled) return;

        if (!healthResponse.ok) {
          throw new Error(`Backend health returned ${healthResponse.status}`);
        }

        const health = await healthResponse.json();
        const surfaces: SurfaceStatus[] = [
          {
            label: 'AGI-1 Backend',
            state: health.ok ? 'live' : 'offline',
            detail: health.status || 'Unknown',
          },
          {
            label: 'Jack Neural Channel',
            state: jackReady ? 'live' : 'pending',
            detail: jackReady
              ? AGI_CONFIG.avatarRoutes.jack
              : 'Route unavailable',
          },
          {
            label: 'Julia Neural Channel',
            state: juliaReady ? 'live' : 'pending',
            detail: juliaReady
              ? AGI_CONFIG.avatarRoutes.julia
              : 'Pending deploy on neural app',
          },
          {
            label: 'Singularity Console',
            state: singularityReady ? 'live' : 'offline',
            detail: AGI_CONFIG.taskInterfaceUrl,
          },
        ];

        setLogs(surfaces);
        setStatus(
          `${surfaces.filter((s) => s.state === 'live').length}/${surfaces.length} Surfaces Live`
        );
      } catch {
        if (cancelled) return;
        setStatus('Degraded');
        setLogs([
          {
            label: 'AGI-1 Backend',
            state: 'offline',
            detail: 'Health check failed',
          },
          {
            label: 'Jack Neural Channel',
            state: 'pending',
            detail: AGI_CONFIG.avatarRoutes.jack,
          },
          {
            label: 'Julia Neural Channel',
            state: 'pending',
            detail: AGI_CONFIG.avatarRoutes.julia,
          },
          {
            label: 'Singularity Console',
            state: 'offline',
            detail: AGI_CONFIG.taskInterfaceUrl,
          },
        ]);
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const toneClass: Record<SurfaceState, string> = {
    live: 'text-green-400 border-green-700',
    pending: 'text-yellow-300 border-yellow-600/60',
    offline: 'text-red-300 border-red-700/60',
  };

  return (
    <div className="p-6 bg-black/80 text-green-400 font-mono rounded-lg border border-green-900/50 backdrop-blur-md text-left">
      <h2 className="text-lg mb-4 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        AGI-1 System Status: {status}
      </h2>
      <div className="h-48 overflow-y-auto space-y-1 text-sm">
        {logs.map((log) => (
          <div
            key={log.label}
            className={`border-l-2 pl-2 py-1 ${toneClass[log.state]}`}
          >
            <div>
              &gt; {log.label} — {log.state.toUpperCase()}
            </div>
            <div className="text-[11px] opacity-80">{log.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
