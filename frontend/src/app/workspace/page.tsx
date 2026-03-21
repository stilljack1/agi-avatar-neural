'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  FolderSearch,
  HardDrive,
  Inbox,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import SovereignSwitcher from '../../components/SovereignSwitcher';

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

type ConnectionService = 'gmail' | 'drive' | 'docs' | 'sheets';
type ConnectionStatus = 'connected' | 'disconnected' | 'syncing';
type EmailPriority = 'critical' | 'important' | 'needs_reply' | 'suspicious' | 'normal';
type TaskStatus = 'running' | 'pending' | 'completed' | 'failed' | 'awaiting_approval';

interface ServiceConnection {
  service: ConnectionService;
  status: ConnectionStatus;
  lastSync: string | null;
}

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  priority: EmailPriority;
  isRead: boolean;
  aiAnalysis?: string;
  scamAlert?: string;
}

interface DriveDoc {
  id: string;
  name: string;
  type: 'doc' | 'sheet' | 'slide' | 'pdf' | 'folder';
  modifiedAt: string;
  aiSummary?: string;
}

interface FinanceSheet {
  id: string;
  name: string;
  type: 'budget' | 'revenue' | 'expense' | 'forecast';
  totalAmount: number;
  anomalies: number;
  lastUpdated: string;
}

interface OpenClawTask {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number;
  subtasks: { label: string; status: TaskStatus; progress: number }[];
  createdAt: string;
}

interface ApprovalItem {
  id: string;
  task: string;
  action: string;
  risk: 'low' | 'medium' | 'high';
  requestedAt: string;
}

interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

/* ═══════════════════════════════════════════════
   SIDEBAR NAV
   ═══════════════════════════════════════════════ */

type SidebarSection = 'connections' | 'email' | 'drive' | 'finance' | 'openclaw';

const SIDEBAR_ITEMS: { id: SidebarSection; label: string; icon: typeof Inbox }[] = [
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'email', label: 'Email Intel', icon: Mail },
  { id: 'drive', label: 'Drive & Docs', icon: HardDrive },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'openclaw', label: 'OpenClaw', icon: Zap },
];

/* ═══════════════════════════════════════════════
   MOCK DATA (used when API is unavailable)
   ═══════════════════════════════════════════════ */

const MOCK_CONNECTIONS: ServiceConnection[] = [
  { service: 'gmail', status: 'connected', lastSync: '2 min ago' },
  { service: 'drive', status: 'connected', lastSync: '5 min ago' },
  { service: 'docs', status: 'syncing', lastSync: null },
  { service: 'sheets', status: 'disconnected', lastSync: null },
];

const MOCK_EMAILS: EmailItem[] = [
  {
    id: 'e1',
    from: 'investor@acme.vc',
    subject: 'Term Sheet — Series B Follow-on',
    snippet: 'Attached is the updated term sheet reflecting the new valuation cap...',
    body: 'Hi team,\n\nAttached is the updated term sheet reflecting the new valuation cap we discussed. Please review sections 3.2 and 4.1 regarding the liquidation preferences. We need your response by end of week.\n\nBest,\nMark',
    date: '14:32',
    priority: 'critical',
    isRead: false,
    aiAnalysis: 'High-priority investment document. Contains updated Series B terms with a revised valuation cap. Key sections flagged: liquidation preferences (3.2) and board composition (4.1). Deadline: end of week.',
  },
  {
    id: 'e2',
    from: 'ops@vendor-global.io',
    subject: 'Invoice #4812 — Infrastructure Services',
    snippet: 'Please find attached invoice for March infrastructure services...',
    date: '13:15',
    priority: 'important',
    isRead: true,
    aiAnalysis: 'Monthly infrastructure invoice. Amount is 12% higher than February — likely due to scaling event on March 8. Recommend cross-referencing with cloud spend dashboard.',
  },
  {
    id: 'e3',
    from: 'cto@partner.dev',
    subject: 'Re: API Integration Timeline',
    snippet: 'When can we schedule the technical review for the new endpoints?',
    date: '11:48',
    priority: 'needs_reply',
    isRead: true,
    aiAnalysis: 'Partner is requesting a timeline for the API integration technical review. Last message from our side was 3 days ago. Suggest scheduling within this week to maintain partnership momentum.',
  },
  {
    id: 'e4',
    from: 'security@bankofamerica-verify.xyz',
    subject: 'URGENT: Verify Your Account Immediately',
    snippet: 'Your account has been flagged for suspicious activity. Click here to verify...',
    date: '10:22',
    priority: 'suspicious',
    isRead: false,
    scamAlert: 'PHISHING DETECTED — Domain "bankofamerica-verify.xyz" is not a legitimate Bank of America domain. Contains suspicious redirect links and urgency language typical of credential-harvesting attacks. Do NOT click any links.',
    aiAnalysis: 'This is a phishing email. The sender domain is fraudulent. The email uses social engineering tactics (urgency, fear of account loss) to trick the recipient into clicking a malicious link.',
  },
  {
    id: 'e5',
    from: 'hr@company.com',
    subject: 'Q1 Team Performance Reviews Due',
    snippet: 'Reminder: All Q1 performance reviews are due by March 28th...',
    date: '09:05',
    priority: 'normal',
    isRead: true,
    aiAnalysis: 'Routine HR reminder. Q1 performance reviews deadline is March 28th. 8 days remaining.',
  },
];

