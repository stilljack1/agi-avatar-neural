import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { GOOGLE_WORKSPACE_SCOPES, hasScopes } from '../_lib/scopes';
import { ensureValidToken, getTokens } from '../oauth/store';

/**
 * POST /api/workspace/drive
 * Google Drive endpoint.
 * Actions: search | list | read
 */

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  owners?: { displayName: string; emailAddress: string }[];
  webViewLink?: string;
  iconLink?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function driveFetch(accessToken: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`drive_api_error:${res.status}:${text.slice(0, 300)}`);
  }
  return res.json();
}

function requireScopes(userId: string, required: string[]): NextResponse | null {
  const stored = getTokens(userId);
  if (!stored || !hasScopes(stored.scopes || [], required)) {
    return NextResponse.json(
      {
        error: 'insufficient_scope',
        detail: 'The connected Google account does not have the required scope for this Drive action.',
        required_scopes: required,
      },
      { status: 403 },
    );
  }
  return null;
}

function formatFileMetadata(file: DriveFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    createdTime: file.createdTime,
    size: file.size ? `${Math.round(Number(file.size) / 1024)} KB` : undefined,
    owners: file.owners?.map((o) => ({ name: o.displayName, email: o.emailAddress })),
    webViewLink: file.webViewLink,
  };
}

/**
 * Fetch the textual content of a file depending on its mimeType.
 * - Google Docs: use Docs API
 * - Google Sheets: delegate to sheets route (return metadata only here)
 * - Google Slides: export as plain text
 * - Other: attempt export as plain text
 */
async function fetchFileContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  // Google Docs
  if (mimeType === 'application/vnd.google-apps.document') {
    const doc = await driveFetch(accessToken, `${DOCS_BASE}/${fileId}`);
    // Extract text from Docs body
    let text = '';
    for (const element of doc.body?.content || []) {
      if (element.paragraph) {
        for (const el of element.paragraph.elements || []) {
          text += el.textRun?.content || '';
        }
      }
    }
    return text;
  }

  // Google Sheets — return hint to use sheets endpoint
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return '[Google Spreadsheet] Use /api/workspace/sheets for detailed analysis.';
  }

  // Google Slides — export as text
  if (mimeType === 'application/vnd.google-apps.presentation') {
    const res = await fetch(`${DRIVE_BASE}/files/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return res.text();
    return '[Presentation content could not be exported]';
  }

  // PDF / other — attempt plain text export
  try {
    const res = await fetch(`${DRIVE_BASE}/files/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return res.text();
  } catch { /* fall through */ }

  // Binary files — just return metadata
  return `[Binary file — mimeType: ${mimeType}]`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, user_id = 'default', query, fileId, max = 20 } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'missing_action', detail: 'Provide action: search | list | read' }, { status: 400 });
    }

    const accessToken = await ensureValidToken(user_id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}`,
      }, { status: 401 });
    }
    const scopeFailure = requireScopes(user_id, [GOOGLE_WORKSPACE_SCOPES.driveReadonly]);
    if (scopeFailure) return scopeFailure;

    // ----- SEARCH -----
    if (action === 'search') {
      if (!query) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

      const params = new URLSearchParams({
        q: query,
        pageSize: String(Math.min(Number(max), 50)),
        fields: 'files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink,iconLink)',
        orderBy: 'modifiedTime desc',
      });

      const data = await driveFetch(accessToken, `${DRIVE_BASE}/files?${params.toString()}`);
      const files = (data.files || []).map(formatFileMetadata);

      console.log(`[workspace/drive] search "${query}": ${files.length} files for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_drive_search',
        severity: 'info',
        userId: user_id,
        metadata: { query, count: files.length },
      });
      return NextResponse.json({ status: 'ok', action: 'search', query, count: files.length, files, timestamp: new Date().toISOString() });
    }

    // ----- LIST -----
    if (action === 'list') {
      const params = new URLSearchParams({
        pageSize: String(Math.min(Number(max), 50)),
        fields: 'files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink,iconLink)',
        orderBy: 'modifiedTime desc',
      });

      const data = await driveFetch(accessToken, `${DRIVE_BASE}/files?${params.toString()}`);
      const files = (data.files || []).map(formatFileMetadata);

      console.log(`[workspace/drive] list: ${files.length} recent files for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_drive_list',
        severity: 'info',
        userId: user_id,
        metadata: { count: files.length },
      });
      return NextResponse.json({ status: 'ok', action: 'list', count: files.length, files, timestamp: new Date().toISOString() });
    }

    // ----- READ -----
    if (action === 'read') {
      if (!fileId) return NextResponse.json({ error: 'missing_fileId' }, { status: 400 });

      // Get file metadata
      const fileMeta: DriveFile = await driveFetch(
        accessToken,
        `${DRIVE_BASE}/files/${fileId}?fields=id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink`,
      );

      // Get content
      const content = await fetchFileContent(accessToken, fileId, fileMeta.mimeType);

      console.log(`[workspace/drive] read file: ${fileId} (${fileMeta.name}) for user: ${user_id}`);
      auditWorkspaceEvent({
        eventType: 'workspace_drive_read',
        severity: 'info',
        userId: user_id,
        metadata: { file_id: fileId, name: fileMeta.name, mime_type: fileMeta.mimeType },
      });
      return NextResponse.json({
        status: 'ok',
        action: 'read',
        file: formatFileMetadata(fileMeta),
        content: content.slice(0, 50000), // cap at 50k chars
        truncated: content.length > 50000,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'unknown_action', detail: `Action "${action}" not supported.` }, { status: 400 });
  } catch (error) {
    console.error('[workspace/drive] POST error:', error);
    return NextResponse.json(
      { error: 'drive_action_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
