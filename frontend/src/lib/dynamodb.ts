// ─────────────────────────────────────────────────────────
//  AGI-1 — DynamoDB Document Client (shared singleton)
// ─────────────────────────────────────────────────────────
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export const docClient = DynamoDBDocumentClient.from(client);

// ── Table names ──────────────────────────────────────────
export const Tables = {
  AUTH: 'AGI1_Auth',
  USER_PROFILES: 'FairGroupAI_UserProfiles',
  USER_CONSENTS: 'FairGroupAI_UserConsents',
  FEATURE_CONSENTS: 'FairGroupAI_FeatureConsents',
  PRIVACY_REQUESTS: 'FairGroupAI_PrivacyRequests',
  SUBSCRIPTIONS: 'FairGroupAI_Subscriptions',
  ENTITLEMENTS: 'FairGroupAI_Entitlements',
  ONBOARDING: 'FairGroupAI_OnboardingState',
} as const;

// ── Generic helpers ──────────────────────────────────────
export async function putItem(table: string, item: Record<string, any>) {
  await docClient.send(new PutCommand({ TableName: table, Item: item }));
}

export async function getItem(table: string, pk: string, sk: string) {
  const res = await docClient.send(new GetCommand({ TableName: table, Key: { pk, sk } }));
  return res.Item || null;
}

export async function queryByPk(table: string, pk: string) {
  const res = await docClient.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
    })
  );
  return res.Items || [];
}

export async function updateItem(
  table: string,
  pk: string,
  sk: string,
  updates: Record<string, any>
) {
  const keys = Object.keys(updates);
  const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ');
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};
  keys.forEach((k, i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = updates[k];
  });

  await docClient.send(
    new UpdateCommand({
      TableName: table,
      Key: { pk, sk },
      UpdateExpression: `SET ${expr}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand };
