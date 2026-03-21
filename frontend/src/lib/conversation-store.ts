/**
 * Shared conversation memory store.
 * Server-side Map keyed by userId:actor, with session TTL and history limit.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationSession {
  messages: ConversationMessage[];
  lastAccess: number;
}

const conversationStore = new Map<string, ConversationSession>();
const MAX_HISTORY = 20;
const SESSION_TTL = 3600_000; // 1 hour

function getKey(userId: string, actor: string): string {
  return `${userId}:${actor}`;
}

export function getConversation(userId: string, actor: string): ConversationMessage[] {
  const key = getKey(userId, actor);
  const session = conversationStore.get(key);
  if (!session) return [];

  if (Date.now() - session.lastAccess > SESSION_TTL) {
    conversationStore.delete(key);
    return [];
  }

  session.lastAccess = Date.now();
  return session.messages;
}

export function addToConversation(
  userId: string,
  actor: string,
  userMessage: string,
  assistantReply: string,
): void {
  const key = getKey(userId, actor);
  let session = conversationStore.get(key);
  if (!session) {
    session = { messages: [], lastAccess: Date.now() };
    conversationStore.set(key, session);
  }

  session.messages.push(
    { role: 'user', content: userMessage, timestamp: Date.now() },
    { role: 'assistant', content: assistantReply, timestamp: Date.now() },
  );

  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
  session.lastAccess = Date.now();
}

// Cleanup old sessions periodically
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];
    conversationStore.forEach((session, key) => {
      if (now - session.lastAccess > SESSION_TTL) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => conversationStore.delete(key));
  }, 300_000);
}
