import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/call/end
 * Ends an active call session.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { call_session_id } = body;

    if (!call_session_id) {
      return NextResponse.json(
        { error: 'missing_session_id' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      call_session_id,
      state: 'ended',
    });
  } catch (error) {
    console.error('[call/end] Error:', error);
    return NextResponse.json(
      { error: 'call_end_failed' },
      { status: 500 }
    );
  }
}