const MOCK_DOCS: DriveDoc[] = [
  { id: 'd1', name: 'AGI-1 Architecture Overview', type: 'doc', modifiedAt: '2 hours ago', aiSummary: 'Comprehensive architecture document covering the multi-agent orchestration layer, sovereign execution pipeline, and OpenClaw task decomposition framework.' },
  { id: 'd2', name: 'Q1 Revenue Forecast', type: 'sheet', modifiedAt: '1 day ago', aiSummary: 'Revenue projections for Q1 showing 34% growth trajectory. Key drivers: enterprise contracts and API licensing.' },
  { id: 'd3', name: 'Investor Deck v4.2', type: 'slide', modifiedAt: '3 days ago' },
  { id: 'd4', name: 'Compliance Audit Report', type: 'pdf', modifiedAt: '1 week ago' },
  { id: 'd5', name: 'Engineering Sprint Plans', type: 'folder', modifiedAt: '5 hours ago' },
];

const MOCK_FINANCE: FinanceSheet[] = [
  { id: 'f1', name: 'Operating Budget 2025', type: 'budget', totalAmount: 2400000, anomalies: 0, lastUpdated: '1 hour ago' },
  { id: 'f2', name: 'Monthly Revenue Tracker', type: 'revenue', totalAmount: 847000, anomalies: 1, lastUpdated: '3 hours ago' },
  { id: 'f3', name: 'Infrastructure Expenses', type: 'expense', totalAmount: 156000, anomalies: 2, lastUpdated: '6 hours ago' },
  { id: 'f4', name: 'Series B Runway Model', type: 'forecast', totalAmount: 18000000, anomalies: 0, lastUpdated: '2 days ago' },
];

const MOCK_TASKS: OpenClawTask[] = [
  {
    id: 't1',
    label: 'Email Triage & Prioritization',
    status: 'running',
    progress: 72,
    subtasks: [
      { label: 'Fetch inbox (last 48h)', status: 'completed', progress: 100 },
      { label: 'NLP classification', status: 'running', progress: 85 },
      { label: 'Priority scoring', status: 'pending', progress: 0 },
      { label: 'Generate briefing', status: 'pending', progress: 0 },
    ],
    createdAt: '14:30',
  },
  {
    id: 't2',
    label: 'Financial Anomaly Detection',
    status: 'completed',
    progress: 100,
    subtasks: [
      { label: 'Load spreadsheet data', status: 'completed', progress: 100 },
      { label: 'Statistical analysis', status: 'completed', progress: 100 },
      { label: 'Flag anomalies', status: 'completed', progress: 100 },
    ],
    createdAt: '13:45',
  },
  {
    id: 't3',
    label: 'Draft Partner Response Email',
    status: 'awaiting_approval',
    progress: 95,
    subtasks: [
      { label: 'Context extraction', status: 'completed', progress: 100 },
      { label: 'Draft generation', status: 'completed', progress: 100 },
      { label: 'Tone calibration', status: 'completed', progress: 100 },
      { label: 'Human approval', status: 'awaiting_approval', progress: 0 },
    ],
    createdAt: '12:10',
  },
];

