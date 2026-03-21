import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { evaluatePolicy, getWorkflowPermissions, type ActionRequest } from '../_lib/policy-engine';
import { recordTask, updateTaskStatus } from '../../../../lib/memory-graph';

/**
 * POST /api/workspace/singularity
 * Singularity Task Router — the multi-step execution orchestrator.
 *
 * Takes high-level task requests from Jack/Julia, determines the correct
 * workflow and Omni-Node, evaluates permissions via Aegis/Policy Engine,
 * and routes to OpenClaw or the appropriate domain connector.
 *
 * Role: Execution Commander, not user-facing persona.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

// ============================================================
// Task Classification
// ============================================================

interface TaskPlan {
  workflow: string;
  description: string;
  target_node: string; // 'gmail' | 'drive' | 'sheets' | 'calendar' | 'openclaw' | 'research'
  subtasks: { action: string; params: Record<string, unknown> }[];
  risk_assessment: string;
}

const TASK_PATTERNS: { pattern: RegExp; workflow: string; node: string }[] = [
  // Email
  { pattern: /(?:check|read|summarize|what's in)\s*(?:my\s+)?(?:email|inbox|mail)/i, workflow: 'inbox_summary', node: 'gmail' },
  { pattern: /(?:reply|respond|write back|answer)\s*(?:to)?\s*(?:email|that|them)/i, workflow: 'reply_management', node: 'gmail' },
  { pattern: /(?:send|compose|draft)\s*(?:an?\s+)?(?:email|message)/i, workflow: 'send_email', node: 'gmail' },
  { pattern: /(?:scam|phish|suspicious|is this safe|fraud)/i, workflow: 'scam_defense', node: 'gmail' },

  // Calendar
  { pattern: /(?:what's|check|show)\s*(?:on\s+)?(?:my\s+)?(?:calendar|schedule|agenda)/i, workflow: 'calendar_read', node: 'calendar' },
  { pattern: /(?:schedule|create|add|book)\s*(?:a\s+)?(?:meeting|event|appointment|call)/i, workflow: 'calendar_write', node: 'calendar' },
  { pattern: /(?:conflicts?|double.?book|busy|free)/i, workflow: 'conflicts', node: 'calendar' },

  // Documents / Drive
  { pattern: /(?:find|search|look for|get)\s*(?:in\s+)?(?:my\s+)?(?:drive|docs|documents|files)/i, workflow: 'workspace_research', node: 'drive' },
  { pattern: /(?:read|open|show|summarize)\s*(?:the\s+)?(?:doc|document|file|spreadsheet)/i, workflow: 'workspace_research', node: 'drive' },

  // Finance
  { pattern: /(?:financ|budget|revenue|expense|burn|runway|p&l)/i, workflow: 'finance_review', node: 'sheets' },

  // Research
  { pattern: /(?:research|investigate|figure out|study|explore|analyze|backtest|hypothesis)/i, workflow: 'research', node: 'research' },
];

function classifyTask(task: string): { workflow: string; node: string } {
  for (const { pattern, workflow, node } of TASK_PATTERNS) {
    if (pattern.test(task)) {
      return { workflow, node };
    }
  }
  return { workflow: 'custom', node: 'openclaw' };
}

// ============================================================
// Route
// ============================================================

export async function POST(request: NextRequest) {
  const planStart = Date.now();

  try {
    const body = await request.json();
    const {
      task,
      user_id = 'default',
      actor = 'jack',
      context = {},
      approved = false,
    } = body;

    if (!task || typeof task !== 'string' || !task.trim()) {
      return NextResponse.json({ error: 'missing_task' }, { status: 400 });
    }

    // Step 1: Classify the task
    const { workflow, node } = classifyTask(task);

    // Step 2: Evaluate permissions via Policy Engine (Aegis gate)
    const requiredPermissions = getWorkflowPermissions(workflow);
    const policyRequest: ActionRequest = {
      user_id,
      action: workflow,
      agent: actor === 'julia' ? 'julia' : 'jack',
      required_permissions: requiredPermissions,
      description: task,
      metadata: context,
      has_user_approval: approved,
    };

    const policyResult = evaluatePolicy(policyRequest);

    // Record task in memory graph
    const taskId = recordTask(user_id, {
      task_type: workflow,
      description: task.slice(0, 200),
      status: 'pending',
      started_at: new Date().toISOString(),
      agent: actor,
      workflow_type: workflow,
    });

    // Step 3: Handle policy decision
    if (policyResult.decision === 'block') {
      updateTaskStatus(user_id, taskId, 'failed', `Blocked: ${policyResult.reason}`);
      return NextResponse.json({
        status: 'blocked',
        workflow,
        target_node: node,
        reason: policyResult.reason,
        missing_permissions: policyResult.missing_permissions,
        risk_level: policyResult.risk_level,
        task_id: taskId,
        timestamp: new Date().toISOString(),
      }, { status: 403 });
    }

    if (policyResult.decision === 'require_approval') {
      return NextResponse.json({
        status: 'approval_required',
        workflow,
        target_node: node,
        risk_level: policyResult.risk_level,
        approval_context: policyResult.approval_context,
        task_id: taskId,
        detail: 'Re-submit with approved: true to proceed.',
        timestamp: new Date().toISOString(),
      });
    }

    // Step 4: Route to the correct Omni-Node / OpenClaw
    updateTaskStatus(user_id, taskId, 'in_progress');

    let routeUrl: string;
    let routeBody: Record<string, unknown>;

    switch (node) {
      case 'gmail':
        routeUrl = '/api/workspace/gmail';
        routeBody = {
          action: workflow === 'inbox_summary' ? 'list' : workflow === 'scam_defense' ? 'classify' : 'list',
          user_id,
          ...context,
        };
        break;
      case 'calendar':
        routeUrl = '/api/workspace/calendar';
        routeBody = {
          action: workflow === 'calendar_write' ? 'create' : workflow === 'conflicts' ? 'conflicts' : 'list',
          user_id,
          approved,
          ...context,
        };
        break;
      case 'drive':
        routeUrl = '/api/workspace/drive';
        routeBody = {
          action: context.fileId ? 'read' : context.query ? 'search' : 'list',
          user_id,
          ...context,
        };
        break;
      case 'sheets':
        routeUrl = '/api/workspace/sheets';
        routeBody = {
          action: 'finance',
          user_id,
          ...context,
        };
        break;
      case 'research':
        routeUrl = '/api/research';
        routeBody = { message: task, actor, userId: user_id };
        break;
      default:
        // OpenClaw handles everything else
        routeUrl = '/api/workspace/openclaw';
        routeBody = { task, actor, user_id, context: { ...context, workflow } };
        break;
    }

    // Execute the route
    const execUrl = new URL(routeUrl, request.url);
    const execRes = await fetch(execUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routeBody),
    });

    const execData = await execRes.json();
    const success = execRes.ok;

    updateTaskStatus(
      user_id,
      taskId,
      success ? 'completed' : 'failed',
      success ? `Executed ${workflow} via ${node}` : execData.error || 'execution_failed',
    );

    auditWorkspaceEvent({
      eventType: 'singularity_task_completed',
      severity: success ? 'info' : 'warning',
      userId: user_id,
      metadata: {
        workflow,
        node,
        task_id: taskId,
        success,
        duration_ms: Date.now() - planStart,
      },
    });

    return NextResponse.json({
      status: success ? 'ok' : 'error',
      workflow,
      target_node: node,
      task_id: taskId,
      policy: {
        decision: policyResult.decision,
        risk_level: policyResult.risk_level,
      },
      result: execData,
      duration_ms: Date.now() - planStart,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[workspace/singularity] Error:', error);
    return NextResponse.json(
      { error: 'singularity_task_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
