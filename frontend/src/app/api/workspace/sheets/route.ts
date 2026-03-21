import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { GOOGLE_WORKSPACE_SCOPES, hasScopes } from '../_lib/scopes';
import { ensureValidToken, getTokens } from '../oauth/store';

/**
 * POST /api/workspace/sheets
 * Google Sheets analysis endpoint.
 * Actions: read | analyze | finance
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
}

interface SpreadsheetMeta {
  spreadsheetId: string;
  properties: { title: string };
  sheets: { properties: SheetProperties }[];
}

interface SheetData {
  range: string;
  values: string[][];
}

interface FinanceMetrics {
  total_revenue?: number;
  total_expenses?: number;
  net_income?: number;
  burn_rate?: number;
  runway_months?: number;
  anomalies: string[];
  trends: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function sheetsFetch(accessToken: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sheets_api_error:${res.status}:${text.slice(0, 300)}`);
  }
  return res.json();
}

function requireScopes(userId: string, required: string[]): NextResponse | null {
  const stored = getTokens(userId);
  if (!stored || !hasScopes(stored.scopes || [], required)) {
    return NextResponse.json(
      {
        error: 'insufficient_scope',
        detail: 'The connected Google account does not have the required scope for this Sheets action.',
        required_scopes: required,
      },
      { status: 403 },
    );
  }
  return null;
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
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`groq_error:${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Convert sheet values to a readable table string for LLM context */
function valuesToTable(values: string[][]): string {
  if (!values || values.length === 0) return '[Empty sheet]';
  // Cap at 100 rows for LLM context
  const rows = values.slice(0, 100);
  return rows.map((row) => row.join('\t')).join('\n');
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, user_id = 'default', spreadsheetId, range, sheetName } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'missing_action', detail: 'Provide action: read | analyze | finance' }, { status: 400 });
    }

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'missing_spreadsheetId' }, { status: 400 });
    }

    const accessToken = await ensureValidToken(user_id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}`,
      }, { status: 401 });
    }
    const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.sheetsReadonly]);
    if (scopeFailure) return scopeFailure;

    // Fetch spreadsheet metadata
    const meta: SpreadsheetMeta = await sheetsFetch(accessToken, `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`);

    // Determine which range to read
    const targetRange = range || (sheetName ? `${sheetName}` : meta.sheets[0]?.properties.title || 'Sheet1');

    // ----- READ -----
    if (action === 'read') {
      const data: SheetData = await sheetsFetch(
        accessToken,
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`,
      );

      console.log(`[workspace/sheets] read: ${spreadsheetId} range: ${targetRange} for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_sheets_read',
        severity: 'info',
        userId: user_id,
        metadata: { spreadsheet_id: spreadsheetId, range: targetRange },
      });
      return NextResponse.json({
        status: 'ok',
        action: 'read',
        spreadsheet: {
          id: meta.spreadsheetId,
          title: meta.properties.title,
          sheets: meta.sheets.map((s) => s.properties.title),
        },
        range: data.range,
        rows: data.values?.length || 0,
        columns: data.values?.[0]?.length || 0,
        values: data.values || [],
        timestamp: new Date().toISOString(),
      });
    }

    // ----- ANALYZE -----
    if (action === 'analyze') {
      if (!GROQ_API_KEY) return NextResponse.json({ error: 'groq_not_configured' }, { status: 503 });

      const data: SheetData = await sheetsFetch(
        accessToken,
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`,
      );

      const table = valuesToTable(data.values || []);

      const analysis = await groqChat(
        `You are a data analyst. Analyze the following spreadsheet data and provide a clear, structured summary.
Include: what the data represents, key patterns, notable values, and any insights.
Respond with valid JSON: {"summary":"...", "data_type":"...", "key_metrics":[{"label":"...","value":"..."}], "patterns":["..."], "insights":["..."]}`,
        `Spreadsheet: ${meta.properties.title}\nSheet: ${targetRange}\n\nData:\n${table}`,
        1024,
      );

      let parsed;
      try {
        const cleaned = analysis.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { summary: analysis, data_type: 'unknown', key_metrics: [], patterns: [], insights: [] };
      }

      console.log(`[workspace/sheets] analyze: ${spreadsheetId} for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_sheets_analyze',
        severity: 'info',
        userId: user_id,
        metadata: { spreadsheet_id: spreadsheetId, range: targetRange },
      });
      return NextResponse.json({
        status: 'ok',
        action: 'analyze',
        spreadsheet: {
          id: meta.spreadsheetId,
          title: meta.properties.title,
        },
        range: data.range,
        rows: data.values?.length || 0,
        analysis: parsed,
        timestamp: new Date().toISOString(),
      });
    }

    // ----- FINANCE -----
    if (action === 'finance') {
      if (!GROQ_API_KEY) return NextResponse.json({ error: 'groq_not_configured' }, { status: 503 });

      const data: SheetData = await sheetsFetch(
        accessToken,
        `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`,
      );

      const table = valuesToTable(data.values || []);

      const financeAnalysis = await groqChat(
        `You are a CFO-level financial analyst. Analyze this spreadsheet data for financial insights.
Focus on: revenue, expenses, net income, burn rate, runway, budget vs actual, anomalies, and trends.
Respond ONLY with valid JSON:
{
  "summary": "executive summary paragraph",
  "total_revenue": <number or null>,
  "total_expenses": <number or null>,
  "net_income": <number or null>,
  "burn_rate": <monthly burn number or null>,
  "runway_months": <number or null>,
  "budget_analysis": {"on_track": <bool>, "variance_pct": <number>, "details": "..."},
  "anomalies": ["description of each anomaly"],
  "trends": ["description of each trend"],
  "recommendations": ["actionable recommendation"],
  "risk_flags": ["any financial risks identified"]
}`,
        `Spreadsheet: ${meta.properties.title}\nSheet: ${targetRange}\n\nData:\n${table}`,
        1500,
      );

      let parsed: FinanceMetrics & Record<string, unknown>;
      try {
        const cleaned = financeAnalysis.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = {
          summary: financeAnalysis,
          anomalies: [],
          trends: [],
        };
      }

      console.log(`[workspace/sheets] finance analysis: ${spreadsheetId} for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_finance_analysis',
        severity: 'info',
        userId: user_id,
        metadata: { spreadsheet_id: spreadsheetId, range: targetRange },
      });
      return NextResponse.json({
        status: 'ok',
        action: 'finance',
        spreadsheet: {
          id: meta.spreadsheetId,
          title: meta.properties.title,
        },
        range: data.range,
        rows: data.values?.length || 0,
        finance: parsed,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'unknown_action', detail: `Action "${action}" not supported.` }, { status: 400 });
  } catch (error) {
    console.error('[workspace/sheets] POST error:', error);
    return NextResponse.json(
      { error: 'sheets_action_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
