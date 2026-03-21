/**
 * AGI-1 Permission Vault + Consent Graph
 *
 * Production-safe permission system that governs what AGI-1 can do.
 * Every agent action checks permissions before executing.
 *
 * Features:
 * - Explicit consent categories with scoped access grants
 * - Per-domain permissions (email, calendar, finance, etc.)
 * - Revocation support
 * - Audit trail integration
 * - Session binding
 * - Risk-gated approval for high-risk actions
 */

import fs from 'fs';
import path from 'path';
import { auditWorkspaceEvent } from './audit';

// ============================================================
// Permission Categories
// ============================================================

export type PermissionCategory =
  | 'email_read'
  | 'email_write'
  | 'email_send'
  | 'calendar_read'
  | 'calendar_write'
  | 'contacts_read'
  | 'docs_read'
  | 'docs_write'
  | 'drive_read'
  | 'drive_write'
  | 'sheets_read'
  | 'sheets_write'
  | 'browser_control'
  | 'microphone'
  | 'camera'
  | 'notifications'
  | 'location'
  | 'finance_read'
  | 'finance_write'
  | 'social_read'
  | 'social_write'
  | 'health_read'
  | 'health_write'
  | 'memory_persist'
  | 'memory_read'
  | 'admin_execute'
  | 'research_execute';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionGrant {
  category: PermissionCategory;
  granted: boolean;
  granted_at: string;
  granted_by: string; // 'user' | 'system' | 'admin'
  expires_at?: string;
  scope?: string;     // e.g., specific email address, specific spreadsheet ID
  risk_level: RiskLevel;
  requires_approval: boolean;
}

export interface ConsentRecord {
  user_id: string;
  session_id?: string;
  grants: Record<PermissionCategory, PermissionGrant>;
  created_at: string;
  updated_at: string;
  revocation_log: RevocationEntry[];
}

export interface RevocationEntry {
  category: PermissionCategory;
  revoked_at: string;
  reason: string;
}

// ============================================================
// Risk Classification
// ============================================================

const PERMISSION_RISK_MAP: Record<PermissionCategory, RiskLevel> = {
  email_read: 'low',
  email_write: 'medium',
  email_send: 'high',
  calendar_read: 'low',
  calendar_write: 'medium',
  contacts_read: 'low',
  docs_read: 'low',
  docs_write: 'medium',
  drive_read: 'low',
  drive_write: 'medium',
  sheets_read: 'low',
  sheets_write: 'medium',
  browser_control: 'high',
  microphone: 'medium',
  camera: 'medium',
  notifications: 'low',
  location: 'medium',
  finance_read: 'medium',
  finance_write: 'critical',
  social_read: 'low',
  social_write: 'high',
  health_read: 'medium',
  health_write: 'high',
  memory_persist: 'low',
  memory_read: 'low',
  admin_execute: 'critical',
  research_execute: 'medium',
};

// High-risk actions always require explicit user approval
const APPROVAL_REQUIRED = new Set<PermissionCategory>([
  'email_send',
  'finance_write',
  'social_write',
  'health_write',
  'admin_execute',
  'browser_control',
]);

// ============================================================
// Vault Storage
// ============================================================

function runtimeRoot(): string {
  const root = process.env.AGI1_WORKSPACE_RUNTIME_DIR || path.join(process.cwd(), 'runtime');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function consentPath(): string {
  return path.join(runtimeRoot(), 'consent_graph.json');
}

function readConsentGraph(): Record<string, ConsentRecord> {
  const target = consentPath();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return {};
  }
}

function writeConsentGraph(graph: Record<string, ConsentRecord>): void {
  fs.writeFileSync(consentPath(), JSON.stringify(graph, null, 2), 'utf8');
}

// ============================================================
// Public API
// ============================================================

export function getConsent(userId: string): ConsentRecord | null {
  const graph = readConsentGraph();
  return graph[userId] || null;
}

