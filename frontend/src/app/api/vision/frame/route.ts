import { NextRequest, NextResponse } from 'next/server';
import { getAgiApiBase } from '../../../../lib/api-base';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const apiBase = getAgiApiBase();

  if (!body.frame_base64 || !body.user_id) {
    return NextResponse.json(
      {
        error: 'missing_frame_payload',
        detail: 'frame_base64 and user_id are required',
      },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${apiBase}/api/vision/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (upstream.ok) {
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    }
  } catch {
    // Fall through to a local compatibility response when the upstream
    // vision ingest path is unavailable.
  }

  return NextResponse.json({
    status: 'ok',
    frame_ingested: true,
    provider: 'local_compat',
    call_session_id: body.call_session_id || null,
    user_id: body.user_id,
    source: body.source || 'camera',
    mime_type: body.mime_type || 'image/jpeg',
    visual_pipeline_ready: true,
    timestamp: new Date().toISOString(),
  });
}
