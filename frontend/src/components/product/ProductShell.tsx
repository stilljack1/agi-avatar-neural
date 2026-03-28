'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  LayoutPanelLeft,
  PanelRight,
  PanelRightClose,
  Rocket,
  ShieldCheck,
  Video,
  VideoOff,
  Waves,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { AGI_CONFIG } from '@/lib/config';
import '@/styles/product-shell.css';

// ── Types ─────────────────────────────────────────────

type AgentId = 'jack' | 'julia';
type TaskState = 'pending' | 'running' | 'completed' | 'failed';
type SurfaceMode = 'pending' | 'live' | 'offline';

type ActivityEntry = {
  id: string;
  source: 'system' | 'agent' | 'singularity' | 'aegis' | 'network';
  title: string;
  detail: string;
  state: TaskState;
  timestamp: string;
};

type SurfaceSnapshot = {
  backend: SurfaceMode;
  backendDetail: string;
  llm: string;
  jackRoute: SurfaceMode;
  juliaRoute: SurfaceMode;
  singularityRoute: SurfaceMode;
  ws: 'pending' | 'connected' | 'fallback';
};

type AgentConfig = {
  id: AgentId;
  label: string;
  role: string;
  subtitle: string;
  wakePhrase: string;
  accentClass: string;
  route: string;
  previewVideo: string;
  fallbackMessage: string;
  responsibilities: string[];
};

// ── Constants ─────────────────────────────────────────

const AGENTS: Record<AgentId, AgentConfig> = {
  jack: {
    id: 'jack',
    label: 'Jack',
    role: 'Operator',
    subtitle: 'Task executor, architecture lead, execution leadership',
    wakePhrase: 'Hey Jack',
    accentClass: 'ps-is-blue',
    route: AGI_CONFIG.avatarRoutes.jack,
    previewVideo: '/avatars/jack-idle.mp4',
    fallbackMessage:
      'Jack remains the active operator when the neural route is not yet available in-frame.',
    responsibilities: [
      'execution leadership',
      'architecture and planning',
      'task intake and operator control',
    ],
  },
  julia: {
    id: 'julia',
    label: 'Julia',
    role: 'Assistant',
    subtitle: 'Conversational AI, UX guidance, product communication',
    wakePhrase: 'Hi Julia',
    accentClass: 'ps-is-orange',
    route: AGI_CONFIG.avatarRoutes.julia,
    previewVideo: '/avatars/julia-idle.mp4',
    fallbackMessage:
      'Julia remains the user-facing assistant even when the live neural route still needs deployment alignment.',
    responsibilities: [
      'conversation and guidance',
      'UX and product reasoning',
      'communication and explanation',
    ],
  },
};

const INITIAL_SURFACES: SurfaceSnapshot = {
  backend: 'pending',
  backendDetail: 'Connecting to brain',
  llm: 'unknown',
  jackRoute: 'pending',
  juliaRoute: 'pending',
  singularityRoute: 'pending',
  ws: 'pending',
};

// ── Helpers ───────────────────────────────────────────

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function stamp(): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function makeWsUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    return url.toString();
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<SurfaceMode> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok ? 'live' : 'offline';
  } catch {
    return 'offline';
  }
}

function stateTone(state: TaskState | SurfaceMode) {
  switch (state) {
    case 'completed':
    case 'live':
      return 'ps-is-success';
    case 'running':
      return 'ps-is-running';
    case 'failed':
    case 'offline':
      return 'ps-is-danger';
    default:
      return 'ps-is-pending';
  }
}

function modeToTaskState(mode: SurfaceMode): TaskState {
  if (mode === 'live') return 'running';
  if (mode === 'offline') return 'failed';
  return 'pending';
}

// ── Main Shell ────────────────────────────────────────

