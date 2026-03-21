'use client';

const USER_ID_KEY = 'agi1.user.id';
const HANDSHAKE_KEY = 'agi1.sovereign.handshake';
const AUTH_SESSION_KEY = 'agi1.auth.session';
const ANON_PREFIX = 'anon-browser:';

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === 'local-user' || trimmed === 'anonymous' || trimmed === 'default') return null;
  return trimmed;
}

function readJsonUserId(storageKey: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (
      normalizeUserId(parsed?.user_id)
      || normalizeUserId(parsed?.userId)
      || normalizeUserId(parsed?.id)
    );
  } catch {
    return null;
  }
}

function generateAnonymousUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${ANON_PREFIX}${crypto.randomUUID()}`;
  }
  return `${ANON_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getStableBrowserUserId(): string {
  if (typeof window === 'undefined') return 'local-user';

  const direct = normalizeUserId(window.localStorage.getItem(USER_ID_KEY));
  if (direct) return direct;

  const handshakeUserId = readJsonUserId(HANDSHAKE_KEY);
  if (handshakeUserId) {
    window.localStorage.setItem(USER_ID_KEY, handshakeUserId);
    return handshakeUserId;
  }

  const authUserId = readJsonUserId(AUTH_SESSION_KEY);
  if (authUserId) {
    window.localStorage.setItem(USER_ID_KEY, authUserId);
    return authUserId;
  }

  const anonymousUserId = generateAnonymousUserId();
  window.localStorage.setItem(USER_ID_KEY, anonymousUserId);
  return anonymousUserId;
}

export function persistBrowserUserId(userId: string | null | undefined): string {
  const normalized = normalizeUserId(userId);
  if (typeof window === 'undefined') {
    return normalized || 'local-user';
  }
  if (normalized) {
    window.localStorage.setItem(USER_ID_KEY, normalized);
    return normalized;
  }
  return getStableBrowserUserId();
}
