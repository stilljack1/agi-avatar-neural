'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ConnectedService {
  service: string;
  status: 'enabled' | 'disabled';
  granted_permissions: string[];
  categories: string[];
  last_granted_at: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  drive: 'Drive & Docs',
  calendar: 'Calendar',
  sheets: 'Sheets',
  contacts: 'Contacts',
  camera: 'Camera',
  microphone: 'Microphone',
  location: 'Location',
  notifications: 'Notifications',
};

export default function PrivacyConnectionsPage() {
  const router = useRouter();
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyService, setBusyService] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/user/connected-services');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load connected services.');
      }
      setServices(data.services || []);
      setMessage(data.message || '');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load connected services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  async function revokeService(service: string) {
    setBusyService(service);
    setError('');
    try {
      const response = await fetch('/api/user/connected-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', service }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke service.');
      }
      setServices(data.services || []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to revoke service.');
    } finally {
      setBusyService(null);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
        <button
          onClick={() => router.push('/settings/privacy')}
          className="text-white/30 hover:text-white/60 text-sm flex items-center gap-1 mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Privacy Center
        </button>

        <h1 className="text-2xl font-bold">Connected Services & Permissions</h1>
        <p className="text-white/40 text-sm mt-1 max-w-2xl">
          AGI-1 requests Gmail, Drive, Sheets, camera, microphone, and similar permissions only
          when you actively use a feature that needs them. You can revoke them here at any time.
        </p>

        {message && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {loading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-white/8 bg-white/[0.03] p-5 animate-pulse">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="mt-3 h-3 w-40 rounded bg-white/5" />
                <div className="mt-5 h-9 w-24 rounded bg-white/5" />
              </div>
            ))}

          {!loading &&
            services.map((service) => {
              const enabled = service.status === 'enabled';
              return (
                <div key={service.service} className="rounded-xl border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{SERVICE_LABELS[service.service] || service.service}</h2>
                      <p className="text-xs text-white/30 mt-1">
                        {enabled
                          ? `Enabled for ${service.granted_permissions.join(', ')}`
                          : 'Not enabled. AGI-1 will request this later only if a feature needs it.'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                        enabled
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : 'bg-white/5 text-white/35 border border-white/10'
                      }`}
                    >
                      {enabled ? 'Enabled' : 'Off'}
                    </span>
                  </div>

                  <div className="mt-4 text-xs text-white/35">
                    {service.last_granted_at
                      ? `Last granted ${new Date(service.last_granted_at).toLocaleString()}`
                      : 'No active grant on record.'}
                  </div>

                  <button
                    onClick={() => revokeService(service.service)}
                    disabled={!enabled || busyService === service.service}
                    className="mt-5 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busyService === service.service ? 'Revoking...' : enabled ? 'Revoke access' : 'Enable from feature flow'}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
