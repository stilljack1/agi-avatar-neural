import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { GOOGLE_WORKSPACE_SCOPES, hasScopes } from '../_lib/scopes';
import { ensureValidToken, getTokens } from '../oauth/store';

/**
 * GET  /api/workspace/gmail  — Quick list of recent/unread emails
 * POST /api/workspace/gmail  — Full Gmail intelligence endpoint
 *
 * Actions: list | read | search | thread | classify | draft | send
 *
 * Includes:
 *  - Email importance classification via Groq LLM
 *  - Scam / phishing detection via Groq LLM + heuristics
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
}

type EmailCategory =
  | 'critical'
  | 'important'
  | 'needs_reply'
  | 'informational'
  | 'low_priority'
  | 'newsletter'
  | 'billing'
  | 'hiring'
  | 'investor'
  | 'support'
  | 'suspicious';

type ScamVerdict = 'likely_safe' | 'uncertain' | 'suspicious' | 'high_scam_risk';

interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  reason: string;
}

interface ScamAnalysis {
  verdict: ScamVerdict;
  score: number;
  flags: string[];
  explanation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBody(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  if (part.body?.data) return decodeBase64Url(part.body.data);
  if (part.parts) {
    // Prefer text/plain, then text/html
    const plain = part.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html = part.parts.find((p) => p.mimeType === 'text/html');
    if (html?.body?.data) return decodeBase64Url(html.body.data);
    // Recurse into nested multipart
    for (const sub of part.parts) {
      const found = extractBody(sub);
      if (found) return found;
    }
  }
  return '';
}

function summarizeMessage(msg: GmailMessage) {
  const headers = msg.payload?.headers;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: extractHeader(headers, 'From'),
    to: extractHeader(headers, 'To'),
    subject: extractHeader(headers, 'Subject'),
    date: extractHeader(headers, 'Date'),
    snippet: msg.snippet || '',
    labels: msg.labelIds || [],
  };
}

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gmail_api_error:${res.status}:${text.slice(0, 300)}`);
  }
  return res.json();
}

function requireScopes(userId: string, required: string[]): NextResponse | null {
  const stored = getTokens(userId);
  if (!stored || !hasScopes(stored.scopes || [], required)) {
    return NextResponse.json(
      {
        error: 'insufficient_scope',
        detail: 'The connected Google account does not have the required scope for this action.',
        required_scopes: required,
      },
      { status: 403 },
    );
  }
  return null;
}

async function groqChat(systemPrompt: string, userContent: string, maxTokens = 512): Promise<string> {
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
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`groq_error:${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
async function classifyEmail(from: string, subject: string, snippet: string): Promise<ClassificationResult> {
  const prompt = `You are an email classifier. Classify the email into exactly ONE category.
Categories: critical, important, needs_reply, informational, low_priority, newsletter, billing, hiring, investor, support, suspicious.
Respond ONLY with valid JSON: {"category":"<cat>","confidence":0.0-1.0,"reason":"<brief reason>"}`;

  const input = `From: ${from}\nSubject: ${subject}\nSnippet: ${snippet}`;

  try {
    const raw = await groqChat(prompt, input, 128);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { category: 'informational', confidence: 0.3, reason: 'classification_fallback' };
  }
}

// ---------------------------------------------------------------------------
// Scam / Phishing Detection
// ---------------------------------------------------------------------------
function heuristicScamFlags(from: string, subject: string, body: string): string[] {
  const flags: string[] = [];
  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();

  // Sender mismatch: display name vs actual email domain
  const emailMatch = from.match(/<([^>]+)>/);
  const displayName = from.replace(/<[^>]+>/, '').trim().toLowerCase();
  if (emailMatch) {
    const domain = emailMatch[1].split('@')[1] || '';
    if (displayName.includes('paypal') && !domain.includes('paypal')) flags.push('sender_domain_mismatch');
    if (displayName.includes('google') && !domain.includes('google')) flags.push('sender_domain_mismatch');
    if (displayName.includes('apple') && !domain.includes('apple')) flags.push('sender_domain_mismatch');
    if (displayName.includes('microsoft') && !domain.includes('microsoft')) flags.push('sender_domain_mismatch');
    if (displayName.includes('amazon') && !domain.includes('amazon')) flags.push('sender_domain_mismatch');
  }

  // Urgency pressure
  const urgencyWords = ['urgent', 'immediately', 'act now', 'expires today', 'last chance', 'final warning', 'suspended', 'locked'];
  if (urgencyWords.some((w) => lowerSubject.includes(w) || lowerBody.includes(w))) flags.push('urgency_pressure');

  // Payment / credential requests
  if (/password|credential|ssn|social security|bank account|credit card/i.test(lowerBody)) flags.push('credential_request');
  if (/wire transfer|western union|bitcoin|crypto wallet|gift card/i.test(lowerBody)) flags.push('payment_request');

  // Suspicious links
  if (/bit\.ly|tinyurl|t\.co|shorturl|click here to verify/i.test(lowerBody)) flags.push('suspicious_links');

  // Spoofed domains (common typosquatting patterns)
  if (emailMatch) {
    const domain = emailMatch[1].split('@')[1] || '';
    if (/paypa1|g00gle|amaz0n|micros0ft|app1e/i.test(domain)) flags.push('spoofed_domain');
  }

  return flags;
}

async function analyzeScam(from: string, subject: string, body: string): Promise<ScamAnalysis> {
  const heuristicFlags = heuristicScamFlags(from, subject, body);

  const prompt = `You are an email security analyst. Analyze this email for scam/phishing indicators.
Consider: sender legitimacy, urgency tactics, payment requests, credential phishing, suspicious links, spoofed domains.
Respond ONLY with valid JSON: {"verdict":"likely_safe"|"uncertain"|"suspicious"|"high_scam_risk","score":0.0-1.0,"flags":["flag1"],"explanation":"brief explanation"}`;

  const input = `From: ${from}\nSubject: ${subject}\nBody (first 1000 chars): ${body.slice(0, 1000)}`;

  try {
    const raw = await groqChat(prompt, input, 256);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const llmResult = JSON.parse(cleaned) as ScamAnalysis;
    // Merge heuristic flags
    const allFlags = Array.from(new Set([...llmResult.flags, ...heuristicFlags]));
    // Bump verdict if many heuristic flags
    let verdict = llmResult.verdict;
    if (heuristicFlags.length >= 3 && verdict === 'likely_safe') verdict = 'uncertain';
    if (heuristicFlags.length >= 4 && verdict !== 'high_scam_risk') verdict = 'suspicious';
    return { ...llmResult, flags: allFlags, verdict };
  } catch {
    const score = Math.min(heuristicFlags.length * 0.2, 1);
    const verdict: ScamVerdict = score >= 0.6 ? 'suspicious' : score >= 0.3 ? 'uncertain' : 'likely_safe';
    return { verdict, score, flags: heuristicFlags, explanation: 'LLM analysis unavailable; heuristic only.' };
  }
}

// ---------------------------------------------------------------------------
// Route: GET — quick inbox list
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id') || 'default';
    const accessToken = await ensureValidToken(userId);

    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(userId)}`,
      }, { status: 401 });
    }
    const scopeFailure = requireScopes(userId, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
    if (scopeFailure) return scopeFailure;

    const maxResults = request.nextUrl.searchParams.get('max') || '20';
    const data = await gmailFetch(accessToken, `/messages?maxResults=${maxResults}&labelIds=INBOX`);
    const messageIds: { id: string }[] = data.messages || [];

    // Fetch summaries in parallel (max 20)
    const summaries = await Promise.all(
      messageIds.slice(0, 20).map(async (m) => {
        const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
        return summarizeMessage(msg);
      }),
    );

    console.log(`[workspace/gmail] GET listed ${summaries.length} messages for user: ${userId}`);

    return NextResponse.json({
      status: 'ok',
      count: summaries.length,
      messages: summaries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[workspace/gmail] GET error:', error);
    return NextResponse.json(
      { error: 'gmail_list_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Route: POST — full Gmail intelligence
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      user_id = 'default',
      messageId,
      threadId,
      query,
      to,
      subject,
      body: emailBody,
      max = 20,
    } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'missing_action', detail: 'Provide action: list | read | search | thread | classify | draft | send' }, { status: 400 });
    }

    const accessToken = await ensureValidToken(user_id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}`,
      }, { status: 401 });
    }

    // ----- LIST -----
    if (action === 'list') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
      if (scopeFailure) return scopeFailure;
      const data = await gmailFetch(accessToken, `/messages?maxResults=${max}&labelIds=INBOX`);
      const messageIds: { id: string }[] = data.messages || [];

      const summaries = await Promise.all(
        messageIds.slice(0, Number(max)).map(async (m) => {
          const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
          return summarizeMessage(msg);
        }),
      );

      console.log(`[workspace/gmail] list: ${summaries.length} messages for user: ${user_id}`);
      return NextResponse.json({ status: 'ok', action: 'list', count: summaries.length, messages: summaries, timestamp: new Date().toISOString() });
    }

    // ----- READ -----
    if (action === 'read') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
      if (scopeFailure) return scopeFailure;
      if (!messageId) return NextResponse.json({ error: 'missing_messageId' }, { status: 400 });
      const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${messageId}?format=full`);
      const headers = msg.payload?.headers;
      const content = extractBody(msg.payload);

      console.log(`[workspace/gmail] read message: ${messageId} for user: ${user_id}`);
      return NextResponse.json({
        status: 'ok',
        action: 'read',
        message: {
          id: msg.id,
          threadId: msg.threadId,
          from: extractHeader(headers, 'From'),
          to: extractHeader(headers, 'To'),
          subject: extractHeader(headers, 'Subject'),
          date: extractHeader(headers, 'Date'),
          labels: msg.labelIds || [],
          body: content,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ----- SEARCH -----
    if (action === 'search') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
      if (scopeFailure) return scopeFailure;
      if (!query) return NextResponse.json({ error: 'missing_query' }, { status: 400 });
      const data = await gmailFetch(accessToken, `/messages?maxResults=${max}&q=${encodeURIComponent(query)}`);
      const messageIds: { id: string }[] = data.messages || [];

      const summaries = await Promise.all(
        messageIds.slice(0, Number(max)).map(async (m) => {
          const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
          return summarizeMessage(msg);
        }),
      );

      console.log(`[workspace/gmail] search "${query}": ${summaries.length} results for user: ${user_id}`);
      return NextResponse.json({ status: 'ok', action: 'search', query, count: summaries.length, messages: summaries, timestamp: new Date().toISOString() });
    }

    // ----- THREAD -----
    if (action === 'thread') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
      if (scopeFailure) return scopeFailure;
      const tid = threadId || messageId;
      if (!tid) return NextResponse.json({ error: 'missing_threadId' }, { status: 400 });

      // If messageId was provided, get its threadId first
      let resolvedThreadId = threadId;
      if (!resolvedThreadId && messageId) {
        const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${messageId}?format=minimal`);
        resolvedThreadId = msg.threadId;
      }

      const threadData = await gmailFetch(accessToken, `/threads/${resolvedThreadId}?format=full`);
      const messages = (threadData.messages || []).map((msg: GmailMessage) => {
        const headers = msg.payload?.headers;
        return {
          id: msg.id,
          from: extractHeader(headers, 'From'),
          to: extractHeader(headers, 'To'),
          subject: extractHeader(headers, 'Subject'),
          date: extractHeader(headers, 'Date'),
          body: extractBody(msg.payload),
        };
      });

      console.log(`[workspace/gmail] thread ${resolvedThreadId}: ${messages.length} messages for user: ${user_id}`);
      return NextResponse.json({ status: 'ok', action: 'thread', threadId: resolvedThreadId, count: messages.length, messages, timestamp: new Date().toISOString() });
    }

    // ----- CLASSIFY -----
    if (action === 'classify') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailReadonly]);
      if (scopeFailure) return scopeFailure;
      if (!messageId) return NextResponse.json({ error: 'missing_messageId' }, { status: 400 });
      if (!GROQ_API_KEY) return NextResponse.json({ error: 'groq_not_configured' }, { status: 503 });

      const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${messageId}?format=full`);
      const headers = msg.payload?.headers;
      const from = extractHeader(headers, 'From');
      const subj = extractHeader(headers, 'Subject');
      const content = extractBody(msg.payload);

      const [classification, scamAnalysis] = await Promise.all([
        classifyEmail(from, subj, msg.snippet || ''),
        analyzeScam(from, subj, content),
      ]);

      console.log(`[workspace/gmail] classify message: ${messageId} => ${classification.category} / ${scamAnalysis.verdict}`);
      auditWorkspaceEvent({
        eventType: 'workspace_gmail_classify',
        severity: scamAnalysis.verdict === 'high_scam_risk' ? 'warning' : 'info',
        userId: user_id,
        metadata: {
          message_id: messageId,
          category: classification.category,
          scam_verdict: scamAnalysis.verdict,
        },
      });
      return NextResponse.json({
        status: 'ok',
        action: 'classify',
        messageId,
        classification,
        scam_analysis: scamAnalysis,
        timestamp: new Date().toISOString(),
      });
    }

    // ----- DRAFT -----
    if (action === 'draft') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailSend]);
      if (scopeFailure) return scopeFailure;
      if (!to || !subject || !emailBody) {
        return NextResponse.json({ error: 'missing_fields', detail: 'Provide to, subject, body' }, { status: 400 });
      }

      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody,
      ].join('\r\n');

      const encoded = Buffer.from(rawEmail).toString('base64url');

      const draft = await gmailFetch(accessToken, '/drafts', {
        method: 'POST',
        body: JSON.stringify({ message: { raw: encoded } }),
      });

      console.log(`[workspace/gmail] draft created: ${draft.id} for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_gmail_draft_created',
        severity: 'info',
        userId: user_id,
        metadata: { draft_id: draft.id, to, subject },
      });
      return NextResponse.json({ status: 'ok', action: 'draft', draftId: draft.id, timestamp: new Date().toISOString() });
    }

    // ----- SEND -----
    if (action === 'send') {
      const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.gmailSend]);
      if (scopeFailure) return scopeFailure;
      if (!to || !subject || !emailBody) {
        return NextResponse.json({ error: 'missing_fields', detail: 'Provide to, subject, body' }, { status: 400 });
      }

      // Approval check: require explicit approval flag
      if (!body.approved) {
        auditWorkspaceEvent({
          eventType: 'workspace_gmail_send_blocked_pending_approval',
          severity: 'warning',
          userId: user_id,
          metadata: { to, subject },
        });
        return NextResponse.json({
          status: 'approval_required',
          action: 'send',
          detail: 'Set approved: true to confirm sending. This is a safety check.',
          preview: { to, subject, body: emailBody.slice(0, 200) },
          timestamp: new Date().toISOString(),
        });
      }

      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody,
      ].join('\r\n');

      const encoded = Buffer.from(rawEmail).toString('base64url');

      const sent = await gmailFetch(accessToken, '/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: encoded }),
      });

      console.log(`[workspace/gmail] sent message: ${sent.id} to: ${to} for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_gmail_sent',
        severity: 'info',
        userId: user_id,
        metadata: { message_id: sent.id, to, subject },
      });
      return NextResponse.json({ status: 'ok', action: 'send', messageId: sent.id, timestamp: new Date().toISOString() });
    }

    return NextResponse.json({ error: 'unknown_action', detail: `Action "${action}" not supported.` }, { status: 400 });
  } catch (error) {
    console.error('[workspace/gmail] POST error:', error);
    return NextResponse.json(
      { error: 'gmail_action_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
