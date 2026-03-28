import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, putItem, Tables } from './dynamodb';

export type PrivacyRequestType = 'data_export' | 'account_deletion';
export type PrivacyRequestStatus = 'requested' | 'in_review' | 'fulfilled' | 'denied' | 'canceled';

export interface PrivacyRequest {
  request_id: string;
  user_id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  request_source: 'privacy_center';
  requested_at: string;
  updated_at: string;
  notes?: string;
}

export async function createPrivacyRequest(data: {
  user_id: string;
  request_type: PrivacyRequestType;
  notes?: string;
}): Promise<PrivacyRequest> {
  const now = new Date().toISOString();
  const requestId = `${data.request_type}_${now}`;

  const record: PrivacyRequest & { pk: string; sk: string } = {
    pk: `USER#${data.user_id}`,
    sk: `REQUEST#${now}#${data.request_type}`,
    request_id: requestId,
    user_id: data.user_id,
    request_type: data.request_type,
    status: 'requested',
    request_source: 'privacy_center',
    requested_at: now,
    updated_at: now,
    notes: data.notes,
  };

  await putItem(Tables.PRIVACY_REQUESTS, record);
  return record;
}

export async function listPrivacyRequests(userId: string): Promise<PrivacyRequest[]> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: Tables.PRIVACY_REQUESTS,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': 'REQUEST#',
        },
        ScanIndexForward: false,
      })
    );

    return (result.Items || []) as PrivacyRequest[];
  } catch {
    return [];
  }
}
