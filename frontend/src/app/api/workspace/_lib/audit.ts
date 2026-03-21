import fs from 'fs';
import path from 'path';

export type WorkspaceAuditSeverity = 'info' | 'warning' | 'error';

export interface WorkspaceAuditEvent {
  eventType: string;
  severity: WorkspaceAuditSeverity;
  userId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

function runtimeRoot(): string {
  const root = process.env.AGI1_WORKSPACE_RUNTIME_DIR || path.join(process.cwd(), 'runtime');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function auditPath(): string {
  return path.join(runtimeRoot(), 'workspace_audit.jsonl');
}

export function auditWorkspaceEvent(event: WorkspaceAuditEvent): void {
  const payload = {
    timestamp: new Date().toISOString(),
    pm: 'OpenClaw',
    exec: 'Jack | Julia | Singularity | Aegis | Workspace',
    event_type: event.eventType,
    severity: event.severity,
    user_id: event.userId || 'unknown',
    detail: event.detail || '',
    metadata: event.metadata || {},
  };
  fs.appendFileSync(auditPath(), `${JSON.stringify(payload)}\n`, 'utf8');
}

export function readWorkspaceAudit(limit = 100): Record<string, unknown>[] {
  const target = auditPath();
  if (!fs.existsSync(target)) return [];
  const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-Math.max(1, limit)).flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return typeof parsed === 'object' && parsed ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}