const MOCK_APPROVALS: ApprovalItem[] = [
  { id: 'a1', task: 'Send reply to cto@partner.dev', action: 'Send Email', risk: 'low', requestedAt: '12:15' },
  { id: 'a2', task: 'Update Q1 budget allocation', action: 'Modify Sheet', risk: 'medium', requestedAt: '11:30' },
];

const MOCK_LOG: LogEntry[] = [
  { time: '14:35', level: 'info', message: 'Email triage workflow initiated — processing 47 messages' },
  { time: '14:32', level: 'success', message: 'Financial anomaly scan complete — 2 anomalies flagged in Infrastructure Expenses' },
  { time: '14:28', level: 'warn', message: 'Phishing email detected from bankofamerica-verify.xyz — quarantined' },
  { time: '14:15', level: 'info', message: 'Google Drive sync completed — 12 documents indexed' },
  { time: '14:10', level: 'error', message: 'Sheets API rate limit hit — retrying in 30s' },
  { time: '14:05', level: 'success', message: 'Partner email draft generated — awaiting human approval' },
];

const EMPTY_CONNECTIONS: ServiceConnection[] = [
  { service: 'gmail', status: 'disconnected', lastSync: null },
  { service: 'drive', status: 'disconnected', lastSync: null },
  { service: 'docs', status: 'disconnected', lastSync: null },
  { service: 'sheets', status: 'disconnected', lastSync: null },
];

/* ═══════════════════════════════════════════════
   HELPER FUNCTIONS
   ═══════════════════════════════════════════════ */

function priorityLabel(p: EmailPriority): string {
  switch (p) {
    case 'critical': return 'CRITICAL';
    case 'important': return 'IMPORTANT';
    case 'needs_reply': return 'NEEDS REPLY';
    case 'suspicious': return 'SUSPICIOUS';
    default: return '';
  }
}

function serviceLabel(s: ConnectionService): string {
  switch (s) {
    case 'gmail': return 'Gmail';
    case 'drive': return 'Google Drive';
    case 'docs': return 'Google Docs';
    case 'sheets': return 'Google Sheets';
  }
}

function inferDriveType(mimeType?: string): DriveDoc['type'] {
  if (!mimeType) return 'doc';
  if (mimeType.includes('spreadsheet')) return 'sheet';
  if (mimeType.includes('presentation')) return 'slide';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('folder')) return 'folder';
  return 'doc';
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function statusColor(s: TaskStatus): string {
  switch (s) {
    case 'running': return '#55cfff';
    case 'completed': return '#22c55e';
    case 'failed': return '#ef4444';
    case 'awaiting_approval': return '#ff8d2b';
    case 'pending': return '#64748b';
  }
}

function logLevelColor(l: LogEntry['level']): string {
  switch (l) {
    case 'info': return '#55cfff';
    case 'warn': return '#ff8d2b';
    case 'error': return '#ef4444';
    case 'success': return '#22c55e';
  }
}

/* ═══════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════ */

