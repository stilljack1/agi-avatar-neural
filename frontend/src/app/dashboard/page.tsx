'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  ChevronRight,
  Cpu,
  Database,
  Logs,
  Network,
  RadioTower,
  Settings,
  Shield,
  TerminalSquare,
  TimerReset,
} from 'lucide-react';
import AvatarBrain from '../../components/avatar/AvatarBrain';
import SovereignSwitcher from '../../components/SovereignSwitcher';
import assetManifest from '../../../asset-manifest.json';

type ThemeName = 'thermal' | 'cryo';
type PresenceState = 'idle' | 'thinking' | 'speaking';
type ActorId = 'jack' | 'julia';
type TabId = 'active' | 'details' | 'logs';

const THEMES: Array<{
  id: ThemeName;
  label: string;
  accent: string;
  progress: string;
}> = [
  { id: 'thermal', label: 'Thermal', accent: 'Orange lattice', progress: 'amber' },
  { id: 'cryo', label: 'Cryo', accent: 'Blue lattice', progress: 'cyan' },
];

const SIDEBAR_ITEMS = [
  { id: 'queue', label: 'Sypoest Queue', icon: Boxes },
  { id: 'history', label: 'Task History', icon: TimerReset },
  { id: 'resources', label: 'Resource Monitor', icon: RadioTower },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const TASK_OVERVIEW = [
  'Analyzing multi-cloud execution logs',
  'Reconciling agent supervision traces',
  'Compiling operator deployment packet',
];

const TASK_DETAIL_LINES = [
  ['Current Task', 'Data Analysis & Report Generation'],
  ['Priority', 'High'],
  ['Estimated Time', '02:35 Remaining'],
  ['Routing', 'Bedrock Primary • OpenRouter Fallback'],
  ['Presence', 'MP4 Sovereign Mode • Hot-Swap Ready'],
];

const ACTIVITY_LOG = [
  { time: '14:22', line: 'Data Processing: Analyzing dataset drift against deployment packet.' },
  { time: '14:18', line: 'Sub-task Started: Report drafting initiated for executive review.' },
  { time: '14:15', line: 'System Update: Models optimized and confidence flywheel re-indexed.' },
];

export default function DashboardPage() {
  const [theme, setTheme] = useState<ThemeName>('cryo');
  const [activeTab, setActiveTab] = useState<TabId>('active');
  const [activeActor, setActiveActor] = useState<ActorId>('julia');
  const [presenceState, setPresenceState] = useState<PresenceState>('speaking');
  const [command, setCommand] = useState('');

  const metrics = useMemo(
    () => ({
      cpu: theme === 'thermal' ? 74 : 62,
      memory: theme === 'thermal' ? 62 : 58,
      network: theme === 'thermal' ? 45 : 41,
    }),
    [theme]
  );

  const progress = theme === 'thermal' ? 76 : 81;

  const profiles = useMemo(
    () => ({
      jack: {
        id: 'jack',
        displayName: 'Jack',
        title: 'AGI-1 Operations Officer',
        speech: 'Routing the execution tree now. Supervisor consensus is stabilizing.',
        poster: assetManifest.jack.image,
        idleVideo: assetManifest.jack.video,
        speakingVideo: assetManifest.jack.video,
      },
      julia: {
        id: 'julia',
        displayName: 'Singularity',
        title: 'AGI-1 Task Officer',
        speech: "Processing the data now, I'll have the report ready shortly.",
        poster: assetManifest.julia.image,
        idleVideo: assetManifest.julia.video,
        speakingVideo: assetManifest.julia.video,
      },
    }),
    []
  );

  const activeProfile = profiles[activeActor];

  const submitCommand = () => {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    setPresenceState('thinking');
    window.setTimeout(() => setPresenceState('speaking'), 550);
    setCommand('');
  };

  return (
    <main className={`singularity-shell singularity-shell--${theme}`}>
      <div className="singularity-shell__backdrop" />
      <div className="singularity-console">
        <header className="singularity-header">
          <div className="singularity-header__brand">
            <div className="singularity-header__glyph" />
            <div>
              <h1>AGI TASK EXECUTION</h1>
              <p>Singularity interface • sovereign execution console</p>
            </div>
          </div>

          <div className="singularity-header__themebar">
            {THEMES.map((themeOption) => (
              <button
                key={themeOption.id}
                className={`theme-toggle ${themeOption.id === theme ? 'theme-toggle--active' : ''}`}
                onClick={() => setTheme(themeOption.id)}
              >
                <span>{themeOption.label}</span>
                <small>{themeOption.accent}</small>
              </button>
            ))}
          </div>
        </header>

        <SovereignSwitcher />

        <div className="singularity-grid">
          <aside className="singularity-sidebar">
            <nav className="singularity-nav">
              {SIDEBAR_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.id === 'settings';
                return (
                  <button key={item.id} className={`singularity-nav__item ${active ? 'is-active' : ''}`}>
                    <span className="singularity-nav__icon">
                      <Icon size={18} />
                    </span>
                    <span>{item.label}</span>
                    {active ? <ChevronRight size={14} /> : null}
                  </button>
                );
              })}
            </nav>

            <div className="singularity-sidebar__palette">
              {['#66e4ff', '#d0e4ff', '#6171a7', '#f09e63', '#7aa9ff', '#ff9435'].map((chip) => (
                <span key={chip} style={{ backgroundColor: chip }} />
              ))}
            </div>
          </aside>

          <section className="singularity-main">
            <section className="status-strip">
              <StatusLine icon={<Activity size={15} />} label="System Status" value="OPERATIONAL" positive />
              <StatusLine
                icon={<Cpu size={15} />}
                label="Task Progress"
                value={`${progress}%`}
                progress={progress}
              />
              <StatusLine
                icon={<Network size={15} />}
                label="Resource Utilization"
                value={`CPU ${metrics.cpu}% | Memory ${metrics.memory}% | Network ${metrics.network}%`}
              />
            </section>

            <section className="task-frame" style={{ position: 'relative' }}>
              {/* Small square portrait screen - upper right */}
              <div className="task-frame__portrait">
                <video
                  key={`portrait-${activeActor}`}
                  className="task-frame__portrait-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                >
                  <source src={activeProfile.idleVideo} type="video/mp4" />
                </video>
                <div className="task-frame__portrait-badge">
                  <span className="task-frame__portrait-dot" />
                  {activeProfile.displayName}
                </div>
              </div>

              <div className="task-frame__header">
                <h2>MAIN TASK EXECUTION</h2>
                <div className="task-frame__actor-switch">
                  {(['julia', 'jack'] as ActorId[]).map((actor) => (
                    <button
                      key={actor}
                      className={actor === activeActor ? 'is-active' : ''}
                      onClick={() => setActiveActor(actor)}
                    >
                      {actor === 'julia' ? 'Singularity' : 'Jack'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="task-tabs">
                {[
                  { id: 'active', label: 'Active Task' },
                  { id: 'details', label: 'Task Details' },
                  { id: 'logs', label: 'Logs' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={activeTab === tab.id ? 'is-active' : ''}
                    onClick={() => setActiveTab(tab.id as TabId)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="task-summary">
                {TASK_DETAIL_LINES.map(([label, value]) => (
                  <div key={label} className="task-summary__row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="task-columns">
                <Panel title="Task Overview" icon={<TerminalSquare size={16} />}>
                  <ol className="number-list">
                    {TASK_OVERVIEW.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </Panel>

                <Panel title="Sub-Tasks" icon={<Database size={16} />} active>
                  <div className="subtask-list">
                    <SubtaskRow label="Data Processing" status="In Progress" metric="84.3 GB" progress={92} />
                    <SubtaskRow label="Report Drafting" status="Pending" metric="97.6%" progress={98} />
                    <SubtaskRow label="Summary Generation" status="Pending" metric="68%" progress={68} />
                  </div>
                </Panel>

                <Panel title="Live Metrics" icon={<Shield size={16} />}>
                  <div className="live-metrics">
                    <MetricPill label="Consensus" value="99.2%" />
                    <MetricPill label="Aegis" value="PASS" />
                    <MetricPill label="Trinity" value="SYNCED" />
                    <MetricPill label="Hydration" value="2.1 KB" />
                  </div>
                </Panel>
              </div>

              <section className="activity-log">
                <div className="activity-log__header">
                  <Logs size={16} />
                  <span>Activity Log</span>
                </div>
                {ACTIVITY_LOG.map((entry) => (
                  <div key={`${entry.time}-${entry.line}`} className="activity-log__row">
                    <time>{entry.time}</time>
                    <span>{entry.line}</span>
                  </div>
                ))}
              </section>
            </section>
          </section>

          <aside className="singularity-right">
            <AvatarBrain
              profile={activeProfile}
              state={presenceState}
              theme={theme}
              taskLabel="Factory / War Room"
              metrics={metrics}
            />

            <section className="circuit-panel">
              <div className="circuit-panel__header">Execution Lattice</div>
              <div className="circuit-panel__grid">
                {Array.from({ length: 34 }).map((_, index) => (
                  <span key={index} className={`circuit-node ${index % 4 === 0 ? 'circuit-node--wide' : ''}`} />
                ))}
              </div>
            </section>
          </aside>
        </div>

        <footer className="command-bar">
          <button className="command-bar__lock" onClick={() => setPresenceState('idle')}>
            <Shield size={18} />
          </button>

          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onFocus={() => setPresenceState('thinking')}
            onBlur={() => setPresenceState('idle')}
            placeholder="Type your request..."
          />

          <button className="command-bar__send" onClick={submitCommand}>
            SEND
          </button>
        </footer>
      </div>
    </main>
  );
}

function StatusLine({
  icon,
  label,
  value,
  progress,
  positive = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: number;
  positive?: boolean;
}) {
  return (
    <div className="status-line">
      <div className={`status-line__bullet ${positive ? 'is-positive' : ''}`}>{icon}</div>
      <div className="status-line__copy">
        <span>{label}:</span>
        <strong>{value}</strong>
      </div>
      {typeof progress === 'number' ? (
        <div className="status-line__progress">
          <div className="status-line__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  icon,
  active = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`task-panel ${active ? 'task-panel--active' : ''}`}>
      <header className="task-panel__header">
        <span className="task-panel__icon">{icon}</span>
        <span>{title}</span>
      </header>
      <div className="task-panel__content">{children}</div>
    </section>
  );
}

function SubtaskRow({
  label,
  status,
  metric,
  progress,
}: {
  label: string;
  status: string;
  metric: string;
  progress: number;
}) {
  return (
    <div className="subtask-row">
      <div>
        <span className="subtask-row__label">{label}</span>
        <span className="subtask-row__status">{status}</span>
      </div>
      <div className="subtask-row__meter">
        <div className="subtask-row__bar">
          <div className="subtask-row__fill" style={{ width: `${progress}%` }} />
        </div>
        <strong>{metric}</strong>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
