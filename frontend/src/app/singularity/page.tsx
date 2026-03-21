'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  Boxes,
  Cpu,
  Database,
  Logs,
  RadioTower,
  Shield,
  TerminalSquare,
} from 'lucide-react';

const QUEUE = [
  'Coordinating execution queues across API, neural, and admin surfaces',
  'Watching transport health and runtime truth signals',
  'Preparing rollback-safe deployment checkpoints',
];

const LOG_LINES = [
  'Neural runtime heartbeat steady on api.agi1.org',
  'Command-center bridge active on agi1.org/command-center',
  'Public route integrity checks passing on agi1.org and fairgroupai.com',
];

export default function SingularityPage() {
  useEffect(() => {
    document.title = 'AGI-1 Singularity Console';
  }, []);

  return (
    <main className="singularity-shell singularity-shell--cryo">
      <div className="singularity-shell__backdrop" />
      <div className="singularity-console">
        <header className="singularity-header">
          <div className="singularity-header__brand">
            <div className="singularity-header__glyph" />
            <div>
              <h1>AGI-1 Singularity Console</h1>
              <p>Sovereign execution layer. No avatar streams. No consumer UI bleed-through.</p>
            </div>
          </div>

          <div className="singularity-header__themebar">
            <Link href="/neural" className="theme-toggle theme-toggle--active">
              <span>Neural</span>
              <small>Avatar interface</small>
            </Link>
            <Link href="/workspace" className="theme-toggle">
              <span>Workspace</span>
              <small>Operator tools</small>
            </Link>
            <Link href="/command-center/" className="theme-toggle">
              <span>Command Center</span>
              <small>Admin dashboard</small>
            </Link>
          </div>
        </header>

        <div className="singularity-grid">
          <aside className="singularity-sidebar">
            <nav className="singularity-nav">
              <button className="singularity-nav__item is-active">
                <span className="singularity-nav__icon"><Boxes size={18} /></span>
                <span>Execution Queue</span>
              </button>
              <button className="singularity-nav__item">
                <span className="singularity-nav__icon"><RadioTower size={18} /></span>
                <span>Runtime Health</span>
              </button>
              <button className="singularity-nav__item">
                <span className="singularity-nav__icon"><Shield size={18} /></span>
                <span>Safety Guardrails</span>
              </button>
            </nav>
          </aside>

          <section className="singularity-main">
            <section className="status-strip">
              <StatusLine icon={<Activity size={15} />} label="System Status" value="Operational" positive />
              <StatusLine icon={<Cpu size={15} />} label="Execution Mode" value="Isolated console" />
              <StatusLine icon={<Database size={15} />} label="Runtime Truth" value="Audio and vision remain explicit" />
            </section>

            <section className="task-frame">
              <div className="task-frame__header">
                <h2>SINGULARITY EXECUTION CORE</h2>
                <div className="task-frame__actor-switch">
                  <button className="is-active">Execution</button>
                  <button>Observability</button>
                  <button>Safety</button>
                </div>
              </div>

              <div className="task-columns">
                <Panel title="Queue" icon={<TerminalSquare size={16} />}>
                  <ol className="number-list">
                    {QUEUE.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </Panel>

                <Panel title="Live Notes" icon={<Logs size={16} />} active>
                  <div className="activity-log">
                    {LOG_LINES.map((line) => (
                      <div key={line} className="activity-log__row">
                        <span className="activity-log__time">LIVE</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="singularity-right" style={{ marginTop: 24 }}>
                <Panel title="Operator Paths" icon={<ArrowRight size={16} />}>
                  <div className="task-summary">
                    <div className="task-summary__row">
                      <span>Neural Interface</span>
                      <strong>/neural</strong>
                    </div>
                    <div className="task-summary__row">
                      <span>Workspace</span>
                      <strong>/workspace</strong>
                    </div>
                    <div className="task-summary__row">
                      <span>Command Center</span>
                      <strong>/command-center/</strong>
                    </div>
                  </div>
                </Panel>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}

function StatusLine({
  icon,
  label,
  value,
  positive = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className={`status-line ${positive ? 'status-line--positive' : ''}`}>
      <div className="status-line__icon">{icon}</div>
      <div>
        <span className="status-line__label">{label}</span>
        <strong className="status-line__value">{value}</strong>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  active = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <section className={`task-panel ${active ? 'task-panel--active' : ''}`}>
      <div className="task-panel__header">
        <span className="task-panel__icon">{icon}</span>
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  );
}