export default function WorkspacePage() {
  const [activeSection, setActiveSection] = useState<SidebarSection>('email');
  const [connections, setConnections] = useState<ServiceConnection[]>(EMPTY_CONNECTIONS);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [docs, setDocs] = useState<DriveDoc[]>([]);
  const [financeSheets, setFinanceSheets] = useState<FinanceSheet[]>([]);
  const [tasks, setTasks] = useState<OpenClawTask[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [executionLog, setExecutionLog] = useState<LogEntry[]>([]);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const userId = 'default';

  /* ─── Data Fetching ─── */
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const statusRes = await fetch(`/api/workspace/status?user_id=${encodeURIComponent(userId)}`);
      const status = await statusRes.json();
      const integrations = status?.integrations || {};
      const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setConnections([
        { service: 'gmail', status: integrations.gmail ? 'connected' : 'disconnected', lastSync: integrations.gmail ? nowLabel : null },
        { service: 'drive', status: integrations.drive ? 'connected' : 'disconnected', lastSync: integrations.drive ? nowLabel : null },
        { service: 'docs', status: integrations.docs ? 'connected' : 'disconnected', lastSync: integrations.docs ? nowLabel : null },
        { service: 'sheets', status: integrations.sheets ? 'connected' : 'disconnected', lastSync: integrations.sheets ? nowLabel : null },
      ]);

      if (integrations.gmail) {
        const emailRes = await fetch(`/api/workspace/gmail?user_id=${encodeURIComponent(userId)}&max=20`);
        const emailData = await emailRes.json();
        const mappedEmails: EmailItem[] = (emailData.messages || []).map((message: any) => ({
          id: message.id,
          from: message.from || 'Unknown sender',
          subject: message.subject || 'Untitled',
          snippet: message.snippet || '',
          date: message.date || '',
          priority: 'normal',
          isRead: !(message.labels || []).includes('UNREAD'),
        }));
        setEmails(mappedEmails);
      } else {
        setEmails([]);
      }

      if (integrations.drive || integrations.docs || integrations.sheets) {
        const driveRes = await fetch('/api/workspace/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', user_id: userId, max: 20 }),
        });
        const driveData = await driveRes.json();
        const mappedDocs: DriveDoc[] = (driveData.files || []).map((file: any) => ({
          id: file.id,
          name: file.name || 'Untitled',
          type: inferDriveType(file.mimeType),
          modifiedAt: file.modifiedTime || file.createdTime || 'unknown',
        }));
        setDocs(mappedDocs);
        setFinanceSheets([]);
      } else {
        setDocs([]);
        setFinanceSheets([]);
      }

      setTasks([]);
      setApprovals([]);
      setExecutionLog((prev) => [
        ...prev.slice(-19),
        { time: nowLabel, level: 'info', message: 'Workspace refreshed from live connectors.' },
      ]);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh workspace data');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh emails every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAll();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  /* ─── Handlers ─── */
  const handleConnectGoogle = useCallback(async () => {
    window.location.href = `/api/workspace/oauth?user_id=${encodeURIComponent(userId)}`;
  }, [userId]);

  const handleDraftReply = useCallback(async (emailId: string) => {
    try {
      const response = await fetch('/api/workspace/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Draft a reply for this email thread',
          user_id: userId,
          context: { workflow: 'reply_management', messageId: emailId, create_draft: true },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || data?.error || 'Draft generation failed');
      setExecutionLog((prev) => [
        ...prev.slice(-19),
        { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), level: 'success', message: 'Draft reply generated through OpenClaw.' },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draft reply');
    }
  }, [userId]);

  const handleGenerateBriefing = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Review the latest finance sheet and produce a founder briefing',
          user_id: userId,
          context: { workflow: 'finance_review' },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || data?.error || 'Finance briefing failed');
      setExecutionLog((prev) => [
        ...prev.slice(-19),
        { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), level: 'success', message: 'Finance briefing generated.' },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate finance briefing');
    }
  }, [userId]);

  const handleApproval = useCallback(async (approvalId: string, decision: 'approve' | 'reject') => {
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    setExecutionLog((prev) => [
      ...prev.slice(-19),
      {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        level: decision === 'approve' ? 'success' : 'warn',
        message: `Approval ${decision}d for ${approvalId}.`,
      },
    ]);
  }, []);

  /* ─── Computed ─── */
  const filteredDocs = useMemo(() => {
    if (!driveSearch.trim()) return docs;
    const q = driveSearch.toLowerCase();
    return docs.filter((d) => d.name.toLowerCase().includes(q));
  }, [docs, driveSearch]);

  const connectedCount = connections.filter((c) => c.status === 'connected').length;
  const totalAnomalies = financeSheets.reduce((sum, f) => sum + f.anomalies, 0);
  const activeTasks = tasks.filter((t) => t.status === 'running').length;

  /* ─── Render ─── */
  return (
    <main className="workspace-shell">
      <div className="workspace-shell__backdrop" />

      <div className="workspace-console">
        {/* Header */}
        <header className="workspace-header">
          <div className="workspace-header__brand">
            <div className="workspace-header__glyph">
              <Sparkles size={20} />
            </div>
            <div>
              <h1>WORKSPACE INTELLIGENCE</h1>
              <p>AGI-1 command center &bull; Google Workspace operations</p>
            </div>
          </div>

          <div className="workspace-header__status-bar">
            <span className="workspace-header__stat">
              <Wifi size={14} />
              <strong>{connectedCount}/4</strong> services
            </span>
            <span className="workspace-header__stat">
              <Mail size={14} />
              <strong>{emails.filter((e) => !e.isRead).length}</strong> unread
            </span>
            <span className="workspace-header__stat">
              <Zap size={14} />
              <strong>{activeTasks}</strong> active
            </span>
            {totalAnomalies > 0 && (
              <span className="workspace-header__stat workspace-header__stat--warn">
                <AlertTriangle size={14} />
                <strong>{totalAnomalies}</strong> anomalies
              </span>
            )}
            <button
              className="workspace-header__refresh"
              onClick={refreshAll}
              disabled={isLoading}
              title="Refresh all data"
            >
              <RefreshCw size={16} className={isLoading ? 'workspace-spin' : ''} />
            </button>
          </div>
        </header>

        <SovereignSwitcher />

        {error && (
          <div className="workspace-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={14} /></button>
          </div>
        )}

        {/* Main Grid */}
        <div className="workspace-grid">
          {/* Left Sidebar */}
          <aside className="workspace-sidebar">
            <nav className="workspace-nav">
              {SIDEBAR_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    className={`workspace-nav__item ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className="workspace-nav__icon"><Icon size={18} /></span>
                    <span>{item.label}</span>
                    {isActive && <ChevronRight size={14} />}
                  </button>
                );
              })}
            </nav>

            {/* Quick Stats */}
            <div className="workspace-sidebar__stats">
              <div className="workspace-sidebar__stat-label">SYNC STATUS</div>
              {connections.map((conn) => (
                <div key={conn.service} className="workspace-sidebar__conn-row">
                  <span
                    className={`workspace-sidebar__conn-dot workspace-sidebar__conn-dot--${conn.status}`}
                  />
                  <span className="workspace-sidebar__conn-name">{serviceLabel(conn.service)}</span>
                  <span className="workspace-sidebar__conn-status">{conn.status}</span>
                </div>
              ))}
            </div>

            <div className="workspace-sidebar__meta">
              Last sync: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </aside>

          {/* Main Content */}
          <section className="workspace-main">
            {/* Connection Status Panel */}
            {activeSection === 'connections' && (
              <ConnectionsPanel
                connections={connections}
                onConnect={handleConnectGoogle}
              />
            )}

            {/* Email Intelligence */}
            {activeSection === 'email' && (
              <EmailPanel
                emails={emails}
                expandedId={expandedEmail}
                onToggle={(id) => setExpandedEmail(expandedEmail === id ? null : id)}
                onDraftReply={handleDraftReply}
              />
            )}

            {/* Drive & Docs */}
            {activeSection === 'drive' && (
              <DrivePanel
                docs={filteredDocs}
                search={driveSearch}
                onSearchChange={setDriveSearch}
                expandedId={expandedDoc}
                onToggle={(id) => setExpandedDoc(expandedDoc === id ? null : id)}
              />
            )}

            {/* Finance */}
            {activeSection === 'finance' && (
              <FinancePanel
                sheets={financeSheets}
                onGenerateBriefing={handleGenerateBriefing}
              />
            )}

            {/* OpenClaw */}
            {activeSection === 'openclaw' && (
              <OpenClawPanel
                tasks={tasks}
                approvals={approvals}
                log={executionLog}
                onApproval={handleApproval}
              />
            )}
          </section>

          {/* Right Panel — OpenClaw Status */}
          <aside className="workspace-right">
            <div className="workspace-right__header">
              <Zap size={16} />
              <span>OPENCLAW STATUS</span>
            </div>

            <div className="workspace-right__section">
              <div className="workspace-right__label">ACTIVE WORKFLOWS</div>
              {tasks.map((task) => (
                <div key={task.id} className="workspace-right__task-row">
                  <span
                    className="workspace-right__task-dot"
                    style={{ background: statusColor(task.status) }}
                  />
                  <div className="workspace-right__task-info">
                    <span className="workspace-right__task-name">{task.label}</span>
                    <div className="workspace-right__task-bar">
                      <div
                        className="workspace-right__task-fill"
                        style={{ width: `${task.progress}%`, background: statusColor(task.status) }}
                      />
                    </div>
                  </div>
                  <span className="workspace-right__task-pct">{task.progress}%</span>
                </div>
              ))}
            </div>

            {approvals.length > 0 && (
              <div className="workspace-right__section">
                <div className="workspace-right__label">APPROVAL QUEUE ({approvals.length})</div>
                {approvals.map((item) => (
                  <div key={item.id} className="workspace-right__approval">
                    <span className={`workspace-right__risk workspace-right__risk--${item.risk}`}>
                      {item.risk.toUpperCase()}
                    </span>
                    <span className="workspace-right__approval-task">{item.task}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="workspace-right__section">
              <div className="workspace-right__label">EXECUTION LOG</div>
              {executionLog.slice(0, 5).map((entry, i) => (
                <div key={i} className="workspace-right__log-row">
                  <time style={{ color: logLevelColor(entry.level) }}>{entry.time}</time>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════
   SUB-PANELS
   ═══════════════════════════════════════════════ */

function ConnectionsPanel({
  connections,
  onConnect,
}: {
  connections: ServiceConnection[];
  onConnect: () => void;
}) {
  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <Link2 size={20} />
        <h2>Google Workspace Connections</h2>
      </div>

      <div className="connection-status__grid">
        {connections.map((conn) => (
          <div key={conn.service} className={`connection-status__card connection-status__card--${conn.status}`}>
            <div className="connection-status__icon">
              {conn.status === 'connected' ? (
                <CheckCircle2 size={24} />
              ) : conn.status === 'syncing' ? (
                <Loader2 size={24} className="workspace-spin" />
              ) : (
                <WifiOff size={24} />
              )}
            </div>
            <div className="connection-status__info">
              <strong>{serviceLabel(conn.service)}</strong>
              <span className={`connection-status__badge connection-status__badge--${conn.status}`}>
                {conn.status.toUpperCase()}
              </span>
            </div>
            {conn.lastSync && (
              <div className="connection-status__sync">
                <Clock size={12} /> {conn.lastSync}
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="workspace-btn workspace-btn--primary" onClick={onConnect}>
        <Link2 size={18} />
        Connect Google Workspace
      </button>

      <p className="workspace-panel__note">
        OAuth 2.0 with read-only scopes. Your credentials are encrypted and stored locally.
        AGI-1 never stores raw passwords.
      </p>
    </div>
  );
}

function EmailPanel({
  emails,
  expandedId,
  onToggle,
  onDraftReply,
}: {
  emails: EmailItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDraftReply: (id: string) => void;
}) {
  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <Inbox size={20} />
        <h2>Email Intelligence</h2>
        <span className="workspace-panel__count">{emails.length} messages</span>
      </div>

      <div className="email-list">
        {emails.map((email) => {
          const isExpanded = expandedId === email.id;
          return (
            <div
              key={email.id}
              className={`email-card email-card--${email.priority} ${isExpanded ? 'email-card--expanded' : ''} ${!email.isRead ? 'email-card--unread' : ''}`}
            >
              {email.scamAlert && (
                <div className="scam-alert">
                  <ShieldAlert size={18} />
                  <div>
                    <strong>PHISHING ALERT</strong>
                    <p>{email.scamAlert}</p>
                  </div>
                </div>
              )}

              <button className="email-card__header" onClick={() => onToggle(email.id)}>
                <div className="email-card__left">
                  {!email.isRead && <span className="email-card__unread-dot" />}
                  <div className="email-card__meta">
                    <span className="email-card__from">{email.from}</span>
                    <span className="email-card__subject">{email.subject}</span>
                    {!isExpanded && <span className="email-card__snippet">{email.snippet}</span>}
                  </div>
                </div>
                <div className="email-card__right">
                  {email.priority !== 'normal' && (
                    <span className={`email-card__badge email-card__badge--${email.priority}`}>
                      {priorityLabel(email.priority)}
                    </span>
                  )}
                  <time className="email-card__time">{email.date}</time>
                  <ChevronDown
                    size={16}
                    className={`email-card__chevron ${isExpanded ? 'email-card__chevron--open' : ''}`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="email-card__body">
                  {email.body && (
                    <pre className="email-card__content">{email.body}</pre>
                  )}
                  {email.aiAnalysis && (
                    <div className="email-card__analysis">
                      <div className="email-card__analysis-header">
                        <Sparkles size={14} />
                        <span>AI Analysis</span>
                      </div>
                      <p>{email.aiAnalysis}</p>
                    </div>
                  )}
                  {email.priority !== 'suspicious' && (
                    <button
                      className="workspace-btn workspace-btn--secondary"
                      onClick={() => onDraftReply(email.id)}
                    >
                      <Send size={16} />
                      Draft Reply
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DrivePanel({
  docs,
  search,
  onSearchChange,
  expandedId,
  onToggle,
}: {
  docs: DriveDoc[];
  search: string;
  onSearchChange: (v: string) => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const typeIcon = (type: DriveDoc['type']) => {
    switch (type) {
      case 'doc': return <FileText size={18} />;
      case 'sheet': return <TrendingUp size={18} />;
      case 'folder': return <FolderSearch size={18} />;
      default: return <FileText size={18} />;
    }
  };

  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <HardDrive size={20} />
        <h2>Drive &amp; Documents</h2>
      </div>

      <div className="workspace-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search Drive..."
        />
      </div>

      <div className="drive-list">
        {docs.map((doc) => {
          const isExpanded = expandedId === doc.id;
          return (
            <button
              key={doc.id}
              className={`drive-card ${isExpanded ? 'drive-card--expanded' : ''}`}
              onClick={() => onToggle(doc.id)}
            >
              <span className="drive-card__icon">{typeIcon(doc.type)}</span>
              <div className="drive-card__info">
                <span className="drive-card__name">{doc.name}</span>
                <span className="drive-card__modified">{doc.modifiedAt}</span>
                {isExpanded && doc.aiSummary && (
                  <div className="drive-card__summary">
                    <Sparkles size={13} />
                    <span>{doc.aiSummary}</span>
                  </div>
                )}
              </div>
              <span className="drive-card__type">{doc.type.toUpperCase()}</span>
              <ArrowRight size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinancePanel({
  sheets,
  onGenerateBriefing,
}: {
  sheets: FinanceSheet[];
  onGenerateBriefing: () => void;
}) {
  const totalBudget = sheets.filter((s) => s.type === 'budget').reduce((a, s) => a + s.totalAmount, 0);
  const totalRevenue = sheets.filter((s) => s.type === 'revenue').reduce((a, s) => a + s.totalAmount, 0);
  const totalExpenses = sheets.filter((s) => s.type === 'expense').reduce((a, s) => a + s.totalAmount, 0);
  const totalAnomalies = sheets.reduce((a, s) => a + s.anomalies, 0);

  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <DollarSign size={20} />
        <h2>Finance Analysis</h2>
      </div>

      <div className="finance-summary">
        <div className="finance-summary__card">
          <span className="finance-summary__label">Budget</span>
          <strong className="finance-summary__value">{formatCurrency(totalBudget)}</strong>
        </div>
        <div className="finance-summary__card">
          <span className="finance-summary__label">Revenue</span>
          <strong className="finance-summary__value finance-summary__value--green">{formatCurrency(totalRevenue)}</strong>
        </div>
        <div className="finance-summary__card">
          <span className="finance-summary__label">Expenses</span>
          <strong className="finance-summary__value finance-summary__value--orange">{formatCurrency(totalExpenses)}</strong>
        </div>
        <div className="finance-summary__card">
          <span className="finance-summary__label">Anomalies</span>
          <strong className={`finance-summary__value ${totalAnomalies > 0 ? 'finance-summary__value--red' : 'finance-summary__value--green'}`}>
            {totalAnomalies}
          </strong>
        </div>
      </div>

      <div className="finance-sheets">
        {sheets.map((sheet) => (
          <div key={sheet.id} className="finance-sheet-row">
            <div className="finance-sheet-row__info">
              <span className="finance-sheet-row__name">{sheet.name}</span>
              <span className="finance-sheet-row__type">{sheet.type.toUpperCase()}</span>
            </div>
            <div className="finance-sheet-row__data">
              <strong>{formatCurrency(sheet.totalAmount)}</strong>
              {sheet.anomalies > 0 && (
                <span className="finance-sheet-row__anomaly">
                  <AlertTriangle size={13} />
                  {sheet.anomalies} anomal{sheet.anomalies === 1 ? 'y' : 'ies'}
                </span>
              )}
              <span className="finance-sheet-row__updated">{sheet.lastUpdated}</span>
            </div>
          </div>
        ))}
      </div>

      <button className="workspace-btn workspace-btn--primary" onClick={onGenerateBriefing}>
        <Sparkles size={18} />
        Generate Financial Briefing
      </button>
    </div>
  );
}

function OpenClawPanel({
  tasks,
  approvals,
  log,
  onApproval,
}: {
  tasks: OpenClawTask[];
  approvals: ApprovalItem[];
  log: LogEntry[];
  onApproval: (id: string, decision: 'approve' | 'reject') => void;
}) {
  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <Zap size={20} />
        <h2>OpenClaw Task Board</h2>
      </div>

      {/* Task Decomposition */}
      <div className="openclaw-taskboard">
        {tasks.map((task) => (
          <div key={task.id} className={`openclaw-task openclaw-task--${task.status}`}>
            <div className="openclaw-task__header">
              <span
                className="openclaw-task__dot"
                style={{ background: statusColor(task.status) }}
              />
              <span className="openclaw-task__label">{task.label}</span>
              <span className="openclaw-task__status" style={{ color: statusColor(task.status) }}>
                {task.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div className="openclaw-task__progress">
              <div className="openclaw-task__bar">
                <div
                  className="openclaw-task__fill"
                  style={{ width: `${task.progress}%`, background: statusColor(task.status) }}
                />
              </div>
              <span>{task.progress}%</span>
            </div>

            <div className="openclaw-task__subtasks">
              {task.subtasks.map((sub, i) => (
                <div key={i} className="openclaw-subtask">
                  <span
                    className="openclaw-subtask__dot"
                    style={{ background: statusColor(sub.status) }}
                  />
                  <span className="openclaw-subtask__label">{sub.label}</span>
                  <span className="openclaw-subtask__status" style={{ color: statusColor(sub.status) }}>
                    {sub.status === 'completed' ? (
                      <CheckCircle2 size={14} />
                    ) : sub.status === 'running' ? (
                      <Loader2 size={14} className="workspace-spin" />
                    ) : sub.status === 'awaiting_approval' ? (
                      <Shield size={14} />
                    ) : (
                      <Clock size={14} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Approval Queue */}
      {approvals.length > 0 && (
        <div className="approval-queue">
          <div className="approval-queue__header">
            <Shield size={18} />
            <span>APPROVAL QUEUE</span>
            <span className="approval-queue__count">{approvals.length}</span>
          </div>
          {approvals.map((item) => (
            <div key={item.id} className="approval-queue__item">
              <div className="approval-queue__info">
                <span className={`approval-queue__risk approval-queue__risk--${item.risk}`}>
                  {item.risk.toUpperCase()}
                </span>
                <div>
                  <span className="approval-queue__task">{item.task}</span>
                  <span className="approval-queue__action">{item.action} &bull; {item.requestedAt}</span>
                </div>
              </div>
              <div className="approval-queue__actions">
                <button
                  className="workspace-btn workspace-btn--approve"
                  onClick={() => onApproval(item.id, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="workspace-btn workspace-btn--reject"
                  onClick={() => onApproval(item.id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Execution Log */}
      <div className="openclaw-log">
        <div className="openclaw-log__header">
          <FileText size={16} />
          <span>Execution Log</span>
        </div>
        {log.map((entry, i) => (
          <div key={i} className="openclaw-log__row">
            <span className="openclaw-log__dot" style={{ background: logLevelColor(entry.level) }} />
            <time>{entry.time}</time>
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
