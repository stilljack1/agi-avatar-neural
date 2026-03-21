/**
 * AGI-1 Policy Engine — Aegis Approval & Risk Gates
 *
 * Evaluates whether an action should proceed, require approval, or be blocked.
 * Works with the Permission Vault to enforce consent-based execution.
 */

import {
  checkPermission,
  type PermissionCategory,
  type RiskLevel,
} from './permission-vault';
import { auditWorkspaceEvent } from './audit';

// ============================================================
// Types
// ============================================================

export type PolicyDecision = 'allow' | 'require_approval' | 'block';

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reason: string;
  risk_level: RiskLevel;
  required_permissions: PermissionCategory[];
  missing_permissions: PermissionCategory[];
  approval_context?: {
    action_description: string;
    risk_explanation: string;
    reversible: boolean;
  };
}

export interface ActionRequest {
  user_id: string;
  action: string;
  agent: 'jack' | 'julia' | 'singularity' | 'openclaw' | 'aegis';
  required_permissions: PermissionCategory[];
  description: string;
  metadata?: Record<string, unknown>;
  has_user_approval?: boolean;
}

// ============================================================
// Risk Descriptions
// ============================================================

const RISK_DESCRIPTIONS: Record<string, string> = {
  email_send: 'Send an email on your behalf. The recipient will see it as coming from your account.',
  finance_write: 'Modify financial data. This could affect real monetary records.',
  social_write: 'Post content to social media. This will be publicly visible.',
  health_write: 'Update health/wellness records.',
  admin_execute: 'Execute administrative commands with elevated privileges.',
  browser_control: 'Control browser automation. The agent will interact with websites on your behalf.',
};

// ============================================================
// Policy Evaluation
// ============================================================

export function evaluatePolicy(request: ActionRequest): PolicyEvaluation {
  const missingPermissions: PermissionCategory[] = [];
  let highestRisk: RiskLevel = 'low';
  let needsApproval = false;

  for (const perm of request.required_permissions) {
    const check = checkPermission(request.user_id, perm);

    if (!check.allowed) {
      missingPermissions.push(perm);
    }

    if (check.requires_approval) {
      needsApproval = true;
    }

    // Track highest risk level
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    if (riskOrder.indexOf(check.risk_level) > riskOrder.indexOf(highestRisk)) {
      highestRisk = check.risk_level;
    }
  }

  // Decision logic
  let decision: PolicyDecision;
  let reason: string;

  if (missingPermissions.length > 0) {
    decision = 'block';
    reason = `Missing permissions: ${missingPermissions.join(', ')}`;
  } else if (needsApproval && !request.has_user_approval) {
    decision = 'require_approval';
    reason = `High-risk action requires explicit user approval`;
  } else {
    decision = 'allow';
    reason = 'All permissions granted and approval satisfied';
  }

  // Audit the evaluation
  auditWorkspaceEvent({
    eventType: 'policy_evaluation',
    severity: decision === 'block' ? 'warning' : 'info',
    userId: request.user_id,
    metadata: {
      action: request.action,
      agent: request.agent,
      decision,
      risk_level: highestRisk,
      missing_permissions: missingPermissions,
    },
  });

  const evaluation: PolicyEvaluation = {
    decision,
    reason,
    risk_level: highestRisk,
    required_permissions: request.required_permissions,
    missing_permissions: missingPermissions,
  };

  if (decision === 'require_approval') {
    const approvalDescriptions = request.required_permissions
      .filter((p) => RISK_DESCRIPTIONS[p])
      .map((p) => RISK_DESCRIPTIONS[p]);

    evaluation.approval_context = {
      action_description: request.description,
      risk_explanation: approvalDescriptions.join(' ') || `This action has ${highestRisk} risk level.`,
      reversible: !['email_send', 'social_write', 'finance_write'].some((p) =>
        request.required_permissions.includes(p as PermissionCategory)
      ),
    };
  }

  return evaluation;
}

/**
 * Quick permission check for common workflows.
 * Returns true if all required permissions are granted and no approval is needed.
 */
export function canExecute(userId: string, permissions: PermissionCategory[]): boolean {
  return permissions.every((p) => checkPermission(userId, p).allowed);
}

/**
 * Determine which permissions a workflow needs based on its type.
 */
export function getWorkflowPermissions(workflow: string): PermissionCategory[] {
  const workflowPermissions: Record<string, PermissionCategory[]> = {
    inbox_summary: ['email_read'],
    reply_management: ['email_read', 'email_write'],
    send_email: ['email_read', 'email_write', 'email_send'],
    finance_review: ['sheets_read', 'drive_read'],
    workspace_research: ['drive_read', 'docs_read'],
    scam_defense: ['email_read'],
    calendar_read: ['calendar_read'],
    calendar_write: ['calendar_read', 'calendar_write'],
    social_post: ['social_write'],
    research: ['research_execute'],
    custom: ['admin_execute'],
  };

  return workflowPermissions[workflow] || [];
}
