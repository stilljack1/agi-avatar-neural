import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { auditWorkspaceEvent } from '../_lib/audit';
import { deriveCapabilities } from '../_lib/scopes';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string[];
  updated_at?: string;
}

type TokenVault = Record<string, StoredTokens>;

function runtimeRoot(): string {
  const root = process.env.AGI1_WORKSPACE_RUNTIME_DIR || path.join(process.cwd(), 'runtime');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function vaultPath(): string {
  return process.env.AGI1_WORKSPACE_TOKEN_STORE_PATH || path.join(runtimeRoot(), 'workspace_tokens.enc');
}

function encryptionKey(): Buffer {
  const secret =
    process.env.AGI1_WORKSPACE_TOKEN_SECRET ||
    process.env.WORKSPACE_TOKEN_ENCRYPTION_KEY ||
    GOOGLE_CLIENT_SECRET;
  return crypto.createHash('sha256').update(secret || 'agi1-workspace-dev-secret').digest();
}

function encryptPayload(payload: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptPayload(serialized: string): string {
  const parsed = JSON.parse(serialized) as { iv: string; tag: string; data: string };
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function readVault(): TokenVault {
  const target = vaultPath();
  if (!fs.existsSync(target)) return {};
  try {
    const serialized = fs.readFileSync(target, 'utf8');
    const decrypted = decryptPayload(serialized);
    const parsed = JSON.parse(decrypted);
    return typeof parsed === 'object' && parsed ? (parsed as TokenVault) : {};
  } catch (error) {
    auditWorkspaceEvent({
      eventType: 'workspace_token_vault_read_failed',
      severity: 'warning',
      detail: error instanceof Error ? error.message : 'unknown',
    });
    return {};
  }
}

function writeVault(vault: TokenVault): void {
  const target = vaultPath();
  fs.writeFileSync(target, encryptPayload(JSON.stringify(vault)), 'utf8');
}

export function getTokens(userId: string): StoredTokens | undefined {
  const vault = readVault();
  return vault[userId];
}

export function setTokens(userId: string, tokens: StoredTokens): void {
  const vault = readVault();
  vault[userId] = { ...tokens, updated_at: new Date().toISOString() };
  writeVault(vault);
  auditWorkspaceEvent({
    eventType: 'workspace_tokens_stored',
    severity: 'info',
    userId,
    metadata: {
      scopes: tokens.scopes,
      capabilities: deriveCapabilities(tokens.scopes),
      has_refresh_token: Boolean(tokens.refresh_token),
    },
  });
}

export function deleteTokens(userId: string): void {
  const vault = readVault();
  delete vault[userId];
  writeVault(vault);
  auditWorkspaceEvent({
    eventType: 'workspace_tokens_deleted',
    severity: 'warning',
    userId,
  });
}

export async function ensureValidToken(userId: string): Promise<string | null> {
  const stored = getTokens(userId);
  if (!stored) return null;

  if (Date.now() < stored.expires_at - 60_000) {
    return stored.access_token;
  }

  if (!stored.refresh_token) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: stored.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('[workspace/oauth] Token refresh failed:', res.status);
      deleteTokens(userId);
      return null;
    }

    const data = await res.json();
    const refreshed: StoredTokens = {
      access_token: data.access_token,
      refresh_token: stored.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      scopes: stored.scopes,
    };
    setTokens(userId, refreshed);
    console.log('[workspace/oauth] Token refreshed for user:', userId);
    auditWorkspaceEvent({
      eventType: 'workspace_token_refreshed',
      severity: 'info',
      userId,
      metadata: { scopes: refreshed.scopes },
    });
    return refreshed.access_token;
  } catch (error) {
    console.error('[workspace/oauth] Refresh error:', error);
    deleteTokens(userId);
    return null;
  }
}