export function grantPermission(
  userId: string,
  category: PermissionCategory,
  grantedBy: string = 'user',
  scope?: string,
  expiresAt?: string,
): PermissionGrant {
  const graph = readConsentGraph();

  if (!graph[userId]) {
    graph[userId] = {
      user_id: userId,
      grants: {} as Record<PermissionCategory, PermissionGrant>,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revocation_log: [],
    };
  }

  const grant: PermissionGrant = {
    category,
    granted: true,
    granted_at: new Date().toISOString(),
    granted_by: grantedBy,
    expires_at: expiresAt,
    scope,
    risk_level: PERMISSION_RISK_MAP[category] || 'medium',
    requires_approval: APPROVAL_REQUIRED.has(category),
  };

  graph[userId].grants[category] = grant;
  graph[userId].updated_at = new Date().toISOString();
  writeConsentGraph(graph);

  auditWorkspaceEvent({
    eventType: 'permission_granted',
    severity: grant.risk_level === 'critical' ? 'warning' : 'info',
    userId,
    metadata: { category, risk_level: grant.risk_level, granted_by: grantedBy, scope },
  });

  return grant;
}

export function revokePermission(
  userId: string,
  category: PermissionCategory,
  reason: string = 'user_revoked',
): boolean {
  const graph = readConsentGraph();
  const record = graph[userId];
  if (!record || !record.grants[category]) return false;

  record.grants[category].granted = false;
  record.revocation_log.push({
    category,
    revoked_at: new Date().toISOString(),
    reason,
  });
  record.updated_at = new Date().toISOString();
  writeConsentGraph(graph);

  auditWorkspaceEvent({
    eventType: 'permission_revoked',
    severity: 'warning',
    userId,
    metadata: { category, reason },
  });

  return true;
}

export function checkPermission(userId: string, category: PermissionCategory): {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
  risk_level: RiskLevel;
} {
  const record = getConsent(userId);
  const riskLevel = PERMISSION_RISK_MAP[category] || 'medium';
  const requiresApproval = APPROVAL_REQUIRED.has(category);

  if (!record || !record.grants[category]) {
    return {
      allowed: false,
      reason: 'no_consent_granted',
      requires_approval: requiresApproval,
      risk_level: riskLevel,
    };
  }

  const grant = record.grants[category];

  if (!grant.granted) {
    return {
      allowed: false,
      reason: 'permission_revoked',
      requires_approval: requiresApproval,
      risk_level: riskLevel,
    };
  }

  // Check expiry
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
    return {
      allowed: false,
      reason: 'permission_expired',
      requires_approval: requiresApproval,
      risk_level: riskLevel,
    };
  }

  return {
    allowed: true,
    reason: 'granted',
    requires_approval: requiresApproval,
    risk_level: riskLevel,
  };
}

export function listPermissions(userId: string): {
  category: PermissionCategory;
  granted: boolean;
  risk_level: RiskLevel;
  granted_at?: string;
}[] {
  const record = getConsent(userId);
  const allCategories = Object.keys(PERMISSION_RISK_MAP) as PermissionCategory[];

  return allCategories.map((cat) => {
    const grant = record?.grants[cat];
    return {
      category: cat,
      granted: grant?.granted ?? false,
      risk_level: PERMISSION_RISK_MAP[cat],
      granted_at: grant?.granted_at,
    };
  });
}

/**
 * Bulk grant: set initial permissions from OAuth scopes.
 * Maps Google OAuth scopes to AGI-1 permission categories.
 */
export function syncFromOAuthScopes(userId: string, scopes: string[]): void {
  const scopeMap: Record<string, PermissionCategory[]> = {
    'https://www.googleapis.com/auth/gmail.readonly': ['email_read'],
    'https://www.googleapis.com/auth/gmail.send': ['email_write', 'email_send'],
    'https://www.googleapis.com/auth/gmail.modify': ['email_read', 'email_write', 'email_send'],
    'https://www.googleapis.com/auth/drive.readonly': ['drive_read', 'docs_read'],
    'https://www.googleapis.com/auth/documents.readonly': ['docs_read'],
    'https://www.googleapis.com/auth/spreadsheets.readonly': ['sheets_read'],
    'https://www.googleapis.com/auth/calendar.readonly': ['calendar_read'],
    'https://www.googleapis.com/auth/calendar': ['calendar_read', 'calendar_write'],
  };

  for (const scope of scopes) {
    const categories = scopeMap[scope];
    if (categories) {
      for (const cat of categories) {
        grantPermission(userId, cat, 'oauth_sync');
      }
    }
  }

  // Always grant baseline permissions
  grantPermission(userId, 'memory_persist', 'system');
  grantPermission(userId, 'memory_read', 'system');
  grantPermission(userId, 'research_execute', 'system');
  grantPermission(userId, 'notifications', 'system');
}
