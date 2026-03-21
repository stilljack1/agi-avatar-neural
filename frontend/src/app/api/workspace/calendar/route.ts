import { NextRequest, NextResponse } from 'next/server';
import { auditWorkspaceEvent } from '../_lib/audit';
import { ensureValidToken, getTokens } from '../oauth/store';

/**
 * POST /api/workspace/calendar
 * Google Calendar endpoint.
 * Actions: list | read | create | search | conflicts
 *
 * Requires Google Calendar scope:
 * https://www.googleapis.com/auth/calendar.readonly (read)
 * https://www.googleapis.com/auth/calendar (read+write)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function calendarFetch(accessToken: string, url: string, init?: RequestInit) {
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
    throw new Error(`calendar_api_error:${res.status}:${text.slice(0, 300)}`);
  }
  return res.json();
}

async function groqChat(systemPrompt: string, userContent: string, maxTokens = 512): Promise<string> {
  if (!GROQ_API_KEY) return '[LLM unavailable]';
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

function formatEvent(event: Record<string, unknown>) {
  const start = event.start as Record<string, string> | undefined;
  const end = event.end as Record<string, string> | undefined;
  return {
    id: event.id,
    summary: event.summary || '(No title)',
    description: (event.description as string || '').slice(0, 500),
    location: event.location || '',
    start: start?.dateTime || start?.date || '',
    end: end?.dateTime || end?.date || '',
    status: event.status,
    htmlLink: event.htmlLink,
    attendees: ((event.attendees as Record<string, string>[]) || []).map((a) => ({
      email: a.email,
      responseStatus: a.responseStatus,
    })),
    organizer: event.organizer,
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      user_id = 'default',
      eventId,
      calendarId = 'primary',
      query,
      days = 7,
      summary,
      description,
      start,
      end,
      attendees,
      location,
    } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'missing_action', detail: 'Provide action: list | read | create | search | conflicts' },
        { status: 400 },
      );
    }

    const accessToken = await ensureValidToken(user_id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'not_authenticated',
        action: 'oauth_required',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}`,
      }, { status: 401 });
    }

    // Check calendar scope
    const stored = getTokens(user_id);
    const scopes = stored?.scopes || [];
    const hasCalendarRead = scopes.some((s) => s.includes('calendar'));
    const hasCalendarWrite = scopes.some((s) => s === 'https://www.googleapis.com/auth/calendar');

    if (!hasCalendarRead) {
      return NextResponse.json({
        error: 'calendar_scope_required',
        detail: 'Calendar access not authorized. Re-connect with calendar scope.',
        oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(user_id)}&scopes=calendar`,
      }, { status: 403 });
    }

    // ----- LIST (upcoming events) -----
    if (action === 'list') {
      const now = new Date();
      const futureDate = new Date(now.getTime() + Number(days) * 86400000);

      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: '50',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      const data = await calendarFetch(accessToken, `${CALENDAR_BASE}/calendars/${calendarId}/events?${params}`);
      const events = (data.items || []).map(formatEvent);

      auditWorkspaceEvent({
        eventType: 'workspace_calendar_list',
        severity: 'info',
        userId: user_id,
        metadata: { days, count: events.length },
      });

      return NextResponse.json({
        status: 'ok',
        action: 'list',
        count: events.length,
        days_ahead: days,
        events,
        timestamp: new Date().toISOString(),
      });
    }

    // ----- READ (single event) -----
    if (action === 'read') {
      if (!eventId) return NextResponse.json({ error: 'missing_eventId' }, { status: 400 });
      const event = await calendarFetch(accessToken, `${CALENDAR_BASE}/calendars/${calendarId}/events/${eventId}`);

      return NextResponse.json({
        status: 'ok',
        action: 'read',
        event: formatEvent(event),
        timestamp: new Date().toISOString(),
      });
    }

    // ----- SEARCH -----
    if (action === 'search') {
      if (!query) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

      const now = new Date();
      const futureDate = new Date(now.getTime() + Number(days) * 86400000);
      const pastDate = new Date(now.getTime() - Number(days) * 86400000);

      const params = new URLSearchParams({
        q: query,
        timeMin: pastDate.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: '20',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      const data = await calendarFetch(accessToken, `${CALENDAR_BASE}/calendars/${calendarId}/events?${params}`);
      const events = (data.items || []).map(formatEvent);

      return NextResponse.json({
        status: 'ok',
        action: 'search',
        query,
        count: events.length,
        events,
        timestamp: new Date().toISOString(),
      });
    }

    // ----- CONFLICTS (detect scheduling conflicts) -----
    if (action === 'conflicts') {
      const now = new Date();
      const futureDate = new Date(now.getTime() + Number(days) * 86400000);

      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: '100',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      const data = await calendarFetch(accessToken, `${CALENDAR_BASE}/calendars/${calendarId}/events?${params}`);
      const events = (data.items || []).map(formatEvent);

      // Use LLM to detect conflicts
      const eventList = events.map((e: Record<string, string>) => `${e.start} - ${e.end}: ${e.summary}`).join('\n');
      const conflictAnalysis = await groqChat(
        `You are a scheduling assistant. Analyze these calendar events and identify:
1. Time conflicts (overlapping events)
2. Back-to-back meetings with no breaks
3. Unusually long days
4. Scheduling patterns
Respond with valid JSON: {"conflicts":[{"events":["..."],"type":"overlap|back_to_back|long_day","description":"..."}],"summary":"overall assessment","suggestions":["..."]}`,
        `Events for the next ${days} days:\n${eventList}`,
        512,
      );

      let parsed;
      try {
        const cleaned = conflictAnalysis.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { conflicts: [], summary: conflictAnalysis, suggestions: [] };
      }

      return NextResponse.json({
        status: 'ok',
        action: 'conflicts',
        event_count: events.length,
        analysis: parsed,
        timestamp: new Date().toISOString(),
      });
    }

    // ----- CREATE -----
    if (action === 'create') {
      if (!hasCalendarWrite) {
        return NextResponse.json({
          error: 'calendar_write_scope_required',
          detail: 'Calendar write access not authorized.',
        }, { status: 403 });
      }

      if (!summary || !start || !end) {
        return NextResponse.json({
          error: 'missing_fields',
          detail: 'Provide summary, start, and end for the event.',
        }, { status: 400 });
      }

      // Approval check for creating events
      if (!body.approved) {
        auditWorkspaceEvent({
          eventType: 'workspace_calendar_create_pending_approval',
          severity: 'warning',
          userId: user_id,
          metadata: { summary, start, end },
        });
        return NextResponse.json({
          status: 'approval_required',
          action: 'create',
          detail: 'Set approved: true to confirm creating this event.',
          preview: { summary, start, end, location, attendees },
          timestamp: new Date().toISOString(),
        });
      }

      const eventBody: Record<string, unknown> = {
        summary,
        description: description || '',
        location: location || '',
        start: { dateTime: start },
        end: { dateTime: end },
      };

      if (attendees && Array.isArray(attendees)) {
        eventBody.attendees = attendees.map((email: string) => ({ email }));
      }

      const created = await calendarFetch(accessToken, `${CALENDAR_BASE}/calendars/${calendarId}/events`, {
        method: 'POST',
        body: JSON.stringify(eventBody),
      });

      auditWorkspaceEvent({
        eventType: 'workspace_calendar_event_created',
        severity: 'info',
        userId: user_id,
        metadata: { event_id: created.id, summary, start, end },
      });

      return NextResponse.json({
        status: 'ok',
        action: 'create',
        event: formatEvent(created),
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    console.error('[workspace/calendar] Error:', error);
    return NextResponse.json(
      { error: 'calendar_action_failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
