import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { deriveCapabilities } from '../_lib/scopes';
import { ensureValidToken, getTokens } from '../oauth/store';

/**
 * POST /api/workspace/openclaw
 * OpenClaw orchestration endpoint.
 *
 * Decomposes high-level tasks into multi-step workflows that coordinate
 * across Gmail, Drive, Sheets, and Groq LLM.
 *
 * Supported workflows:
 *  - inbox_summary
 *  - reply_management
 *  - finance_review
 *  - workspace_research
 *  - scam_defense
 *  - custom (free-form LLM-planned execution)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OpenClawRequest {
  task: string;
  context?: Record<string, unknown>;
  actor?: string;
  user_id?: string;
}

interface ExecutionStep {
  step: number;
  name: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  duration_ms: number;
}

interface ExecutionPlan {
  workflow: string;
  task: string;
  steps: ExecutionStep[];
  result: unknown;
  total_duration_ms: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function apiFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`api_error:${res.status}:${text.slice(0, 300)}`);
  }
  return res.json();
}

async function groqChat(systemPrompt: string, userContent: string, maxTokens = 1024): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`groq_error:${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBody(part: Record<string, unknown> | undefined): string {
  if (!part) return '';
  const body = part.body as { data?: string } | undefined;
  if (body?.data) return decodeBase64Url(body.data);
  const parts = part.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    const plain = parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return extractBody(plain);
    const html = parts.find((p) => p.mimeType === 'text/html');
    if (html) return extractBody(html);
    for (const sub of parts) {
      const found = extractBody(sub);
      if (found) return found;
    }
  }
  return '';
}

async function timedStep<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; step: Omit<ExecutionStep, 'step'> }> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      result,
      step: { name, status: 'completed', duration_ms: Date.now() - start },
    };
  } catch (err) {
    return {
      result: null as T,
      step: { name, status: 'failed', error: err instanceof Error ? err.message : 'unknown', duration_ms: Date.now() - start },
    };
  }
}

// ---------------------------------------------------------------------------
// Workflow: inbox_summary
// ---------------------------------------------------------------------------
async function workflowInboxSummary(accessToken: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();
  const max = (context.max as number) || 15;

  // Step 1: Fetch recent inbox messages
  const s1 = await timedStep('fetch_recent_emails', async () => {
    const data = await apiFetch(accessToken, `${GMAIL_BASE}/messages?maxResults=${max}&labelIds=INBOX`);
    const ids: { id: string }[] = data.messages || [];
    return Promise.all(
      ids.slice(0, max).map(async (m) => {
        const msg = await apiFetch(accessToken, `${GMAIL_BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
        return {
          id: msg.id,
          from: extractHeader(msg.payload?.headers, 'From'),
          subject: extractHeader(msg.payload?.headers, 'Subject'),
          date: extractHeader(msg.payload?.headers, 'Date'),
          snippet: msg.snippet || '',
          labels: msg.labelIds || [],
        };
      }),
    );
  });
  steps.push({ step: 1, ...s1.step, result: { count: s1.result?.length || 0 } });

  // Step 2: Classify all emails
  const s2 = await timedStep('classify_emails', async () => {
    const emails = s1.result || [];
    const emailList = emails.map((e: Record<string, string>) => `From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`).join('\n---\n');
    const raw = await groqChat(
      `You are an email classifier. For each email, assign a category and priority.
Categories: critical, important, needs_reply, informational, low_priority, newsletter, billing, hiring, investor, support, suspicious.
Respond with valid JSON array: [{"index":0,"category":"...","priority":1-5,"reason":"brief"}]`,
      `Classify these ${emails.length} emails:\n${emailList}`,
      1024,
    );
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  });
  steps.push({ step: 2, ...s2.step });

  // Step 3: Generate executive summary
  const s3 = await timedStep('generate_summary', async () => {
    const emails = s1.result || [];
    const classifications = s2.result || [];
    const combined = emails.map((e: Record<string, string>, i: number) => {
      const cls = classifications[i] || {};
      return `[${cls.category || 'unknown'}] From: ${e.from} — ${e.subject}`;
    }).join('\n');

    return groqChat(
      `You are an executive assistant. Generate a concise inbox briefing.
Structure: 1) Urgent items requiring immediate attention 2) Important items 3) FYI/low priority.
Be concise and actionable. Use markdown formatting.`,
      `Here are the ${emails.length} most recent emails with classifications:\n${combined}`,
      800,
    );
  });
  steps.push({ step: 3, ...s3.step });

  return {
    workflow: 'inbox_summary',
    task: 'Summarize inbox',
    steps,
    result: {
      email_count: s1.result?.length || 0,
      classifications: s2.result,
      executive_summary: s3.result,
      emails: s1.result,
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Workflow: reply_management
// ---------------------------------------------------------------------------
async function workflowReplyManagement(accessToken: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();
  const messageId = context.messageId as string;

  if (!messageId) throw new Error('messageId required for reply_management');

  // Step 1: Read the full message
  const s1 = await timedStep('read_message', async () => {
    const msg = await apiFetch(accessToken, `${GMAIL_BASE}/messages/${messageId}?format=full`);
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: extractHeader(msg.payload?.headers, 'From'),
      to: extractHeader(msg.payload?.headers, 'To'),
      subject: extractHeader(msg.payload?.headers, 'Subject'),
      date: extractHeader(msg.payload?.headers, 'Date'),
      body: extractBody(msg.payload),
    };
  });
  steps.push({ step: 1, ...s1.step });

  // Step 2: Fetch full thread for context
  const s2 = await timedStep('fetch_thread', async () => {
    if (!s1.result?.threadId) return [];
    const thread = await apiFetch(accessToken, `${GMAIL_BASE}/threads/${s1.result.threadId}?format=full`);
    return (thread.messages || []).map((msg: Record<string, unknown>) => {
      const payload = msg.payload as Record<string, unknown> | undefined;
      const headers = payload?.headers as { name: string; value: string }[] | undefined;
      return {
        from: extractHeader(headers, 'From'),
        date: extractHeader(headers, 'Date'),
        body: extractBody(payload).slice(0, 500),
      };
    });
  });
  steps.push({ step: 2, ...s2.step, result: { thread_messages: s2.result?.length || 0 } });

  // Step 3: Summarize thread + propose reply
  const s3 = await timedStep('propose_reply', async () => {
    const thread = s2.result || [];
    const threadContext = thread.map((m: Record<string, string>) => `${m.from} (${m.date}):\n${m.body}`).join('\n---\n');
    const actor = (context.actor as string) || 'professional assistant';

    const raw = await groqChat(
      `You are drafting an email reply as a ${actor}. Based on the thread context, write:
1. A brief summary of the conversation
2. A proposed professional reply
Respond with valid JSON: {"thread_summary":"...","proposed_reply":"...","tone":"professional|casual|formal","key_points":["..."]}`,
      `Thread context:\n${threadContext}\n\nReply to the most recent message from: ${s1.result?.from}\nSubject: ${s1.result?.subject}`,
      800,
    );
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  });
  steps.push({ step: 3, ...s3.step });

  return {
    workflow: 'reply_management',
    task: `Manage reply for message ${messageId}`,
    steps,
    result: {
      original_message: s1.result,
      thread_length: s2.result?.length || 0,
      reply_proposal: s3.result,
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Workflow: finance_review
// ---------------------------------------------------------------------------
async function workflowFinanceReview(accessToken: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();
  let spreadsheetId = context.spreadsheetId as string;

  // Step 1: Locate spreadsheet (search if ID not provided)
  const s1 = await timedStep('locate_spreadsheet', async () => {
    if (spreadsheetId) return { id: spreadsheetId, source: 'provided' };
    const query = (context.query as string) || 'finance OR budget OR revenue OR expenses';
    const params = new URLSearchParams({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and (${query})`,
      pageSize: '5',
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    const data = await apiFetch(accessToken, `${DRIVE_BASE}/files?${params.toString()}`);
    const files = data.files || [];
    if (files.length === 0) throw new Error('No finance spreadsheets found');
    spreadsheetId = files[0].id;
    return { id: files[0].id, name: files[0].name, source: 'search', alternatives: files.slice(1) };
  });
  steps.push({ step: 1, ...s1.step, result: s1.result });

  // Step 2: Read spreadsheet data
  const s2 = await timedStep('read_spreadsheet', async () => {
    const meta = await apiFetch(accessToken, `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`);
    const sheetName = (context.sheetName as string) || meta.sheets?.[0]?.properties?.title || 'Sheet1';
    const data = await apiFetch(accessToken, `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`);
    return {
      title: meta.properties?.title,
      sheet: sheetName,
      rows: data.values?.length || 0,
      values: data.values || [],
    };
  });
  steps.push({ step: 2, ...s2.step, result: { title: s2.result?.title, rows: s2.result?.rows } });

  // Step 3: Financial analysis via LLM
  const s3 = await timedStep('financial_analysis', async () => {
    const values = s2.result?.values || [];
    const table = values.slice(0, 100).map((row: string[]) => row.join('\t')).join('\n');

    const raw = await groqChat(
      `You are a CFO-level financial analyst. Perform a thorough financial analysis.
Respond ONLY with valid JSON:
{
  "executive_summary": "2-3 sentence overview",
  "total_revenue": <number or null>,
  "total_expenses": <number or null>,
  "net_income": <number or null>,
  "burn_rate_monthly": <number or null>,
  "runway_months": <number or null>,
  "anomalies": [{"description":"...","severity":"high|medium|low","value":"..."}],
  "trends": [{"description":"...","direction":"up|down|stable"}],
  "recommendations": ["..."],
  "risk_flags": ["..."]
}`,
      `Spreadsheet: ${s2.result?.title}\nSheet: ${s2.result?.sheet}\n\nData:\n${table}`,
      1500,
    );
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  });
  steps.push({ step: 3, ...s3.step });

  return {
    workflow: 'finance_review',
    task: 'Financial review',
    steps,
    result: {
      spreadsheet: s1.result,
      data_summary: { title: s2.result?.title, rows: s2.result?.rows },
      financial_analysis: s3.result,
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Workflow: workspace_research
// ---------------------------------------------------------------------------
async function workflowWorkspaceResearch(accessToken: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();
  const query = (context.query as string) || (context.task as string) || '';

  if (!query) throw new Error('query or task required for workspace_research');

  // Step 1: Search Drive
  const s1 = await timedStep('search_drive', async () => {
    const params = new URLSearchParams({
      q: `fullText contains '${query.replace(/'/g, "\\'")}'`,
      pageSize: '10',
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      orderBy: 'modifiedTime desc',
    });
    const data = await apiFetch(accessToken, `${DRIVE_BASE}/files?${params.toString()}`);
    return data.files || [];
  });
  steps.push({ step: 1, ...s1.step, result: { files_found: s1.result?.length || 0 } });

  // Step 2: Fetch content from top results
  const s2 = await timedStep('fetch_content', async () => {
    const files = (s1.result || []).slice(0, 3);
    const contents = await Promise.all(
      files.map(async (file: { id: string; name: string; mimeType: string }) => {
        try {
          let text = '';
          if (file.mimeType === 'application/vnd.google-apps.document') {
            const doc = await apiFetch(accessToken, `${DOCS_BASE}/${file.id}`);
            for (const element of doc.body?.content || []) {
              if (element.paragraph) {
                for (const el of element.paragraph.elements || []) {
                  text += el.textRun?.content || '';
                }
              }
            }
          } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
            const meta = await apiFetch(accessToken, `${SHEETS_BASE}/${file.id}?fields=sheets.properties`);
            const sheetName = meta.sheets?.[0]?.properties?.title || 'Sheet1';
            const data = await apiFetch(accessToken, `${SHEETS_BASE}/${file.id}/values/${encodeURIComponent(sheetName)}`);
            text = (data.values || []).slice(0, 30).map((r: string[]) => r.join('\t')).join('\n');
          } else {
            const res = await fetch(`${DRIVE_BASE}/files/${file.id}/export?mimeType=text/plain`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) text = await res.text();
          }
          return { id: file.id, name: file.name, content: text.slice(0, 5000) };
        } catch {
          return { id: file.id, name: file.name, content: '[Could not extract content]' };
        }
      }),
    );
    return contents;
  });
  steps.push({ step: 2, ...s2.step, result: { documents_read: s2.result?.length || 0 } });

  // Step 3: Synthesize answer
  const s3 = await timedStep('synthesize_answer', async () => {
    const docs = s2.result || [];
    const docsContext = docs.map((d: { name: string; content: string }) => `--- ${d.name} ---\n${d.content}`).join('\n\n');

    return groqChat(
      `You are a research assistant. Based on the workspace documents provided, answer the user's question thoroughly.
Cite which documents your answer draws from. Be specific and actionable.`,
      `Question: ${query}\n\nWorkspace documents:\n${docsContext}`,
      1024,
    );
  });
  steps.push({ step: 3, ...s3.step });

  return {
    workflow: 'workspace_research',
    task: query,
    steps,
    result: {
      query,
      files_found: s1.result?.length || 0,
      documents_analyzed: s2.result?.length || 0,
      answer: s3.result,
      sources: (s1.result || []).map((f: { id: string; name: string; webViewLink?: string }) => ({
        id: f.id,
        name: f.name,
        link: f.webViewLink,
      })),
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Workflow: scam_defense
// ---------------------------------------------------------------------------
async function workflowScamDefense(accessToken: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();
  const messageId = context.messageId as string;

  if (!messageId) throw new Error('messageId required for scam_defense');

  // Step 1: Read full email
  const s1 = await timedStep('inspect_email', async () => {
    const msg = await apiFetch(accessToken, `${GMAIL_BASE}/messages/${messageId}?format=full`);
    const headers = msg.payload?.headers as { name: string; value: string }[] | undefined;
    return {
      id: msg.id,
      from: extractHeader(headers, 'From'),
      to: extractHeader(headers, 'To'),
      subject: extractHeader(headers, 'Subject'),
      date: extractHeader(headers, 'Date'),
      replyTo: extractHeader(headers, 'Reply-To'),
      returnPath: extractHeader(headers, 'Return-Path'),
      receivedSPF: extractHeader(headers, 'Received-SPF'),
      dkim: extractHeader(headers, 'DKIM-Signature'),
      body: extractBody(msg.payload),
      labels: msg.labelIds || [],
    };
  });
  steps.push({ step: 1, ...s1.step });

  // Step 2: Deep scam analysis
  const s2 = await timedStep('analyze_threats', async () => {
    const email = s1.result;
    if (!email) throw new Error('No email data');

    const raw = await groqChat(
      `You are a cybersecurity email forensics expert. Perform a thorough scam/phishing analysis.
Check for: sender spoofing, domain impersonation, urgency tactics, credential phishing, payment fraud, malicious links, social engineering.
Also check header anomalies: Reply-To mismatch, SPF/DKIM failures, suspicious return path.
Respond ONLY with valid JSON:
{
  "verdict": "likely_safe" | "uncertain" | "suspicious" | "high_scam_risk",
  "confidence": 0.0-1.0,
  "threat_type": "phishing|impersonation|payment_fraud|malware|social_engineering|legitimate|unknown",
  "red_flags": [{"flag":"...","severity":"critical|high|medium|low","evidence":"..."}],
  "header_analysis": {"spf":"pass|fail|none","reply_to_mismatch":<bool>,"sender_domain_legitimate":<bool>},
  "explanation": "detailed explanation for the user",
  "safe_actions": ["recommended safe actions"]
}`,
      `Analyze this email:\nFrom: ${email.from}\nReply-To: ${email.replyTo}\nReturn-Path: ${email.returnPath}\nSPF: ${email.receivedSPF}\nSubject: ${email.subject}\nBody:\n${email.body.slice(0, 3000)}`,
      1024,
    );
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  });
  steps.push({ step: 2, ...s2.step });

  // Step 3: Generate user-friendly safety report
  const s3 = await timedStep('generate_safety_report', async () => {
    const analysis = s2.result;
    if (!analysis) return 'Analysis unavailable.';

    return groqChat(
      `You are a friendly security advisor. Take the technical scam analysis and write a clear, non-technical safety report for the user.
Explain what was found, what the risks are, and what they should do. Be reassuring if safe, firm if dangerous.
Use simple language. Include specific action items.`,
      `Analysis results: ${JSON.stringify(analysis)}\nEmail from: ${s1.result?.from}\nSubject: ${s1.result?.subject}`,
      600,
    );
  });
  steps.push({ step: 3, ...s3.step });

  return {
    workflow: 'scam_defense',
    task: `Scam defense analysis for message ${messageId}`,
    steps,
    result: {
      email_summary: {
        from: s1.result?.from,
        subject: s1.result?.subject,
        date: s1.result?.date,
      },
      threat_analysis: s2.result,
      safety_report: s3.result,
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Workflow: custom (LLM-planned)
// ---------------------------------------------------------------------------
async function workflowCustom(accessToken: string, task: string, context: Record<string, unknown>): Promise<ExecutionPlan> {
  const steps: ExecutionStep[] = [];
  const planStart = Date.now();

  // Step 1: Plan execution
  const s1 = await timedStep('plan_execution', async () => {
    const raw = await groqChat(
      `You are OpenClaw, an AI task orchestrator. Given a task, create an execution plan.
Available tools: gmail_search, gmail_read, drive_search, drive_read, sheets_read, docs_read, llm_analyze.
Respond with valid JSON: {"plan_summary":"...","steps":[{"tool":"...","params":{...},"purpose":"..."}],"expected_output":"..."}`,
      `Task: ${task}\nContext: ${JSON.stringify(context)}`,
      512,
    );
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  });
  steps.push({ step: 1, ...s1.step });

  // Step 2: Execute planned steps (simplified — runs LLM analysis on task)
  const s2 = await timedStep('execute_task', async () => {
    return groqChat(
      `You are OpenClaw, an intelligent workspace assistant with access to Gmail, Drive, Sheets, and Docs.
Provide the best possible response to the user's task based on the plan.
Be thorough, specific, and actionable.`,
      `Task: ${task}\nExecution plan: ${JSON.stringify(s1.result)}\nContext: ${JSON.stringify(context)}`,
      1024,
    );
  });
  steps.push({ step: 2, ...s2.step });

  return {
    workflow: 'custom',
    task,
    steps,
    result: {
      plan: s1.result,
      response: s2.result,
    },
    total_duration_ms: Date.now() - planStart,
  };
}

// ---------------------------------------------------------------------------
// Detect workflow from task description
// ---------------------------------------------------------------------------
function detectWorkflow(task: string): string {
  const lower = task.toLowerCase();
  if (/inbox|unread|email summary|email briefing|morning brief/i.test(lower)) return 'inbox_summary';
  if (/reply|respond|draft reply|write back/i.test(lower)) return 'reply_management';
  if (/financ|budget|revenue|expense|burn|runway|p&l|profit|loss/i.test(lower)) return 'finance_review';
  if (/search|find|look up|research|document|drive/i.test(lower)) return 'workspace_research';
  if (/scam|phish|spam|suspicious|fraud|safe|legit/i.test(lower)) return 'scam_defense';
  return 'custom';
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body: OpenClawRequest = await request.json();
    const { task, context = {}, actor, user_id = 'default' } = body;

    if (!task || typeof task !== 'string' || !task.trim()) {
      return NextResponse.json({ error: 'missing_task', detail: 'Provide a task string.' }, { status: 400 });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({
        error: 'groq_not_configured',
        detail: 'Set GROQ_API_KEY environment variable.',
      }, { status: 503 });
    }

    const accessToken = await ensureValidToken(user_id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}`,
      }, { status: 401 });
    }
    const stored = getTokens(user_id);
    const capabilities = deriveCapabilities(stored?.scopes || []);

    // Detect or use explicitly provided workflow
    const workflow = (context.workflow as string) || detectWorkflow(task);
    const enrichedContext = { ...context, actor, task };
    const needsGmailWrite = workflow === 'reply_management' && Boolean(context.send_now);
    if (workflow === 'inbox_summary' && !capabilities.gmailRead) {
      return NextResponse.json({ error: 'gmail_read_scope_required', workflow }, { status: 403 });
    }
    if (workflow === 'workspace_research' && !capabilities.driveRead) {
      return NextResponse.json({ error: 'drive_read_scope_required', workflow }, { status: 403 });
    }
    if (workflow === 'finance_review' && !capabilities.sheetsRead) {
      return NextResponse.json({ error: 'sheets_read_scope_required', workflow }, { status: 403 });
    }
    if (needsGmailWrite && !capabilities.gmailWrite) {
      return NextResponse.json({ error: 'gmail_write_scope_required', workflow }, { status: 403 });
    }

    console.log(`[workspace/openclaw] Starting workflow: ${workflow} for task: "${task.slice(0, 80)}" user: ${user_id}`);
    auditWorkspaceEvent({
      eventType: 'workspace_openclaw_started',
      severity: 'info',
      userId: user_id,
      metadata: { workflow, task_preview: task.slice(0, 160), capabilities },
    });

    let plan: ExecutionPlan;

    switch (workflow) {
      case 'inbox_summary':
        plan = await workflowInboxSummary(accessToken, enrichedContext);
        break;
      case 'reply_management':
        plan = await workflowReplyManagement(accessToken, enrichedContext);
        break;
      case 'finance_review':
        plan = await workflowFinanceReview(accessToken, enrichedContext);
        break;
      case 'workspace_research':
        plan = await workflowWorkspaceResearch(accessToken, enrichedContext);
        break;
      case 'scam_defense':
        plan = await workflowScamDefense(accessToken, enrichedContext);
        break;
      default:
        plan = await workflowCustom(accessToken, task, enrichedContext);
        break;
    }

    console.log(`[workspace/openclaw] Completed workflow: ${workflow} in ${plan.total_duration_ms}ms`);
    auditWorkspaceEvent({
      eventType: 'workspace_openclaw_completed',
      severity: 'info',
      userId: user_id,
      metadata: {
        workflow,
        total_duration_ms: plan.total_duration_ms,
        step_statuses: plan.steps.map((step) => ({ name: step.name, status: step.status })),
      },
    });

    return NextResponse.json({
      status: 'ok',
      ...plan,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[workspace/openclaw] Error:', error);
    return NextResponse.json(
      { error: 'openclaw_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