export function ProductShell() {
  const [activeAgent, setActiveAgent] = useState<AgentId>('jack');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [stageCollapsed, setStageCollapsed] = useState(false);
  const [surface, setSurface] = useState<SurfaceSnapshot>(INITIAL_SURFACES);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    {
      id: createId(),
      source: 'system',
      title: 'AGI-1 shell booted',
      detail:
        'Interaction, execution, and Singularity layers are initializing.',
      state: 'running',
      timestamp: stamp(),
    },
  ]);

  const previousSurfaceRef = useRef<SurfaceSnapshot>(INITIAL_SURFACES);
  const touchStartX = useRef<number | null>(null);

  const pushActivity = useCallback(
    (
      source: ActivityEntry['source'],
      title: string,
      detail: string,
      state: TaskState
    ) => {
      setActivity((current) =>
        [
          {
            id: createId(),
            source,
            title,
            detail,
            state,
            timestamp: stamp(),
          },
          ...current,
        ].slice(0, 18)
      );
    },
    []
  );

  const openExternal = useCallback(
    (url: string, title: string, source: ActivityEntry['source']) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      pushActivity(source, title, url, 'completed');
    },
    [pushActivity]
  );

  // ── Surface probing ─────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const syncSurfaces = async () => {
      try {
        const [healthResponse, jackRoute, juliaRoute, singularityRoute] =
          await Promise.all([
            fetch(`${AGI_CONFIG.backendUrl}/health`),
            probe(AGI_CONFIG.avatarRoutes.jack),
            probe(AGI_CONFIG.avatarRoutes.julia),
            probe(AGI_CONFIG.taskInterfaceUrl),
          ]);

        let backend: SurfaceMode = 'offline';
        let backendDetail = 'Health check failed';
        let llm = 'unknown';

        if (healthResponse.ok) {
          const data = await healthResponse.json();
          backend = data.ok ? 'live' : 'offline';
          backendDetail = data.status || 'Connected';
          llm = data.llm || 'live';
        }

        if (cancelled) return;

        const nextSurface: SurfaceSnapshot = {
          backend,
          backendDetail,
          llm,
          jackRoute,
          juliaRoute,
          singularityRoute,
          ws: previousSurfaceRef.current.ws,
        };

        const previous = previousSurfaceRef.current;
        if (
          previous.backend !== nextSurface.backend ||
          previous.backendDetail !== nextSurface.backendDetail
        ) {
          pushActivity(
            'system',
            'Brain status updated',
            `${nextSurface.backendDetail} • llm: ${nextSurface.llm}`,
            modeToTaskState(nextSurface.backend)
          );
        }
        if (previous.jackRoute !== nextSurface.jackRoute) {
          pushActivity(
            'agent',
            'Jack channel check',
            AGI_CONFIG.avatarRoutes.jack,
            modeToTaskState(nextSurface.jackRoute)
          );
        }
        if (previous.juliaRoute !== nextSurface.juliaRoute) {
          pushActivity(
            'agent',
            'Julia channel check',
            AGI_CONFIG.avatarRoutes.julia,
            modeToTaskState(nextSurface.juliaRoute)
          );
        }

        previousSurfaceRef.current = nextSurface;
        setSurface(nextSurface);
      } catch {
        if (!cancelled) {
          setSurface((current) => ({
            ...current,
            backend: 'offline',
            backendDetail: 'Unable to reach api.agi1.org',
          }));
        }
      }
    };

    void syncSurfaces();
    const intervalId = window.setInterval(() => {
      void syncSurfaces();
    }, 25000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pushActivity]);

  // ── WebSocket ───────────────────────────────────────

  useEffect(() => {
    const wsUrl = makeWsUrl(AGI_CONFIG.backendUrl);
    if (!wsUrl) {
      setSurface((current) => ({ ...current, ws: 'fallback' }));
      return;
    }

    let closedByCleanup = false;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      setSurface((current) => ({ ...current, ws: 'fallback' }));
      pushActivity(
        'network',
        'Realtime channel unavailable',
        'Falling back to heartbeat polling.',
        'pending'
      );
      return;
    }

    socket.addEventListener('open', () => {
      setSurface((current) => ({ ...current, ws: 'connected' }));
      previousSurfaceRef.current = {
        ...previousSurfaceRef.current,
        ws: 'connected',
      };
      pushActivity('network', 'Realtime channel connected', wsUrl, 'running');
    });

    socket.addEventListener('error', () => {
      setSurface((current) => ({ ...current, ws: 'fallback' }));
      previousSurfaceRef.current = {
        ...previousSurfaceRef.current,
        ws: 'fallback',
      };
    });

    socket.addEventListener('close', () => {
      if (!closedByCleanup) {
        setSurface((current) => ({ ...current, ws: 'fallback' }));
        previousSurfaceRef.current = {
          ...previousSurfaceRef.current,
          ws: 'fallback',
        };
        pushActivity(
          'network',
          'Realtime channel closed',
          'Polling remains active for surface checks.',
          'pending'
        );
      }
    });

    return () => {
      closedByCleanup = true;
      socket?.close();
    };
  }, [pushActivity]);

  // ── Derived ─────────────────────────────────────────

  const executionTimeline = useMemo(
    () => [
      {
        title: 'AGI-1 brain',
        state: modeToTaskState(surface.backend),
        detail: `${surface.backendDetail} • llm: ${surface.llm}`,
      },
      {
        title: 'Jack operator channel',
        state: modeToTaskState(surface.jackRoute),
        detail:
          surface.jackRoute === 'live'
            ? AGI_CONFIG.avatarRoutes.jack
            : 'Operator route needs attention',
      },
      {
        title: 'Julia assistant channel',
        state: modeToTaskState(surface.juliaRoute),
        detail:
          surface.juliaRoute === 'live'
            ? AGI_CONFIG.avatarRoutes.julia
            : 'Assistant route pending or unavailable',
      },
      {
        title: 'Singularity execution surface',
        state: modeToTaskState(surface.singularityRoute),
        detail: AGI_CONFIG.taskInterfaceUrl,
      },
      {
        title: 'Aegis oversight layer',
        state:
          surface.backend === 'live'
            ? ('running' as TaskState)
            : ('pending' as TaskState),
        detail:
          'Background guardrail, credential protection, and policy supervision',
      },
    ],
    [surface]
  );

  const currentAgent = AGENTS[activeAgent];

  const onStageTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      touchStartX.current = event.touches[0]?.clientX ?? null;
    },
    []
  );

  const onStageTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (touchStartX.current === null) return;
      const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
      const delta = endX - touchStartX.current;
      if (Math.abs(delta) > 50) {
        setActiveAgent((current) =>
          delta < 0
            ? current === 'jack'
              ? 'julia'
              : 'jack'
            : current === 'julia'
              ? 'jack'
              : 'julia'
        );
      }
      touchStartX.current = null;
    },
    []
  );

  // ── Render ──────────────────────────────────────────

  return (
    <div className="product-shell-root">
      {/* TopBar */}
      <header className="ps-topbar">
        <div className="ps-brand-mark">
          <div className="ps-brand-icon">AGI-1</div>
          <div>
            <div className="ps-brand-title">Operating System for Intelligence</div>
            <div className="ps-brand-subtitle">
              Jack & Julia as the primary interface • Singularity as the second
              interface
            </div>
          </div>
        </div>

        <div className="ps-topbar-nav">
          <button
            className={`ps-nav-pill ${activeAgent === 'jack' ? 'is-active' : ''}`}
            onClick={() => setActiveAgent('jack')}
          >
            Jack
          </button>
          <button
            className={`ps-nav-pill ${activeAgent === 'julia' ? 'is-active' : ''}`}
            onClick={() => setActiveAgent('julia')}
          >
            Julia
          </button>
          <Link
            href="/singularity"
            className="ps-nav-pill ps-nav-pill--singularity"
          >
            <Rocket size={15} />
            Singularity
          </Link>
        </div>

        <div className="ps-topbar-status">
          <StatusBadge state={surface.backend}>
            {surface.backendDetail}
          </StatusBadge>
          <StatusBadge
            state={surface.ws === 'connected' ? 'live' : 'pending'}
          >
            {surface.ws === 'connected' ? 'ws live' : 'polling'}
          </StatusBadge>
        </div>
      </header>

      {/* Three-Column Layout */}
      <div className="ps-product-layout">
        {/* Left Sidebar */}
        <aside className="ps-panel ps-sidebar-panel ps-desktop-only">
          <SectionLabel
            icon={<LayoutPanelLeft size={16} />}
            title="Agent Layer"
            subtitle="Jack and Julia are the primary interaction system."
          />
          <div className="ps-sidebar-stack">
            {Object.values(AGENTS).map((agent) => (
              <button
                key={agent.id}
                className={`ps-sidebar-agent ${activeAgent === agent.id ? 'is-selected' : ''}`}
                onClick={() => {
                  setActiveAgent(agent.id);
                  pushActivity(
                    'agent',
                    `${agent.label} focused`,
                    agent.subtitle,
                    'running'
                  );
                }}
              >
                <div>
                  <div className="ps-sidebar-agent-title">{agent.label}</div>
                  <div className="ps-sidebar-agent-copy">
                    {agent.role} • {agent.subtitle}
                  </div>
                </div>
                <StatusBadge
                  state={
                    agent.id === 'jack'
                      ? surface.jackRoute
                      : surface.juliaRoute
                  }
                >
                  {agent.id === 'jack'
                    ? surface.jackRoute
                    : surface.juliaRoute}
                </StatusBadge>
              </button>
            ))}
          </div>

          <div className="ps-sidebar-card">
            <div className="ps-sidebar-card-title">System split</div>
            <ul className="ps-sidebar-bullets">
              <li>Jack = operator and execution leadership</li>
              <li>Julia = assistant and user-facing intelligence</li>
              <li>Singularity = isolated execution environment</li>
              <li>Aegis = background safety and trust layer</li>
            </ul>
          </div>

          <Link href="/singularity" className="ps-mode-button ps-mode-button--singularity">
            <Rocket size={16} />
            Singularity Mode
          </Link>
        </aside>

        {/* Center Column */}
        <main className="ps-interaction-column">
          {/* Mobile Agent Strip */}
          <div className="ps-mobile-agent-strip">
            {Object.values(AGENTS).map((agent) => (
              <button
                key={agent.id}
                className={`ps-mobile-agent-chip ${activeAgent === agent.id ? 'is-selected' : ''}`}
                onClick={() => setActiveAgent(agent.id)}
              >
                <span>{agent.label}</span>
                <span className="ps-mobile-agent-chip-copy">{agent.role}</span>
              </button>
            ))}
          </div>

          {/* Interaction Panel */}
          <section className="ps-panel ps-interaction-panel">
            <SectionLabel
              icon={<Bot size={16} />}
              title={`${currentAgent.label} Interface`}
              subtitle="Main AGI-1 welcome and interaction layer"
            />

            <div className="ps-interaction-toolbar">
              <button
                className="ps-toolbar-button"
                onClick={() =>
                  openExternal(
                    `${currentAgent.route}?mode=voice`,
                    `Opened ${currentAgent.label} voice channel`,
                    'agent'
                  )
                }
              >
                <Waves size={15} />
                Voice
              </button>
              <button
                className="ps-toolbar-button"
                onClick={() =>
                  openExternal(
                    `${currentAgent.route}?mode=video`,
                    `Opened ${currentAgent.label} video channel`,
                    'agent'
                  )
                }
              >
                <Camera size={15} />
                Camera
              </button>
              <button
                className={`ps-toolbar-button ${fallbackMode ? 'is-active' : ''}`}
                onClick={() => setFallbackMode((c) => !c)}
              >
                {fallbackMode ? <VideoOff size={15} /> : <Video size={15} />}
                Fallback
              </button>
              <button
                className="ps-toolbar-button"
                onClick={() => setStageCollapsed((c) => !c)}
              >
                {stageCollapsed ? (
                  <PanelRight size={15} />
                ) : (
                  <PanelRightClose size={15} />
                )}
                {stageCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>

            <div
              className="ps-agent-stage-shell"
              onTouchStart={onStageTouchStart}
              onTouchEnd={onStageTouchEnd}
            >
              {stageCollapsed ? (
                <CollapsedStage
                  agent={currentAgent}
                  surface={surface}
                  onOpen={() =>
                    openExternal(
                      currentAgent.route,
                      `Opened ${currentAgent.label} live channel`,
                      'agent'
                    )
                  }
                />
              ) : (
                <AgentStage
                  agent={currentAgent}
                  isRouteLive={
                    (currentAgent.id === 'jack'
                      ? surface.jackRoute
                      : surface.juliaRoute) === 'live'
                  }
                  fallbackMode={fallbackMode}
                  onOpen={() =>
                    openExternal(
                      currentAgent.route,
                      `Opened ${currentAgent.label} live channel`,
                      'agent'
                    )
                  }
                />
              )}
            </div>

            <div className="ps-interaction-footer">
              <InfoChip label="Wake phrase" value={currentAgent.wakePhrase} />
              <InfoChip label="Aegis" value="active in background" />
              <InfoChip
                label="Execution"
                value="launches in second interface"
              />
              <InfoChip label="Route" value={currentAgent.route} />
            </div>
          </section>

          {/* Architecture Cards */}
          <section className="ps-panel ps-intelligence-panel">
            <SectionLabel
              icon={<BrainCircuit size={16} />}
              title="Interaction Architecture"
              subtitle="Clear separation between agent intelligence and system execution"
            />
            <div className="ps-intelligence-grid">
              <ArchitectureCard
                title="Jack"
                label="Operator"
                copy="Handles task intake, planning, execution leadership, and direct operating flow."
                tone="is-blue"
              />
              <ArchitectureCard
                title="Julia"
                label="Assistant"
                copy="Handles conversation, communication, product reasoning, and guided user support."
                tone="is-orange"
              />
              <ArchitectureCard
                title="Singularity"
                label="Execution Layer"
                copy="Runs task pipelines, system control, background operations, and device orchestration."
                tone="is-violet"
              />
              <ArchitectureCard
                title="Aegis"
                label="Background Guardrail"
                copy="Stays invisible, protects permissions, secrets, privacy, and aligned execution boundaries."
                tone="is-neutral"
              />
            </div>
          </section>
        </main>

        {/* Right Column — Execution Console */}
        <aside className="ps-execution-column ps-desktop-execution">
          <ExecutionConsole
            surface={surface}
            timeline={executionTimeline}
            activity={activity}
            onOpenDashboard={() =>
              openExternal(
                AGI_CONFIG.taskInterfaceUrl,
                'Opened task execution console',
                'singularity'
              )
            }
          />
        </aside>
      </div>

      {/* Desktop Logs */}
      <section className="ps-panel ps-logs-panel ps-desktop-logs">
        <SectionLabel
          icon={<Activity size={16} />}
          title="System State"
          subtitle="Bottom-layer logs and operating-state trace"
        />
        <ActivityFeed activity={activity} />
      </section>

      {/* Mobile FAB */}
      <button
        className="ps-floating-task-button ps-mobile-only"
        onClick={() => setDrawerOpen(true)}
      >
        <Rocket size={18} />
        Tasks
      </button>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <TaskDrawer
          surface={surface}
          timeline={executionTimeline}
          activity={activity}
          onClose={() => setDrawerOpen(false)}
          onOpenDashboard={() =>
            openExternal(
              AGI_CONFIG.taskInterfaceUrl,
              'Opened mobile execution console',
              'singularity'
            )
          }
        />
      )}
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────

