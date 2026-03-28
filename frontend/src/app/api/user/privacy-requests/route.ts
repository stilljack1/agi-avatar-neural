import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createPrivacyRequest,
  listPrivacyRequests,
  type PrivacyRequestType,
} from '@/lib/privacyRequests';

const ALLOWED_REQUEST_TYPES = new Set<PrivacyRequestType>([
  'data_export',
  'account_deletion',
]);

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requests = await listPrivacyRequests(session.user.email.toLowerCase());
    return NextResponse.json({ requests });
  } catch (error: unknown) {
    console.error('[privacy-requests GET]', error);
    return NextResponse.json({ error: 'Failed to load privacy requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const requestType = body.request_type as PrivacyRequestType;

    if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
      return NextResponse.json(
        { error: 'Invalid request type. Use data_export or account_deletion.' },
        { status: 400 }
      );
    }

    const requests = await listPrivacyRequests(session.user.email.toLowerCase());
    const existing = requests.find(
      (request) =>
        request.request_type === requestType &&
        (request.status === 'requested' || request.status === 'in_review')
    );

    if (existing) {
      return NextResponse.json(
        { error: 'An active request of this type already exists.', request: existing },
        { status: 409 }
      );
    }

    const request = await createPrivacyRequest({
      user_id: session.user.email.toLowerCase(),
      request_type: requestType,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (error: unknown) {
    console.error('[privacy-requests POST]', error);
    return NextResponse.json({ error: 'Failed to create privacy request' }, { status: 500 });
  }
}