function SectionLabel({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="ps-section-label">
      <div className="ps-section-label-title">
        <span className="ps-section-label-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="ps-section-label-subtitle">{subtitle}</div>
    </div>
  );
}

function StatusBadge({
  state,
  children,
}: {
  state: TaskState | SurfaceMode;
  children: React.ReactNode;
}) {
  return (
    <span className={`ps-status-badge ${stateTone(state)}`}>{children}</span>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="ps-info-chip">
      <span className="ps-info-chip-label">{label}</span>
      <span className="ps-info-chip-value">{value}</span>
    </div>
  );
}

function AgentStage({
  agent,
  isRouteLive,
  fallbackMode,
  onOpen,
}: {
  agent: AgentConfig;
  isRouteLive: boolean;
  fallbackMode: boolean;
  onOpen: () => void;
}) {
  if (fallbackMode || !isRouteLive) {
    return (
      <div className={`ps-agent-fallback ${agent.accentClass}`}>
        <video
          className="ps-agent-preview-video"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src={agent.previewVideo} type="video/mp4" />
        </video>
        <div className="ps-agent-fallback-overlay">
          <div className="ps-agent-fallback-copy">
            <div className="ps-agent-fallback-title">{agent.label}</div>
            <p>
              {isRouteLive
                ? 'Avatar fallback mode is active for low-bandwidth viewing.'
                : agent.fallbackMessage}
            </p>
          </div>
          <button className="ps-primary-action" onClick={onOpen}>
            <ExternalLink size={15} />
            Open live channel
          </button>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title={`${agent.label} live interface`}
      src={agent.route}
      loading="lazy"
      className="ps-live-surface-frame"
    />
  );
}

function CollapsedStage({
  agent,
  surface,
  onOpen,
}: {
  agent: AgentConfig;
  surface: SurfaceSnapshot;
  onOpen: () => void;
}) {
  const routeState =
    agent.id === 'jack' ? surface.jackRoute : surface.juliaRoute;
  return (
    <div className="ps-collapsed-stage">
      <div>
        <div className="ps-collapsed-stage-title">
          {agent.label} remains active
        </div>
        <div className="ps-collapsed-stage-copy">{agent.subtitle}</div>
      </div>
      <div className="ps-collapsed-stage-actions">
        <StatusBadge state={routeState}>{routeState}</StatusBadge>
        <button className="ps-ghost-action" onClick={onOpen}>
          Restore live surface
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ArchitectureCard({
  title,
  label,
  copy,
  tone,
}: {
  title: string;
  label: string;
  copy: string;
  tone: 'is-blue' | 'is-orange' | 'is-violet' | 'is-neutral';
}) {
  return (
    <article className={`ps-architecture-card ${tone}`}>
      <div className="ps-architecture-card-label">{label}</div>
      <div className="ps-architecture-card-title">{title}</div>
      <p>{copy}</p>
    </article>
  );
}

function ExecutionConsole({
  surface,
  timeline,
  activity,
  onOpenDashboard,
}: {
  surface: SurfaceSnapshot;
  timeline: Array<{ title: string; state: TaskState; detail: string }>;
  activity: ActivityEntry[];
  onOpenDashboard: () => void;
}) {
  return (
    <section className="ps-panel ps-execution-panel">
      <SectionLabel
        icon={<Cpu size={16} />}
        title="Execution Layer"
        subtitle="Task console, orchestration status, and execution handoff"
      />

      <div className="ps-execution-actions">
        <button className="ps-primary-action" onClick={onOpenDashboard}>
          <ArrowUpRight size={15} />
          Open Tasks
        </button>
        <Link href="/singularity" className="ps-ghost-action">
          <Rocket size={15} />
          Singularity Mode
        </Link>
      </div>

      <div className="ps-execution-embed">
        <iframe
          title="Task execution interface"
          src={AGI_CONFIG.taskInterfaceUrl}
          loading="lazy"
          className="ps-live-surface-frame ps-execution-frame"
        />
      </div>

      <div className="ps-timeline-section">
        <div className="ps-timeline-header">Task progress timeline</div>
        <div className="ps-timeline-list">
          {timeline.map((item) => (
            <div key={item.title} className="ps-timeline-item">
              <div className={`ps-timeline-dot ${stateTone(item.state)}`} />
              <div className="ps-timeline-copy">
                <div className="ps-timeline-title">{item.title}</div>
                <div className="ps-timeline-detail">{item.detail}</div>
              </div>
              <StatusBadge state={item.state}>{item.state}</StatusBadge>
            </div>
          ))}
        </div>
      </div>

      <details
        className="ps-log-details"
        open={surface.backend === 'live'}
      >
        <summary>Expandable logs</summary>
        <ActivityFeed activity={activity.slice(0, 8)} />
      </details>
    </section>
  );
}

function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="ps-activity-feed">
      {activity.map((entry) => (
        <div key={entry.id} className="ps-activity-row">
          <div className="ps-activity-meta">
            <span className={`ps-activity-source ${stateTone(entry.state)}`}>
              {entry.source}
            </span>
            <span>{entry.timestamp}</span>
          </div>
          <div className="ps-activity-title">{entry.title}</div>
          <div className="ps-activity-detail">{entry.detail}</div>
        </div>
      ))}
    </div>
  );
}

function TaskDrawer({
  surface,
  timeline,
  activity,
  onClose,
  onOpenDashboard,
}: {
  surface: SurfaceSnapshot;
  timeline: Array<{ title: string; state: TaskState; detail: string }>;
  activity: ActivityEntry[];
  onClose: () => void;
  onOpenDashboard: () => void;
}) {
  return (
    <div className="ps-task-drawer-backdrop" onClick={onClose}>
      <div
        className="ps-task-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ps-task-drawer-header">
          <div>
            <div className="ps-task-drawer-title">Execution Console</div>
            <div className="ps-task-drawer-copy">
              Persistent on desktop, drawer on mobile.
            </div>
          </div>
          <button className="ps-icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <ExecutionConsole
          surface={surface}
          timeline={timeline}
          activity={activity}
          onOpenDashboard={onOpenDashboard}
        />
      </div>
    </div>
  );
}
